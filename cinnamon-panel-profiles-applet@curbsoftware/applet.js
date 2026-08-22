/* global imports, global, require */
/* Panel Profiles applet: composition root.
 *
 * Owns lifecycle, the panel menu, settings bindings, dirty-state wiring,
 * notifications, and the dependency injection that feeds the lib/ modules
 * (headless-loadable, no St/Clutter) and dialogs.js. Everything heavy
 * lives in those modules; this file only wires them together and renders
 * their state into a native popup menu.
 *
 * Copyright (C) 2026 curbsoftware
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

const Applet = imports.ui.applet;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Mainloop = imports.mainloop;
const Settings = imports.ui.settings;
const SignalManager = imports.misc.signalManager;
const Config = imports.misc.config;
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const St = imports.gi.St;

const uuid = "cinnamon-panel-profiles-applet@curbsoftware";

Gettext.bindtextdomain(uuid, GLib.get_user_data_dir() + "/locale");

function _(str) {
    return Gettext.dgettext(uuid, str);
}

/* lib/ modules plus dialogs.js. First-party Cinnamon applets resolve
 * require() against the xlet root, so './lib/<name>' works for
 * subdirectories (proven in the repo's other xlets). Resolved lazily in
 * _init (require caches, so this is cheap after the first load) and every
 * downstream use stays guarded: a broken module degrades to a dim menu
 * instead of a load crash. */
let _lib = null;

function _loadLib() {
    if (_lib)
        return _lib;
    try {
        _lib = {
            Constants: require("./lib/constants"),
            Logger: require("./lib/logger"),
            AtomicFile: require("./lib/atomicFile"),
            CinnamonState: require("./lib/cinnamonState"),
            ProfileSchema: require("./lib/profileSchema"),
            Fingerprint: require("./lib/fingerprint"),
            AppletConfigStore: require("./lib/appletConfigStore"),
            ProfileStore: require("./lib/profileStore"),
            MonitorTopology: require("./lib/monitorTopology"),
            ApplyController: require("./lib/applyController"),
            Dialogs: require("./dialogs")
        };
    } catch (e) {
        global.logError("[PanelProfiles] could not load lib modules: " + e);
        _lib = null;
    }
    return _lib;
}

/* Dirty status of the live panel state versus the active profile. */
const DIRTY_ACTIVE = "ACTIVE";
const DIRTY_MODIFIED = "MODIFIED";
const DIRTY_UNKNOWN = "UNKNOWN";

function PanelProfilesApplet(metadata, orientation, panel_height, instanceId) {
    this._init(metadata, orientation, panel_height, instanceId);
}

