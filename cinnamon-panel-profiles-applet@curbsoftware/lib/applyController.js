/* Panel Profiles apply engine: the transaction state machine.
 *
 * Owns the ordered profile restore (validate, wait for monitors, snapshot
 * rollback, restore panel settings, restore applet configs, write
 * pendingApply, restore enabled-applets LAST, verify after a settle) plus
 * the single-operation lock shared with every save/manage/rollback entry
 * point. All module dependencies are injected; this file never imports
 * Main and never touches St/Clutter, so nothing here can walk a dead actor.
 *
 * The lifecycle rule that shapes the second half of an apply: Cinnamon
 * live-applies enabled-applets DURING the set_value call and may destroy
 * the calling applet instance mid-write. Everything before that write is
 * allowed to use any dependency; everything after it may only touch
 * state.json (profileStore), the settings/config stores, the scheduler and
 * the logger. Handoff to a fresh instance happens purely through
 * pendingApply in state.json, picked up by resumePendingApply().
 *
 * State strings for an apply are exactly IDLE, VALIDATING,
 * WAITING_FOR_MONITORS, SNAPSHOTTING_ROLLBACK, RESTORING_PANEL_SETTINGS,
 * RESTORING_APPLET_CONFIGS, RESTORING_ENABLED_APPLETS, VERIFYING, COMPLETE,
 * FAILED (COMPLETE and FAILED are momentary; both settle to IDLE). Save and
 * manage operations additionally use SAVING and MANAGING; the plan's enum
 * governs applies only. getState()/isBusy()/isDirtySuppressed() expose the
 * machine, and an optional onStateChange callback mirrors every
 * transition for the menu.
 *
 * Every public function catches exceptions and returns a failure value.
 *
 * No St/Clutter imports and no require() calls: loadable headless via
 * imports.searchPath so the dev-tools test harness can use it directly.
 *
 * Public names are declared with var/function so both the require()
 * auto-export inside Cinnamon and the plain imports.<mod> loader see them.
 *
 * Copyright (C) 2026 curbsoftware
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

const GLib = imports.gi.GLib;

/* ------------------------------------------------------------------ *
 * States
 * ------------------------------------------------------------------ */

var STATE_IDLE = "IDLE";
var STATE_VALIDATING = "VALIDATING";
var STATE_WAITING_FOR_MONITORS = "WAITING_FOR_MONITORS";
var STATE_SNAPSHOTTING_ROLLBACK = "SNAPSHOTTING_ROLLBACK";
var STATE_RESTORING_PANEL_SETTINGS = "RESTORING_PANEL_SETTINGS";
var STATE_RESTORING_APPLET_CONFIGS = "RESTORING_APPLET_CONFIGS";
var STATE_RESTORING_ENABLED_APPLETS = "RESTORING_ENABLED_APPLETS";
var STATE_VERIFYING = "VERIFYING";
var STATE_COMPLETE = "COMPLETE";
var STATE_FAILED = "FAILED";
/* Extensions beyond the plan's apply enum, for the save/manage paths. */
var STATE_SAVING = "SAVING";
var STATE_MANAGING = "MANAGING";

/* ------------------------------------------------------------------ *
 * Dependency seam
 * ------------------------------------------------------------------ */

let _deps = null;
let _busy = false;
let _state = STATE_IDLE;
let _suppressDirty = false;
let _waitHandle = null;   /* monitorTopology waitForTopology cancel handle */
let _verifyTimerId = null;
let _lastMonitorCount = 0;

/**
 * setDependencies:
 * @deps (object): module handles and function seams, all optional unless
 *   noted: { constants, logger, cinnamonState, appletConfigStore,
 *   profileStore, profileSchema, fingerprint, monitorTopology, scheduler,
 *   notify, captureConfigsEnabled, rollbackKeep, isAppletInstalled,
 *   notifySuccessEnabled, onWaitStateChange, onProfileSaved,
 *   onStateChange, environment, waitStabilizeMs, waitTimeoutMs }.
 *
 * Module handles are the frozen lib modules (or fakes). scheduler:
 * {timeoutAdd(ms, fn) -> id, sourceRemove(id)}. notify: {info, warn,
 * success}(title, details) wrapping Main.notify; the controller itself
 * never imports Main, the wrapper decides what is safe to call on a dead
 * actor. captureConfigsEnabled()/notifySuccessEnabled() -> boolean gates.
 * rollbackKeep is accepted for interface completeness but deliberately
 * unconsumed: profileStore.writeRollback owns rotation with its own
 * constants.ROLLBACK_KEEP, and a controller-side count could only drift
 * from it. onWaitStateChange(show, current, required) lets the menu
 * display the wait; onProfileSaved(profile) lets the applet reset dirty
 * tracking; onStateChange(state) mirrors every transition. environment()
 * -> {cinnamonVersion, sessionType} stamps saved profiles and rollbacks.
 * waitStabilizeMs/waitTimeoutMs override the monitor-wait timings.
 *
 * When both profileStore and profileSchema are present the store's
 * validator seam is wired here (validate/migrate adapters): the store owns
 * persistence, the schema owns correctness, the composition root only has
 * to hand both handles to this controller.
 *
 * Wiring also resets the in-memory machine (lock, state, timers): lib
 * modules stay cached across applet reloads, so a fresh instance's init
 * wiring is the one reliable "previous instance is gone" signal. The old
 * instance's outstanding timers are its own scheduler's problem; the
 * composition root cancels them in its removal hook.
 */
