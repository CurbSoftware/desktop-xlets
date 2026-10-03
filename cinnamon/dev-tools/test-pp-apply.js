#!/usr/bin/env gjs
/* global imports, print, printerr */
/**
 * Headless unit tests for the Panel Profiles apply engine:
 * lib/monitorTopology.js and lib/applyController.js.
 *
 * St/Clutter cannot be loaded outside the Cinnamon process, so the
 * controller runs against a fake org.cinnamon settings provider (real
 * GLib.Variant values), a fake layout provider, a MANUAL scheduler whose
 * clock only moves when the test advances it, a recording notify wrapper
 * and the real storage modules over a temp XDG_CONFIG_HOME. The one thing
 * these tests cannot see is Cinnamon's appletManager reacting to the
 * enabled-applets write; the destruction scenario simulates it with a
 * provider hook fired mid-write. Live behaviour is covered separately by
 * dev-tools/live-test-panel-profiles.py.
 *
 * ISOLATION, read this first: constants.js resolves STATE_DIR from
 * GLib.get_user_config_dir() at import time, which follows
 * XDG_CONFIG_HOME. This script REFUSES to run when the config dir still
 * points into the real home, so a bare `gjs dev-tools/test-pp-apply.js`
 * exits with code 2 instead of ever touching ~/.config. Always run as:
 *
 *   tmp=$(mktemp -d)
 *   XDG_CONFIG_HOME="$tmp" gjs dev-tools/test-pp-apply.js
 *   rc=$?; rm -rf "$tmp"; exit $rc
 *
 * Exits 0 when every assertion passes, 1 on failures, 2 on bad environment.
 */

const System = imports.system;

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

/* ------------------------------------------------------------------ *
 * Environment guard: never touch the real ~/.config
 * ------------------------------------------------------------------ */

const CONFIG_DIR = GLib.get_user_config_dir();
const HOME_DIR = GLib.get_home_dir();
if (CONFIG_DIR === HOME_DIR || CONFIG_DIR.indexOf(HOME_DIR + "/") === 0) {
    printerr("REFUSING to run: GLib.get_user_config_dir() is inside " + HOME_DIR +
        ".\nRun as: XDG_CONFIG_HOME=$(mktemp -d) gjs " +
        System.programInvocationName);
    System.exit(2);
}

/* ------------------------------------------------------------------ *
 * Module loading (repo pattern)
 * ------------------------------------------------------------------ */

const SCRIPT_DIR = GLib.path_get_dirname(
    Gio.File.new_for_commandline_arg(System.programInvocationName).get_path());
const REPO_ROOT = GLib.path_get_dirname(SCRIPT_DIR);
const XLET_DIR = REPO_ROOT + "/cinnamon-panel-profiles-applet@curbsoftware";
const LIB_DIR = XLET_DIR + "/lib";

imports.searchPath.unshift(LIB_DIR);
const CONSTANTS = imports.constants;
const ATOMIC = imports.atomicFile;
const CS = imports.cinnamonState;
const FP = imports.fingerprint;
const PSCHEMA = imports.profileSchema;
const PS = imports.profileStore;
const ACS = imports.appletConfigStore;
const MT = imports.monitorTopology;
const AC = imports.applyController;

const STATE_DIR = CONSTANTS.STATE_DIR;
const PROFILES_DIR = STATE_DIR + "/profiles";
const BACKUPS_DIR = STATE_DIR + "/backups";
const STATE_FILE = STATE_DIR + "/state.json";
const SELF = CONSTANTS.selfUuid();
const SPICE_ROOT = CONFIG_DIR + "/spices-apply-test";

/* ------------------------------------------------------------------ *
 * Tiny assertion framework (repo style)
 * ------------------------------------------------------------------ */

let passed = 0;
let failures = [];
let currentSuite = "";

function suite(name) {
    currentSuite = name;
    print("\n• " + name);
}

function check(label, condition, detail) {
    if (condition) {
        passed++;
        print("  ✓ " + label);
    } else {
        failures.push(currentSuite + " / " + label + (detail ? " -- " + detail : ""));
        print("  ✗ " + label + (detail ? " -- " + detail : ""));
    }
}

function eq(label, actual, expected) {
    let a = JSON.stringify(actual);
    let e = JSON.stringify(expected);
    check(label, a === e, a === e ? null : "got " + a + ", want " + e);
}

/* ------------------------------------------------------------------ *
 * Fakes and helpers
 * ------------------------------------------------------------------ */

/* Global ordered event log: settings writes, store writes, config
 * restores. Every fake appends here so cross-module ordering can be
 * asserted. Reset with EVENTS.length = 0 between scenarios. */
const EVENTS = [];

function eventIndex(type, key) {
    for (let i = 0; i < EVENTS.length; i++) {
        if (EVENTS[i].t === type &&
            (key === undefined || EVENTS[i].k === key))
            return i;
    }
    return -1;
}

function V(text) {
    return GLib.Variant.parse(null, text, null, null);
}

function strvOf(variant) {
    return variant.get_strv();
}

function printStrv(arr) {
    return CS.variantToString(GLib.Variant.new_strv(arr));
}

function makeLogger(sink) {
    return {
        warn: function (msg) { sink.push(String(msg)); },
        error: function (msg, e) {
            sink.push(String(msg) + (e && e.message ? ": " + e.message : ""));
        },
        log: function () {}
    };
}

/* Fake org.cinnamon settings provider: real GLib.Variant values, no
 * dconf. opts.onWrite(key) fires inside set_value (the destruction
 * scenario uses it to mimic appletManager destroying the caller mid-write
 * when our own enabled-applets entry changes). */
function fakeProvider(initial, opts) {
    opts = opts || {};
    const values = {};
    const writes = [];
    Object.keys(initial).forEach(function (k) { values[k] = initial[k]; });
    return {
        get_value: function (key) {
            if (!(key in values))
                throw new Error("unknown key " + key);
            return values[key];
        },
        set_value: function (key, variant) {
            if (!(key in values))
                throw new Error("unknown key " + key);
            if (opts.failWrites && opts.failWrites.indexOf(key) !== -1)
                throw new Error("write refused for " + key);
            writes.push(key);
            EVENTS.push({ t: "settings-write", k: key });
            values[key] = variant;
            if (opts.onWrite)
                opts.onWrite(key);
        },
        list_keys: function () { return Object.keys(values); },
        setValues: function (map) {
            Object.keys(map).forEach(function (k) { values[k] = map[k]; });
        },
        _values: values,
        writes: writes
    };
}

/* Fake layout provider shaped like the Main.layoutManager wrapper the
 * composition root injects. */
function fakeLayout(monitors, primaryIndex) {
    let list = monitors;
    let primary = primaryIndex;
    const listeners = {};
    let nextId = 1;
    return {
        getCount: function () { return list.length; },
        getMonitors: function () {
            return list.map(function (m) { return Object.assign({}, m); });
        },
        getPrimaryIndex: function () { return primary; },
        connect: function (cb) {
            const id = nextId++;
            listeners[id] = cb;
            return id;
        },
        disconnect: function (id) { delete listeners[id]; },
        emit: function () {
            Object.keys(listeners).forEach(function (k) { listeners[k](); });
        },
        setMonitors: function (m, p) { list = m; primary = p; },
        listenerCount: function () { return Object.keys(listeners).length; }
    };
}

function MON(i, x, w, name) {
    return { index: i, x: x, y: 0, width: w, height: 1080, name: name || "" };
}

/* Manual scheduler: the clock only moves on advance(ms). Due timers fire
 * in (due, id) order; a timer scheduled from a callback lands on the
 * already-advanced clock. */
function manualScheduler() {
    let next = 1;
    let now = 0;
    const timers = [];
    return {
        timeoutAdd: function (ms, fn) {
            const timer = { id: next, due: now + ms, fn: fn, alive: true,
                fired: false };
            next += 1;
            timers.push(timer);
            return timer.id;
        },
        sourceRemove: function (id) {
            timers.forEach(function (t) {
                if (t.id === id)
                    t.alive = false;
            });
        },
        advance: function (ms) {
            now += ms;
            for (;;) {
                let due = null;
                timers.forEach(function (t) {
                    if (!t.alive || t.fired || t.due > now)
                        return;
                    if (due === null || t.due < due.due ||
                        (t.due === due.due && t.id < due.id))
                        due = t;
                });
                if (!due)
                    return;
                due.fired = true;
                due.fn();
            }
        },
        pendingCount: function () {
            return timers.filter(function (t) {
                return t.alive && !t.fired;
            }).length;
        }
    };
}

function makeNotify() {
    const calls = [];
    return {
        calls: calls,
        info: function (title, details) { calls.push({ level: "info", title: title, details: details }); },
        warn: function (title, details) { calls.push({ level: "warn", title: title, details: details }); },
        success: function (title, details) { calls.push({ level: "success", title: title, details: details }); },
        count: function (level) {
            return calls.filter(function (c) { return c.level === level; }).length;
        }
    };
}

/* Delegating store wrappers that log into EVENTS. The config wrapper can
 * be armed to blow up partway through a restore (after the first file). */
function wrapConfigStore(real) {
    const wrapper = {
        armed: false,
        failAll: false,
        setDependencies: function (d) { real.setDependencies(d); },
        captureConfigs: function (entries) { return real.captureConfigs(entries); },
        captureRollbackState: function (current, target) {
            return real.captureRollbackState(current, target);
        },
        configHashList: function (configs) { return real.configHashList(configs); },
        validateConfigState: function (configs, tombstones) {
            return real.validateConfigState(configs, tombstones);
        },
        restoreConfigState: function (configs, tombstones) {
            if (wrapper.failAll) {
                EVENTS.push({ t: "config-restore", k: "always-throw" });
                throw new Error("persistent config failure");
            }
            if (wrapper.armed) {
                wrapper.armed = false;
                EVENTS.push({ t: "config-restore", k: "partial-then-throw" });
                real.restoreConfigState((configs || []).slice(0, 1), []);
                throw new Error("disk full on the second config write");
            }
            EVENTS.push({ t: "config-restore", k: "n=" +
                ((configs || []).length) + "/d=" +
                ((tombstones || []).length) });
            return real.restoreConfigState(configs, tombstones);
        },
        restoreConfigs: function (configs) {
            if (wrapper.armed) {
                wrapper.armed = false;
                EVENTS.push({ t: "config-restore", k: "partial-then-throw" });
                real.restoreConfigs((configs || []).slice(0, 1));
                throw new Error("disk full on the second config write");
            }
            EVENTS.push({ t: "config-restore", k: "n=" + ((configs || []).length) });
            return real.restoreConfigs(configs);
        }
    };
    return wrapper;
}

