/* Panel Profiles profile store: profiles CRUD, state.json, rollback files.
 *
 * Everything the applet persists lives under STATE_DIR: named profiles in
 * profiles/<id>.json, rollback snapshots in backups/last-good[-<n>].json,
 * and the small machine-owned state.json (active/startup/pendingApply).
 * All writes go through atomicFile (temp sibling + rename, 0600, dirs 0700).
 * Profile ids are validated against a tight pattern before they ever touch
 * a path, because ids come from filenames and, via imports, from outside.
 *
 * DEPENDENCY NOTE: profileSchema.js (validate/migrate) is owned by a
 * parallel work package and MUST NOT be imported here. Instead the
 * composition root injects validators via setDependencies({ validateProfile,
 * migrateProfile }). Until then this store falls back to a minimal
 * structural check (schemaVersion === 1, id and name strings) and skips
 * migration entirely.
 *
 * No St/Clutter imports and no require() calls: this module must stay
 * loadable headless via imports.searchPath so the dev-tools test harness can
 * use it directly.
 *
 * Public names are declared with var/function so both the require()
 * auto-export inside Cinnamon and the plain imports.<mod> loader see them.
 *
 * Copyright (C) 2026 curbsoftware
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

/* ------------------------------------------------------------------ *
 * Sibling modules (constants, atomicFile)
 * ------------------------------------------------------------------ *
 * Resolved lazily through the plain importer instead of require() so this
 * file works in plain gjs. Whoever loads us, tests or the composition root
 * in applet.js, must put the lib directory on imports.searchPath first.
 * Lazy resolution means a load-order mistake degrades to logged failures
 * and failure return values, never a module-load crash. */
let _constants = null;
let _atomicFile = null;
let _siblingsResolved = false;

function _resolveSiblings() {
    if (_siblingsResolved)
        return;
    _siblingsResolved = true;
    try {
        _constants = imports.constants;
    } catch (ignored) {
        _constants = null;
    }
    try {
        _atomicFile = imports.atomicFile;
    } catch (ignored) {
        _atomicFile = null;
    }
}

/* ------------------------------------------------------------------ *
 * Dependency seam
 * ------------------------------------------------------------------ */

let _logger = null;
let _validateProfile = null; /* injected by the composition root (WP1) */
let _migrateProfile = null;

/**
 * setDependencies:
 * @deps (object): { logger, validateProfile, migrateProfile }
 *
 * logger: optional object with warn()/error(). validateProfile(profile)
 * must return null when valid, a string error otherwise; migrateProfile
 * (profile) must return an upgraded profile in place or a new object. Both
 * default to null: the store then only runs its minimal structural check.
 * Unknown keys are ignored.
 */
function setDependencies(deps) {
    try {
        if (!deps)
            return;
        if (deps.logger !== undefined)
            _logger = deps.logger || null;
        if (typeof deps.validateProfile === "function")
            _validateProfile = deps.validateProfile;
        if (typeof deps.migrateProfile === "function")
            _migrateProfile = deps.migrateProfile;
    } catch (ignored) {
        /* seam must never throw */
    }
}

/**
 * resetDependencies:
 *
 * Restores defaults. Test teardown helper.
 */
function resetDependencies() {
    _logger = null;
    _validateProfile = null;
    _migrateProfile = null;
    _siblingsResolved = false;
}

function _warn(msg) {
    try {
        if (_logger && typeof _logger.warn === "function")
            _logger.warn(msg);
    } catch (ignored) {
        /* logging must never take the caller down */
    }
}

/* ------------------------------------------------------------------ *
 * Paths and small helpers
 * ------------------------------------------------------------------ */

/* Profile ids are uuids (letters, digits, hyphens) and nothing else; this
 * is also the traversal guard for filenames that come off disk or out of
 * imported data. */
const PROFILE_ID_RE = /^[A-Za-z0-9-]+$/;

function _stateDirPath() {
    _resolveSiblings();
    return _constants ? _constants.STATE_DIR : "";
}

function _profilesDirPath() {
    return GLib.build_filenamev([_stateDirPath(), _constants.PROFILES_SUBDIR]);
}

function _backupsDirPath() {
    return GLib.build_filenamev([_stateDirPath(), _constants.BACKUPS_SUBDIR]);
}

function _stateFilePath() {
    return GLib.build_filenamev([_stateDirPath(), _constants.STATE_FILE]);
}