function setDependencies(deps) {
    _deps = (deps && typeof deps === "object") ? deps : null;
    _busy = false;
    _state = STATE_IDLE;
    _suppressDirty = false;
    _waitHandle = null;
    _verifyTimerId = null;
    _lastMonitorCount = 0;
    try {
        if (_deps && _deps.profileStore && _deps.profileSchema) {
            _deps.profileStore.setDependencies({
                validateProfile: function (profile) {
                    const verdict = _deps.profileSchema.validate(profile);
                    if (verdict && verdict.ok)
                        return null;
                    return verdict && verdict.errors
                        ? verdict.errors.join("; ")
                        : "profile validation failed";
                },
                migrateProfile: function (profile) {
                    return _deps.profileSchema.migrate(profile).profile;
                }
            });
        }
    } catch (ignored) {
        /* the store's seam must never break controller wiring */
    }
}

/**
 * resetDependencies:
 *
 * Restores defaults and clears in-memory machine state (timers and waits
 * are dropped, not cancelled: tests own the clocks). Test teardown helper.
 */
function resetDependencies() {
    _deps = null;
    _busy = false;
    _state = STATE_IDLE;
    _suppressDirty = false;
    _waitHandle = null;
    _verifyTimerId = null;
    _lastMonitorCount = 0;
}

function _constants() {
    if (_deps && _deps.constants)
        return _deps.constants;
    try {
        return imports.constants;
    } catch (ignored) {
        return null;
    }
}

function _const(name, fallback) {
    const c = _constants();
    return (c && typeof c[name] === "number") ? c[name] : fallback;
}

function _selfUuid() {
    const c = _constants();
    try {
        if (c && typeof c.selfUuid === "function")
            return String(c.selfUuid());
    } catch (ignored) {
    }
    return "";
}

function _cinnamonState() { return _deps ? _deps.cinnamonState : null; }
function _configStore() { return _deps ? _deps.appletConfigStore : null; }
function _profileStore() { return _deps ? _deps.profileStore : null; }
function _schema() { return _deps ? _deps.profileSchema : null; }
function _fingerprintMod() { return _deps ? _deps.fingerprint : null; }
function _topology() { return _deps ? _deps.monitorTopology : null; }
function _scheduler() { return _deps ? _deps.scheduler : null; }

function _log(level, msg, e) {
    try {
        const logger = _deps && _deps.logger;
        if (logger && typeof logger[level] === "function")
            logger[level](msg, e);
    } catch (ignored) {
        /* logging must never take the caller down */
    }
}

function _notify(level, title, details) {
    try {
        const notify = _deps && _deps.notify;
        if (notify && typeof notify[level] === "function")
            notify[level](title, details);
    } catch (ignored) {
        /* a dead notification wrapper must never break the transaction */
    }
}

function _captureConfigsEnabled() {
    try {
        return (_deps && typeof _deps.captureConfigsEnabled === "function")
            ? !!_deps.captureConfigsEnabled() : true;
    } catch (ignored) {
        return true;
    }
}

function _notifySuccessEnabled() {
    try {
        return (_deps && typeof _deps.notifySuccessEnabled === "function")
            ? !!_deps.notifySuccessEnabled() : true;
    } catch (ignored) {
        return true;
    }
}

/* Installability check for referenced third-party applets. A captured
 * config file is NOT proof of installation (it survives uninstalls), so
 * the default probes the applet code directories on disk. */
function _isAppletInstalled(uuid) {
    try {
        if (_deps && typeof _deps.isAppletInstalled === "function")
            return !!_deps.isAppletInstalled(uuid);
        if (typeof uuid !== "string" || uuid.length === 0)
            return false;
        const user = GLib.build_filenamev(
            [GLib.get_home_dir(), ".local", "share", "cinnamon", "applets", uuid]);
        const system = GLib.build_filenamev(
            ["/usr", "share", "cinnamon", "applets", uuid]);
        return GLib.file_test(user, GLib.FileTest.EXISTS) ||
            GLib.file_test(system, GLib.FileTest.EXISTS);
    } catch (ignored) {
        return false;
    }
}

function _environment() {
    try {
        if (_deps && typeof _deps.environment === "function") {
            const env = _deps.environment();
            if (env && typeof env === "object")
                return env;
        }
    } catch (ignored) {
    }
    return { cinnamonVersion: "", sessionType: "" };
}

function _isoNow() {
    try {
        return GLib.DateTime.new_now_local().format("%Y-%m-%dT%H:%M:%S%:z");
    } catch (ignored) {
        return "";
    }
}

/* ------------------------------------------------------------------ *
 * Machine plumbing
 * ------------------------------------------------------------------ */

function _setState(next) {
    _state = next;
    _log("log", "state -> " + next);
    try {
        if (_deps && typeof _deps.onStateChange === "function")
            _deps.onStateChange(next);
    } catch (ignored) {
        /* an observer must never steer the machine */
    }
}

function _lock() {
    if (_busy)
        return false;
    _busy = true;
    return true;
}

function _release() {
    _busy = false;
}

/**
 * getState:
 *
 * Returns (string): the current state (see the list at the top).
 */
function getState() {
    return _state;
}

/**
 * isBusy:
 *
 * Returns (boolean): true while any state-changing operation (apply,
 * wait, save, manage, resume verification) holds the lock.
 */
function isBusy() {
    return _busy;
}

/**
 * isDirtySuppressed:
 *
 * Returns (boolean): true from the first panel-settings write of an apply
 * until its verification resolves (or the operation fails or is
 * cancelled). Dirty tracking must not fire on our own writes.
 */
function isDirtySuppressed() {
    return _suppressDirty;
}

function _notifyWaitState(show, current, required) {
    try {
        if (_deps && typeof _deps.onWaitStateChange === "function")
            _deps.onWaitStateChange(show, current, required);
    } catch (ignored) {
        /* the menu must never steer the machine */
    }
}

function _cancelWaitHandle() {
    if (_waitHandle) {
        try {
            _waitHandle.cancel();
        } catch (ignored) {
        }
        _waitHandle = null;
    }
}

function _cancelVerifyTimer() {
    if (_verifyTimerId !== null) {
        try {
            const scheduler = _scheduler();
            if (scheduler && typeof scheduler.sourceRemove === "function")
                scheduler.sourceRemove(_verifyTimerId);
        } catch (ignored) {
        }
        _verifyTimerId = null;
    }
}