function wrapProfileStore(real) {
    const wrapper = {
        beforeLock: null,
        afterCreate: null,
        afterGetState: null,
        setDependencies: function (d) { real.setDependencies(d); },
        init: function () { return real.init(); },
        listProfiles: function () { return real.listProfiles(); },
        loadProfile: function (id) { return real.loadProfile(id); },
        saveProfile: function (p) { return real.saveProfile(p); },
        createFromSnapshot: function (i) {
            const profile = real.createFromSnapshot(i);
            if (profile && wrapper.afterCreate) {
                const hook = wrapper.afterCreate;
                wrapper.afterCreate = null;
                hook(profile);
            }
            return profile;
        },
        updateFromSnapshot: function (e, i) { return real.updateFromSnapshot(e, i); },
        duplicateProfile: function (id, name) { return real.duplicateProfile(id, name); },
        deleteProfile: function (id) { return real.deleteProfile(id); },
        renameProfile: function (id, n) { return real.renameProfile(id, n); },
        writeRollback: function (b) {
            const ok = real.writeRollback(b);
            if (ok)
                EVENTS.push({ t: "rollback-write" });
            return ok;
        },
        readRollback: function () { return real.readRollback(); },
        getState: function () {
            const state = real.getState();
            if (wrapper.afterGetState) {
                const hook = wrapper.afterGetState;
                wrapper.afterGetState = null;
                hook(state);
            }
            return state;
        },
        withStoreLock: function (fn) {
            if (wrapper.beforeLock) {
                const hook = wrapper.beforeLock;
                wrapper.beforeLock = null;
                hook();
            }
            return real.withStoreLock(fn);
        },
        mutateState: function (fn) {
            const before = real.getState();
            const result = real.mutateState(fn);
            const after = real.getState();
            if (!before || !after)
                return result;
            if (after.pendingApply && !before.pendingApply)
                EVENTS.push({ t: "pendingApply-set" });
            if (!after.pendingApply && before.pendingApply)
                EVENTS.push({ t: "pendingApply-cleared" });
            if (after.activeProfileId && !before.activeProfileId)
                EVENTS.push({ t: "active-set" });
            return result;
        }
    };
    return wrapper;
}

const STORE = wrapProfileStore(PS);
const CONFIGS = wrapConfigStore(ACS);

function exists(path) {
    try {
        return Gio.File.new_for_path(path).query_exists(null);
    } catch (ignored) {
        return false;
    }
}

function readRaw(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok)
            return null;
        return new TextDecoder("utf-8").decode(bytes);
    } catch (ignored) {
        return null;
    }
}

function writeRaw(path, text) {
    GLib.file_set_contents(path, text);
}

function deleteFile(path) {
    try {
        Gio.File.new_for_path(path).delete(null);
    } catch (ignored) {
    }
}

function startWidgetLockWorker(action, profileId, tag) {
    const ready = CONFIG_DIR + "/" + tag + ".ready";
    const release = CONFIG_DIR + "/" + tag + ".release";
    deleteFile(ready);
    deleteFile(release);
    const process = Gio.Subprocess.new([
        "python3", SCRIPT_DIR + "/pp-widget-lock-helper.py", "hold",
        XLET_DIR + "/profilesManagerWidget.py", action, profileId,
        ready, release
    ], Gio.SubprocessFlags.NONE);
    const deadline = GLib.get_monotonic_time() + 5000000;
    while (!exists(ready) && GLib.get_monotonic_time() < deadline)
        GLib.usleep(10000);
    return {
        ready: exists(ready),
        release: function () {
            writeRaw(release, "release\n");
            try {
                return process.wait_check(null);
            } catch (ignored) {
                return false;
            }
        }
    };
}

function startWaitingRepairWorker(profileId, tag) {
    const ready = CONFIG_DIR + "/" + tag + ".ready";
    const trigger = CONFIG_DIR + "/" + tag + ".trigger";
    const attempting = CONFIG_DIR + "/" + tag + ".attempting";
    const acquired = CONFIG_DIR + "/" + tag + ".acquired";
    const release = CONFIG_DIR + "/" + tag + ".release";
    [ready, trigger, attempting, acquired, release].forEach(deleteFile);
    const process = Gio.Subprocess.new([
        "python3", SCRIPT_DIR + "/pp-widget-lock-helper.py", "wait-repair",
        XLET_DIR + "/profilesManagerWidget.py", profileId, ready, trigger,
        attempting, acquired, release
    ], Gio.SubprocessFlags.NONE);
    function waitFor(path) {
        const deadline = GLib.get_monotonic_time() + 5000000;
        while (!exists(path) && GLib.get_monotonic_time() < deadline)
            GLib.usleep(10000);
        return exists(path);
    }
    return {
        ready: waitFor(ready),
        trigger: function () { writeRaw(trigger, "go\n"); },
        waitAttempting: function () { return waitFor(attempting); },
        waitAcquired: function () { return waitFor(acquired); },
        release: function () {
            writeRaw(release, "release\n");
            try {
                return process.wait_check(null);
            } catch (ignored) {
                return false;
            }
        }
    };
}

function listDirNames(path) {
    const names = [];
    try {
        const children = Gio.File.new_for_path(path).enumerate_children(
            "standard::name", Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = children.next_file(null)) !== null)
            names.push(info.get_name());
        children.close(null);
    } catch (ignored) {
    }
    names.sort();
    return names;
}

/* Wipe profiles, backups and reset state.json between scenarios. */
function resetAppState() {
    listDirNames(PROFILES_DIR).forEach(function (n) {
        deleteFile(PROFILES_DIR + "/" + n);
    });
    listDirNames(BACKUPS_DIR).forEach(function (n) {
        deleteFile(BACKUPS_DIR + "/" + n);
    });
    PS.mutateState(function (s) {
        s.activeProfileId = null;
        s.pendingApply = null;
        s.lastSuccessfulApply = null;
        s.lastFailure = null;
    });
}

/* Two distinguishable live states. A: single bottom panel, five applets,
 * max id 21, next-applet-id 10, one desklet. B: different everything. */
function stateA() {
    return {
        "panels-enabled": V("['1:0:bottom']"),
        "enabled-applets": V("['panel1:left:0:menu@cinnamon.org:0', " +
            "'panel1:left:1:x@x:5', " +
            "'panel1:right:0:systray@cinnamon.org:3', " +
            "'panel1:right:1:cal@x:13', " +
            "'panel1:right:2:" + SELF + ":21']"),
        "panels-autohide": V("['1:1']"),
        "panels-show-delay": V("['1:0']"),
        "panels-hide-delay": V("['1:0']"),
        "panels-height": V("['1:28']"),
        "panel-scale-text-icons": V("true"),
        "panel-zone-icon-sizes": V("'[{\"panelId\": 1, \"left\": 0, \"center\": 0, \"right\": 0}]'"),
        "panel-zone-symbolic-icon-sizes": V("'[{\"panelId\": 1, \"left\": 16, \"center\": 16, \"right\": 16}]'"),
        "panel-zone-text-sizes": V("'[{\"panelId\": 1, \"left\": 0.9, \"center\": 0.9, \"right\": 0.9}]'"),
        "enabled-desklets": V("['clock@x:7:100:100']"),
        "desklet-decorations": V("0"),
        "desklet-snap": V("false"),
        "desklet-snap-interval": V("500"),
        "next-applet-id": V("10"),
        "next-desklet-id": V("4")
    };
}

function stateB() {
    return {
        "panels-enabled": V("['1:0:top']"),
        "enabled-applets": V("['panel1:right:0:cal@x:13', 'panel1:left:0:menu@cinnamon.org:0']"),
        "panels-autohide": V("['1:2']"),
        "panels-show-delay": V("['1:1']"),
        "panels-hide-delay": V("['1:1']"),
        "panels-height": V("['1:40']"),
        "panel-scale-text-icons": V("false"),
        "panel-zone-icon-sizes": V("'[{\"panelId\": 1, \"left\": 0, \"center\": 0, \"right\": 0}]'"),
        "panel-zone-symbolic-icon-sizes": V("'[{\"panelId\": 1, \"left\": 24, \"center\": 24, \"right\": 24}]'"),
        "panel-zone-text-sizes": V("'[{\"panelId\": 1, \"left\": 1.0, \"center\": 1.0, \"right\": 1.0}]'"),
        "enabled-desklets": V("['notes@x:5:200:200']"),
        "desklet-decorations": V("1"),
        "desklet-snap": V("true"),
        "desklet-snap-interval": V("250"),
        "next-applet-id": V("40"),
        "next-desklet-id": V("9")
    };
}

const CONTENT_A = "{\"flavor\":\"a\"}";
const CONTENT_B = "{\"flavor\":\"b\"}";
const DESKLET_CONTENT_A = "{\"desklet\":\"a\"}";
const DESKLET_CONTENT_B = "{\"desklet\":\"b\"}";

function writeConfigFiles(content) {
    ATOMIC.ensurePrivateDir(SPICE_ROOT + "/x@x");
    writeRaw(SPICE_ROOT + "/x@x/5.json", content);
    ATOMIC.ensurePrivateDir(SPICE_ROOT + "/cal@x");
    writeRaw(SPICE_ROOT + "/cal@x/13.json", content);
}

function writeDeskletConfigFiles(content) {
    /* clock@x (stateA) stores its config uuid-named (single-instance
     * shape); notes@x (stateB) uses the instance-id name. */
    ATOMIC.ensurePrivateDir(SPICE_ROOT + "/clock@x");
    writeRaw(SPICE_ROOT + "/clock@x/clock@x.json", content);
    ATOMIC.ensurePrivateDir(SPICE_ROOT + "/notes@x");
    writeRaw(SPICE_ROOT + "/notes@x/5.json", content);
}

/* Full wiring of the controller exactly the way the composition root
 * does it, with the scenario fakes. Returns the recorder handles. */
function wireController(overrides) {
    const clock = manualScheduler();
    const states = [];
    const notify = makeNotify();
    const warns = [];
    const waitEvents = [];
    const saved = [];
    const removalHandoff = [];
    const layout = fakeLayout([MON(0, 0, 1920, "DP-1")], 0);
    const deps = {
        constants: CONSTANTS,
        logger: makeLogger(warns),
        cinnamonState: CS,
        appletConfigStore: CONFIGS,
        profileStore: STORE,
        profileSchema: PSCHEMA,
        fingerprint: FP,
        monitorTopology: MT,
        scheduler: clock,
        notify: notify,
        isAppletInstalled: function () { return true; },
        isDeskletInstalled: function () { return true; },
        notifySuccessEnabled: function () { return true; },
        onStateChange: function (s) {
            states.push(s);
            removalHandoff.push([s,
                AC.shouldPreserveTransactionOnRemoval()]);
        },
        onWaitStateChange: function (show, current, required) {
            waitEvents.push([show, current, required]);
        },
        onProfileSaved: function (p) { saved.push(p); },
        waitStabilizeMs: 100,
        waitTimeoutMs: 5000
    };
    Object.keys(overrides || {}).forEach(function (k) {
        deps[k] = overrides[k];
    });
    AC.setDependencies(deps);
    MT.setDependencies({ layoutProvider: layout, scheduler: clock,
        logger: deps.logger });
    return {
        clock: clock,
        states: states,
        notify: notify,
        warns: warns,
        waitEvents: waitEvents,
        saved: saved,
        removalHandoff: removalHandoff,
        layout: layout,
        deps: deps
    };
}

function injectProvider(values, opts) {
    const provider = fakeProvider(values, opts);
    CS.setDependencies({
        selfUuid: SELF,
        settingsProvider: provider,
        logger: null
    });
    return provider;
}

/* A schema-valid handcrafted profile (fingerprint empty: verification
 * then relies on the canonical settings compare alone). */