function _profileFilePath(id) {
    return GLib.build_filenamev([_profilesDirPath(), id + ".json"]);
}

function _lastGoodPath() {
    return GLib.build_filenamev([_backupsDirPath(), _constants.LAST_GOOD_FILE]);
}

function _numberedRollbackPath(n) {
    return GLib.build_filenamev([_backupsDirPath(),
        _constants.LAST_GOOD_FILE.replace(/\.json$/, "") + "-" + n + ".json"]);
}

/* ISO 8601 with a numeric timezone offset (-07:00 style). GLib's own
 * format_iso8601() omits the minutes half of the offset on whole-hour
 * zones and nothing downstream can parse that; %:z always emits hh:mm. */
function _isoNow() {
    return GLib.DateTime.new_now_local().format("%Y-%m-%dT%H:%M:%S%:z");
}

function _defaultState() {
    _resolveSiblings();
    return {
        schemaVersion: _constants ? _constants.STATE_SCHEMA_VERSION : 1,
        activeProfileId: null,
        startupProfileId: null,
        pendingApply: null,
        lastSuccessfulApply: null,
        lastFailure: null,
        warnedPrimaryPlacement: false
    };
}

/* Merge a parsed state over the defaults so a future schema that gained a
 * key still loads on an older state file without a spurious recovery. */
function _mergeState(parsed) {
    const state = _defaultState();
    if (parsed && typeof parsed === "object") {
        for (const key in state) {
            if (parsed[key] !== undefined)
                state[key] = parsed[key];
        }
    }
    return state;
}

function _selfUuidValue() {
    _resolveSiblings();
    if (_constants && typeof _constants.selfUuid === "function")
        return String(_constants.selfUuid());
    return "";
}

/* ------------------------------------------------------------------ *
 * init
 * ------------------------------------------------------------------ */

/**
 * init:
 *
 * Ensures STATE_DIR, profiles/ and backups/ exist (0700), then reads
 * state.json. Corrupt JSON or a wrong-shaped state is renamed to
 * state.json.corrupt-<unixts> and replaced with safe defaults; profile
 * files are NEVER touched during recovery. If the quarantine rename fails
 * the corrupt file is left in place and defaults are returned unwritten,
 * because destroying the user's state to "fix" it is worse than running
 * on defaults.
 *
 * Returns (object): { state, recoveredWarnings[] }.
 */
function init() {
    const warnings = [];
    let state = _defaultState();
    _resolveSiblings();
    if (!_atomicFile) {
        warnings.push("sibling modules unavailable");
        return { state: state, recoveredWarnings: warnings };
    }
    try {
        if (!_atomicFile.ensurePrivateDir(_stateDirPath()) ||
            !_atomicFile.ensurePrivateDir(_profilesDirPath()) ||
            !_atomicFile.ensurePrivateDir(_backupsDirPath())) {
            warnings.push("could not create state directories");
            return { state: state, recoveredWarnings: warnings };
        }

        const statePath = _stateFilePath();
        if (!_atomicFile.fileExists(statePath)) {
            if (!_atomicFile.writePrivateFileAtomic(statePath,
                    JSON.stringify(state, null, 2)))
                warnings.push("could not write initial state.json");
            return { state: state, recoveredWarnings: warnings };
        }

        const text = _atomicFile.readTextFile(statePath);
        let parsed = null;
        try {
            parsed = text === null ? null : JSON.parse(text);
        } catch (ignored) {
            parsed = null;
        }
        const shapeOk = parsed !== null && typeof parsed === "object" &&
            parsed.schemaVersion === _defaultState().schemaVersion;
        if (shapeOk) {
            state = _mergeState(parsed);
            /* Persist the merge only when it actually changed something. */
            const mergedText = JSON.stringify(state, null, 2);
            if (mergedText !== text &&
                !_atomicFile.writePrivateFileAtomic(statePath, mergedText))
                warnings.push("could not persist normalized state.json");
            return { state: state, recoveredWarnings: warnings };
        }

        const quarantined = _quarantineStateFile(statePath);
        if (quarantined === null) {
            warnings.push("state.json unreadable and could not be quarantined");
            return { state: state, recoveredWarnings: warnings };
        }
        warnings.push("state.json was corrupt; recovered to defaults, " +
            "old file kept as " + quarantined);
        _warn("state.json corrupt, quarantined as " + quarantined);
        if (!_atomicFile.writePrivateFileAtomic(statePath,
                JSON.stringify(state, null, 2)))
            warnings.push("could not write fresh state.json");
    } catch (e) {
        _warn("init failed: " + e);
        warnings.push("init failed: " + e);
    }
    return { state: state, recoveredWarnings: warnings };
}