function _recordLastFailure(message, extra) {
    try {
        const store = _profileStore();
        if (!store || typeof store.mutateState !== "function")
            return;
        store.mutateState(function (state) {
            state.lastFailure = {
                at: _isoNow(),
                message: String(message)
            };
            if (extra)
                state.lastFailure.detail = extra;
        });
    } catch (ignored) {
        /* state bookkeeping must never mask the real failure */
    }
}

/* Terminal failure: pass through FAILED, settle IDLE, release the lock. */
function _failTerminal() {
    _suppressDirty = false;
    _setState(STATE_FAILED);
    _setState(STATE_IDLE);
    _release();
}

/* ------------------------------------------------------------------ *
 * Capture helpers
 * ------------------------------------------------------------------ */

/* Parse a stored enabled-applets record into its entry list. */
function _entriesOfSnapshot(snapshot) {
    try {
        const rec = snapshot && snapshot.cinnamonSettings &&
            snapshot.cinnamonSettings["enabled-applets"];
        if (!rec || typeof rec.value !== "string")
            return [];
        const state = _cinnamonState();
        if (!state || typeof state.parseVariant !== "function")
            return [];
        const variant = state.parseVariant(null, rec.value);
        if (!variant || variant.get_type_string() !== "as")
            return [];
        const parsed = state.parseEnabledApplets(variant.get_strv());
        return Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch (ignored) {
        return [];
    }
}

/* Stored record -> raw string array, or null when unparseable. */
function _strvOfRecord(rec) {
    try {
        if (!rec || typeof rec.value !== "string")
            return null;
        const state = _cinnamonState();
        const variant = state.parseVariant(null, rec.value);
        if (!variant || variant.get_type_string() !== "as")
            return null;
        return variant.get_strv();
    } catch (ignored) {
        return null;
    }
}

/* Raw string array -> stored record (verbatim GVariant print form). */
function _recordOfStrv(arr) {
    try {
        const state = _cinnamonState();
        const variant = GLib.Variant.new_strv(arr);
        return { type: "as", value: state.variantToString(variant) };
    } catch (ignored) {
        return null;
    }
}

/**
 * _captureCurrent: (internal)
 *
 * Full capture bundle for saves and rollback snapshots. Uses the live
 * settings, the applet config store (gated by captureConfigsEnabled) and
 * the monitor topology.
 *
 * Returns (object): {snapshot, entries, configs, configHashes, topology}
 * where snapshot is the captureSettings() result (cinnamonSettings map
 * plus missingKeys).
 */
function _captureCurrent() {
    const state = _cinnamonState();
    const store = _configStore();
    const snapshot = state.captureSettings();
    const entries = _entriesOfSnapshot(snapshot);
    const configs = (_captureConfigsEnabled() && store)
        ? store.captureConfigs(entries) : [];
    const configHashes = store ? store.configHashList(configs) : [];
    const topology = _topology()
        ? _topology().getCurrentTopology()
        : { expectedCount: 0, monitors: [] };
    return {
        snapshot: snapshot,
        entries: entries,
        configs: configs,
        configHashes: configHashes,
        topology: topology
    };
}

/* Live fingerprint without touching the layout provider (safe after the
 * enabled-applets write, where the calling instance may already be dead
 * and Main-shaped dependencies are off limits). */
function _liveFingerprint() {
    try {
        const state = _cinnamonState();
        const store = _configStore();
        const fp = _fingerprintMod();
        if (!state || !store || !fp)
            return null;
        const snapshot = state.captureSettings();
        const entries = _entriesOfSnapshot(snapshot);
        const configs = _captureConfigsEnabled()
            ? store.captureConfigs(entries) : [];
        const value = fp.computeFingerprint(snapshot,
            store.configHashList(configs));
        return value === "" ? null : value;
    } catch (ignored) {
        return null;
    }
}

function _fingerprintOf(bundle) {
    try {
        const fp = _fingerprintMod();
        return fp ? fp.computeFingerprint(bundle.snapshot,
            bundle.configHashes) : "";
    } catch (ignored) {
        return "";
    }
}

/* Rollback bundle: profile-shaped so beginRollback can push it straight
 * back through the same apply pipeline. */
function _rollbackBundleOf(bundle) {
    const now = _isoNow();
    return {
        schemaVersion: _const("SCHEMA_VERSION", 1),
        id: "rollback",
        name: "(rollback)",
        description: "",
        createdAt: now,
        updatedAt: now,
        environment: _environment(),
        monitorTopology: bundle.topology,
        cinnamonSettings: bundle.snapshot.cinnamonSettings,
        appletConfigs: bundle.configs,
        fingerprint: _fingerprintOf(bundle),
        managerAnchor: { uuid: _selfUuid(), required: true }
    };
}

/* ------------------------------------------------------------------ *
 * Anchor repair and pre-flight warnings
 * ------------------------------------------------------------------ */

/* Repair the manager anchor on our copy of the profile (never the stored
 * file): parse the stored panels-enabled and enabled-applets values, run
 * ensureManagerAnchor against the live primary monitor and allocator, and
 * write repaired values back. Returns an array of user-facing warnings;
 * a parse failure returns {fatal: reason} instead. */
function _repairAnchor(profile) {
    const state = _cinnamonState();
    const settings = profile.cinnamonSettings;
    const eaStrv = _strvOfRecord(settings["enabled-applets"]);
    const peStrv = _strvOfRecord(settings["panels-enabled"]);
    if (!eaStrv || !peStrv)
        return { fatal: "stored enabled-applets or panels-enabled is unparseable" };

    let primaryIndex = 0;
    if (_topology()) {
        const topology = _topology().getCurrentTopology();
        (topology.monitors || []).forEach(function (m) {
            if (m.primary)
                primaryIndex = m.savedIndex;
        });
    }
    const liveNextId = state.readNextAppletId();

    const anchor = state.ensureManagerAnchor({
        enabledApplets: eaStrv,
        panelsEnabled: peStrv,
        nextAppletId: liveNextId,
        primaryMonitorIndex: primaryIndex
    });
    if (anchor.repaired) {
        const repairedRecord = _recordOfStrv(anchor.enabledApplets);
        if (repairedRecord)
            settings["enabled-applets"] = repairedRecord;
        if (anchor.panelsEnabled.join("\x00") !== peStrv.join("\x00")) {
            const panelsRecord = _recordOfStrv(anchor.panelsEnabled);
            if (panelsRecord)
                settings["panels-enabled"] = panelsRecord;
        }
        /* What gets applied now differs from the stored fingerprint, so
         * recompute it: verification and the pendingApply marker must
         * describe the repaired state, not the imported one. */
        try {
            const fpMod = _fingerprintMod();
            const configStore = _configStore();
            if (fpMod && configStore)
                profile.fingerprint = fpMod.computeFingerprint(profile,
                    configStore.configHashList(profile.appletConfigs || []));
        } catch (ignored) {
            /* verification falls back to the stored fingerprint */
        }
        _log("log", "manager anchor repaired for apply");
    }
    return { fatal: null };
}

/* Referenced applets that are not installed ride along as warnings; they
 * must never abort the restore (spec 15). */
function _collectApplyWarnings(profile) {
    const warnings = [];
    try {
        const state = _cinnamonState();
        const strv = _strvOfRecord(
            profile.cinnamonSettings["enabled-applets"]);
        if (!strv)
            return warnings;
        const parsed = state.parseEnabledApplets(strv);
        (parsed.malformed || []).forEach(function (raw) {
            warnings.push("malformed enabled-applets entry preserved: " + raw);
        });
        const self = _selfUuid();
        const seen = {};
        (parsed.entries || []).forEach(function (entry) {
            if (entry.uuid === self || seen[entry.uuid])
                return;
            seen[entry.uuid] = true;
            if (!_isAppletInstalled(entry.uuid))
                warnings.push("applet not installed: " + entry.uuid);
        });
    } catch (ignored) {
        /* warnings are best-effort */
    }
    return warnings;
}

/* ------------------------------------------------------------------ *
 * The apply pipeline
 * ------------------------------------------------------------------ */

/* Phases 6 through 12 of the transaction; the lock is held on entry and
 * always released on exit (verify keeps it until the settle timer
 * resolves). Never call directly: beginApply and beginRollback own the
 * lock. */
function _applyNow(profile, reason, applyWarnings) {
    let rollback = null;
    let enabledAppletsWritten = false;
    try {
        /* 6. Rollback snapshot before any modification. */
        _setState(STATE_SNAPSHOTTING_ROLLBACK);
        const bundle = _captureCurrent();
        rollback = _rollbackBundleOf(bundle);
        const store = _profileStore();
        if (!store || typeof store.writeRollback !== "function" ||
            !store.writeRollback(rollback))
            throw new Error("rollback snapshot could not be written");

        /* 7. Panel settings except enabled-applets. */
        _suppressDirty = true;
        _setState(STATE_RESTORING_PANEL_SETTINGS);
        const state = _cinnamonState();
        const settingsResult =
            state.restoreSettingsExceptEnabledApplets(profile);
        if (!settingsResult || settingsResult.ok !== true)
            throw new Error("panel settings restore failed: " +
                (settingsResult
                    ? settingsResult.warnings.join("; ")
                    : "no result"));

        /* 8. Applet config files. */
        _setState(STATE_RESTORING_APPLET_CONFIGS);
        const configStore = _configStore();
        configStore.restoreConfigs(profile.appletConfigs || []);

        /* 9. pendingApply BEFORE the enabled-applets write: if the write
         * destroys this instance, the next one resumes from state.json. */
        store.mutateState(function (s) {
            s.pendingApply = {
                profileId: reason === "rollback" ? null : profile.id,
                reason: reason,
                startedAt: _isoNow(),
                fingerprint: typeof profile.fingerprint === "string"
                    ? profile.fingerprint : ""
            };
        });

        /* 10. enabled-applets LAST: one write, Cinnamon live-applies it
         * and may destroy this instance mid-call. After this point only
         * state.json work (plus the allocator bump and the settle timer)
         * continues; no Main-shaped dependency is touched again. */
        _setState(STATE_RESTORING_ENABLED_APPLETS);
        if (state.restoreEnabledApplets(profile) !== true)
            throw new Error("enabled-applets write failed");
        enabledAppletsWritten = true;

        /* 11. Bump the allocator past the max restored id, forward-only.
         * The anchor's allocated id is already inside the entries. */
        _bumpPastMaxId(profile);

        /* 12. Verification after the settle window. */
        _scheduleVerification(profile, reason);
        return _applyResult(true, undefined, applyWarnings);
    } catch (e) {
        _log("error", "apply failed", e);
        _handleApplyError(e, rollback, enabledAppletsWritten);
        return _applyResult(true, "apply failed", applyWarnings);
    }
}

/* Result shape for beginApply: warnings ride along only when there are
 * any, so exact-shape comparisons by callers stay stable. */
function _applyResult(started, failure, applyWarnings) {
    const result = { started: started };
    if (failure)
        result.failure = failure;
    if (applyWarnings && applyWarnings.length > 0)
        result.warnings = applyWarnings;
    return result;
}

function _bumpPastMaxId(profile) {
    try {
        const state = _cinnamonState();
        const strv = _strvOfRecord(
            profile.cinnamonSettings["enabled-applets"]);
        if (!strv)
            return;
        const parsed = state.parseEnabledApplets(strv);
        let maxId = 0;
        (parsed.entries || []).forEach(function (entry) {
            if (entry.instanceId === null)
                return;
            const n = parseInt(entry.instanceId, 10);
            if (Number.isFinite(n) && n > maxId)
                maxId = n;
        });
        if (maxId > 0)
            state.bumpNextAppletId(maxId + 1);
    } catch (ignored) {
        /* forward-only bump is best-effort; collisions are caught later
         * by verification */
    }
}

/* Exactly one verification timer may be armed. When our own enabled-applets
 * entry changes mid-apply, the dying instance has already scheduled one and
 * the successor's resumePendingApply() schedules another; overwriting the id
 * without cancelling leaks the first timer, and both then fire (double
 * "profile loaded" notifications). Cancel-then-schedule keeps the newest
 * timer the only one. */
function _cancelVerifyTimer() {
    if (_verifyTimerId !== null) {
        try {
            _scheduler().sourceRemove(_verifyTimerId);
        } catch (e) {
            /* source already gone */
        }
    }
    _verifyTimerId = null;
}

function _scheduleVerification(profile, reason) {
    const scheduler = _scheduler();
    if (!scheduler || typeof scheduler.timeoutAdd !== "function")
        throw new Error("no scheduler available for verification");
    _cancelVerifyTimer();
    _setState(STATE_VERIFYING);
    _verifyTimerId = scheduler.timeoutAdd(_const("VERIFY_SETTLE_MS", 1500),
        function () {
            _verifyTimerId = null;
            _runVerification(profile, reason);
            return false;
        });
}

/* Step 12: canonical verify against the profile plus a live fingerprint
 * compare. Success commits state.json; failure keeps the rollback, warns
 * exactly once and never retries. Runs on a timer, possibly after this
 * instance was destroyed; only state.json, the settings/config stores,
 * the logger and the notify wrapper are touched. */
function _runVerification(profile, reason) {
    try {
        const state = _cinnamonState();
        const verdict = state.verifyAgainst(profile);
        let fingerprintOk = true;
        const target = typeof profile.fingerprint === "string"
            ? profile.fingerprint : "";
        if (target.length > 0) {
            const live = _liveFingerprint();
            if (live === null || live !== target)
                fingerprintOk = false;
        }
        if ((verdict && verdict.ok) && fingerprintOk) {
            const store = _profileStore();
            store.mutateState(function (s) {
                /* A rollback is not a named profile: the desktop matches
                 * nothing in the list, so nothing is active. */
                s.activeProfileId = reason === "rollback"
                    ? null : profile.id;
                s.pendingApply = null;
                s.lastSuccessfulApply = _isoNow();
            });
            _suppressDirty = false;
            _setState(STATE_COMPLETE);
            _setState(STATE_IDLE);
            _release();
            _log("log", "verification succeeded for " + profile.name);
            if (_notifySuccessEnabled())
                _notify("success", "Panel Profiles",
                    "Panel profile loaded: " + profile.name);
        } else {
            const mismatched = verdict ? verdict.mismatchedKeys : [];
            /* Log the live value of each mismatched panel key. These are
             * org.cinnamon panel-layout keys only, never applet config
             * contents, so nothing private can leak. Seeing the actual
             * value is the difference between debugging a Cinnamon
             * rewrite and guessing. */
            let detail = "";
            try {
                const cs = _cinnamonState();
                detail = mismatched.map(function (k) {
                    const live = cs ? cs.getRaw(k) : null;
                    const saved = profile.cinnamonSettings[k]
                        ? profile.cinnamonSettings[k].value : "?";
                    return k + " live=" + live + " saved=" + saved;
                }).join("; ");
            } catch (ignored) {
                /* diagnostics must not mask the failure */
            }
            _log("warn", "verification mismatched keys: " +
                (mismatched.join(", ") || "fingerprint differs") +
                (detail ? " [" + detail + "]" : ""));
            _recordLastFailure("verification failed after apply", {
                mismatchedKeys: mismatched,
                fingerprintOk: fingerprintOk
            });
            /* Known outcome: a later resume would only re-fail, so the
             * pending marker is cleared (the UNKNOWN-outcome path, an
             * exception at/after the write, keeps it instead). */
            const store = _profileStore();
            store.mutateState(function (s) {
                s.pendingApply = null;
            });
            _suppressDirty = false;
            _setState(STATE_FAILED);
            _setState(STATE_IDLE);
            _release();
            _notify("warn", "Panel Profiles",
                "Profile \"" + profile.name + "\" did not verify after " +
                "restoring. The previous layout can be restored from the " +
                "menu.");
        }
    } catch (e) {
        /* An exception in verification is an at/after-write failure. */
        _log("error", "verification threw", e);
        _handleApplyError(e, null, true);
    }
}

/* Step 13. Before the enabled-applets write: configs overwritten during
 * this attempt are restored from the rollback bundle and pendingApply is
 * cleared (the attempt is over). At/after the write the outcome is
 * unknown to us, so the rollback is preserved, pendingApply is LEFT for
 * a resumed verification, and exactly one warning goes out. */
function _handleApplyError(e, rollback, enabledAppletsWritten) {
    try {
        if (!enabledAppletsWritten) {
            if (rollback) {
                try {
                    const configStore = _configStore();
                    configStore.restoreConfigs(rollback.appletConfigs || []);
                } catch (restored) {
                    _log("warn", "config auto-restore failed: " + restored);
                }
            }
            const store = _profileStore();
            if (store && typeof store.mutateState === "function") {
                store.mutateState(function (s) {
                    s.pendingApply = null;
                });
            }
            _recordLastFailure("apply failed: " +
                (e && e.message ? e.message : String(e)));
            _failTerminal();
            _notify("warn", "Panel Profiles",
                "Profile could not be applied: " +
                (e && e.message ? e.message : String(e)));
        } else {
            _recordLastFailure("apply failed after the applet list was " +
                "written: " + (e && e.message ? e.message : String(e)));
            _failTerminal();
            _notify("warn", "Panel Profiles",
                "Profile apply failed after the applet list was written. " +
                "The previous layout can be restored from the menu.");
        }
    } catch (outer) {
        /* never leave the lock held */
        _failTerminal();
    }
}

/* Shared continuation once a profile object is validated: anchor repair,
 * pre-flight warnings, the monitor gate, then the write pipeline. */
function _continueApply(profile, reason) {
    const anchor = _repairAnchor(profile);
    if (anchor.fatal) {
        _recordLastFailure(anchor.fatal);
        _failTerminal();
        return { started: false, failure: anchor.fatal };
    }
    const warnings = _collectApplyWarnings(profile);
    if (warnings.length > 0) {
        /* Spec 15/45: a missing third-party applet must not abort the
         * restore, but the user has to hear about it. Surface the collected
         * warnings once (log plus a warning notification; the notify wrapper
         * already honors the notify-warnings setting). */
        const text = warnings.join("; ");
        _log("warn", "apply warnings: " + text);
        _notify("warn", "Panel Profiles", "Profile loaded with warnings: " + text);
    }

    /* 5. Monitor gate: only when the profile expects more heads than are
     * live. Both user- and startup-initiated applies wait internally and
     * continue on ready; a user-initiated one also reports the wait back
     * to the caller as a non-start. */
    let expectedCount = 1;
    try {
        const topology = profile.monitorTopology;
        if (topology && Number.isFinite(Number(topology.expectedCount)))
            expectedCount = Math.max(1, Math.floor(
                Number(topology.expectedCount)));
    } catch (ignored) {
    }
    const currentCount = _topology()
        ? _topology().getMonitorCount() : 0;
    if (expectedCount > currentCount) {
        _setState(STATE_WAITING_FOR_MONITORS);
        _lastMonitorCount = currentCount;
        _notifyWaitState(true, currentCount, expectedCount);
        const stabilizeMs = (_deps && Number.isFinite(
            Number(_deps.waitStabilizeMs)))
            ? Number(_deps.waitStabilizeMs)
            : _const("STABILIZE_MS_DEFAULT", 2000);
        const timeoutMs = (_deps && Number.isFinite(
            Number(_deps.waitTimeoutMs)))
            ? Number(_deps.waitTimeoutMs) : 60000;
        _waitHandle = _topology().waitForTopology(expectedCount, {
            stabilizeMs: stabilizeMs,
            timeoutMs: timeoutMs,
            onProgress: function (count, required) {
                _lastMonitorCount = count;
                _notifyWaitState(true, count, required);
            },
            onReady: function () {
                _waitHandle = null;
                _notifyWaitState(false, _lastMonitorCount, expectedCount);
                _log("log", "monitors ready, continuing apply");
                _applyNow(profile, reason, warnings);
            },
            onTimeout: function () {
                _waitHandle = null;
                _notifyWaitState(false, _lastMonitorCount, expectedCount);
                _log("warn", "monitor wait timed out: " +
                    _lastMonitorCount + "/" + expectedCount);
                _recordLastFailure("monitor wait timed out: " +
                    _lastMonitorCount + " of " + expectedCount +
                    " required displays became available");
                _failTerminal();
                _notify("warn", "Panel Profiles",
                    "\"" + profile.name + "\" was not restored because " +
                    "only " + _lastMonitorCount + " of " + expectedCount +
                    " required displays became available.");
            }
        });
        if (reason === "user")
            return _applyResult(false, "waiting", warnings);
        return _applyResult(true, null, warnings);
    }
    return _applyNow(profile, reason, warnings);
}

/**
 * beginApply:
 * @profileId (string): stored profile id.
 * @options (object): {reason: "user" | "startup" | "rollback"}.
 *
 * Runs the full transaction. The immediate return does not mean the apply
 * finished: verification lands on a settle timer, and a monitor wait can
 * defer the writes entirely.
 *
 * Returns (object): {started, failure?, warnings?}. started is false with
 * failure "busy" when another operation holds the lock, with a validation
 * error string, or (reason "user", insufficient monitors) with "waiting"
 * while the wait continues internally.
 */
function beginApply(profileId, options) {
    try {
        options = options || {};
        const reason = (options.reason === "startup" ||
            options.reason === "rollback")
            ? options.reason : "user";
        if (!_lock())
            return { started: false, failure: "busy" };

        /* 2. VALIDATING: load, migrate, validate (the store runs the
         * schema seam wired in setDependencies). */
        _setState(STATE_VALIDATING);
        const store = _profileStore();
        if (!store || typeof store.loadProfile !== "function") {
            _recordLastFailure("profile store unavailable");
            _failTerminal();
            return { started: false, failure: "profile store unavailable" };
        }
        const loaded = store.loadProfile(profileId);
        if (!loaded || loaded.error || !loaded.profile) {
            const failure = "profile load failed: " +
                (loaded ? loaded.error : "no result");
            _recordLastFailure(failure);
            _failTerminal();
            return { started: false, failure: failure };
        }
        return _continueApply(loaded.profile, reason);
    } catch (e) {
        _log("error", "beginApply failed", e);
        _handleApplyError(e, null, false);
        return { started: false, failure: "apply failed" };
    }
}

/**
 * beginRollback:
 *
 * Loads backups/last-good.json and pushes it through the exact same
 * pipeline with reason "rollback" (the normal flow snapshots the current
 * state as the new rollback first, so nothing is lost).
 *
 * Returns (object): {started, failure?}.
 */
function beginRollback() {
    try {
        if (!_lock())
            return { started: false, failure: "busy" };
        _setState(STATE_VALIDATING);
        const store = _profileStore();
        if (!store || typeof store.readRollback !== "function") {
            _failTerminal();
            return { started: false, failure: "profile store unavailable" };
        }
        const bundle = store.readRollback();
        if (!bundle) {
            _setState(STATE_IDLE);
            _release();
            return { started: false, failure: "no rollback snapshot" };
        }
        const schema = _schema();
        const verdict = schema && typeof schema.validate === "function"
            ? schema.validate(bundle) : { ok: true, errors: [] };
        if (!verdict || !verdict.ok) {
            const failure = "rollback bundle invalid: " +
                (verdict && verdict.errors
                    ? verdict.errors.join("; ") : "unknown");
            _recordLastFailure(failure);
            _failTerminal();
            return { started: false, failure: failure };
        }
        return _continueApply(bundle, "rollback");
    } catch (e) {
        _log("error", "beginRollback failed", e);
        _handleApplyError(e, null, false);
        return { started: false, failure: "rollback failed" };
    }
}

/**
 * resumePendingApply:
 *
 * Applet _init entry: if state.json carries a pendingApply (a previous
 * instance died around the enabled-applets write), jump straight to the
 * verification path. A pending rollback is verified against the
 * fingerprint recorded in the marker (its bundle was overwritten by the
 * newer snapshot); a pending profile is reloaded from disk. A marker
 * whose target is gone is cleared, failed once, and reported false.
 *
 * Returns (boolean): true when a verification was scheduled.
 */
function resumePendingApply() {
    try {
        if (_busy)
            return false;
        const store = _profileStore();
        if (!store || typeof store.getState !== "function")
            return false;
        const pending = store.getState().pendingApply;
        if (!pending || typeof pending !== "object" ||
            typeof pending.reason !== "string")
            return false;

        if (!_lock())
            return false;
        _suppressDirty = true;

        if (pending.reason === "rollback") {
            _cancelVerifyTimer();
            _setState(STATE_VERIFYING);
            _verifyTimerId = _scheduler().timeoutAdd(
                _const("VERIFY_SETTLE_MS", 1500),
                function () {
                    _verifyTimerId = null;
                    _runRollbackResume(pending);
                    return false;
                });
            return true;
        }

        const loaded = store.loadProfile(pending.profileId);
        if (!loaded || loaded.error || !loaded.profile) {
            store.mutateState(function (s) {
                s.pendingApply = null;
            });
            _recordLastFailure("pending apply target profile is gone");
            _failTerminal();
            _log("warn", "pending apply target profile is gone");
            return false;
        }
        _cancelVerifyTimer();
        _setState(STATE_VERIFYING);
        _verifyTimerId = _scheduler().timeoutAdd(
            _const("VERIFY_SETTLE_MS", 1500),
            function () {
                _verifyTimerId = null;
                _runVerification(loaded.profile, pending.reason);
                return false;
            });
        return true;
    } catch (e) {
        _log("error", "resumePendingApply failed", e);
        _failTerminal();
        return false;
    }
}

/* Verification completion for a resumed rollback: the live fingerprint
 * must match the one recorded in the marker. */
function _runRollbackResume(pending) {
    try {
        const target = typeof pending.fingerprint === "string"
            ? pending.fingerprint : "";
        const live = _liveFingerprint();
        const store = _profileStore();
        if (target.length > 0 && live !== null && live === target) {
            store.mutateState(function (s) {
                s.pendingApply = null;
                s.activeProfileId = null;
                s.lastSuccessfulApply = _isoNow();
            });
            _suppressDirty = false;
            _setState(STATE_COMPLETE);
            _setState(STATE_IDLE);
            _release();
            _log("log", "resumed rollback verified");
            if (_notifySuccessEnabled())
                _notify("success", "Panel Profiles",
                    "Previous layout restored.");
        } else {
            _recordLastFailure("resumed rollback did not verify");
            store.mutateState(function (s) {
                s.pendingApply = null;
            });
            _suppressDirty = false;
            _setState(STATE_FAILED);
            _setState(STATE_IDLE);
            _release();
            _notify("warn", "Panel Profiles",
                "The previous layout could not be verified after " +
                "restoring. Try restoring it again from the menu.");
        }
    } catch (e) {
        _log("error", "rollback resume threw", e);
        _handleApplyError(e, null, true);
    }
}

/**
 * computeCurrentFingerprint:
 *
 * Fingerprint of the live panel state for the applet's dirty checks
 * (settings plus captured config hashes; the layout provider is never
 * touched, so this is safe at any time).
 *
 * Returns (string|null): hex sha256, or null when unevaluable.
 */
function computeCurrentFingerprint() {
    return _liveFingerprint();
}

/**
 * cancelAll:
 *
 * Cancels any monitor wait and verification timer, releases the lock and
 * settles to IDLE. state.json is left exactly as it is: a pendingApply
 * survives on purpose, because a reload may still resume it.
 */
function cancelAll() {
    try {
        _cancelWaitHandle();
        _notifyWaitState(false, _lastMonitorCount, 0);
        _cancelVerifyTimer();
        _suppressDirty = false;
        _setState(STATE_IDLE);
        _release();
    } catch (e) {
        _log("warn", "cancelAll failed: " + e);
        _release();
    }
}

/* ------------------------------------------------------------------ *
 * Save and manage operations (same single-operation lock)
 * ------------------------------------------------------------------ */

/**
 * beginSaveNew:
 * @name (string): candidate profile name (trimmed, capped here).
 *
 * Capture-only: snapshot the live state into a brand-new profile. No
 * rollback is written and nothing is restored.
 *
 * Returns (object): {ok, profile?, reason?} with reason "busy" or
 * "invalid-name" on the guard failures.
 */
function beginSaveNew(name) {
    try {
        if (!_lock())
            return { ok: false, reason: "busy" };
        const schema = _schema();
        const clean = schema && typeof schema.sanitizeName === "function"
            ? schema.sanitizeName(name) : null;
        if (clean === null) {
            _setState(STATE_IDLE);
            _release();
            return { ok: false, reason: "invalid-name" };
        }
        _setState(STATE_SAVING);
        const bundle = _captureCurrent();
        const store = _profileStore();
        const profile = store.createFromSnapshot({
            name: clean,
            description: "",
            snapshot: bundle.snapshot.cinnamonSettings,
            configs: bundle.configs,
            configHashes: bundle.configHashes,
            topology: bundle.topology,
            fingerprint: _fingerprintOf(bundle),
            cinnamonVersion: _environment().cinnamonVersion,
            sessionType: _environment().sessionType
        });
        if (!profile)
            throw new Error("createFromSnapshot failed");
        _onProfileSaved(profile);
        _setState(STATE_IDLE);
        _release();
        return { ok: true, profile: profile };
    } catch (e) {
        _log("error", "beginSaveNew failed", e);
        _recordLastFailure("save failed: " +
            (e && e.message ? e.message : String(e)));
        _failTerminal();
        return { ok: false, reason: "save failed" };
    }
}

/**
 * beginSaveUpdate:
 * @profileId (string): existing profile to overwrite with the live state.
 *
 * Same capture as beginSaveNew routed through updateFromSnapshot, which
 * preserves id, createdAt, name, description and startup designation.
 *
 * Returns (object): {ok, profile?, reason?}.
 */
function beginSaveUpdate(profileId) {
    try {
        if (!_lock())
            return { ok: false, reason: "busy" };
        _setState(STATE_SAVING);
        const store = _profileStore();
        const loaded = store.loadProfile(profileId);
        if (!loaded || loaded.error || !loaded.profile) {
            _failTerminal();
            return { ok: false, reason: "not-found" };
        }
        const bundle = _captureCurrent();
        const updated = store.updateFromSnapshot(loaded.profile, {
            snapshot: bundle.snapshot.cinnamonSettings,
            configs: bundle.configs,
            topology: bundle.topology,
            fingerprint: _fingerprintOf(bundle)
        });
        if (!updated)
            throw new Error("updateFromSnapshot failed");
        _onProfileSaved(updated);
        _setState(STATE_IDLE);
        _release();
        return { ok: true, profile: updated };
    } catch (e) {
        _log("error", "beginSaveUpdate failed", e);
        _recordLastFailure("update failed: " +
            (e && e.message ? e.message : String(e)));
        _failTerminal();
        return { ok: false, reason: "update failed" };
    }
}

function _onProfileSaved(profile) {
    try {
        if (_deps && typeof _deps.onProfileSaved === "function")
            _deps.onProfileSaved(profile);
    } catch (ignored) {
        /* dirty-baseline reset is the applet's problem, not ours */
    }
}

/**
 * beginDuplicate:
 * @profileId (string): profile to duplicate.
 *
 * Returns (object): {ok, profile?, reason?}.
 */
function beginDuplicate(profileId) {
    try {
        if (!_lock())
            return { ok: false, reason: "busy" };
        _setState(STATE_MANAGING);
        const copy = _profileStore().duplicateProfile(profileId);
        _setState(STATE_IDLE);
        _release();
        if (!copy)
            return { ok: false, reason: "not-found" };
        return { ok: true, profile: copy };
    } catch (e) {
        _log("error", "beginDuplicate failed", e);
        _failTerminal();
        return { ok: false, reason: "duplicate failed" };
    }
}

/**
 * beginDelete:
 * @profileId (string): profile to delete.
 *
 * Thin wrapper over the store (which also clears active/startup ids in
 * state.json when they point at the profile); additionally drops a
 * pendingApply that targets the deleted profile, since its verification
 * could never succeed.
 *
 * Returns (object): {ok, reason?}.
 */
function beginDelete(profileId) {
    try {
        if (!_lock())
            return { ok: false, reason: "busy" };
        _setState(STATE_MANAGING);
        const store = _profileStore();
        const removed = store.deleteProfile(profileId);
        if (removed) {
            store.mutateState(function (s) {
                if (s.pendingApply && s.pendingApply.profileId === profileId)
                    s.pendingApply = null;
            });
        }
        _setState(STATE_IDLE);
        _release();
        if (!removed)
            return { ok: false, reason: "not-found" };
        return { ok: true };
    } catch (e) {
        _log("error", "beginDelete failed", e);
        _failTerminal();
        return { ok: false, reason: "delete failed" };
    }
}

/**
 * beginRename:
 * @profileId (string): profile to rename.
 * @name (string): new name (sanitized here before it reaches the store).
 *
 * Returns (object): {ok, reason?}.
 */
function beginRename(profileId, name) {
    try {
        if (!_lock())
            return { ok: false, reason: "busy" };
        const schema = _schema();
        const clean = schema && typeof schema.sanitizeName === "function"
            ? schema.sanitizeName(name) : null;
        if (clean === null) {
            _setState(STATE_IDLE);
            _release();
            return { ok: false, reason: "invalid-name" };
        }
        _setState(STATE_MANAGING);
        const renamed = _profileStore().renameProfile(profileId, clean);
        _setState(STATE_IDLE);
        _release();
        if (!renamed)
            return { ok: false, reason: "not-found" };
        return { ok: true };
    } catch (e) {
        _log("error", "beginRename failed", e);
        _failTerminal();
        return { ok: false, reason: "rename failed" };
    }
}

/**
 * setStartupProfile:
 * @profileId (string|null): profile to designate, or null to clear.
 *
 * Returns (object): {ok, reason?}.
 */
function setStartupProfile(profileId) {
    try {
        if (!_lock())
            return { ok: false, reason: "busy" };
        _setState(STATE_MANAGING);
        const store = _profileStore();
        if (profileId !== null) {
            const loaded = store.loadProfile(profileId);
            if (!loaded || loaded.error || !loaded.profile) {
                _setState(STATE_IDLE);
                _release();
                return { ok: false, reason: "not-found" };
            }
        }
        store.mutateState(function (s) {
            s.startupProfileId = profileId;
        });
        _setState(STATE_IDLE);
        _release();
        return { ok: true };
    } catch (e) {
        _log("error", "setStartupProfile failed", e);
        _failTerminal();
        return { ok: false, reason: "set-startup failed" };
    }
}