function handProfile(id, name, entries, panels, extraSettings) {
    const settings = {
        "panels-enabled": { type: "as", value: printStrv(panels) },
        "enabled-applets": { type: "as", value: printStrv(entries) },
        "panels-height": { type: "as", value: "['1:28']" }
    };
    Object.keys(extraSettings || {}).forEach(function (k) {
        settings[k] = extraSettings[k];
    });
    return {
        schemaVersion: 1,
        id: id,
        name: name,
        description: "",
        createdAt: "2026-08-19T20:00:00-07:00",
        updatedAt: "2026-08-19T20:00:00-07:00",
        environment: { cinnamonVersion: "6.6.9", sessionType: "x11" },
        monitorTopology: {
            expectedCount: 1,
            monitors: [{ savedIndex: 0, primary: true, x: 0, y: 0,
                width: 1920, height: 1080, scale: 1 }]
        },
        cinnamonSettings: settings,
        appletConfigs: [],
        fingerprint: "",
        managerAnchor: { uuid: SELF, required: true }
    };
}

/* ------------------------------------------------------------------ *
 * One-time module wiring that every scenario shares
 * ------------------------------------------------------------------ */

FP.setDependencies({
    canonicalize: CS.fingerprintSettingsPart,
    sha256: ATOMIC.sha256Hex
});
PS.setDependencies({ logger: makeLogger([]) });
ACS.setDependencies({
    selfUuid: function () { return SELF; },
    logger: null,
    configRoot: SPICE_ROOT
});

suite("environment isolation");
check("config dir redirected out of home", CONFIG_DIR.indexOf(HOME_DIR) !== 0,
    CONFIG_DIR);
check("STATE_DIR under temp config dir",
    STATE_DIR.indexOf(CONFIG_DIR + "/") === 0, STATE_DIR);

/* ------------------------------------------------------------------ *
 * monitorTopology: reads, satisfaction, matching
 * ------------------------------------------------------------------ */

suite("monitorTopology basics");

MT.resetDependencies();
(function () {
    const empty = MT.getCurrentTopology();
    eq("no provider gives a safe empty topology", empty,
        { expectedCount: 0, monitors: [] });
    eq("no provider gives count 0", MT.getMonitorCount(), 0);
    check("nothing satisfies an empty topology",
        MT.topologySatisfies(empty, { expectedCount: 1 }) === false);
})();

(function () {
    const layout = fakeLayout(
        [MON(0, 0, 1920, "DP-1"), MON(1, 1920, 1280, "HDMI-1")], 1);
    const clock = manualScheduler();
    MT.setDependencies({ layoutProvider: layout, scheduler: clock, logger: null });
    const topology = MT.getCurrentTopology();
    eq("count follows the provider", MT.getMonitorCount(), 2);
    eq("expectedCount is the monitor count", topology.expectedCount, 2);
    eq("primary flag from primaryIndex",
        topology.monitors.map(function (m) { return m.primary; }),
        [false, true]);
    eq("savedIndex is the live index",
        topology.monitors.map(function (m) { return m.savedIndex; }),
        [0, 1]);
    eq("geometry carried through",
        [topology.monitors[1].x, topology.monitors[1].width], [1920, 1280]);
    eq("scale defaults to 1",
        topology.monitors.map(function (m) { return m.scale; }), [1, 1]);
    eq("names carried through",
        topology.monitors.map(function (m) { return m.name; }),
        ["DP-1", "HDMI-1"]);
    check("equal count satisfies",
        MT.topologySatisfies(topology, { expectedCount: 2 }));
    check("more current than required satisfies",
        MT.topologySatisfies(topology, { expectedCount: 1 }));
    check("fewer current than required does not",
        MT.topologySatisfies(topology, { expectedCount: 3 }) === false);
    check("missing required fails closed",
        MT.topologySatisfies(topology, null) === false);
    check("raw counts tolerated",
        MT.topologySatisfies(2, 2) && !MT.topologySatisfies(1, 2));
})();

suite("mapSavedMonitorsToCurrent");

(function () {
    /* Name beats geometry: the current monitors swapped their connectors,
     * names still pair them correctly. */
    const layout = fakeLayout(
        [MON(0, 1920, 1280, "HDMI-1"), MON(1, 0, 1920, "DP-1")], 1);
    MT.setDependencies({ layoutProvider: layout,
        scheduler: manualScheduler(), logger: null });
    const saved = { monitors: [
        { savedIndex: 0, primary: true, x: 0, y: 0, width: 1920, height: 1080, name: "DP-1", scale: 1 },
        { savedIndex: 1, primary: false, x: 1920, y: 0, width: 1280, height: 1080, name: "HDMI-1", scale: 1 }
    ] };
    const mapped = MT.mapSavedMonitorsToCurrent(saved);
    eq("name match pairs across swapped geometry", mapped.indexMap, { 0: 1, 1: 0 });
    eq("name match leaves nothing unmatched", mapped.unmatched, []);
})();

(function () {
    /* No names: primary flag pairs them. */
    const layout = fakeLayout(
        [MON(0, 1920, 1280, ""), MON(1, 0, 1920, "")], 0);
    MT.setDependencies({ layoutProvider: layout,
        scheduler: manualScheduler(), logger: null });
    const saved = { monitors: [
        { savedIndex: 0, primary: true, x: 0, y: 0, width: 1920, height: 1080, name: "" },
        { savedIndex: 1, primary: false, x: 1920, y: 0, width: 1280, height: 1080, name: "" }
    ] };
    const mapped = MT.mapSavedMonitorsToCurrent(saved);
    eq("primary flag pairs without names", mapped.indexMap, { 0: 0, 1: 1 });
})();

(function () {
    /* No names, both non-primary, distinct geometry: geometry pairs. */
    const layout = fakeLayout(
        [MON(0, 0, 1920, ""), MON(1, 1920, 1280, "")], -1);
    MT.setDependencies({ layoutProvider: layout,
        scheduler: manualScheduler(), logger: null });
    const saved = { monitors: [
        { savedIndex: 5, primary: false, x: 1920, y: 0, width: 1280, height: 1080, name: "" },
        { savedIndex: 6, primary: false, x: 0, y: 0, width: 1920, height: 1080, name: "" }
    ] };
    const mapped = MT.mapSavedMonitorsToCurrent(saved);
    eq("exact geometry pairs regardless of index", mapped.indexMap, { 5: 1, 6: 0 });
})();

(function () {
    /* Nothing distinguishing at all: saved index fallback. */
    const layout = fakeLayout([MON(0, 0, 1920, "")], 0);
    MT.setDependencies({ layoutProvider: layout,
        scheduler: manualScheduler(), logger: null });
    const saved = { monitors: [
        { savedIndex: 0, primary: false, x: 9, y: 9, width: 9, height: 9, name: "" }
    ] };
    const mapped = MT.mapSavedMonitorsToCurrent(saved);
    eq("saved index fallback", mapped.indexMap, { 0: 0 });
})();

(function () {
    /* Fewer current than saved: extras go unmatched, no monitor is used
     * twice, and the result is deterministic across calls. */
    const layout = fakeLayout([MON(0, 0, 1920, "")], 0);
    MT.setDependencies({ layoutProvider: layout,
        scheduler: manualScheduler(), logger: null });
    const saved = { monitors: [
        { savedIndex: 0, primary: false, x: 0, y: 0, width: 1920, height: 1080, name: "" },
        { savedIndex: 1, primary: false, x: 0, y: 0, width: 1920, height: 1080, name: "" },
        { savedIndex: 2, primary: false, x: 0, y: 0, width: 1920, height: 1080, name: "" }
    ] };
    const first = MT.mapSavedMonitorsToCurrent(saved);
    const second = MT.mapSavedMonitorsToCurrent(saved);
    eq("one match, deterministic (first saved wins)", first.indexMap, { 0: 0 });
    eq("deterministic across calls", first, second);
    eq("extras unmatched", first.unmatched, [1, 2]);
    check("no live monitor claimed twice",
        Object.keys(first.indexMap).length === 1);
})();

(function () {
    const layout = fakeLayout(
        [MON(0, 0, 1920, "DUP"), MON(1, 1920, 1920, "DUP")], -1);
    MT.setDependencies({ layoutProvider: layout,
        scheduler: manualScheduler(), logger: null });
    const noExact = { monitors: [{ savedIndex: 7, primary: false,
        x: 500, y: 0, width: 1920, height: 1080, name: "DUP", scale: 1 }] };
    const ambiguousName = MT.mapSavedMonitorsToCurrent(noExact);
    eq("duplicate connector name without exact index is ambiguous",
        ambiguousName.ambiguous, [7]);
    eq("ambiguous name is not guessed", ambiguousName.indexMap, {});

    const duplicateSavedIndex = { monitors: [
        { savedIndex: 0, primary: false, x: 0, y: 0,
            width: 1920, height: 1080, name: "", scale: 1 },
        { savedIndex: 0, primary: false, x: 1920, y: 0,
            width: 1920, height: 1080, name: "", scale: 1 }
    ] };
    const duplicateIndex = MT.mapSavedMonitorsToCurrent(duplicateSavedIndex);
    eq("duplicate saved monitor index is ambiguous",
        duplicateIndex.ambiguous, [0]);
    eq("duplicate saved index is not mapped", duplicateIndex.indexMap, {});
})();

suite("waitForTopology");

(function () {
    /* Already sufficient: stabilize, then ready exactly once. */
    const clock = manualScheduler();
    const layout = fakeLayout([MON(0, 0, 1920, "")], 0);
    MT.setDependencies({ layoutProvider: layout, scheduler: clock, logger: null });
    let ready = 0, timeouts = 0, progresses = 0;
    const handle = MT.waitForTopology(1, {
        stabilizeMs: 100, timeoutMs: 5000,
        onReady: function () { ready++; },
        onTimeout: function () { timeouts++; },
        onProgress: function () { progresses++; }
    });
    eq("not ready before the window", ready, 0);
    clock.advance(99);
    eq("still waiting inside the window", ready, 0);
    clock.advance(1);
    eq("ready exactly once after the window", ready, 1);
    eq("no timeout after ready", timeouts, 0);
    eq("no progress without a change", progresses, 0);
    clock.advance(60000);
    eq("nothing fires after completion", [ready, timeouts], [1, 0]);
    eq("provider disconnected after completion", layout.listenerCount(), 0);
    handle.cancel();
})();

(function () {
    /* Insufficient, then arrives: churn during stabilization restarts the
     * window, so ready only fires after a FULL quiet window. */
    const clock = manualScheduler();
    const layout = fakeLayout([MON(0, 0, 1920, "")], 0);
    MT.setDependencies({ layoutProvider: layout, scheduler: clock, logger: null });
    let ready = 0, timeouts = 0;
    const progresses = [];
    MT.waitForTopology(2, {
        stabilizeMs: 100, timeoutMs: 5000,
        onReady: function () { ready++; },
        onTimeout: function () { timeouts++; },
        onProgress: function (count, required) { progresses.push([count, required]); }
    });
    clock.advance(4000);
    eq("no ready while insufficient", ready, 0);
    layout.setMonitors([MON(0, 0, 1920, ""), MON(1, 1920, 1280, "")], 0);
    layout.emit();
    eq("progress fired once on the change", progresses, [[2, 2]]);
    clock.advance(60);            /* 60 ms into the window */
    layout.emit();                /* churn: restart the window */
    clock.advance(60);            /* only 60 ms since the restart */
    eq("not ready yet after churn restart", ready, 0);
    eq("churn fired another progress", progresses.length, 2);
    clock.advance(41);            /* past 100 ms since the restart */
    eq("ready after a full quiet window", ready, 1);
    eq("no timeout after ready", timeouts, 0);
})();