/* Rename the corrupt state file aside. Returns the new basename or null. */
function _quarantineStateFile(statePath) {
    try {
        const ts = Math.floor(GLib.get_real_time() / 1000000);
        let target = statePath + ".corrupt-" + ts;
        let n = 2;
        while (_atomicFile.fileExists(target)) {
            target = statePath + ".corrupt-" + ts + "-" + n;
            n++;
        }
        Gio.File.new_for_path(statePath).move(
            Gio.File.new_for_path(target), Gio.FileCopyFlags.NONE, null, null);
        return target.substr(target.lastIndexOf("/") + 1);
    } catch (e) {
        _warn("could not quarantine state.json: " + e);
        return null;
    }
}

/* ------------------------------------------------------------------ *
 * Listing and loading
 * ------------------------------------------------------------------ */

/**
 * listProfiles:
 *
 * Scans profiles/*.json. A file that is unreadable or not valid JSON is
 * listed with valid:false and its name taken from the filename so the UI
 * can still show (and the user delete) the broken thing. Sorted by name
 * with localeCompare; Array.sort is stable in SpiderMonkey.
 *
 * Returns (array): [{id, name, updatedAt, expectedCount, valid}].
 */
function listProfiles() {
    const out = [];
    _resolveSiblings();
    if (!_atomicFile)
        return out;
    try {
        if (!_atomicFile.ensurePrivateDir(_profilesDirPath()))
            return out;
        const dir = Gio.File.new_for_path(_profilesDirPath());
        const children = dir.enumerate_children("standard::name,standard::type",
            Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = children.next_file(null)) !== null) {
            const name = info.get_name();
            if (info.get_file_type() !== Gio.FileType.REGULAR)
                continue;
            if (name.length <= 5 || name.substr(name.length - 5) !== ".json")
                continue;
            const id = name.substr(0, name.length - 5);
            let entry = {
                id: id,
                name: id,
                updatedAt: null,
                expectedCount: null,
                valid: false
            };
            const text = _atomicFile.readTextFile(_profileFilePath(id));
            let parsed = null;
            try {
                parsed = text === null ? null : JSON.parse(text);
            } catch (ignored) {
                parsed = null;
            }
            if (parsed !== null && typeof parsed === "object" &&
                typeof parsed.name === "string" && parsed.name.length > 0) {
                entry.name = parsed.name;
                entry.updatedAt = typeof parsed.updatedAt === "string"
                    ? parsed.updatedAt : null;
                entry.expectedCount = parsed.monitorTopology &&
                    typeof parsed.monitorTopology.expectedCount === "number"
                    ? parsed.monitorTopology.expectedCount : null;
                entry.valid = true;
            }
            out.push(entry);
        }
        children.close(null);
        out.sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
    } catch (e) {
        _warn("listProfiles failed: " + e);
    }
    return out;
}

/**
 * loadProfile:
 * @id (string): profile id (filename stem).
 *
 * Reads and parses the profile, then migrates and validates it. With no
 * injected validators this is a minimal structural check only
 * (schemaVersion === 1, id and name strings); the composition root injects
 * profileSchema.validate/migrate at applet init (see the dependency note
 * at the top of this file).
 *
 * Returns (object): { profile, error } with profile null on any failure.
 */
function loadProfile(id) {
    _resolveSiblings();
    if (!_atomicFile)
        return { profile: null, error: "sibling modules unavailable" };
    try {
        if (typeof id !== "string" || !PROFILE_ID_RE.test(id))
            return { profile: null, error: "invalid profile id" };
        const text = _atomicFile.readTextFile(_profileFilePath(id));
        if (text === null)
            return { profile: null, error: "profile file unreadable" };
        let profile;
        try {
            profile = JSON.parse(text);
        } catch (e) {
            return { profile: null, error: "invalid JSON: " + e.message };
        }
        if (profile === null || typeof profile !== "object")
            return { profile: null, error: "profile is not an object" };

        if (_migrateProfile) {
            try {
                const migrated = _migrateProfile(profile);
                profile = migrated !== undefined && migrated !== null
                    ? migrated : profile;
            } catch (e) {
                return { profile: null, error: "migration failed: " + e.message };
            }
        }

        if (_validateProfile) {
            let error = null;
            try {
                error = _validateProfile(profile);
            } catch (e) {
                error = "validator threw: " + e.message;
            }
            if (error)
                return { profile: null, error: error };
        } else {
            const versionOk = _constants
                ? profile.schemaVersion === _constants.SCHEMA_VERSION
                : profile.schemaVersion === 1;
            if (!versionOk)
                return { profile: null, error: "unsupported schemaVersion" };
            if (typeof profile.id !== "string" || profile.id.length === 0)
                return { profile: null, error: "missing id" };
            if (typeof profile.name !== "string" || profile.name.length === 0)
                return { profile: null, error: "missing name" };
        }
        return { profile: profile, error: null };
    } catch (e) {
        return { profile: null, error: "loadProfile failed: " + e.message };
    }
}