PanelProfilesApplet.prototype = {
    __proto__: Applet.IconApplet.prototype,

    _init: function(metadata, orientation, panel_height, instanceId) {
        Applet.IconApplet.prototype._init.call(this, orientation, panel_height, instanceId);

        this.metadata = metadata;
        this._signalManager = new SignalManager.SignalManager(null);

        /* Pending timeout sources created by _deferAction(). */
        this._idleSources = [];
        this._destroyed = false;

        /* A reload (our enabled-applets entry changed) still recreates the
         * instance, so teardown must leave the controller's transaction
         * alone; see on_applet_reloaded. */
        this._reloadPending = false;

        /* Dirty tracking state: debounce source, GSettings watch ids, the
         * config-file watch handle, and the cached status + active name. */
        this._dirtyDebounceId = null;
        this._dirtyStatus = DIRTY_UNKNOWN;
        this._settingWatchIds = [];
        this._configWatchHandle = null;
        this._activeProfileName = null;

        /* The monitor-wait state pushed by the apply controller. */
        this._waitState = null;

        /* Notification wrapper shared with the apply controller. */
        this._notifier = null;

        /* Startup-recovery state: the stabilization timer (sufficient-monitor
         * path) and the monitors-changed watch shared by the stabilization
         * restart and the primary-placement nag. */
        this._startupStabilizeId = null;
        this._startupApplyProfileId = null;
        this._startupApplyRequiredCount = 0;
        this._monitorsChangedId = null;

        /* lib modules resolve their siblings through the plain importer
         * (imports.constants and friends), so the lib directory must sit on
         * the search path before anything calls into them. */
        const libPath = metadata.path + "/lib";
        if (imports.searchPath.indexOf(libPath) === -1)
            imports.searchPath.unshift(libPath);

        this._modules = _loadLib();

        // Initialize settings first: the wiring closures below read the
        // bound values (capture-applet-settings, notify-*).
        this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
        this.settings.bind("startup-auto-restore", "startupAutoRestore");
        this.settings.bind("startup-wait-displays", "startupWaitDisplays");
        this.settings.bind("startup-wait-timeout", "startupWaitTimeout");
        this.settings.bind("stabilization-delay", "stabilizationDelay");
        this.settings.bind("capture-applet-settings", "captureAppletSettings");
        this.settings.bind("keep-rollback-history", "keepRollbackHistory");
        this.settings.bind("rollback-history-count", "rollbackHistoryCount");
        this.settings.bind("notify-success", "notifySuccess");
        this.settings.bind("notify-warnings", "notifyWarnings");
        this.settings.bind("debug-logging", "debugLogging", (value) => {
            if (this._modules)
                this._modules.Logger.setDebug(value);
        });

        if (this._modules) {
            this._modules.Logger.setDebug(this.debugLogging);
            this._wireModules();
        }

        // Set up the menu
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menuManager.addMenu(this.menu);

        this.set_applet_icon_symbolic_path(metadata.path + "/icon-symbolic.svg");
        this.set_applet_tooltip(_("Panel Profiles"));

        if (this._modules) {
            this._initDirtyTracking();
            this._startupCheck();
            this._runPrimaryPlacementCheck();
            this._connectMonitorsChanged();
        }
    },

    /* ---------------------------------------------------------------- *
     * Module wiring (the composition root proper)
     * ---------------------------------------------------------------- */

    _wireModules: function() {
        const M = this._modules;
        const metadata = this.metadata;

        try {
            M.Constants.setDependencies({ selfUuid: metadata.uuid });
            M.Logger.setDependencies({});
            M.AtomicFile.setDependencies({ logger: M.Logger });
            M.CinnamonState.setDependencies({
                constants: M.Constants,
                selfUuid: metadata.uuid,
                settingsProvider: null, /* lazy default: Gio.Settings org.cinnamon */
                logger: M.Logger
            });
            M.ProfileSchema.setDependencies({
                constants: M.Constants,
                logger: M.Logger
            });
            M.Fingerprint.setDependencies({
                canonicalize: M.CinnamonState.fingerprintSettingsPart,
                sha256: M.AtomicFile.sha256Hex
            });
            M.AppletConfigStore.setDependencies({
                selfUuid: () => metadata.uuid,
                logger: M.Logger
            });
            /* Deliberately no validateProfile/migrateProfile here: the
             * apply controller wires the schema adapters into the store
             * itself right below (its own setDependencies does it), which
             * is the one place that owns both handles. */
            M.ProfileStore.setDependencies({ logger: M.Logger });
            M.MonitorTopology.setDependencies({
                layoutProvider: this._makeLayoutProvider(),
                logger: M.Logger,
                scheduler: this._makeScheduler()
            });

            /* ApplyController's own wiring resets its in-memory machine,
             * so it must come after the store wiring above. */
            M.ApplyController.setDependencies({
                constants: M.Constants,
                logger: M.Logger,
                cinnamonState: M.CinnamonState,
                appletConfigStore: M.AppletConfigStore,
                profileStore: M.ProfileStore,
                profileSchema: M.ProfileSchema,
                fingerprint: M.Fingerprint,
                monitorTopology: M.MonitorTopology,
                scheduler: this._makeScheduler(),
                notify: this._makeNotifier(),
                captureConfigsEnabled: () => this.captureAppletSettings,
                notifySuccessEnabled: () => this.notifySuccess,
                isAppletInstalled: (candidate) => this._isAppletInstalled(candidate),
                environment: () => ({
                    cinnamonVersion: Config.PACKAGE_VERSION || "",
                    sessionType: GLib.getenv("XDG_SESSION_TYPE") || ""
                }),
                onStateChange: (st) => this._onControllerState(st),
                onWaitStateChange: (show, current, required) =>
                    this._onWaitState(show, current, required),
                onProfileSaved: (profile) => this._onProfileSaved(profile),
                waitStabilizeMs: this.stabilizationDelay * 1000,
                waitTimeoutMs: this.startupWaitTimeout * 1000
            });
            this._notifier = this._makeNotifier();

            M.Dialogs.setTranslate(_);
            M.Dialogs.setDependencies({ logger: M.Logger });

            const init = M.ProfileStore.init();
            if (init && init.recoveredWarnings && init.recoveredWarnings.length)
                M.Logger.warn("state init: " + init.recoveredWarnings.join("; "));

            /* A previous instance may have died around its enabled-applets
             * write; if state.json carries a pendingApply, resume it. */
            if (init && init.state && init.state.pendingApply) {
                try {
                    M.ApplyController.resumePendingApply();
                } catch (e) {
                    M.Logger.error("resumePendingApply failed", e);
                }
            }
            M.Logger.log("wired");
        } catch (e) {
            M.Logger.error("module wiring failed", e);
        }
    },

    _makeLayoutProvider: function() {
        const lm = Main.layoutManager;
        return {
            getCount: () => lm.monitors.length,
            getMonitors: () => lm.monitors,
            getPrimaryIndex: () => lm.primaryIndex,
            connect: (cb) => lm.connect("monitors-changed", cb),
            disconnect: (id) => lm.disconnect(id)
        };
    },

    _makeScheduler: function() {
        return {
            timeoutAdd: (ms, fn) => Mainloop.timeout_add(ms, fn),
            sourceRemove: (id) => Mainloop.source_remove(id)
        };
    },

    _makeNotifier: function() {
        return {
            info: (title, details) => {
                try { Main.notify(title, details || ""); } catch (e) { }
            },
            warn: (title, details) => {
                if (!this.notifyWarnings)
                    return;
                try { Main.warningNotify(title, details || ""); } catch (e) { }
            },
            success: (title, details) => {
                if (!this.notifySuccess)
                    return;
                try { Main.notify(title, details || ""); } catch (e) { }
            }
        };
    },

    _isAppletInstalled: function(candidate) {
        if (typeof candidate !== "string" || candidate.length === 0)
            return false;
        const user = GLib.build_filenamev(
            [GLib.get_home_dir(), ".local", "share", "cinnamon", "applets", candidate]);
        const system = GLib.build_filenamev(
            ["/usr", "share", "cinnamon", "applets", candidate]);
        return GLib.file_test(user, GLib.FileTest.EXISTS) ||
            GLib.file_test(system, GLib.FileTest.EXISTS);
    },

    /* ---------------------------------------------------------------- *
     * Dirty tracking
     * ---------------------------------------------------------------- */

    _initDirtyTracking: function() {
        const M = this._modules;
        try {
            this._cinnamonSettings = new Gio.Settings({
                schema_id: "org.cinnamon"
            });
            M.Constants.PANEL_SETTING_KEYS.forEach((key) => {
                this._settingWatchIds.push(
                    this._cinnamonSettings.connect("changed::" + key,
                        () => this._onTrackedChange()));
            });
        } catch (e) {
            M.Logger.error("dirty tracking init failed", e);
        }
        this._rebuildDirtyTracking();
    },

    /* (Re)attach the config-file watch to the active profile and recompute
     * the status. Called whenever the active profile changes: after an
     * apply completes, after a save, after a manage operation. */
    _rebuildDirtyTracking: function() {
        if (this._destroyed || !this._modules)
            return;
        const M = this._modules;

        if (this._configWatchHandle) {
            M.AppletConfigStore.unwatchConfigs(this._configWatchHandle);
            this._configWatchHandle = null;
        }
        this._activeProfileName = null;

        try {
            const state = M.ProfileStore.getState();
            if (state.activeProfileId) {
                const loaded = M.ProfileStore.loadProfile(state.activeProfileId);
                if (loaded && !loaded.error && loaded.profile) {
                    this._activeProfileName = loaded.profile.name;
                    this._configWatchHandle =
                        M.AppletConfigStore.watchConfigs(
                            loaded.profile.appletConfigs || [],
                            () => this._onTrackedChange());
                }
            }
        } catch (e) {
            M.Logger.error("dirty tracking rebuild failed", e);
        }
        this._recomputeDirty();
    },

    _onTrackedChange: function() {
        if (this._destroyed || !this._modules)
            return;
        if (this._modules.ApplyController.isDirtySuppressed())
            return;
        if (this._dirtyDebounceId !== null) {
            Mainloop.source_remove(this._dirtyDebounceId);
            this._dirtyDebounceId = null;
        }
        const delay = (this._modules.Constants.DIRTY_DEBOUNCE_MS || 500);
        this._dirtyDebounceId = Mainloop.timeout_add(delay, () => {
            this._dirtyDebounceId = null;
            this._recomputeDirty();
            return false;
        });
    },

    _recomputeDirty: function() {
        if (this._destroyed || !this._modules)
            return;
        const M = this._modules;
        try {
            const state = M.ProfileStore.getState();
            if (!state.activeProfileId) {
                this._dirtyStatus = DIRTY_UNKNOWN;
            } else {
                const loaded = M.ProfileStore.loadProfile(state.activeProfileId);
                if (!loaded || loaded.error || !loaded.profile) {
                    this._dirtyStatus = DIRTY_UNKNOWN;
                } else {
                    const configs = loaded.profile.appletConfigs || [];
                    const root = M.Constants.SPICES_CONFIG_ROOT;
                    /* A config file the profile captured but that no longer
                     * exists is a modification, full stop: no need to hash. */
                    const missing = configs.some((config) => !GLib.file_test(
                        GLib.build_filenamev([root, config.relativePath]),
                        GLib.FileTest.EXISTS));
                    if (missing) {
                        this._dirtyStatus = DIRTY_MODIFIED;
                    } else {
                        const live = M.ApplyController.computeCurrentFingerprint();
                        const stored = loaded.profile.fingerprint;
                        if (live === null || typeof stored !== "string" ||
                                stored.length === 0) {
                            /* Either side unevaluable: no verdict. */
                            this._dirtyStatus = DIRTY_UNKNOWN;
                        } else {
                            this._dirtyStatus = live === stored
                                ? DIRTY_ACTIVE : DIRTY_MODIFIED;
                        }
                    }
                }
            }
        } catch (e) {
            this._dirtyStatus = DIRTY_UNKNOWN;
        }
        this._onDirtyChanged();
    },

    _onDirtyChanged: function() {
        if (this._destroyed)
            return;
        this._updateTooltip();
        if (this.menu && this.menu.isOpen)
            this.updateMenu();
    },

    _onProfileSaved: function(profile) {
        if (this._destroyed || !this._modules || !profile)
            return;
        const M = this._modules;
        /* The live state now IS the saved profile: make it active so the
         * menu check, tooltip and dirty baseline all agree. Saves are
         * capture-only, so this cannot fight an in-flight apply. */
        try {
            M.ProfileStore.mutateState((state) => {
                state.activeProfileId = profile.id;
            });
        } catch (e) {
            M.Logger.error("could not mark saved profile active", e);
        }
        this._rebuildDirtyTracking();
    },

    /* ---------------------------------------------------------------- *
     * Controller callbacks
     * ---------------------------------------------------------------- */

    _onControllerState: function(state) {
        if (this._destroyed || !this._modules)
            return;
        if (state === this._modules.ApplyController.STATE_COMPLETE)
            this._rebuildDirtyTracking();
        else if (state === "FAILED")
            this._onTrackedChange();
        this._updateTooltip();
        if (this.menu && this.menu.isOpen)
            this.updateMenu();
    },

    _onWaitState: function(show, current, required) {
        if (this._destroyed)
            return;
        this._waitState = show ? { current: current, required: required } : null;
        this._updateTooltip();
        if (this.menu && this.menu.isOpen)
            this.updateMenu();
    },

    _updateTooltip: function() {
        if (this._destroyed || !this._modules)
            return;
        const M = this._modules;
        let text = _("Panel Profiles");
        try {
            const controllerState = M.ApplyController.getState();
            const applying = M.ApplyController.isBusy() &&
                controllerState !== M.ApplyController.STATE_SAVING &&
                controllerState !== M.ApplyController.STATE_MANAGING;
            if (applying) {
                text = _("Restoring profile…");
            } else if (this._activeProfileName) {
                text = this._dirtyStatus === DIRTY_MODIFIED
                    ? this._activeProfileName + " (" + _("modified") + ")"
                    : this._activeProfileName;
            }
        } catch (e) {
            text = _("Panel Profiles");
        }
        try {
            this.set_applet_tooltip(text);
        } catch (e) {
            /* actor already gone; nothing left to label */
        }
    },

    /* ---------------------------------------------------------------- *
     * Startup recovery
     * ---------------------------------------------------------------- */

    /* Runs once per instance, after module wiring and dirty tracking. A
     * pendingApply was already resumed in _wireModules and always outranks
     * the startup path, so this returns early when one is on disk. */
    _startupCheck: function() {
        if (this._destroyed || !this._modules)
            return;
        const M = this._modules;

        let state;
        try {
            state = M.ProfileStore.getState();
        } catch (e) {
            M.Logger.error("startup check could not read state", e);
            return;
        }
        if (state.pendingApply)
            return;
        if (!this.startupAutoRestore || !state.startupProfileId)
            return;

        let loaded;
        try {
            loaded = M.ProfileStore.loadProfile(state.startupProfileId);
        } catch (e) {
            loaded = null;
        }
        if (!loaded || loaded.error || !loaded.profile) {
            M.Logger.warn("startup profile is unreadable; skipping startup " +
                "restore");
            return;
        }
        const profile = loaded.profile;

        /* a. Fingerprint short-circuit: live state already equals the
         * startup profile, so mark it active and stop. No rollback, no
         * profile writes, no churn. */
        let live = null;
        try {
            live = M.ApplyController.computeCurrentFingerprint();
        } catch (e) {
            live = null;
        }
        if (live !== null && typeof profile.fingerprint === "string" &&
                profile.fingerprint.length > 0 && live === profile.fingerprint) {
            try {
                M.ProfileStore.mutateState((s) => {
                    s.activeProfileId = profile.id;
                });
            } catch (e) {
                M.Logger.error("could not mark startup profile active", e);
            }
            this._dirtyStatus = DIRTY_ACTIVE;
            M.Logger.log("startup profile already matches the live layout; " +
                "no restore needed");
            this._rebuildDirtyTracking();
            return;
        }

        let required = 1;
        try {
            const t = profile.monitorTopology;
            if (t && Number.isFinite(Number(t.expectedCount)))
                required = Math.max(1, Math.floor(Number(t.expectedCount)));
        } catch (ignored) {
            /* profile without a readable topology defaults to one monitor */
        }
        const currentCount = M.MonitorTopology.getMonitorCount();

        if (M.MonitorTopology.topologySatisfies(currentCount, required)) {
            /* b. Enough monitors now: settle briefly (restarting on any
             * churn), re-check, then apply. */
            this._startStabilize(profile.id, required);
        } else if (this.startupWaitDisplays) {
            /* c. Not enough monitors: the apply controller owns the wait
             * internally (stabilization, single timeout warning, menu wait
             * display). beginApply returns {started:true} for the startup
             * reason and carries on. */
            M.ApplyController.beginApply(profile.id, { reason: "startup" });
        } else {
            /* d. Not enough monitors and waiting is off: leave the desktop
             * untouched. Log once, never retry. */
            M.Logger.log("startup profile needs " + required +
                " displays but only " + currentCount +
                " are available and display waiting is disabled");
        }
    },

    /* Arm (or re-arm on churn) the short stabilization timer used when the
     * required monitor count is already present at startup. */
    _startStabilize: function(profileId, required) {
        if (this._startupStabilizeId !== null) {
            Mainloop.source_remove(this._startupStabilizeId);
            this._startupStabilizeId = null;
        }
        this._startupApplyProfileId = profileId;
        this._startupApplyRequiredCount = required;
        const delayMs = Math.max(0, Number(this.stabilizationDelay) || 0) * 1000;
        this._startupStabilizeId = Mainloop.timeout_add(delayMs, () => {
            this._startupStabilizeId = null;
            if (this._destroyed || !this._modules) {
                this._startupApplyProfileId = null;
                return false;
            }
            const M = this._modules;
            const id = this._startupApplyProfileId;
            const req = this._startupApplyRequiredCount;
            this._startupApplyProfileId = null;
            const count = M.MonitorTopology.getMonitorCount();
            if (count >= req || this.startupWaitDisplays) {
                /* Sufficient, or dropped below but waiting is on: the
                 * controller either applies now or waits internally. */
                M.ApplyController.beginApply(id, { reason: "startup" });
            } else {
                M.Logger.log("startup profile needs " + req +
                    " displays but only " + count +
                    " are available and display waiting is disabled");
            }
            return false;
        });
    },

    _connectMonitorsChanged: function() {
        if (this._monitorsChangedId !== null)
            return;
        try {
            this._monitorsChangedId = Main.layoutManager.connect(
                "monitors-changed", () => this._onMonitorsChanged());
        } catch (e) {
            if (this._modules)
                this._modules.Logger.error("could not watch monitors-changed", e);
        }
    },

    _onMonitorsChanged: function() {
        if (this._destroyed || !this._modules)
            return;
        if (this._startupApplyProfileId !== null)
            this._startStabilize(this._startupApplyProfileId,
                this._startupApplyRequiredCount);
        this._runPrimaryPlacementCheck();
    },

    /* One-time info notice when startup recovery is on but the applet sits
     * on a non-primary monitor. The flag resets once the applet is back on
     * the primary, so a later regression warns again. Never repeats while
     * the flag is set. */
    _runPrimaryPlacementCheck: function() {
        if (this._destroyed || !this._modules || !this.startupAutoRestore)
            return;
        const M = this._modules;
        let eaStrv = null;
        let peStrv = null;
        try {
            if (!this._cinnamonSettings)
                return;
            eaStrv = this._cinnamonSettings.get_strv("enabled-applets");
            peStrv = this._cinnamonSettings.get_strv("panels-enabled");
        } catch (e) {
            return;
        }
        const parsedEa = M.CinnamonState.parseEnabledApplets(eaStrv);
        const selfEntry = (parsedEa.entries || []).find(
            (entry) => entry.uuid === this.metadata.uuid);
        if (!selfEntry)
            return; /* not installed yet; nothing to judge */
        const parsedPe = M.CinnamonState.parsePanelsEnabled(peStrv);
        const panel = (parsedPe.panels || []).find(
            (p) => p.id === selfEntry.panelId);
        if (!panel)
            return; /* own panel is not in panels-enabled; cannot place it */
        let primaryIndex = -1;
        try {
            primaryIndex = Main.layoutManager.primaryIndex;
        } catch (e) {
            return;
        }
        const onPrimary = panel.monitor === primaryIndex;
        let state;
        try {
            state = M.ProfileStore.getState();
        } catch (e) {
            return;
        }
        if (!onPrimary) {
            if (!state.warnedPrimaryPlacement) {
                try {
                    Main.notify(_("Panel Profiles"),
                        _("Move Panel Profiles to a panel on the primary " +
                            "monitor for reliable startup recovery."));
                } catch (e) {
                    /* notification is best-effort */
                }
                try {
                    M.ProfileStore.mutateState((s) => {
                        s.warnedPrimaryPlacement = true;
                    });
                } catch (e) {
                    M.Logger.error("could not record placement warning", e);
                }
            }
        } else if (state.warnedPrimaryPlacement) {
            try {
                M.ProfileStore.mutateState((s) => {
                    s.warnedPrimaryPlacement = false;
                });
            } catch (e) {
                M.Logger.error("could not clear placement warning", e);
            }
        }
    },

    /* ---------------------------------------------------------------- *
     * Menu
     * ---------------------------------------------------------------- */

    on_applet_clicked: function(event) {
        this.updateMenu();
        this.menu.toggle();
    },

    /* Rebuilt from live data on every open. Guarded: state callbacks and
     * deferred actions can land here after the actor is gone. */
    updateMenu: function() {
        if (this._destroyed || !this.menu)
            return;
        const M = this._modules;
        try {
            this.menu.removeAll();

            this._addDimMenuItem(_("Panel Profiles"), null, true);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            if (!M) {
                this._addDimMenuItem(_("Panel Profiles could not load."));
                return;
            }

            const profiles = M.ProfileStore.listProfiles();
            const state = M.ProfileStore.getState();
            const busy = M.ApplyController.isBusy();
            const controllerState = M.ApplyController.getState();
            /* During a monitor wait the profile rows stay clickable so the
             * user can manually load a different (e.g. one-monitor) profile;
             * _applyProfile cancels the pending wait first. */
            const waiting = controllerState ===
                M.ApplyController.STATE_WAITING_FOR_MONITORS;

            if (profiles.length === 0) {
                /* First run: nothing saved yet, only save and manage. */
                this._addDimMenuItem(_("No panel profiles saved yet."));
                this._addDimMenuItem(_("Save your current panel layout to create one."));
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                this._addActionMenuItem(_("Save current layout…"), !busy,
                    () => this._openSaveDialog());
                this._addActionMenuItem(_("Manage profiles…"), !busy,
                    () => this._openManageDialog());
                return;
            }

            /* Profile rows: valid profiles only (a broken file must never
             * be loadable from here; the manage dialog can delete it).
             * The active profile leads, the rest stay alphabetical. */
            const rows = profiles.filter((p) => p.valid);
            const activeId = state.activeProfileId;
            const activeRow = rows.find((p) => p.id === activeId) || null;
            this._activeProfileName = activeRow ? activeRow.name : null;
            const ordered = activeRow
                ? [activeRow].concat(rows.filter((p) => p !== activeRow))
                : rows;

            const section = new PopupMenu.PopupMenuSection();
            const self = this;
            ordered.forEach((profile) => {
                const item = new PopupMenu.PopupMenuItem(profile.name);
                if (profile === activeRow) {
                    item.setOrnament(PopupMenu.OrnamentType.CHECK, true);
                    if (this._dirtyStatus === DIRTY_MODIFIED) {
                        const tag = new St.Label({
                            text: _("Modified"),
                            style_class: "panel-profiles-tag"
                        });
                        item.addActor(tag, { expand: true, span: -1, align: St.Align.END });
                    }
                }
                if (busy && !waiting)
                    item.setSensitive(false);
                item.connect("activate", () => {
                    self._deferAction(() => self._applyProfile(profile.id));
                });
                section.addMenuItem(item);
            });
            this.menu.addMenuItem(section);
            /* Long lists scroll. The section's signal wiring happened in
             * addMenuItem above; reparenting its actor into a scroll view
             * keeps activation and key navigation intact. */
            if (ordered.length > 12) {
                const scroll = new St.ScrollView({
                    x_fill: true,
                    y_fill: false,
                    y_align: St.Align.START,
                    overlay_scrollbars: true,
                    hscrollbar_policy: St.PolicyType.NEVER,
                    vscrollbar_policy: St.PolicyType.AUTOMATIC
                });
                scroll.add_actor(section.actor);
                this.menu.addActor(scroll);
            }

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            /* Status block. */
            this._addStatusRows(M, state, activeRow);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            /* Actions, all gated by the operation lock. */
            if (busy)
                this._addDimMenuItem(this._busyLabel(controllerState));

            if (activeRow && this._dirtyStatus === DIRTY_MODIFIED) {
                this._addActionMenuItem(_("Update \"%s\"").format(activeRow.name),
                    !busy, () => this._confirmUpdate(activeRow.id, activeRow.name));
            }
            this._addActionMenuItem(_("Save current layout…"), !busy,
                () => this._openSaveDialog());
            if (M.ProfileStore.readRollback() !== null) {
                this._addActionMenuItem(_("Restore previous layout"), !busy,
                    () => this._modules.ApplyController.beginRollback());
            }
            this._addActionMenuItem(_("Manage profiles…"), !busy,
                () => this._openManageDialog());
        } catch (e) {
            if (M)
                M.Logger.error("menu build failed", e);
            else
                global.logError("[PanelProfiles] menu build failed: " + e);
        }
    },

    /* Dim, non-reactive informational row. Defaults to the theme's inactive
     * item look (normal weight, dimmed); pass bold=true for a section title.
     * The subtitle class forces font-weight: bold under Numix, which reads as
     * a header, not as secondary text, so it is opt-in only. */
    _addDimMenuItem: function(text, extraStyle, bold) {
        const item = new PopupMenu.PopupMenuItem(text);
        item.actor.reactive = false;
        item.actor.can_focus = false;
        item.label.add_style_class_name(bold
            ? "popup-subtitle-menu-item"
            : "popup-inactive-menu-item");
        if (extraStyle)
            item.label.add_style_class_name(extraStyle);
        this.menu.addMenuItem(item);
        return item;
    },

    _addStatusRows: function(M, state, activeRow) {
        /* The wait block carries its own required count; otherwise the
         * active profile's expected count is the informative one. */
        if (this._waitState) {
            let startupName = null;
            try {
                if (state.startupProfileId) {
                    const rows = M.ProfileStore.listProfiles();
                    const row = rows.find((p) =>
                        p.id === state.startupProfileId && p.valid);
                    startupName = row ? row.name : null;
                }
            } catch (e) {
                startupName = null;
            }
            if (startupName)
                this._addDimMenuItem(_("Startup profile: %s").format(startupName),
                    "panel-profiles-status");
            this._addDimMenuItem(
                _("Displays: %d / %d").format(
                    this._waitState.current, this._waitState.required),
                "panel-profiles-status");
            this._addDimMenuItem(
                _("Waiting for display %d…").format(this._waitState.required),
                "panel-profiles-status");
            return;
        }
        if (activeRow) {
            this._addDimMenuItem(_("Current: %s").format(activeRow.name),
                "panel-profiles-status");
            if (Number.isFinite(activeRow.expectedCount)) {
                this._addDimMenuItem(
                    _("Displays: %d / %d").format(
                        M.MonitorTopology.getMonitorCount(), activeRow.expectedCount),
                    "panel-profiles-status");
            }
        }
    },

    _addActionMenuItem: function(text, sensitive, handler) {
        const item = new PopupMenu.PopupMenuItem(text);
        item.setSensitive(sensitive !== false);
        const self = this;
        item.connect("activate", () => {
            self._deferAction(handler);
        });
        this.menu.addMenuItem(item);
        return item;
    },

    _busyLabel: function(controllerState) {
        if (controllerState === "SAVING" || controllerState === "MANAGING")
            return _("Saving…");
        if (controllerState === "WAITING_FOR_MONITORS")
            return _("Waiting…");
        return _("Loading…");
    },

    /* ---------------------------------------------------------------- *
     * Actions
     * ---------------------------------------------------------------- */

    _applyProfile: function(profileId) {
        if (this._destroyed || !this._modules)
            return;
        const M = this._modules;
        /* A manual load while the startup wait is pending must win over the
         * wait: cancel it (this releases the lock and clears the menu wait
         * display), then start the user's apply normally. */
        if (M.ApplyController.getState() ===
                M.ApplyController.STATE_WAITING_FOR_MONITORS)
            M.ApplyController.cancelAll();
        const result = M.ApplyController.beginApply(profileId, { reason: "user" });
        if (result && result.failure && result.failure !== "waiting" &&
                result.failure !== "busy") {
            /* Validation failures inside the controller only reach the
             * log; the click deserves a visible notice. */
            M.Logger.warn("apply refused: " + result.failure);
            if (this._notifier)
                this._notifier.warn(_("Panel Profiles"),
                    _("The profile could not be loaded."));
        }
        this._updateTooltip();
    },

    _confirmUpdate: function(profileId, name) {
        if (this._destroyed || !this._modules)
            return;
        const M = this._modules;
        const self = this;
        try {
            const dialog = new M.Dialogs.PanelProfilesConfirmDialog(
                _("Update \"%s\"?").format(name),
                _("The saved version of this profile will be replaced by your current panel configuration."),
                _("Update"),
                () => {
                    try {
                        M.ApplyController.beginSaveUpdate(profileId);
                    } catch (e) {
                        M.Logger.error("update save failed", e);
                    }
                    self._onDirtyChanged();
                });
            dialog.open(global.get_current_time());
        } catch (e) {
            M.Logger.error("could not open update confirmation", e);
        }
    },

    _openSaveDialog: function() {
        if (this._destroyed || !this._modules)
            return;
        const M = this._modules;
        const profiles = M.ProfileStore.listProfiles();
        const state = M.ProfileStore.getState();
        const activeRow = profiles.find((p) =>
            p.id === state.activeProfileId && p.valid) || null;
        const self = this;

        M.Dialogs.promptSaveProfile({
            existingProfiles: profiles
                .filter((p) => p.valid)
                .map((p) => ({ id: p.id, name: p.name })),
            activeProfileName: activeRow ? activeRow.name : null
        }, (result) => {
            if (self._destroyed || !result)
                return;
            if (result.mode === "new") {
                const saved = M.ApplyController.beginSaveNew(result.name);
                if (saved.ok) {
                    if (result.useAtStartup)
                        M.ApplyController.setStartupProfile(saved.profile.id);
                    else
                        self._maybeOfferStartup(saved.profile);
                }
            } else if (result.mode === "replace" && result.targetId) {
                /* The replace confirmation already happened inside the
                 * dialog; the overwrite is consented to. */
                const saved = M.ApplyController.beginSaveUpdate(result.targetId);
                if (saved.ok && result.useAtStartup)
                    M.ApplyController.setStartupProfile(result.targetId);
            }
            self._onDirtyChanged();
        });
    },

    /* After a very first save, offer to designate it as the startup
     * profile. Silent when it does not apply or the dialog cannot open. */
    _maybeOfferStartup: function(profile) {
        if (this._destroyed || !this._modules || !profile)
            return;
        const M = this._modules;
        const state = M.ProfileStore.getState();
        if (state.startupProfileId !== null)
            return;
        const validCount = M.ProfileStore.listProfiles()
            .filter((p) => p.valid).length;
        if (validCount !== 1)
            return;
        const self = this;
        this._deferAction(() => {
            try {
                M.Dialogs.promptStartupOffer(profile.name, (useIt) => {
                    if (useIt && !self._destroyed)
                        M.ApplyController.setStartupProfile(profile.id);
                });
            } catch (e) {
                /* the offer is optional; stay silent */
            }
        });
    },

    _openManageDialog: function() {
        if (this._destroyed || !this._modules)
            return;
        const M = this._modules;
        const self = this;
        M.Dialogs.openManageProfiles({
            profiles: this._manageRows(),
            operations: {
                load: (id) => {
                    self._deferAction(() => self._applyProfile(id));
                },
                rename: (id, newName, done) => {
                    M.ApplyController.beginRename(id, newName);
                    self._afterManageOp(done);
                },
                duplicate: (id, done) => {
                    M.ApplyController.beginDuplicate(id);
                    self._afterManageOp(done);
                },
                setStartup: (id, done) => {
                    M.ApplyController.setStartupProfile(id);
                    self._afterManageOp(done);
                },
                removeStartup: (id, done) => {
                    M.ApplyController.setStartupProfile(null);
                    self._afterManageOp(done);
                },
                delete: (id, done) => {
                    M.ApplyController.beginDelete(id);
                    self._afterManageOp(done);
                }
            }
        });
    },

    _afterManageOp: function(done) {
        if (this._destroyed)
            return;
        /* The active profile may have changed (delete); re-attach the
         * dirty watches before the dialog re-renders from fresh rows. */
        this._rebuildDirtyTracking();
        try {
            if (typeof done === "function")
                done(this._manageRows());
        } catch (e) {
            if (this._modules)
                this._modules.Logger.error("manage refresh failed", e);
        }
    },

    _manageRows: function() {
        if (!this._modules)
            return [];
        const M = this._modules;
        const state = M.ProfileStore.getState();
        return M.ProfileStore.listProfiles().map((p) => ({
            id: p.id,
            name: p.name,
            updatedAt: p.updatedAt,
            expectedCount: p.expectedCount,
            valid: p.valid,
            isActive: p.id === state.activeProfileId,
            isStartup: p.id === state.startupProfileId
        }));
    },

    /* Menu items must not act synchronously: PopupMenuBase closes the menu
     * in its own 'activate' handler, which runs after ours. Pushing a modal
     * dialog before that has happened fights the menu's grab. Defer to the
     * next main loop turn and track the source so teardown can cancel it.
     *
     * timeout_add(0), not idle_add: idle callbacks sit below Clutter's
     * redraw priority, so an action fired while a menu or dialog was still
     * animating could be starved for hundreds of milliseconds. */
    _deferAction: function(fn) {
        const self = this;
        let id = Mainloop.timeout_add(0, function() {
            self._idleSources = self._idleSources.filter(function(s) { return s !== id; });
            try {
                fn.call(self);
            } catch (e) {
                if (self._modules)
                    self._modules.Logger.error("deferred action failed", e);
                else
                    global.logError("[PanelProfiles] deferred action failed: " + e);
            }
            return false;
        });
        this._idleSources.push(id);
    },

    /* ---------------------------------------------------------------- *
     * Teardown
     * ---------------------------------------------------------------- */

    on_applet_reloaded: function() {
        /* Our enabled-applets entry changed, most likely DURING an apply:
         * a fresh instance is about to run _init and resume whatever
         * pendingApply sits in state.json. Cancel nothing here. */
        this._reloadPending = true;
        this._teardown(false);
    },

    on_applet_removed_from_panel: function() {
        this._teardown(!this._reloadPending);
    },

    /* Full teardown when @full (real removal): cancels controller
     * transactions and resets every module seam. Reload teardown releases
     * only this instance's UI, signals and timers; the module-level
     * controller state survives for the next instance. Idempotent. */
    _teardown: function(full) {
        if (this._destroyed)
            return;
        this._destroyed = true;
        const M = this._modules;

        if (this._idleSources) {
            for (let i = 0; i < this._idleSources.length; i++)
                Mainloop.source_remove(this._idleSources[i]);
            this._idleSources = [];
        }
        if (this._dirtyDebounceId !== null) {
            Mainloop.source_remove(this._dirtyDebounceId);
            this._dirtyDebounceId = null;
        }
        if (this._startupStabilizeId !== null) {
            Mainloop.source_remove(this._startupStabilizeId);
            this._startupStabilizeId = null;
        }
        this._startupApplyProfileId = null;
        this._startupApplyRequiredCount = 0;
        if (this._monitorsChangedId !== null) {
            try {
                Main.layoutManager.disconnect(this._monitorsChangedId);
            } catch (e) {
                /* layout manager already finalized */
            }
            this._monitorsChangedId = null;
        }
        if (this._settingWatchIds.length && this._cinnamonSettings) {
            this._settingWatchIds.forEach((id) => {
                try {
                    this._cinnamonSettings.disconnect(id);
                } catch (e) {
                    /* settings object already finalized */
                }
            });
            this._settingWatchIds = [];
        }
        if (this._configWatchHandle && M) {
            M.AppletConfigStore.unwatchConfigs(this._configWatchHandle);
            this._configWatchHandle = null;
        }
        if (full && M) {
            try {
                M.ApplyController.cancelAll();
            } catch (e) {
                M.Logger.warn("cancelAll failed: " + e);
            }
        }
        this._signalManager.disconnectAllSignals();
        try {
            this.settings.finalize();
        } catch (e) {
            /* already gone */
        }
        if (full && M) {
            ["ApplyController", "MonitorTopology", "ProfileStore",
                "AppletConfigStore", "Fingerprint", "ProfileSchema",
                "CinnamonState", "AtomicFile", "Logger", "Constants"]
                .forEach((name) => {
                    try {
                        if (M[name] && M[name].resetDependencies)
                            M[name].resetDependencies();
                    } catch (e) {
                        /* a failed reset must not block the rest */
                    }
                });
        }
        /* Drop our search-path entry so repeated reloads do not stack
         * duplicates; a fresh _init unshifts it again. */
        try {
            const libPath = this.metadata.path + "/lib";
            imports.searchPath = imports.searchPath.filter((p) => p !== libPath);
        } catch (e) {
            /* cosmetic at worst */
        }
    }
};

function main(metadata, orientation, panel_height, instanceId) {
    return new PanelProfilesApplet(metadata, orientation, panel_height, instanceId);
}