(function () {
    /* Drops back below required mid-wait: no ready, hard timeout fires
     * exactly once, nothing after. */
    const clock = manualScheduler();
    const layout = fakeLayout([MON(0, 0, 1920, "")], 0);
    MT.setDependencies({ layoutProvider: layout, scheduler: clock, logger: null });
    let ready = 0, timeouts = 0;
    MT.waitForTopology(2, {
        stabilizeMs: 100, timeoutMs: 5000,
        onReady: function () { ready++; },
        onTimeout: function () { timeouts++; }
    });
    layout.setMonitors([MON(0, 0, 1920, ""), MON(1, 1920, 1280, "")], 0);
    layout.emit();
    clock.advance(50);
    layout.setMonitors([MON(0, 0, 1920, "")], 0);   /* dropped again */
    layout.emit();
    clock.advance(200);
    eq("no ready after a drop", ready, 0);
    clock.advance(5000);
    eq("timeout fired exactly once", timeouts, 1);
    clock.advance(60000);
    eq("no retries after the timeout", [ready, timeouts], [0, 1]);
})();

(function () {
    /* cancel() is silent and idempotent. */
    const clock = manualScheduler();
    const layout = fakeLayout([MON(0, 0, 1920, "")], 0);
    MT.setDependencies({ layoutProvider: layout, scheduler: clock, logger: null });
    let fired = 0;
    const handle = MT.waitForTopology(2, {
        stabilizeMs: 100, timeoutMs: 5000,
        onReady: function () { fired++; },
        onTimeout: function () { fired++; },
        onProgress: function () { fired++; }
    });
    handle.cancel();
    handle.cancel();
    layout.setMonitors([MON(0, 0, 1920, ""), MON(1, 1920, 1280, "")], 0);
    layout.emit();
    clock.advance(60000);
    eq("nothing fires after cancel", fired, 0);
    eq("cancel disconnects the provider", layout.listenerCount(), 0);
})();

(function () {
    /* Throwing callbacks are survivable: a hostile onProgress must not
     * stop the wait from reaching a normal ready. */
    const clock = manualScheduler();
    const layout = fakeLayout([MON(0, 0, 1920, "")], 0);
    MT.setDependencies({ layoutProvider: layout, scheduler: clock, logger: null });
    let ready = 0;
    MT.waitForTopology(1, {
        stabilizeMs: 50, timeoutMs: 5000,
        onReady: function () { ready++; },
        onProgress: function () { throw new Error("menu progress on fire"); }
    });
    layout.emit();        /* progress throws: swallowed, stabilize starts */
    clock.advance(50);
    eq("ready despite a throwing progress callback", ready, 1);
})();

MT.resetDependencies();

/* ------------------------------------------------------------------ *
 * Controller: happy path
 * ------------------------------------------------------------------ */

suite("saved profile active commit under real contention");
resetAppState();
writeConfigFiles(CONTENT_A);
injectProvider(stateA());
PS.init();
let saveCommitWorker = null;
STORE.afterCreate = function () {
    saveCommitWorker = startWidgetLockWorker(
        "repair", "unrelated-profile", "save-active-commit-lock");
};
let harness = wireController({ commitRetryDelayMs: 50,
    commitRetryLimit: 3 });
let saveResult = AC.beginSaveNew("Durable Save");
check("profile file saves before active commit contention",
    saveResult.ok === true && saveResult.pendingCommit === true &&
    exists(PROFILES_DIR + "/" + saveResult.profile.id + ".json"));
check("Python worker holds lock across saved active commit",
    saveCommitWorker && saveCommitWorker.ready);
check("save remains busy until active id is durable",
    AC.isBusy() && AC.getState() === "SAVING");
eq("UI saved callback waits for durable active state",
    harness.saved.length, 0);
const saveContendedRaw = JSON.parse(readRaw(STATE_FILE));
check("contended save does not expose false active id",
    saveContendedRaw.activeProfileId !== saveResult.profile.id);
check("save active contention worker exits cleanly",
    saveCommitWorker.release());
harness.clock.advance(50);
eq("saved callback fires after durable active commit", harness.saved.length, 1);
eq("saved profile becomes durably active",
    PS.getState().activeProfileId, saveResult.profile.id);
check("save releases only after active commit",
    !AC.isBusy() && AC.getState() === "IDLE");

suite("apply happy path");

resetAppState();
writeConfigFiles(CONTENT_A);
EVENTS.length = 0;
const provider = injectProvider(stateA());
PS.init();

harness = wireController({ notifySuccessEnabled: function () { return false; } });
saveResult = AC.beginSaveNew("Layout A");
check("save-new returns ok", saveResult.ok === true, JSON.stringify(saveResult));
const profileA = saveResult.profile;
check("no rollback written by a save", eventIndex("rollback-write") === -1);
check("saved profile has a fingerprint", profileA.fingerprint.length === 64);
eq("onProfileSaved fired with the profile", harness.saved.length, 1);
check("SAVING observed in the state sequence",
    harness.states.indexOf("SAVING") !== -1);

/* Drift the live state, then apply A over it. The counter is pinned back
 * below the profile's max id (21) so the forward-only bump is observable:
 * stateB's own counter value (40) would make the correct bump a no-op. */
provider.setValues(stateB());
provider._values["next-applet-id"] = V("10");
writeConfigFiles(CONTENT_B);
EVENTS.length = 0;
harness.states.length = 0;

let applyResult = AC.beginApply(profileA.id, { reason: "user" });
check("apply starts", applyResult.started === true &&
    applyResult.failure === undefined, JSON.stringify(applyResult));
eq("state sequence through the writes", harness.states, [
    "VALIDATING",
    "SNAPSHOTTING_ROLLBACK",
    "RESTORING_PANEL_SETTINGS",
    "RESTORING_APPLET_CONFIGS",
    "RESTORING_ENABLED_APPLETS",
    "VERIFYING"
]);
(function () {
    function valueAt(state) {
        const row = harness.removalHandoff.find(function (item) {
            return item[0] === state;
        });
        return row ? row[1] : null;
    }
    eq("snapshot removal is not a handoff", valueAt("SNAPSHOTTING_ROLLBACK"), false);
    eq("save removal is not a handoff", valueAt("SAVING"), false);
    eq("panel write removal is a handoff", valueAt("RESTORING_PANEL_SETTINGS"), true);
    eq("config removal is not a handoff", valueAt("RESTORING_APPLET_CONFIGS"), false);
    eq("applet list removal is a handoff", valueAt("RESTORING_ENABLED_APPLETS"), true);
    eq("verify removal is not a handoff", valueAt("VERIFYING"), false);
})();
check("busy while verification is pending", AC.isBusy());
check("dirty suppressed while applying", AC.isDirtySuppressed());
check("rollback written before any settings write",
    eventIndex("rollback-write") !== -1 &&
    eventIndex("settings-write") > eventIndex("rollback-write"),
    JSON.stringify(EVENTS.filter(function (e) {
        return e.t === "rollback-write" || e.t === "settings-write";
    }).slice(0, 3)));
check("pendingApply written before the enabled-applets write",
    eventIndex("pendingApply-set") !== -1 &&
    eventIndex("settings-write", "enabled-applets") !== -1 &&
    eventIndex("pendingApply-set") < eventIndex("settings-write", "enabled-applets"));
check("panel settings restored before configs",
    eventIndex("settings-write", "panels-enabled") !== -1 &&
    eventIndex("settings-write", "panels-height") !== -1 &&
    eventIndex("config-restore") > eventIndex("settings-write", "panels-height"));
(function () {
    const restoreWrites = provider.writes.filter(function (k) {
        return k !== "next-applet-id";
    });
    eq("enabled-applets is the last restore write",
        restoreWrites[restoreWrites.length - 1], "enabled-applets");
    check("panels-enabled written before enabled-applets",
        restoreWrites.indexOf("panels-enabled") !== -1 &&
        restoreWrites.indexOf("panels-enabled") <
            restoreWrites.indexOf("enabled-applets"));
})();
eq("rollback file exists", exists(BACKUPS_DIR + "/last-good.json"), true);
eq("pendingApply in state.json",
    PS.getState().pendingApply && PS.getState().pendingApply.profileId,
    profileA.id);

harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
eq("sequence completes", harness.states.slice(-2), ["COMPLETE", "IDLE"]);
check("not busy after completion", !AC.isBusy());
check("idle removal is not a handoff",
    AC.shouldPreserveTransactionOnRemoval() === false);
check("dirty suppression lifted", !AC.isDirtySuppressed());
eq("activeProfileId set", PS.getState().activeProfileId, profileA.id);
eq("pendingApply cleared on success", PS.getState().pendingApply, null);
check("lastSuccessfulApply recorded",
    typeof PS.getState().lastSuccessfulApply === "string" &&
    PS.getState().lastSuccessfulApply.length > 0);
check("success notification gated off",
    harness.notify.count("success") === 0 &&
    harness.notify.count("warn") === 0,
    JSON.stringify(harness.notify.calls));
eq("restored panels-enabled verbatim",
    strvOf(provider._values["panels-enabled"]), ["1:0:bottom"]);
eq("restored enabled-applets verbatim",
    strvOf(provider._values["enabled-applets"]),
    strvOf(stateA()["enabled-applets"]));
eq("config content restored", readRaw(SPICE_ROOT + "/x@x/5.json"), CONTENT_A);
eq("next-applet-id bumped past the max restored id",
    CS.readNextAppletId(), 22);
check("fingerprint of the live state matches the profile",
    AC.computeCurrentFingerprint() === profileA.fingerprint);

/* Second apply with the success gate ON: exactly one notification. */
harness = wireController({});
EVENTS.length = 0;
applyResult = AC.beginApply(profileA.id, { reason: "user" });
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
check("second apply completes", harness.states.indexOf("COMPLETE") !== -1);
eq("success notification fires when enabled",
    harness.notify.count("success"), 1);
eq("no warnings on a clean apply", harness.notify.count("warn"), 0);
eq("next-applet-id never lowered by a re-apply", CS.readNextAppletId(), 22);

/* Forward-only against a SMALLER profile: the counter stays put. */
const smallProfile = handProfile("small-profile-1", "Small",
    ["panel1:left:0:menu@cinnamon.org:0", "panel1:right:2:" + SELF + ":5"],
    ["1:0:bottom"]);
PS.saveProfile(smallProfile);
provider.setValues(stateB());
/* stateB carries its own counter (40); a profile whose max id is 5 must
 * not drag it back down. */
harness = wireController({});
applyResult = AC.beginApply("small-profile-1", { reason: "user" });
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
check("small-id profile applies", harness.states.indexOf("COMPLETE") !== -1);
eq("counter not rewound by smaller ids", CS.readNextAppletId(), 40);

suite("verification commit under real store contention");
resetAppState();
writeConfigFiles(CONTENT_A);
const commitProvider = injectProvider(stateA());
PS.init();
harness = wireController({ commitRetryDelayMs: 50, commitRetryLimit: 3 });
const commitProfile = AC.beginSaveNew("Commit Contention").profile;
PS.mutateState(function (state) { state.activeProfileId = null; });
commitProvider.setValues(stateB());
writeConfigFiles(CONTENT_B);
applyResult = AC.beginApply(commitProfile.id, { reason: "user" });
check("contention profile apply reaches verification",
    applyResult.started === true && AC.getState() === "VERIFYING");