/* ------------------------------------------------------------------ *
 * Saving and creating
 * ------------------------------------------------------------------ */

/**
 * saveProfile:
 * @profile (object): full profile; profile.id becomes the filename stem.
 *
 * Writes the two-space-indented JSON atomically with mode 0600.
 *
 * Returns (boolean): true on success.
 */
function saveProfile(profile) {
    _resolveSiblings();
    if (!_atomicFile)
        return false;
    try {
        if (profile === null || typeof profile !== "object")
            return false;
        if (typeof profile.id !== "string" || !PROFILE_ID_RE.test(profile.id))
            return false;
        if (!_atomicFile.ensurePrivateDir(_profilesDirPath()))
            return false;
        return _atomicFile.writePrivateFileAtomic(_profileFilePath(profile.id),
            JSON.stringify(profile, null, 2));
    } catch (e) {
        _warn("saveProfile failed: " + e);
        return false;
    }
}

/**
 * createFromSnapshot:
 * @input (object): { name, description, snapshot, configs, configHashes,
 * topology, fingerprint, cinnamonVersion, sessionType }
 *
 * Builds a full schema v1 profile around a captured snapshot and saves it.
 * snapshot maps to the cinnamonSettings field. configHashes is accepted
 * for signature compatibility but deliberately NOT persisted: every hash
 * already lives in appletConfigs[].sha256 and the sorted list is derivable
 * via appletConfigStore.configHashList, so storing it would be a second
 * copy that can drift.
 *
 * Returns (object|null): the saved profile, or null.
 */
function createFromSnapshot(input) {
    _resolveSiblings();
    try {
        input = input || {};
        const now = _isoNow();
        const profile = {
            schemaVersion: _constants ? _constants.SCHEMA_VERSION : 1,
            id: GLib.uuid_string_random(),
            name: input.name,
            description: typeof input.description === "string"
                ? input.description : "",
            createdAt: now,
            updatedAt: now,
            environment: {
                cinnamonVersion: typeof input.cinnamonVersion === "string"
                    ? input.cinnamonVersion : "",
                sessionType: typeof input.sessionType === "string"
                    ? input.sessionType : ""
            },
            monitorTopology: input.topology || { expectedCount: 1, monitors: [] },
            cinnamonSettings: input.snapshot || {},
            appletConfigs: Array.isArray(input.configs) ? input.configs : [],
            fingerprint: typeof input.fingerprint === "string"
                ? input.fingerprint : "",
            managerAnchor: { uuid: _selfUuidValue(), required: true }
        };
        if (typeof profile.name !== "string" || profile.name.length === 0)
            return null;
        return saveProfile(profile) ? profile : null;
    } catch (e) {
        _warn("createFromSnapshot failed: " + e);
        return null;
    }
}

/**
 * updateFromSnapshot:
 * @existing (object): previously loaded profile.
 * @input (object): { snapshot, configs, configHashes, topology, fingerprint }
 *
 * Replaces the panel state (settings, configs, topology, fingerprint) while
 * preserving identity and metadata: id, createdAt, name, description,
 * environment and managerAnchor. updatedAt is refreshed. A field is only
 * replaced when the input actually carries it, so an empty configs array
 * (a capture with no third-party configs) clears the stored list instead
 * of being mistaken for "not provided".
 *
 * Returns (object|null): the updated profile, or null.
 */
function updateFromSnapshot(existing, input) {
    _resolveSiblings();
    try {
        if (existing === null || typeof existing !== "object")
            return null;
        if (typeof existing.id !== "string" || !PROFILE_ID_RE.test(existing.id))
            return null;
        input = input || {};
        if ("snapshot" in input)
            existing.cinnamonSettings = input.snapshot || {};
        if ("configs" in input)
            existing.appletConfigs = Array.isArray(input.configs)
                ? input.configs : [];
        if ("topology" in input)
            existing.monitorTopology = input.topology ||
                { expectedCount: 1, monitors: [] };
        if ("fingerprint" in input)
            existing.fingerprint = typeof input.fingerprint === "string"
                ? input.fingerprint : "";
        existing.updatedAt = _isoNow();
        return saveProfile(existing) ? existing : null;
    } catch (e) {
        _warn("updateFromSnapshot failed: " + e);
        return null;
    }
}

/* ------------------------------------------------------------------ *
 * Duplicate / delete / rename
 * ------------------------------------------------------------------ */

/**
 * duplicateProfile:
 * @id (string): profile to duplicate.
 *
 * Deep-copies the profile under a fresh id and name "<name> Copy"
 * (then " Copy 2", " Copy 3", ... on collisions). createdAt and updatedAt
 * are stamped now. Startup designation is never copied: it lives in
 * state.json keyed by id, and the duplicate's id is new.
 *
 * Returns (object|null): the saved duplicate, or null.
 */
function duplicateProfile(id) {
    _resolveSiblings();
    try {
        const loaded = loadProfile(id);
        if (loaded.error)
            return null;
        const copy = JSON.parse(JSON.stringify(loaded.profile));
        copy.name = _uniqueCopyName(loaded.profile.name);
        copy.id = GLib.uuid_string_random();
        const now = _isoNow();
        copy.createdAt = now;
        copy.updatedAt = now;
        return saveProfile(copy) ? copy : null;
    } catch (e) {
        _warn("duplicateProfile failed: " + e);
        return null;
    }
}

function _nameExists(name) {
    const profiles = listProfiles();
    for (let i = 0; i < profiles.length; i++) {
        if (profiles[i].valid && profiles[i].name === name)
            return true;
    }
    return false;
}

function _uniqueCopyName(base) {
    if (typeof base !== "string" || base.length === 0)
        base = "Profile";
    let name = base + " Copy";
    if (!_nameExists(name))
        return name;
    let n = 2;
    while (_nameExists(base + " Copy " + n))
        n++;
    return base + " Copy " + n;
}

/**
 * deleteProfile:
 * @id (string): profile to delete.
 *
 * Deletes the file and fixes state.json in the same breath: activeProfileId
 * and startupProfileId are cleared when (and only when) they point at the
 * deleted profile.
 *
 * Returns (boolean): true when the file was removed.
 */
function deleteProfile(id) {
    _resolveSiblings();
    if (!_atomicFile)
        return false;
    try {
        if (typeof id !== "string" || !PROFILE_ID_RE.test(id))
            return false;
        const path = _profileFilePath(id);
        if (!_atomicFile.fileExists(path))
            return false;
        try {
            Gio.File.new_for_path(path).delete(null);
        } catch (e) {
            _warn("deleteProfile failed: " + e);
            return false;
        }
        /* Best-effort state fix-up; the file is already gone. */
        mutateState(function (state) {
            if (state.activeProfileId === id)
                state.activeProfileId = null;
            if (state.startupProfileId === id)
                state.startupProfileId = null;
        });
        return true;
    } catch (e) {
        _warn("deleteProfile failed: " + e);
        return false;
    }
}

/**
 * renameProfile:
 * @id (string): profile to rename.
 * @newName (string): the new name; the CALLER sanitizes (trim, cap).
 *
 * Returns (boolean): true when the rename was persisted.
 */
function renameProfile(id, newName) {
    _resolveSiblings();
    try {
        if (typeof newName !== "string" || newName.length === 0)
            return false;
        const loaded = loadProfile(id);
        if (loaded.error)
            return false;
        loaded.profile.name = newName;
        return saveProfile(loaded.profile);
    } catch (e) {
        _warn("renameProfile failed: " + e);
        return false;
    }
}

/* ------------------------------------------------------------------ *
 * Rollback snapshots
 * ------------------------------------------------------------------ */

/**
 * writeRollback:
 * @bundle (object): full profile-shaped snapshot ({name: "(rollback)", ...}).
 *
 * Writes backups/last-good.json atomically, rotating first: the existing
 * last-good.json becomes last-good-2.json, last-good-2 becomes last-good-3,
 * and anything past ROLLBACK_KEEP total files drops off. The NEW snapshot
 * always lands in last-good.json; last-good itself is mandatory, the
 * numbered tail is the retention window (spec 16: keep 3-5 total).
 *
 * Returns (boolean): true on success.
 */