const commitWorker = startWidgetLockWorker(
    "repair", "unrelated-profile", "verification-commit-lock");
check("Python worker holds store lock across verification",
    commitWorker.ready);
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
const contendedRaw = JSON.parse(readRaw(STATE_FILE));
check("contended verification does not announce false success",
    harness.notify.count("success") === 0 &&
    harness.states.indexOf("COMPLETE") === -1);
check("contended verification stays busy for bounded retry", AC.isBusy());
check("durable pending marker remains during contention",
    contendedRaw.pendingApply &&
    contendedRaw.pendingApply.profileId === commitProfile.id);
check("old durable active id is not changed before commit",
    contendedRaw.activeProfileId !== commitProfile.id);
check("Python verification contention worker exits cleanly",
    commitWorker.release());
harness.clock.advance(50);
const committedState = PS.getState();
check("verification succeeds only after durable commit",
    harness.notify.count("success") === 1 &&
    harness.states.indexOf("COMPLETE") !== -1);
eq("durable active id commits after contention",
    committedState.activeProfileId, commitProfile.id);
eq("durable pending marker clears after contention",
    committedState.pendingApply, null);

resetAppState();
writeConfigFiles(CONTENT_A);
const exhaustedProvider = injectProvider(stateA());
PS.init();
harness = wireController({ commitRetryDelayMs: 50, commitRetryLimit: 2 });
const exhaustedProfile = AC.beginSaveNew("Commit Exhaustion").profile;
exhaustedProvider.setValues(stateB());
writeConfigFiles(CONTENT_B);
AC.beginApply(exhaustedProfile.id, { reason: "user" });
const exhaustedWorker = startWidgetLockWorker(
    "repair", "unrelated-profile", "verification-commit-exhaustion");
check("Python worker can hold through the full retry window",
    exhaustedWorker.ready);
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
harness.clock.advance(50);
harness.clock.advance(50);
const exhaustedRaw = JSON.parse(readRaw(STATE_FILE));
check("exhausted commit retries never announce success",
    harness.notify.count("success") === 0 &&
    harness.states.indexOf("COMPLETE") === -1);
check("exhausted commit retries fail and release the controller",
    harness.notify.count("warn") === 1 && !AC.isBusy() &&
    AC.getState() === "IDLE");
check("failed durable commit leaves marker for startup recovery",
    exhaustedRaw.pendingApply &&
    exhaustedRaw.pendingApply.profileId === exhaustedProfile.id);
check("exhausted contention worker exits cleanly",
    exhaustedWorker.release());
AC.cancelAll(true);

/* ------------------------------------------------------------------ *
 * Controller: destruction at the enabled-applets write
 * ------------------------------------------------------------------ */

suite("destruction at the enabled-applets write");

resetAppState();
writeConfigFiles(CONTENT_A);
let destroyed = false;
const destructiveProvider = injectProvider(stateA(), {
    onWrite: function (key) {
        if (key === "enabled-applets")
            destroyed = true;   /* appletManager destroyed us mid-call */
    }
});
destructiveProvider.setValues(stateB());
writeConfigFiles(CONTENT_B);
harness = wireController({});
saveResult = AC.beginSaveNew("PreDestruction");
destructiveProvider.setValues(stateB());
EVENTS.length = 0;
harness.states.length = 0;
applyResult = AC.beginApply(saveResult.profile.id, { reason: "user" });
check("apply reports started with no exception",
    applyResult.started === true, JSON.stringify(applyResult));
check("destruction hook fired during the write", destroyed);
eq("state parked in VERIFYING, busy", [AC.getState(), AC.isBusy()],
    ["VERIFYING", true]);
eq("pendingApply written for the successor instance",
    PS.getState().pendingApply &&
    PS.getState().pendingApply.profileId, saveResult.profile.id);
eq("no notify call after the destruction point",
    harness.notify.calls.length, 0);
check("the destroyed instance's verify timer is only on its own clock",
    harness.clock.pendingCount() === 1);
/* The clock is never advanced here: a destroyed instance has no future. */

/* ------------------------------------------------------------------ *
 * Controller: verification failure
 * ------------------------------------------------------------------ */

suite("verification failure");

resetAppState();
writeConfigFiles(CONTENT_A);
const failProvider = injectProvider(stateA());
PS.init();
harness = wireController({});
const victim = AC.beginSaveNew("Victim").profile;
failProvider.setValues(stateB());
EVENTS.length = 0;
harness.states.length = 0;
applyResult = AC.beginApply(victim.id, { reason: "user" });
/* Simulate the desktop drifting after our write but before verify. */
failProvider._values["panels-height"] = V("['1:99']");
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
check("automatic rollback started",
    PS.getState().pendingApply.reason === "auto-rollback");
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
check("automatic rollback completed", harness.states.indexOf("COMPLETE") !== -1);
eq("settles to IDLE and releases the lock",
    [AC.getState(), AC.isBusy()], ["IDLE", false]);
eq("exactly one warning notification", harness.notify.count("warn"), 1);
check("mismatched key logged",
    harness.warns.some(function (w) { return w.indexOf("panels-height") !== -1; }),
    JSON.stringify(harness.warns));
eq("rollback preserved", PS.readRollback() !== null, true);
eq("pendingApply cleared after a known failed outcome",
    PS.getState().pendingApply, null);
check("lastFailure records the mismatched keys",
    PS.getState().lastFailure !== null &&
    PS.getState().lastFailure.detail &&
    PS.getState().lastFailure.detail.mismatchedKeys.indexOf("panels-height") !== -1);
harness.clock.advance(600000);
eq("no retry loop after a verification failure",
    harness.notify.count("warn"), 1);
check("failed profile not active",
    PS.getState().activeProfileId !== victim.id);

/* ------------------------------------------------------------------ *
 * Controller: exception during config restore
 * ------------------------------------------------------------------ */

suite("config restore exception");

resetAppState();
writeConfigFiles(CONTENT_A);
const rescueProvider = injectProvider(stateA());
PS.init();
harness = wireController({});
const rescued = AC.beginSaveNew("Rescued").profile;
rescueProvider.setValues(stateB());
writeConfigFiles(CONTENT_B);
/* Seed a stale pendingApply to prove the failure path clears it. */
PS.mutateState(function (s) {
    s.pendingApply = { profileId: "stale-id", reason: "user",
        startedAt: "2026-01-01T00:00:00+00:00" };
});
EVENTS.length = 0;
harness.states.length = 0;
CONFIGS.armed = true;
applyResult = AC.beginApply(rescued.id, { reason: "user" });
check("apply reports the failure", applyResult.started === true &&
    applyResult.failure === "apply failed", JSON.stringify(applyResult));
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
check("automatic recovery completed", harness.states.indexOf("COMPLETE") !== -1);
eq("settles IDLE and unlocked",
    [AC.getState(), AC.isBusy()], ["IDLE", false]);
/* The apply's batch threw after one file; the rollback bundle (captured
 * from the stateB live set, which references only cal@x) was then written
 * back over both the active config and the dormant target config. */
eq("config restore attempted then rolled back from the rollback bundle",
    EVENTS.filter(function (e) { return e.t === "config-restore"; })
        .map(function (e) { return e.k; }),
    ["partial-then-throw", "n=2/d=0"]);
check("stale pendingApply cleared by the failure path",
    PS.getState().pendingApply === null);
eq("rollback-restored config back to its captured content",
    readRaw(SPICE_ROOT + "/cal@x/13.json"), CONTENT_B);
eq("rollback restores the dormant overwritten target config",
    readRaw(SPICE_ROOT + "/x@x/5.json"), CONTENT_B);
eq("one warning notification", harness.notify.count("warn"), 1);
check("dirty suppression lifted", !AC.isDirtySuppressed());

/* Desklet configs ride the same auto-restore: a failure AFTER phase 8
 * (the enabled-desklets write throwing on a corrupt record) must put the
 * rollback bundle's desklet contents back. */
resetAppState();
writeConfigFiles(CONTENT_A);
writeDeskletConfigFiles(DESKLET_CONTENT_A);
injectProvider(stateA());
PS.init();
harness = wireController({});
const dkRescued = AC.beginSaveNew("DeskletRescue", true).profile;
const dkLoaded = PS.loadProfile(dkRescued.id).profile;
dkLoaded.cinnamonSettings["enabled-desklets"] =
    { type: "as", value: "['broken" };
PS.saveProfile(dkLoaded);
writeDeskletConfigFiles(DESKLET_CONTENT_B); /* drift the live desklet config */
EVENTS.length = 0;
harness.states.length = 0;
applyResult = AC.beginApply(dkRescued.id, { reason: "user" });
check("desklet-write failure reports apply failed",
    applyResult.started === true && applyResult.failure === "apply failed",
    JSON.stringify(applyResult));
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
eq("desklet config rolled back to the rollback bundle's content",
    readRaw(SPICE_ROOT + "/clock@x/clock@x.json"), DESKLET_CONTENT_B);
check("failed desklet apply settles IDLE",
    AC.getState() === "IDLE" && !AC.isBusy());

resetAppState();
writeConfigFiles(CONTENT_A);
injectProvider(stateA());
PS.init();
harness = wireController({});
const noRecursion = AC.beginSaveNew("No recursion").profile;
EVENTS.length = 0;
CONFIGS.failAll = true;
applyResult = AC.beginApply(noRecursion.id, { reason: "user" });
CONFIGS.failAll = false;
eq("failed automatic rollback stops after two config attempts",
    EVENTS.filter(function (e) { return e.k === "always-throw"; }).length, 2);
check("automatic rollback failure settles unlocked",
    AC.getState() === "IDLE" && !AC.isBusy());
eq("automatic rollback failure clears marker", PS.getState().pendingApply, null);

resetAppState();
writeConfigFiles(CONTENT_A);
writeDeskletConfigFiles(DESKLET_CONTENT_A);
injectProvider(stateA());
PS.init();
harness = wireController({});
const invalidSecondBatch = AC.beginSaveNew("Invalid desklet config", true).profile;
const invalidLoaded = PS.loadProfile(invalidSecondBatch.id).profile;
invalidLoaded.deskletConfigs.push({ uuid: "wrong@x", instanceId: "7",
    relativePath: "clock@x/7.json", content: "{}",
    sha256: ACS.configHashList([]).join("") });
PS.saveProfile(invalidLoaded);
EVENTS.length = 0;
applyResult = AC.beginApply(invalidSecondBatch.id, { reason: "user" });
check("invalid desklet batch is rejected before apply",
    applyResult.started === false &&
    applyResult.failure.indexOf("relativePath") !== -1,
    JSON.stringify(applyResult));
check("both config batches validate before any Cinnamon mutation",
    EVENTS.every(function (e) { return e.t !== "settings-write" &&
        e.t !== "config-restore" && e.t !== "rollback-write"; }));

/* ------------------------------------------------------------------ *
 * Controller: monitor wait, lock, timeout
 * ------------------------------------------------------------------ */

suite("monitor wait and the operation lock");

let layout = null;