function writeRollback(bundle) {
    _resolveSiblings();
    if (!_atomicFile)
        return false;
    try {
        if (bundle === null || typeof bundle !== "object")
            return false;
        if (!_atomicFile.ensurePrivateDir(_backupsDirPath()))
            return false;

        const keep = _constants ? _constants.ROLLBACK_KEEP : 3;
        const lastGood = _lastGoodPath();
        /* Oldest first so each move lands on a vacated name. */
        try {
            Gio.File.new_for_path(_numberedRollbackPath(keep)).delete(null);
        } catch (ignored) {
            /* usually just ENOENT */
        }
        for (let i = keep - 1; i >= 2; i--) {
            const from = _numberedRollbackPath(i);
            if (_atomicFile.fileExists(from)) {
                try {
                    Gio.File.new_for_path(from).move(
                        Gio.File.new_for_path(_numberedRollbackPath(i + 1)),
                        Gio.FileCopyFlags.OVERWRITE, null, null);
                } catch (ignored) {
                    /* a stuck older snapshot must not block the new one */
                }
            }
        }
        if (keep >= 2 && _atomicFile.fileExists(lastGood)) {
            try {
                Gio.File.new_for_path(lastGood).move(
                    Gio.File.new_for_path(_numberedRollbackPath(2)),
                    Gio.FileCopyFlags.OVERWRITE, null, null);
            } catch (ignored) {
            }
        }
        return _atomicFile.writePrivateFileAtomic(lastGood,
            JSON.stringify(bundle, null, 2));
    } catch (e) {
        _warn("writeRollback failed: " + e);
        return false;
    }
}

/**
 * readRollback:
 *
 * Returns (object|null): the parsed backups/last-good.json, or null when
 * missing or unparseable.
 */
function readRollback() {
    _resolveSiblings();
    if (!_atomicFile)
        return null;
    try {
        const text = _atomicFile.readTextFile(_lastGoodPath());
        if (text === null)
            return null;
        const bundle = JSON.parse(text);
        return (bundle !== null && typeof bundle === "object") ? bundle : null;
    } catch (e) {
        _warn("readRollback failed: " + e);
        return null;
    }
}

/* ------------------------------------------------------------------ *
 * state.json access
 * ------------------------------------------------------------------ */

/**
 * getState:
 *
 * Reads state.json fresh from disk each call (cheap, and immune to stale
 * in-memory copies after a crash or another instance's write). Missing or
 * corrupt files yield the safe defaults without writing anything.
 *
 * Returns (object): the state.
 */
function getState() {
    _resolveSiblings();
    if (!_atomicFile)
        return _defaultState();
    try {
        const text = _atomicFile.readTextFile(_stateFilePath());
        if (text === null)
            return _defaultState();
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (ignored) {
            return _defaultState();
        }
        if (parsed === null || typeof parsed !== "object" ||
            parsed.schemaVersion !== _defaultState().schemaVersion)
            return _defaultState();
        return _mergeState(parsed);
    } catch (e) {
        _warn("getState failed: " + e);
        return _defaultState();
    }
}

/**
 * mutateState:
 * @fn (function): called as fn(state) with the current state; returns a new
 * state object, mutates and returns undefined/null-ish, or returns null to
 * abort with no write.
 *
 * Atomic read-modify-write. A throwing fn aborts without writing.
 *
 * Returns (object|null): the persisted state, or null when aborted or the
 * write failed.
 */
function mutateState(fn) {
    _resolveSiblings();
    if (!_atomicFile)
        return null;
    try {
        if (typeof fn !== "function")
            return null;
        const state = getState();
        let result;
        try {
            result = fn(state);
        } catch (e) {
            _warn("mutateState callback threw, no write: " + e);
            return null;
        }
        if (result === null)
            return null;
        const next = (result === undefined || typeof result !== "object")
            ? state : result;
        if (!_atomicFile.ensurePrivateDir(_stateDirPath()))
            return null;
        if (!_atomicFile.writePrivateFileAtomic(_stateFilePath(),
                JSON.stringify(next, null, 2)))
            return null;
        return next;
    } catch (e) {
        _warn("mutateState failed: " + e);
        return null;
    }
}