resetAppState();
writeConfigFiles(CONTENT_A);
const waitProvider = injectProvider(stateA());
PS.init();
harness = wireController({});
layout = harness.layout;
/* Save a two-head profile while two heads are live. */
layout.setMonitors([MON(0, 0, 1920, "DP-1"), MON(1, 1920, 1280, "HDMI-1")], 0);
const dual = AC.beginSaveNew("Dual").profile;
layout.setMonitors([MON(0, 0, 1920, "DP-1")], 0);
waitProvider.setValues(stateB());
EVENTS.length = 0;
harness.states.length = 0;

applyResult = AC.beginApply(dual.id, { reason: "user" });
eq("user apply reports the wait without starting",
    applyResult, { started: false, failure: "waiting" });
eq("state WAITING_FOR_MONITORS", AC.getState(), "WAITING_FOR_MONITORS");
check("busy while waiting", AC.isBusy());
check("wait removal is not a lifecycle handoff",
    AC.shouldPreserveTransactionOnRemoval() === false);
eq("menu told about the wait", harness.waitEvents, [[true, 1, 2]]);

/* The single-operation lock covers everything. */
eq("second beginApply refused",
    AC.beginApply(dual.id, { reason: "user" }),
    { started: false, failure: "busy" });
eq("beginSaveNew refused while applying",
    AC.beginSaveNew("Nope"), { ok: false, reason: "busy" });
eq("beginRollback refused while applying",
    AC.beginRollback(), { started: false, failure: "busy" });
eq("save-update refused while applying",
    AC.beginSaveUpdate(dual.id), { ok: false, reason: "busy" });
check("no writes happened while waiting",
    EVENTS.filter(function (e) {
        return e.t === "settings-write" || e.t === "rollback-write";
    }).length === 0);

/* Quiet clock, then the second head arrives, then churn restarts the
 * stabilization window, then readiness runs the whole apply. */
harness.clock.advance(1000);
eq("still waiting without a signal", AC.getState(), "WAITING_FOR_MONITORS");
layout.setMonitors([MON(0, 0, 1920, "DP-1"), MON(1, 1920, 1280, "HDMI-1")], 0);
layout.emit();
harness.clock.advance(60);
layout.emit();          /* churn */
harness.clock.advance(60);
check("not applied yet after churn", AC.getState() === "WAITING_FOR_MONITORS",
    AC.getState());
harness.clock.advance(41);
check("apply ran after the stable window",
    harness.states.indexOf("SNAPSHOTTING_ROLLBACK") !== -1);
eq("menu told the wait ended", harness.waitEvents[harness.waitEvents.length - 1],
    [false, 2, 2]);
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
check("waited apply completes", harness.states.indexOf("COMPLETE") !== -1);
eq("activeProfileId set after the waited apply",
    PS.getState().activeProfileId, dual.id);

/* Timeout path: exactly one warning, IDLE, nothing written. */
resetAppState();
writeConfigFiles(CONTENT_A);
injectProvider(stateA());
PS.init();
harness = wireController({});
layout = harness.layout;
layout.setMonitors([MON(0, 0, 1920, "DP-1"), MON(1, 1920, 1280, "HDMI-1")], 0);
const timeoutProfile = AC.beginSaveNew("NeverReady").profile;
layout.setMonitors([MON(0, 0, 1920, "DP-1")], 0);
harness.states.length = 0;
EVENTS.length = 0;
applyResult = AC.beginApply(timeoutProfile.id, { reason: "user" });
eq("user apply reports the wait without starting",
    applyResult, { started: false, failure: "waiting" });
check("but the controller is busy waiting", AC.isBusy());
harness.clock.advance(5000);
eq("timeout warns exactly once", harness.notify.count("warn"), 1);
check("timeout message quotes the profile and the counts",
    harness.notify.calls[0].details.indexOf("NeverReady") !== -1 &&
    harness.notify.calls[0].details.indexOf("1 of 2") !== -1,
    harness.notify.calls[0].details);
eq("state settles IDLE", AC.getState(), "IDLE");
check("lock released after the timeout", !AC.isBusy());
eq("wait indicator hidden",
    harness.waitEvents[harness.waitEvents.length - 1][0], false);
check("no settings writes during a timed-out wait",
    EVENTS.filter(function (e) { return e.t === "settings-write"; }).length === 0);
check("no rollback written during a timed-out wait",
    eventIndex("rollback-write") === -1);
harness.clock.advance(60000);
eq("still exactly one warning", harness.notify.count("warn"), 1);

/* User-initiated apply onto an insufficient topology: refused to the
 * caller, waited internally, cancellable. */
resetAppState();
writeConfigFiles(CONTENT_A);
injectProvider(stateA());
PS.init();
harness = wireController({});
layout = harness.layout;
layout.setMonitors([MON(0, 0, 1920, "DP-1"), MON(1, 1920, 1280, "HDMI-1")], 0);
const waitUser = AC.beginSaveNew("WaitForMe").profile;
layout.setMonitors([MON(0, 0, 1920, "DP-1")], 0);
applyResult = AC.beginApply(waitUser.id, { reason: "user" });
eq("user apply reports the wait without starting",
    applyResult, { started: false, failure: "waiting" });
eq("but the controller is busy waiting", AC.isBusy(), true);
AC.cancelAll();
eq("cancelAll settles IDLE", AC.getState(), "IDLE");
check("cancelAll releases the lock", !AC.isBusy());
PS.mutateState(function (state) {
    state.pendingApply = { profileId: waitUser.id, reason: "user" };
});
AC.cancelAll();
eq("reload cancellation preserves pendingApply",
    PS.getState().pendingApply.profileId, waitUser.id);
AC.cancelAll(true);
eq("genuine removal clears pendingApply", PS.getState().pendingApply, null);

/* ------------------------------------------------------------------ *
 * Controller: resumePendingApply
 * ------------------------------------------------------------------ */

suite("resumePendingApply");

["prepared", "settings-written", "configs-written", "writing-lists",
    "lists-written", undefined, "unknown"].forEach(function (phase) {
    check("phase " + String(phase) + " requires rollback",
        AC.pendingPhaseNeedsRollback(phase) === true);
});
check("verifying phase can resume verification",
    AC.pendingPhaseNeedsRollback("verifying") === false);

/* Normal resume: the previous instance died before its verify timer. */
resetAppState();
writeConfigFiles(CONTENT_A);
const resumeProvider = injectProvider(stateA());
PS.init();
harness = wireController({});
const resumedProfile = AC.beginSaveNew("Resumed").profile;
resumeProvider.setValues(stateB());
writeConfigFiles(CONTENT_B);
AC.beginApply(resumedProfile.id, { reason: "user" });
const oldClock = harness.clock;
check("previous instance left a pending verify", oldClock.pendingCount() === 1);
check("pendingApply on disk", PS.getState().pendingApply !== null);

/* Simulate the reload: fresh controller wiring, NEW clock. */
harness = wireController({});
harness.states.length = 0;
check("resume returns true", AC.resumePendingApply() === true);
eq("jumps straight to VERIFYING", AC.getState(), "VERIFYING");
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
check("resume completes verification",
    harness.states.indexOf("COMPLETE") !== -1);
eq("activeProfileId set by the resume",
    PS.getState().activeProfileId, resumedProfile.id);
eq("pendingApply cleared by the resume", PS.getState().pendingApply, null);
eq("one success notification from the resume",
    harness.notify.count("success"), 1);
eq("the dead instance's timer was cancelled by the rewire",
    oldClock.pendingCount(), 0);

/* A successor can initialize inside the old instance's enabled-applets
 * set_value call. It must give that synchronous caller time to advance the
 * list marker instead of racing it with an automatic rollback. */
resetAppState();
writeConfigFiles(CONTENT_A);
const handoffProvider = injectProvider(stateA());
PS.init();
harness = wireController({ commitRetryDelayMs: 50, commitRetryLimit: 3 });
const handoffProfile = AC.beginSaveNew("List Handoff").profile;
PS.mutateState(function (state) {
    state.pendingApply = {
        transactionId: "synchronous-list-handoff",
        profileId: handoffProfile.id,
        reason: "user",
        phase: "writing-lists",
        fingerprint: handoffProfile.fingerprint,
        includeDesklets: false,
        targetSettings: handoffProfile.cinnamonSettings
    };
});
harness = wireController({ commitRetryDelayMs: 50, commitRetryLimit: 3 });
check("list handoff gets a bounded grace retry",
    AC.resumePendingApply() === true && AC.getState() === "VALIDATING" &&
    harness.clock.pendingCount() === 1);
eq("handoff grace does not start rollback writes",
    handoffProvider.writes.length, 0);
PS.mutateState(function (state) {
    state.pendingApply.phase = "verifying";
});
harness.clock.advance(50);
eq("advanced list marker resumes verification", AC.getState(), "VERIFYING");
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
check("synchronous list handoff commits without rollback",
    PS.getState().activeProfileId === handoffProfile.id &&
    PS.getState().pendingApply === null && handoffProvider.writes.length === 0);

/* Applet startup sees init.busy and calls resumePendingApply. The controller
 * must retry the durable read instead of treating contention as no marker. */
resetAppState();
writeConfigFiles(CONTENT_A);
injectProvider(stateA());
PS.init();
harness = wireController({ commitRetryDelayMs: 50, commitRetryLimit: 3 });
const startupProfile = AC.beginSaveNew("Startup Recovery").profile;
PS.mutateState(function (state) {
    state.pendingApply = {
        transactionId: "startup-contention",
        profileId: startupProfile.id,
        reason: "user",
        phase: "verifying",
        fingerprint: startupProfile.fingerprint,
        includeDesklets: false,
        targetSettings: startupProfile.cinnamonSettings
    };
});
const startupWorker = startWidgetLockWorker(
    "repair", "unrelated-profile", "startup-recovery-lock");
check("Python worker holds lock during applet startup", startupWorker.ready);
const startupInit = PS.init();
check("contended startup returns explicit busy state",
    startupInit.busy === true && startupInit.state === null);
harness = wireController({ commitRetryDelayMs: 50, commitRetryLimit: 3 });
check("startup recovery schedules a bounded read retry",
    AC.resumePendingApply() === true && harness.clock.pendingCount() === 1 &&
    AC.isBusy());
check("startup contention emits no false success",
    harness.notify.count("success") === 0);
check("startup lock worker exits cleanly", startupWorker.release());
harness.clock.advance(50);
eq("startup retry reaches durable verification", AC.getState(), "VERIFYING");
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
const startupState = PS.getState();
check("startup recovery completes after contention",
    harness.states.indexOf("COMPLETE") !== -1 &&
    harness.notify.count("success") === 1);
eq("startup recovery commits active profile",
    startupState.activeProfileId, startupProfile.id);
eq("startup recovery clears durable pending marker",
    startupState.pendingApply, null);

PS.mutateState(function (state) {
    state.pendingApply = {
        transactionId: "between-read-contention",
        profileId: startupProfile.id,
        reason: "user",
        phase: "verifying",
        fingerprint: startupProfile.fingerprint,
        includeDesklets: false,
        targetSettings: startupProfile.cinnamonSettings
    };
});
harness = wireController({ commitRetryDelayMs: 50, commitRetryLimit: 3 });
const betweenReadWorker = startWaitingRepairWorker(
    "unrelated-profile", "between-state-target-read");
check("Python between-read contender is armed", betweenReadWorker.ready);
STORE.afterGetState = function () {
    betweenReadWorker.trigger();
    betweenReadWorker.waitAttempting();
};
check("atomic startup read schedules valid target verification",
    AC.resumePendingApply() === true && AC.getState() === "VERIFYING");
check("Python contender acquires only after atomic target read",
    betweenReadWorker.waitAcquired());
check("between-read contention never clears the valid marker",
    JSON.parse(readRaw(STATE_FILE)).pendingApply.profileId === startupProfile.id);
check("between-read contention worker exits cleanly",
    betweenReadWorker.release());
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
eq("atomic startup read completes the valid recovery",
    PS.getState().pendingApply, null);

/* No pendingApply: silent false. */
AC.cancelAll();
check("resume without a pending marker returns false",
    AC.resumePendingApply() === false);

/* Pending marker whose profile is gone: cleared, FAILED once, false. */
PS.mutateState(function (s) {
    s.pendingApply = { profileId: "gone-profile", reason: "user",
        phase: "verifying", startedAt: "2026-01-01T00:00:00+00:00" };
});
harness = wireController({});
harness.states.length = 0;
check("gone-profile resume returns false", AC.resumePendingApply() === false);
eq("marker cleared", PS.getState().pendingApply, null);
check("FAILED observed exactly once on the gone-profile resume",
    harness.states.filter(function (s) { return s === "FAILED"; }).length, 1);
check("lastFailure recorded", PS.getState().lastFailure !== null);

/* Rollback resume: verified against the fingerprint in the marker. */
resetAppState();
writeConfigFiles(CONTENT_A);
const rbProvider = injectProvider(stateA());
PS.init();
harness = wireController({});
const rbProfile = AC.beginSaveNew("RollbackSource").profile;
rbProvider.setValues(stateB());
writeConfigFiles(CONTENT_B);
AC.beginApply(rbProfile.id, { reason: "user" });
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
/* last-good now holds the pre-apply (stateB) snapshot. */
check("rollback snapshot exists", PS.readRollback() !== null);
const manualRollbackSource = readRaw(BACKUPS_DIR + "/last-good.json");
harness = wireController({});
harness.states.length = 0;
EVENTS.length = 0;
const rollbackStart = AC.beginRollback();
check("rollback apply starts", rollbackStart.started === true);
check("manual rollback does not replace its recovery source",
    eventIndex("rollback-write") === -1 &&
    readRaw(BACKUPS_DIR + "/last-good.json") === manualRollbackSource);
check("rollback marker pending",
    PS.getState().pendingApply !== null &&
    PS.getState().pendingApply.reason === "rollback");
harness = wireController({ commitRetryDelayMs: 50, commitRetryLimit: 3 });
harness.states.length = 0;
check("rollback resume returns true", AC.resumePendingApply() === true);
const rollbackCommitWorker = startWidgetLockWorker(
    "repair", "unrelated-profile", "rollback-verification-commit-lock");
check("Python worker holds lock across rollback verification",
    rollbackCommitWorker.ready);
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
check("contended rollback verification does not announce success",
    harness.notify.count("success") === 0 &&
    harness.states.indexOf("COMPLETE") === -1);
check("rollback marker remains until its commit succeeds",
    JSON.parse(readRaw(STATE_FILE)).pendingApply.reason === "rollback");
check("rollback commit contention worker exits cleanly",
    rollbackCommitWorker.release());
harness.clock.advance(50);
check("rollback resume completes",
    harness.states.indexOf("COMPLETE") !== -1);
eq("rollback leaves no active profile",
    PS.getState().activeProfileId, null);
eq("rollback marker cleared", PS.getState().pendingApply, null);
eq("live state is the rollback content",
    strvOf(rbProvider._values["panels-height"]), ["1:40"]);
eq("rollback config content restored",
    readRaw(SPICE_ROOT + "/cal@x/13.json"), CONTENT_B);
check("successful manual rollback preserves last-good",
    readRaw(BACKUPS_DIR + "/last-good.json") === manualRollbackSource);

PS.mutateState(function (state) {
    state.pendingApply = { transactionId: "failed-resume",
        profileId: null, reason: "auto-rollback", phase: "verifying",
        fingerprint: "not-the-live-fingerprint", includeDesklets: true };
});
harness = wireController({});
EVENTS.length = 0;
check("failed rollback resume schedules one verification",
    AC.resumePendingApply() === true);
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
eq("failed rollback resume clears its marker", PS.getState().pendingApply, null);
check("failed rollback resume does not start another restore",
    EVENTS.every(function (e) { return e.t !== "config-restore" &&
        e.t !== "settings-write"; }));
check("failed rollback resume settles unlocked",
    AC.getState() === "IDLE" && !AC.isBusy());

rbProvider._values["panels-height"] = V("['1:99']");
/* Simulate a v3 recovery source from before config digests and target-union
 * rollback metadata. Resume must migrate it in memory without replacing the
 * durable source. */
const legacyIncompleteRollback = PS.readRollback();
legacyIncompleteRollback.schemaVersion = 3;
legacyIncompleteRollback.kind = "both";
delete legacyIncompleteRollback.includeDesklets;
delete legacyIncompleteRollback.rollbackConfigFiles;
delete legacyIncompleteRollback.configTombstones;
legacyIncompleteRollback.appletConfigs.forEach(function (config) {
    delete config.sha256;
});
legacyIncompleteRollback.deskletConfigs.forEach(function (config) {
    delete config.sha256;
});
writeRaw(BACKUPS_DIR + "/last-good.json",
    JSON.stringify(legacyIncompleteRollback, null, 2) + "\n");
PS.mutateState(function (state) {
    state.pendingApply = { transactionId: "incomplete-user",
        profileId: rbProfile.id, reason: "user", phase: "settings-written",
        fingerprint: "partial", includeDesklets: false };
});
const incompleteSource = readRaw(BACKUPS_DIR + "/last-good.json");
harness = wireController({});
check("incomplete phase resumes by starting rollback",
    AC.resumePendingApply() === true);
check("incomplete resume records automatic rollback verification",
    PS.getState().pendingApply.reason === "auto-rollback" &&
    PS.getState().pendingApply.phase === "verifying");
check("incomplete resume preserves original last-good",
    readRaw(BACKUPS_DIR + "/last-good.json") === incompleteSource);
check("legacy last-good source remains unmodified on disk",
    JSON.parse(incompleteSource).schemaVersion === 3 &&
    JSON.parse(incompleteSource).appletConfigs.every(function (config) {
        return config.sha256 === undefined;
    }));
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
eq("incomplete resume restores rollback panel state",
    strvOf(rbProvider._values["panels-height"]), ["1:40"]);
eq("incomplete resume clears marker after verification",
    PS.getState().pendingApply, null);

rbProvider._values["panels-height"] = V("['1:88']");
PS.mutateState(function (state) {
    state.pendingApply = { transactionId: "incomplete-auto-rollback",
        profileId: null, reason: "auto-rollback", phase: "configs-written",
        fingerprint: "partial", includeDesklets: true };
});
harness = wireController({});
check("incomplete automatic rollback resumes without recursion refusal",
    AC.resumePendingApply() === true);
check("resumed automatic rollback reaches verification",
    PS.getState().pendingApply.reason === "auto-rollback" &&
    PS.getState().pendingApply.phase === "verifying");
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
eq("resumed automatic rollback restores the saved state",
    strvOf(rbProvider._values["panels-height"]), ["1:40"]);
eq("resumed automatic rollback clears its marker",
    PS.getState().pendingApply, null);

/* ------------------------------------------------------------------ *
 * Controller: save and manage operations
 * ------------------------------------------------------------------ */

suite("save and manage operations");

resetAppState();
writeConfigFiles(CONTENT_A);
const manageProvider = injectProvider(stateA());
PS.init();
harness = wireController({});

eq("save-new rejects a blank name",
    AC.beginSaveNew("   "), { ok: false, reason: "invalid-name" });
eq("save-new rejects an overlong name",
    AC.beginSaveNew("z".repeat(CONSTANTS.PROFILE_NAME_MAX + 1)),
    { ok: false, reason: "invalid-name" });
check("rejected save leaves the machine idle",
    AC.getState() === "IDLE" && !AC.isBusy());

const managed = AC.beginSaveNew("Managed").profile;
check("save-new ok", managed !== null && managed.name === "Managed");

manageProvider.setValues(stateB());
const updated = AC.beginSaveUpdate(managed.id);
check("save-update ok", updated.ok === true &&
    updated.profile.fingerprint !== managed.fingerprint);
eq("identity preserved on update",
    [updated.profile.id, updated.profile.name, updated.profile.createdAt],
    [managed.id, "Managed", managed.createdAt]);
eq("onProfileSaved fired for new and update", harness.saved.length, 2);

const raced = AC.beginSaveNew("Delete race").profile;
STORE.beforeLock = function () {
    deleteFile(PROFILES_DIR + "/" + raced.id + ".json");
};
EVENTS.length = 0;
applyResult = AC.beginApply(raced.id, { reason: "user" });
check("delete winning before the store lock aborts apply",
    applyResult.failure === "apply failed");
check("delete race cannot mutate Cinnamon or write a new rollback",
    EVENTS.every(function (event) {
        return event.t !== "settings-write" && event.t !== "rollback-write";
    }));

/* ------------------------------------------------------------------ *
 * Controller: anchor repair integration
 * ------------------------------------------------------------------ */

suite("anchor repair during apply");

resetAppState();
writeConfigFiles(CONTENT_A);
const anchorProvider = injectProvider(stateA());
PS.init();
harness = wireController({});

/* No self entry: the live manager placement and id are reused because its
 * panel survives in the target. */
const noAnchor = handProfile("no-anchor-1", "NoAnchor",
    ["panel1:left:0:menu@cinnamon.org:0", "panel1:right:2:cal@x:13"],
    ["1:0:bottom"]);
PS.saveProfile(noAnchor);
applyResult = AC.beginApply("no-anchor-1", { reason: "user" });
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
const writtenEntries = strvOf(anchorProvider._values["enabled-applets"]);
const selfEntries = writtenEntries.filter(function (e) {
    return e.indexOf(":" + SELF + ":") !== -1;
});
eq("exactly one repaired self entry",
    selfEntries, ["panel1:right:2:" + SELF + ":21"]);
check("stored profile file was not mutated",
    PS.loadProfile("no-anchor-1").profile.cinnamonSettings[
        "enabled-applets"].value.indexOf(SELF) === -1);
eq("allocator remains past the reused live id",
    CS.readNextAppletId(), 22);

/* Duplicate self entries collapse to the first surviving one. */
resetAppState();
const dupAnchor = handProfile("dup-anchor-1", "DupAnchor",
    ["panel1:right:5:" + SELF + ":21", "panel1:right:6:" + SELF + ":21",
     "panel1:left:0:menu@cinnamon.org:0"],
    ["1:0:bottom"]);
PS.saveProfile(dupAnchor);
const dupProvider = injectProvider(stateA());
harness = wireController({});
applyResult = AC.beginApply("dup-anchor-1", { reason: "user" });
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
const dupWritten = strvOf(dupProvider._values["enabled-applets"]);
eq("duplicate self entries collapsed",
    dupWritten.filter(function (e) {
        return e.indexOf(":" + SELF + ":") !== -1;
    }),
    ["panel1:right:5:" + SELF + ":21"]);

/* ------------------------------------------------------------------ *
 * Controller: missing third-party applet warning
 * ------------------------------------------------------------------ */

suite("missing applet warning");

resetAppState();
writeConfigFiles(CONTENT_A);
const ghostProvider = injectProvider(stateA());
PS.init();
harness = wireController({
    isAppletInstalled: function (uuid) { return uuid !== "ghost@nowhere"; }
});
const ghosty = handProfile("ghosty-1", "Ghosty",
    ["panel1:left:0:menu@cinnamon.org:0",
     "panel1:right:0:ghost@nowhere:9",
     "panel1:right:2:" + SELF + ":21"],
    ["1:0:bottom"]);
PS.saveProfile(ghosty);
applyResult = AC.beginApply("ghosty-1", { reason: "user" });
check("apply continues with warnings",
    applyResult.started === true, JSON.stringify(applyResult));
check("missing applet reported in the result",
    applyResult.warnings && applyResult.warnings.some(function (w) {
        return w.indexOf("ghost@nowhere") !== -1;
    }), JSON.stringify(applyResult.warnings));
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
check("apply completed despite the missing applet",
    harness.states.indexOf("COMPLETE") !== -1);
eq("ghost entry still restored verbatim (Cinnamon deals with it)",
    strvOf(ghostProvider._values["enabled-applets"]).some(function (e) {
        return e.indexOf("ghost@nowhere") !== -1;
    }), true);

/* ------------------------------------------------------------------ *
 * Controller: desklet-scope apply ("both")
 * ------------------------------------------------------------------ */

suite("panel profile with desklets");

resetAppState();
writeConfigFiles(CONTENT_A);
writeDeskletConfigFiles(DESKLET_CONTENT_A);
const deskletProvider = injectProvider(stateA());
PS.init();
harness = wireController({});

const deskletSave = AC.beginSaveNew("Panels and Desklets", true);
check("save with desklets ok", deskletSave.ok === true,
    JSON.stringify(deskletSave));
const deskletProfile = deskletSave.profile;
eq("desklet option stamped", deskletProfile.includeDesklets, true);
check("desklet config captured",
    deskletProfile.deskletConfigs.length === 1 &&
    deskletProfile.deskletConfigs[0].relativePath === "clock@x/clock@x.json",
    JSON.stringify(deskletProfile.deskletConfigs));
check("applet configs captured with panel profile",
    deskletProfile.appletConfigs.length >= 1,
    JSON.stringify(deskletProfile.appletConfigs));
check("full settings captured for a combined profile",
    deskletProfile.cinnamonSettings["enabled-applets"] !== undefined &&
    deskletProfile.cinnamonSettings["panels-enabled"] !== undefined);

/* Drift everything, then apply. */
deskletProvider.setValues(stateB());
deskletProvider._values["next-applet-id"] = V("10");
deskletProvider._values["next-desklet-id"] = V("3");
writeConfigFiles(CONTENT_B);
writeDeskletConfigFiles(DESKLET_CONTENT_B);
EVENTS.length = 0;
harness.states.length = 0;

applyResult = AC.beginApply(deskletProfile.id, { reason: "user" });
check("desklet apply starts", applyResult.started === true,
    JSON.stringify(applyResult));
eq("state sequence includes panel, desklet, and applet phases",
    harness.states, [
        "VALIDATING",
        "SNAPSHOTTING_ROLLBACK",
        "RESTORING_PANEL_SETTINGS",
        "RESTORING_APPLET_CONFIGS",
        "RESTORING_ENABLED_DESKELETS",
        "RESTORING_ENABLED_APPLETS",
        "VERIFYING"
    ]);
check("enabled-desklets written",
    eventIndex("settings-write", "enabled-desklets") !== -1);
check("enabled-applets written last",
    eventIndex("settings-write", "enabled-applets") !== -1);
check("panel layout keys written",
    ["panels-enabled", "panels-height", "panels-autohide"].every(
        function (k) { return eventIndex("settings-write", k) !== -1; }));
check("pendingApply written before the desklet list write",
    eventIndex("pendingApply-set") !== -1 &&
    eventIndex("pendingApply-set") <
        eventIndex("settings-write", "enabled-desklets"));
eq("desklet list restored verbatim",
    strvOf(deskletProvider._values["enabled-desklets"]), ["clock@x:7:100:100"]);
eq("desklet scalars restored",
    String(deskletProvider._values["desklet-decorations"].print(true)), "0");
eq("desklet config content restored",
    readRaw(SPICE_ROOT + "/clock@x/clock@x.json"), DESKLET_CONTENT_A);
check("applet config restored with panels",
    readRaw(SPICE_ROOT + "/x@x/5.json") === CONTENT_A);
eq("next-desklet-id bumped past the max restored id",
    CS.readNextDeskletId(), 8);
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
check("desklet apply verifies", harness.states.indexOf("COMPLETE") !== -1);
eq("combined profile becomes active",
    PS.getState().activeProfileId, deskletProfile.id);
check("rollback bundle captured both families",
    (function () {
        const rb = PS.readRollback();
        return rb.includeDesklets === true &&
            rb.deskletConfigs.length === 1 &&
            rb.appletConfigs.length >= 1;
    })());

/* ------------------------------------------------------------------ *
 * Controller: panels-only apply never touches the desklet world
 * ------------------------------------------------------------------ */

suite("panels-only apply leaves desklets alone");

resetAppState();
writeConfigFiles(CONTENT_A);
writeDeskletConfigFiles(DESKLET_CONTENT_A);
const panelKindProvider = injectProvider(stateA());
PS.init();
harness = wireController({});

const panelSave = AC.beginSaveNew("Panels Only", false);
const panelProfile = panelSave.profile;
eq("desklets excluded", panelProfile.includeDesklets, false);
/* The live desklet list is emptied after the save; the panel apply must not
 * bring back the captured list. */
panelKindProvider._values["enabled-desklets"] = V("['moved@x:9:9:9']");
writeDeskletConfigFiles(DESKLET_CONTENT_B);
EVENTS.length = 0;
harness.states.length = 0;
applyResult = AC.beginApply(panelProfile.id, { reason: "user" });
check("panel apply starts", applyResult.started === true,
    JSON.stringify(applyResult));
check("enabled-desklets never written by a panel apply",
    eventIndex("settings-write", "enabled-desklets") === -1);
["desklet-decorations", "desklet-snap", "desklet-snap-interval"].forEach(
    function (k) {
        check("panel apply skips " + k,
            eventIndex("settings-write", k) === -1);
    });
eq("desklet list untouched",
    strvOf(panelKindProvider._values["enabled-desklets"]), ["moved@x:9:9:9"]);
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
check("panel apply verifies", harness.states.indexOf("COMPLETE") !== -1);
eq("panel profile active",
    PS.getState().activeProfileId, panelProfile.id);

/* ------------------------------------------------------------------ *
 * Controller: verification uses the recomputed digest, so a stale
 * stored fingerprint (from before a migration) still verifies
 * ------------------------------------------------------------------ */

suite("stale stored fingerprint still verifies");

resetAppState();
writeConfigFiles(CONTENT_A);
injectProvider(stateA());
PS.init();
harness = wireController({});
const fpProfile = AC.beginSaveNew("FpStale").profile;
eq("saved without desklets", fpProfile.includeDesklets, false);

/* Corrupt the stored fingerprint to a pre-migration-style stale value;
 * the apply must still verify (recompute-at-use). */
const stale = PS.loadProfile(fpProfile.id).profile;
stale.fingerprint = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
PS.saveProfile(stale);
applyResult = AC.beginApply(fpProfile.id, { reason: "user" });
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
check("apply verifies despite the stale stored fingerprint",
    harness.states.indexOf("COMPLETE") !== -1,
    harness.states.join(","));
eq("active slot committed",
    PS.getState().activeProfileId, fpProfile.id);

suite("zero instance allocator bump");

resetAppState();
writeConfigFiles(CONTENT_A);
writeDeskletConfigFiles(DESKLET_CONTENT_A);
const zeroState = stateA();
zeroState["enabled-applets"] = V("['panel1:right:0:" +
    CONSTANTS.selfUuid() + ":0']");
zeroState["enabled-desklets"] = V("['clock@x:0:25:30']");
zeroState["next-applet-id"] = V("0");
zeroState["next-desklet-id"] = V("0");
injectProvider(zeroState);
PS.init();
harness = wireController({});
const zeroProfile = AC.beginSaveNew("Zero IDs", true).profile;
applyResult = AC.beginApply(zeroProfile.id, { reason: "user" });
check("zero-id profile apply starts", applyResult.started === true);
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
eq("applet allocator advances past restored id zero", CS.readNextAppletId(), 1);
eq("desklet allocator advances past restored id zero", CS.readNextDeskletId(), 1);


/* ------------------------------------------------------------------ *
 * Controller: verification failure with the rollback file gone
 * ------------------------------------------------------------------ */

/* The apply captures a rollback bundle in memory, writes it to
 * backups/last-good.json, then drops the in-memory copy. Verification runs
 * later off a timer and re-reads the file. If anything removed it in the
 * meantime the rollback has nothing to restore from, and the layout is left
 * on the half-applied profile with only a log line to say so. Seen for real:
 * "automatic rollback failed: rollback snapshot unavailable". */

suite("verification failure with no rollback file");

resetAppState();
writeConfigFiles(CONTENT_A);
const goneProvider = injectProvider(stateA());
PS.init();
harness = wireController({});
const orphan = AC.beginSaveNew("Orphan").profile;
goneProvider.setValues(stateB());
EVENTS.length = 0;
harness.states.length = 0;
applyResult = AC.beginApply(orphan.id, { reason: "user" });
eq("rollback file was written by the apply",
    exists(BACKUPS_DIR + "/last-good.json"), true);

/* Something eats the snapshot between the write and the settle timer. */
try {
    Gio.File.new_for_path(BACKUPS_DIR + "/last-good.json").delete(null);
} catch (ignored) {
    /* already gone is fine */
}
eq("rollback file is gone before verification",
    exists(BACKUPS_DIR + "/last-good.json"), false);

/* Same drift as the suite above, so verification is guaranteed to fail. */
goneProvider._values["panels-height"] = V("['1:99']");
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);
harness.clock.advance(CONSTANTS.VERIFY_SETTLE_MS);

check("rollback still runs from the in-memory bundle",
    harness.states.indexOf("COMPLETE") !== -1,
    "states: " + JSON.stringify(harness.states));
eq("settles to IDLE and releases the lock",
    [AC.getState(), AC.isBusy()], ["IDLE", false]);
/* The rollback bundle captures the live desktop at apply time, which is
 * stateB here, not the profile's stateA. */
eq("panels-height is restored, not left on the drifted value",
    strvOf(goneProvider._values["panels-height"]),
    strvOf(stateB()["panels-height"]));
check("failure is not reported as an unavailable snapshot",
    !(PS.getState().lastFailure &&
      String(PS.getState().lastFailure.message)
          .indexOf("rollback snapshot unavailable") !== -1),
    JSON.stringify(PS.getState().lastFailure));


/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

MT.resetDependencies();
AC.resetDependencies();
CS.resetDependencies();
FP.resetDependencies();
PS.resetDependencies();
ACS.resetDependencies();

print("\n" + "=".repeat(60));
if (failures.length === 0) {
    print("All " + passed + " assertions passed.");
    System.exit(0);
} else {
    print(passed + " passed, " + failures.length + " FAILED:");
    failures.forEach(function (f) { print("  - " + f); });
    System.exit(1);
}
