#!/usr/bin/env gjs
/* global imports, print */
/**
 * Headless unit tests for the Panel Profiles storage layer:
 * lib/profileStore.js and lib/appletConfigStore.js.
 *
 * St/Clutter cannot be instantiated outside the Cinnamon process, so this
 * harness covers only what runs headless: profile CRUD, state recovery,
 * rollback storage, cross-process contention, config capture/restore/watch
 * and path sanitization.
 *
 * ISOLATION, read this first: constants.js resolves STATE_DIR and
 * SPICES_CONFIG_ROOT from GLib.get_user_config_dir() at import time, which
 * follows XDG_CONFIG_HOME. This script REFUSES to run when the config dir
 * still points into the real home, so a bare `gjs dev-tools/test-pp-storage.js`
 * exits with code 2 instead of ever touching ~/.config. Always run it as:
 *
 *   tmp=$(mktemp -d)
 *   XDG_CONFIG_HOME="$tmp" gjs dev-tools/test-pp-storage.js
 *   rc=$?; rm -rf "$tmp"; exit $rc
 *
 * The appletConfigStore side additionally gets its own temp configRoot
 * injected, so nothing relies on the constants default even indirectly.
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
const PS = imports.profileStore;
const ACS = imports.appletConfigStore;
const PSCHEMA = imports.profileSchema;

const STATE_DIR = CONSTANTS.STATE_DIR;
const PROFILES_DIR = STATE_DIR + "/profiles";
const BACKUPS_DIR = STATE_DIR + "/backups";
const STATE_FILE = STATE_DIR + "/state.json";

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
 * Helpers
 * ------------------------------------------------------------------ */

function makeLogger() {
    return {
        warns: [],
        warn: function (msg) { this.warns.push(String(msg)); },
        error: function (msg) { this.warns.push(String(msg)); }
    };
}

function fileMode(path) {
    try {
        const info = Gio.File.new_for_path(path).query_info(
            "unix::mode", Gio.FileQueryInfoFlags.NONE, null);
        return info.get_attribute_uint32("unix::mode") & 0o777;
    } catch (ignored) {
        return -1;
    }
}

function exists(path) {
    try {
        return Gio.File.new_for_path(path).query_exists(null);
    } catch (ignored) {
        return false;
    }
}

function writeRaw(path, text) {
    GLib.file_set_contents(path, text);
}

function readRaw(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok)
            return null;
        const decoder = new TextDecoder("utf-8");
        return decoder.decode(bytes);
    } catch (ignored) {
        return null;
    }
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

function isoParses(iso) {
    if (typeof iso !== "string")
        return false;
    if (isNaN(new Date(iso).getTime()))
        return false;
    try {
        return GLib.DateTime.new_from_iso8601(iso, null) !== null;
    } catch (ignored) {
        return false;
    }
}

function deleteRaw(path) {
    try {
        Gio.File.new_for_path(path).delete(null);
    } catch (ignored) {
    }
}

function startWidgetLockWorker(action, profileId, tag) {
    const ready = CONFIG_DIR + "/" + tag + ".ready";
    const release = CONFIG_DIR + "/" + tag + ".release";
    deleteRaw(ready);
    deleteRaw(release);
    const process = Gio.Subprocess.new([
        "python3", SCRIPT_DIR + "/pp-widget-lock-helper.py", "hold",
        XLET_DIR + "/profilesManagerWidget.py", action, profileId,
        ready, release
    ], Gio.SubprocessFlags.NONE);
    const deadline = GLib.get_monotonic_time() + 5000000;
    while (!exists(ready) && GLib.get_monotonic_time() < deadline)
        GLib.usleep(10000);
    return {
        process: process,
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

/* A schema v4 snapshot input shaped like a real capture. */
function snapshotInput(name) {
    return {
        name: name,
        description: "made by test",
        snapshot: {
            "panels-enabled": { type: "as", value: "['1:0:bottom']" },
            "enabled-applets": { type: "as", value: "['panel1:right:0:x@x:1']" }
        },
        configs: [{
            uuid: "x@x", instanceId: "1",
            relativePath: "x@x/1.json", sha256: ATOMIC.sha256Hex("{}"), content: "{}"
        }],
        deskletConfigs: [{
            uuid: "clock@x", instanceId: "0",
            relativePath: "clock@x/clock@x.json",
            sha256: ATOMIC.sha256Hex("{}"), content: "{}"
        }],
        includeDesklets: true,
        configHashes: ["x@x|1|" + ATOMIC.sha256Hex("{}"),
            "clock@x|0|" + ATOMIC.sha256Hex("{}")],
        topology: { expectedCount: 2, monitors: [{ savedIndex: 0, primary: true }] },
        fingerprint: "fp-" + name,
        cinnamonVersion: "6.6.9",
        sessionType: "x11"
    };
}

/* ------------------------------------------------------------------ *
 * Environment isolation
 * ------------------------------------------------------------------ */

suite("environment isolation");
check("config dir redirected out of home", CONFIG_DIR.indexOf(HOME_DIR) !== 0,
    CONFIG_DIR);
check("STATE_DIR under temp config dir",
    STATE_DIR.indexOf(CONFIG_DIR + "/") === 0, STATE_DIR);

/* ------------------------------------------------------------------ *
 * profileStore.init
 * ------------------------------------------------------------------ */

const psLog = makeLogger();
PS.setDependencies({ logger: psLog });

suite("init creates layout with private modes");
const initResult = PS.init();
eq("init returns default state", initResult.state, {
    schemaVersion: 3,
    activeProfileId: null,
    pendingApply: null,
    lastSuccessfulApply: null,
    lastFailure: null
});
eq("no recovery warnings on clean start", initResult.recoveredWarnings, []);
check("state dir mode 0700", fileMode(STATE_DIR) === 0o700,
    "got " + fileMode(STATE_DIR).toString(8));
check("profiles dir mode 0700", fileMode(PROFILES_DIR) === 0o700);
check("backups dir mode 0700", fileMode(BACKUPS_DIR) === 0o700);
check("state.json mode 0600", fileMode(STATE_FILE) === 0o600,
    "got " + fileMode(STATE_FILE).toString(8));
check("init is idempotent", PS.init().recoveredWarnings.length === 0);

/* ------------------------------------------------------------------ *
 * Corrupt state.json recovery
 * ------------------------------------------------------------------ */

suite("corrupt state.json recovery");
writeRaw(STATE_FILE, "{ this is not json");
const corrupted = PS.init();
check("recovery recorded a warning", corrupted.recoveredWarnings.length === 1,
    JSON.stringify(corrupted.recoveredWarnings));
eq("defaults returned", corrupted.state.activeProfileId, null);
check("fresh state.json written", readRaw(STATE_FILE) !== null);
check("fresh state.json is valid JSON with defaults",
    JSON.parse(readRaw(STATE_FILE)).activeProfileId === null);
const quarantined = listDirNames(STATE_DIR).filter(function (n) {
    return n.indexOf("state.json.corrupt-") === 0;
});
check("corrupt file quarantined with unixts suffix",
    quarantined.length === 1 && /^state\.json\.corrupt-\d+$/.test(quarantined[0]),
    JSON.stringify(quarantined));
check("quarantine holds the original garbage",
    readRaw(STATE_DIR + "/" + quarantined[0]) === "{ this is not json");

suite("wrong-shape state.json recovery");
writeRaw(STATE_FILE, "{\"schemaVersion\": 99, \"activeProfileId\": \"x\"}");
const wrongShape = PS.init();
check("wrong schemaVersion treated as corrupt",
    wrongShape.recoveredWarnings.length === 1);
eq("defaults returned", wrongShape.state.activeProfileId, null);

suite("v1 state.json migrates instead of quarantining");
writeRaw(STATE_FILE, "{\"schemaVersion\": 1, \"activeProfileId\": \"keepme\"}");
const merged = PS.init();
eq("no spurious recovery", merged.recoveredWarnings, []);
eq("v1 active id preserved", merged.state.activeProfileId, "keepme");
eq("v1 startup designation dropped", merged.state.startupProfileId, undefined);
eq("state upgraded to v3 on disk",
    JSON.parse(readRaw(STATE_FILE)).schemaVersion, 3);
/* Two quarantine files by now: the garbage one and the wrong-shape one. */
check("no extra quarantine files beyond the two corruptions",
    listDirNames(STATE_DIR).filter(function (n) {
        return n.indexOf("state.json.corrupt-") === 0;
    }).length === 2);
PS.init(); /* rewrite clean state for later suites */

/* ------------------------------------------------------------------ *
 * save / load / list
 * ------------------------------------------------------------------ */

suite("createFromSnapshot builds schema v4");
const created = PS.createFromSnapshot(snapshotInput("Work"));
check("returns a profile", created !== null);
check("schemaVersion is current", created.schemaVersion === CONSTANTS.SCHEMA_VERSION);
check("id looks like a uuid", /^[0-9a-f-]{36}$/.test(created.id), created.id);
eq("name kept", created.name, "Work");
eq("description kept", created.description, "made by test");
check("createdAt parses as ISO 8601", isoParses(created.createdAt), created.createdAt);
check("updatedAt parses as ISO 8601", isoParses(created.updatedAt), created.updatedAt);
check("timestamps carry an offset", /Z|[+-]\d\d:\d\d$/.test(created.createdAt),
    created.createdAt);
eq("environment recorded", created.environment,
    { cinnamonVersion: "6.6.9", sessionType: "x11" });
eq("monitorTopology recorded", created.monitorTopology,
    snapshotInput("Work").topology);
eq("cinnamonSettings recorded", created.cinnamonSettings,
    snapshotInput("Work").snapshot);
eq("appletConfigs recorded", created.appletConfigs,
    snapshotInput("Work").configs);
eq("deskletConfigs recorded", created.deskletConfigs,
    snapshotInput("Work").deskletConfigs);
eq("desklet option recorded", created.includeDesklets, true);
eq("fingerprint recorded", created.fingerprint, "fp-Work");
eq("managerAnchor set", created.managerAnchor,
    { uuid: CONSTANTS.selfUuid(), required: true });
check("configHashes not duplicated into the profile",
    !("configHashes" in created));
check("createFromSnapshot without a name fails",
    PS.createFromSnapshot({ snapshot: {} }) === null);
const kindJunk = PS.createFromSnapshot(Object.assign(
    snapshotInput("NoDesklets"), { includeDesklets: false }));
check("false desklet option preserved", kindJunk.includeDesklets === false);
const kindless = PS.createFromSnapshot((function () {
    const input = snapshotInput("DefaultScope");
    delete input.includeDesklets;
    return input;
})());
check("missing desklet option defaults false", kindless.includeDesklets === false);
/* Drop the probe profiles so the later list suite stays deterministic. */
deleteRaw(PROFILES_DIR + "/" + kindJunk.id + ".json");
deleteRaw(PROFILES_DIR + "/" + kindless.id + ".json");

suite("save/load roundtrip is byte-exact");
check("saveProfile true", PS.saveProfile(created) === true);
const rawText = readRaw(PROFILES_DIR + "/" + created.id + ".json");
check("file exists on disk", rawText !== null);
const loaded = PS.loadProfile(created.id);
check("load returns no error", loaded.error === null, loaded.error);
check("re-serializing the load is byte-identical to the file",
    JSON.stringify(loaded.profile, null, 2) === rawText);
check("profile file mode 0600",
    fileMode(PROFILES_DIR + "/" + created.id + ".json") === 0o600);
check("saveProfile rejects a traversal id",
    PS.saveProfile({ id: "../../evil", name: "x" }) === false);
check("no evil file escaped", !exists(STATE_DIR + "/evil.json"));

suite("loadProfile failures");
check("unknown id errors", PS.loadProfile("no-such-profile").error !== null);
check("bad id pattern errors", PS.loadProfile("../nope").error !== null);
writeRaw(PROFILES_DIR + "/zz-broken.json", "not json at all");
const broken = PS.loadProfile("zz-broken");
check("invalid JSON errors", broken.error !== null && broken.profile === null);
const mismatchedFile = JSON.parse(readRaw(PROFILES_DIR + "/" + created.id + ".json"));
writeRaw(PROFILES_DIR + "/mismatched-file.json", JSON.stringify(mismatchedFile));
check("profile id must match its filename",
    PS.loadProfile("mismatched-file").error !== null);
deleteRaw(PROFILES_DIR + "/mismatched-file.json");

suite("listProfiles");
PSCHEMA.setDependencies({ logger: psLog, constants: CONSTANTS });
PS.setDependencies({
    logger: psLog,
    validateProfile: function (profile) {
        const verdict = PSCHEMA.validate(profile);
        return verdict && verdict.ok ? null : verdict.errors.join("; ");
    },
    migrateProfile: function (profile) {
        return PSCHEMA.migrate(profile).profile;
    }
});
PS.createFromSnapshot(snapshotInput("Bravo"));
PS.createFromSnapshot(snapshotInput("alpha"));
PS.createFromSnapshot(snapshotInput("delta"));
writeRaw(PROFILES_DIR + "/bad-shape.json",
    JSON.stringify({ schemaVersion: 4, id: "bad-shape", name: "Looks valid" }));
const listed = PS.listProfiles();
eq("all files listed (invalid included)", listed.length, 6);
eq("locale-sorted by display name",
    listed.map(function (p) { return p.name; }),
    ["alpha", "bad-shape", "Bravo", "delta", "Work", "zz-broken"]);
eq("valid flags", listed.map(function (p) { return p.valid; }),
    [true, false, true, true, true, false]);
check("valid JSON with an invalid schema is listed invalid",
    listed[1].name === "bad-shape" && listed[1].valid === false);
eq("invalid entry name comes from the filename",
    listed[5].name, "zz-broken");
eq("expectedCount surfaced from topology", listed[0].expectedCount, 2);
check("updatedAt surfaced", typeof listed[0].updatedAt === "string");
eq("expectedCount null for invalid", listed[5].expectedCount, null);

/* ------------------------------------------------------------------ *
 * v1/v2 profile files migrate on load (schema validators wired the way
 * the apply controller wires them in production)
 * ------------------------------------------------------------------ */

suite("v1 and v2 profiles migrate on load");
PS.setDependencies({
    logger: psLog,
    validateProfile: function (profile) {
        const verdict = PSCHEMA.validate(profile);
        return verdict && verdict.ok ? null
            : verdict.errors.join("; ");
    },
    migrateProfile: function (profile) {
        return PSCHEMA.migrate(profile).profile;
    }
});
(function () {
    function handVersion(version, extra) {
        const base = snapshotInput("Legacy");
        const hand = {
            schemaVersion: version,
            id: "legacy111-2222-3333-4444-555555555555",
            name: "Legacy",
            description: "",
            createdAt: "2026-01-01T00:00:00+00:00",
            updatedAt: "2026-01-01T00:00:00+00:00",
            environment: { cinnamonVersion: "6.6.9", sessionType: "x11" },
            monitorTopology: { expectedCount: 1, monitors: [] },
            cinnamonSettings: base.snapshot,
            appletConfigs: base.configs,
            fingerprint: "fp-legacy",
            managerAnchor: { uuid: CONSTANTS.selfUuid(), required: true }
        };
        Object.keys(extra || {}).forEach(function (k) {
            hand[k] = extra[k];
        });
        return hand;
    }

    /* v1: no kind, no deskletConfigs. */
    writeRaw(PROFILES_DIR + "/legacy111-2222-3333-4444-555555555555.json",
        JSON.stringify(handVersion(1, {
            kind: undefined,
            deskletConfigs: undefined
        }), null, 2));
    let loaded = PS.loadProfile("legacy111-2222-3333-4444-555555555555");
    check("v1 loads without error", loaded.error === null, loaded.error);
    eq("v1 migrates to current version", loaded.profile.schemaVersion,
        CONSTANTS.SCHEMA_VERSION);
    eq("v1 excludes desklets", loaded.profile.includeDesklets, false);
    eq("v1 deskletConfigs backfilled", loaded.profile.deskletConfigs, []);

    /* v2 with a legacy desklets scope becomes a desklet-kind profile. */
    writeRaw(PROFILES_DIR + "/legacy222-2222-3333-4444-555555555555.json",
        JSON.stringify(handVersion(2, {
            id: "legacy222-2222-3333-4444-555555555555",
            kind: undefined,
            scope: "desklets",
            deskletConfigs: []
        }), null, 2));
    loaded = PS.loadProfile("legacy222-2222-3333-4444-555555555555");
    check("v2 desklets-scope loads without error", loaded.error === null, loaded.error);
    eq("v2 desklets scope includes desklets",
        loaded.profile.includeDesklets, true);

    /* v2 with scope both becomes panel with a warning about the desklet
     * half, and still validates. */
    writeRaw(PROFILES_DIR + "/legacy333-2222-3333-4444-555555555555.json",
        JSON.stringify(handVersion(2, {
            id: "legacy333-2222-3333-4444-555555555555",
            kind: undefined,
            scope: "both",
            deskletConfigs: []
        }), null, 2));
    loaded = PS.loadProfile("legacy333-2222-3333-4444-555555555555");
    check("v2 both-scope loads without error", loaded.error === null, loaded.error);
    eq("v2 both scope includes desklets",
        loaded.profile.includeDesklets, true);
})();
/* Restore the logger-only seam the earlier suites assumed. */
PS.setDependencies({ logger: psLog });

/* ------------------------------------------------------------------ *
 * v1 state.json migration (active routing per kind)
 * ------------------------------------------------------------------ */

suite("v1 state migration preserves the active id");
(function () {
    function resetState(raw) {
        writeRaw(STATE_FILE, JSON.stringify(raw));
    }
    const deskletMade = PS.createFromSnapshot(
        Object.assign(snapshotInput("Router"), { includeDesklets: true }));
    check("desklet router profile created", deskletMade !== null);
    const panelMade = PS.createFromSnapshot(
        Object.assign(snapshotInput("RouterPanel"), { includeDesklets: false }));
    check("panel router profile created", panelMade !== null);
    const panelId = panelMade.id;

    /* Active id points at the desklet profile: routed to the desklet slot. */
    resetState({
        schemaVersion: 1,
        activeProfileId: deskletMade.id,
        startupProfileId: "dropped",
        pendingApply: null,
        lastSuccessfulApply: null,
        lastFailure: null,
        warnedPrimaryPlacement: true
    });
    let st = PS.init().state;
    eq("v1 desklet profile remains active",
        st.activeProfileId, deskletMade.id);
    check("startup designation dropped", st.startupProfileId === undefined);
    check("placement warning flag dropped",
        st.warnedPrimaryPlacement === undefined);

    /* Active id points at the panel profile: routed to the panel slot. */
    resetState({
        schemaVersion: 1,
        activeProfileId: panelId,
        pendingApply: null
    });
    st = PS.init().state;
    eq("v1 panel profile remains active", st.activeProfileId, panelId);

    /* A removal marker is voided; a user marker survives. */
    resetState({
        schemaVersion: 1,
        activeProfileId: null,
        pendingApply: { profileId: "x", reason: "removal",
            startedAt: "2026-01-01T00:00:00+00:00" }
    });
    st = PS.init().state;
    eq("removal marker voided", st.pendingApply, null);
    resetState({
        schemaVersion: 1,
        activeProfileId: null,
        pendingApply: { profileId: "x", reason: "user",
            startedAt: "2026-01-01T00:00:00+00:00" }
    });
    st = PS.getState();
    eq("user marker survives the migration",
        st.pendingApply && st.pendingApply.reason, "user");

    resetState({
        schemaVersion: 2,
        activePanelProfileId: panelId,
        activeDeskletProfileId: deskletMade.id,
        pendingApply: null
    });
    st = PS.init().state;
    eq("v2 migration prefers active panel profile",
        st.activeProfileId, panelId);

    resetState({
        schemaVersion: 2,
        activePanelProfileId: null,
        activeDeskletProfileId: deskletMade.id,
        pendingApply: null
    });
    st = PS.init().state;
    eq("v2 migration falls back to active desklet profile",
        st.activeProfileId, deskletMade.id);
})();

/* ------------------------------------------------------------------ *
 * updateFromSnapshot
 * ------------------------------------------------------------------ */

suite("updateFromSnapshot");
const before = PS.loadProfile(created.id).profile;
const stale = "2020-01-01T00:00:00+00:00";
before.updatedAt = stale;
PS.saveProfile(before);
const newConfigs = [{ uuid: "y@y", instanceId: "2",
    relativePath: "y@y/2.json", sha256: ATOMIC.sha256Hex("{}"), content: "{}" }];
const newDeskletConfigs = [{ uuid: "notes@x", instanceId: "2",
    relativePath: "notes@x/2.json", sha256: ATOMIC.sha256Hex("{}"), content: "{}" }];
const updated = PS.updateFromSnapshot(before, {
    snapshot: {
        "panels-enabled": { type: "as", value: "['2:1:bottom']" },
        "enabled-applets": { type: "as", value: "['panel1:right:0:x@x:1']" }
    },
    configs: newConfigs,
    deskletConfigs: newDeskletConfigs,
    topology: { expectedCount: 1, monitors: [] },
    fingerprint: "fp-changed"
});
check("returns the updated profile", updated !== null);
check("id preserved", updated.id === before.id);
check("createdAt preserved", updated.createdAt === created.createdAt);
check("name preserved", updated.name === "Work");
check("description preserved", updated.description === "made by test");
check("updatedAt refreshed", updated.updatedAt !== stale, updated.updatedAt);
check("updatedAt parses as ISO 8601", isoParses(updated.updatedAt));
eq("cinnamonSettings replaced", updated.cinnamonSettings,
    {
        "panels-enabled": { type: "as", value: "['2:1:bottom']" },
        "enabled-applets": { type: "as", value: "['panel1:right:0:x@x:1']" }
    });
eq("appletConfigs replaced", updated.appletConfigs, newConfigs);
eq("deskletConfigs replaced", updated.deskletConfigs, newDeskletConfigs);
eq("desklet option preserved when input carries none",
    updated.includeDesklets, true);
eq("monitorTopology replaced", updated.monitorTopology,
    { expectedCount: 1, monitors: [] });
eq("fingerprint replaced", updated.fingerprint, "fp-changed");
check("update persisted to disk",
    PS.loadProfile(created.id).profile.fingerprint === "fp-changed");
const emptied = PS.updateFromSnapshot(updated, { configs: [] });
eq("explicit empty configs clears the list", emptied.appletConfigs, []);
eq("explicit empty deskletConfigs clears the list too",
    PS.updateFromSnapshot(updated, { deskletConfigs: [] }).deskletConfigs, []);
eq("desklet option replaced only when carried",
    PS.updateFromSnapshot(updated, { includeDesklets: false }).includeDesklets,
    false);

suite("writeRollback / readRollback");
function rollbackBundle(i) {
    return {
        schemaVersion: 1,
        id: "rollback-" + i,
        name: "(rollback)",
        description: "",
        createdAt: "2026-01-01T00:00:0" + i + "+00:00",
        updatedAt: "2026-01-01T00:00:0" + i + "+00:00",
        environment: { cinnamonVersion: "6.6.9", sessionType: "x11" },
        monitorTopology: { expectedCount: 1, monitors: [] },
        cinnamonSettings: {},
        appletConfigs: [],
        fingerprint: "rb" + i,
        managerAnchor: { uuid: CONSTANTS.selfUuid(), required: true }
    };
}
for (let i = 1; i <= 5; i++)
    check("rollback write " + i + " succeeds", PS.writeRollback(rollbackBundle(i)) === true);
check("last-good exists", exists(BACKUPS_DIR + "/last-good.json"));
check("no inaccessible numbered history is created",
    !exists(BACKUPS_DIR + "/last-good-2.json") &&
    !exists(BACKUPS_DIR + "/last-good-3.json"));
eq("newest bundle in last-good",
    JSON.parse(readRaw(BACKUPS_DIR + "/last-good.json")).fingerprint, "rb5");
eq("readRollback returns the newest", PS.readRollback(), rollbackBundle(5));
check("rollback file mode 0600", fileMode(BACKUPS_DIR + "/last-good.json") === 0o600);
check("one more write replaces the accessible snapshot",
    PS.writeRollback(rollbackBundle(6)) === true);
eq("replacement is newest",
    JSON.parse(readRaw(BACKUPS_DIR + "/last-good.json")).fingerprint, "rb6");
check("writeRollback rejects garbage", PS.writeRollback(null) === false);

/* ------------------------------------------------------------------ *
 * getState / mutateState
 * ------------------------------------------------------------------ */

suite("mutateState");
PS.init();
const quarantineCountBeforeMutation = listDirNames(STATE_DIR).filter(function (n) {
    return n.indexOf("state.json.corrupt-") === 0;
}).length;
writeRaw(STATE_FILE, "garbage before removal cleanup");
const recoveredMutation = PS.mutateState(function (s) {
    s.lastFailure = "cleanup survived corrupt state";
});
check("mutation quarantines corrupt state before writing",
    recoveredMutation !== null &&
    recoveredMutation.lastFailure === "cleanup survived corrupt state");
const mutationQuarantines = listDirNames(STATE_DIR).filter(function (n) {
    return n.indexOf("state.json.corrupt-") === 0;
});
eq("mutation creates one corrupt-state quarantine",
    mutationQuarantines.length, quarantineCountBeforeMutation + 1);
check("mutation quarantine preserves unreadable bytes",
    mutationQuarantines.some(function (name) {
        return readRaw(STATE_DIR + "/" + name) ===
            "garbage before removal cleanup";
    }));
check("mutate in place persists",
    PS.mutateState(function (s) {
        s.pendingApply = { profileId: "p1", reason: "user" };
    }) !== null);
eq("getState re-reads from disk",
    PS.getState().pendingApply, { profileId: "p1", reason: "user" });
const beforeText = readRaw(STATE_FILE);
check("fn returning null aborts without writing",
    PS.mutateState(function () { return null; }) === null);
check("state untouched after abort", readRaw(STATE_FILE) === beforeText);
check("fn throwing aborts without writing",
    PS.mutateState(function () { throw new Error("boom"); }) === null);
check("state untouched after throw", readRaw(STATE_FILE) === beforeText);
const replaced = PS.mutateState(function () {
    const s = PS.getState();
    s.lastFailure = "replaced";
    return s;
});
check("fn returning a new state object persists it",
    replaced !== null && PS.getState().lastFailure === "replaced");
check("mutateState rejects non-functions", PS.mutateState(null) === null);

suite("cross-process profile store lock");
const nestedLock = PS.withStoreLock(function () {
    return PS.withStoreLock(function () { return "nested ran"; });
});
check("outer store lock acquired", nestedLock.ok === true);
check("same-process nested lock is reentrant",
    nestedLock.value && nestedLock.value.ok === true &&
    nestedLock.value.value === "nested ran");
check("lock file released after callback",
    !exists(STATE_DIR + "/store.lock"));
const thrownLock = PS.withStoreLock(function () {
    throw new Error("lock callback failed");
});
check("throwing lock callback reports failure", thrownLock.ok === false);
check("throwing callback still releases lock",
    !exists(STATE_DIR + "/store.lock"));

suite("two-process store serialization");
const raceVictim = PS.createFromSnapshot(snapshotInput("Race Victim"));
const staleVictim = PS.loadProfile(raceVictim.id).profile;
const deleteWorker = startWidgetLockWorker(
    "delete", raceVictim.id, "delete-save-race");
check("Python delete holds the shared lock", deleteWorker.ready);
const blockedUpdate = PS.updateFromSnapshot(staleVictim, {
    fingerprint: "must-not-resurrect"
});
eq("save-update refuses contention instead of recreating a deleted profile",
    blockedUpdate, null);
check("Python delete worker exits cleanly", deleteWorker.release());
check("deleted profile remains absent after lock release",
    !exists(PROFILES_DIR + "/" + raceVictim.id + ".json"));
eq("stale save-update is rejected after the delete commits",
    PS.updateFromSnapshot(staleVictim, { fingerprint: "still-stale" }), null);
check("stale update never resurrects the profile",
    !exists(PROFILES_DIR + "/" + raceVictim.id + ".json"));

const oldActive = PS.createFromSnapshot(snapshotInput("Old Active"));
const verifiedActive = PS.createFromSnapshot(snapshotInput("Verified Active"));
PS.mutateState(function (state) {
    state.activeProfileId = oldActive.id;
    state.pendingApply = { profileId: verifiedActive.id, reason: "user",
        phase: "verifying" };
});
const repairWorker = startWidgetLockWorker(
    "repair", oldActive.id, "repair-verify-race");
check("Python state repair holds the shared lock", repairWorker.ready);
const busyStartup = PS.init();
check("startup reports lock contention explicitly",
    busyStartup.busy === true && busyStartup.state === null);
eq("contended state read never fabricates defaults", PS.getState(), null);
eq("JS verification state commit refuses contention",
    PS.mutateState(function (state) {
        state.activeProfileId = verifiedActive.id;
        state.pendingApply = null;
    }), null);
check("Python repair worker exits cleanly", repairWorker.release());
check("startup retry sees the durable pending transaction",
    PS.init().state.pendingApply.profileId === verifiedActive.id);
const verified = PS.mutateState(function (state) {
    state.activeProfileId = verifiedActive.id;
    state.pendingApply = null;
});
check("JS verification retry commits from repaired state", verified !== null);
const lateRepair = startWidgetLockWorker(
    "repair", oldActive.id, "late-repair");
check("late Python repair acquires the shared lock", lateRepair.ready);
check("late Python repair exits cleanly", lateRepair.release());
const serializedState = PS.getState();
eq("state repair cannot erase the verified active profile",
    serializedState.activeProfileId, verifiedActive.id);
eq("state repair cannot resurrect stale pendingApply",
    serializedState.pendingApply, null);

/* ------------------------------------------------------------------ *
 * appletConfigStore: sanitizeRelativePath
 * ------------------------------------------------------------------ */

const SPICES = CONFIG_DIR + "/spices-test";
ATOMIC.ensurePrivateDir(SPICES);
const acsLog = makeLogger();
ACS.setDependencies({
    selfUuid: function () { return "self@me"; },
    logger: acsLog,
    configRoot: SPICES
});

suite("sanitizeRelativePath acceptance");
eq("plain", ACS.sanitizeRelativePath("a@x/17.json"), "a@x/17.json");
eq("rich characters", ACS.sanitizeRelativePath("A-b._+@x/C9-.+_@.json"),
    "A-b._+@x/C9-.+_@.json");
eq("uuid-named single instance", ACS.sanitizeRelativePath("x@x/x@x.json"),
    "x@x/x@x.json");

suite("sanitizeRelativePath rejection table");
eq("absolute path", ACS.sanitizeRelativePath("/a/b.json"), null);
eq("leading-slash two-parter", ACS.sanitizeRelativePath("/b.json"), null);
eq("dotdot component", ACS.sanitizeRelativePath("../b.json"), null);
eq("dotdot tail", ACS.sanitizeRelativePath("a/...json"), "a/...json"); /* "..." is a legal name, not traversal */
eq("traversal inside", ACS.sanitizeRelativePath("a/../b.json"), null);
eq("backslash", ACS.sanitizeRelativePath("a\\b.json"), null);
eq("nested deep", ACS.sanitizeRelativePath("a/b/c.json"), null);
eq("non-json extension", ACS.sanitizeRelativePath("a/b.txt"), null);
eq("json as directory", ACS.sanitizeRelativePath("a.json/b"), null);
eq("empty component", ACS.sanitizeRelativePath("a//b.json"), null);
eq("trailing slash", ACS.sanitizeRelativePath("a/b.json/"), null);
eq("empty string", ACS.sanitizeRelativePath(""), null);
eq("not a string", ACS.sanitizeRelativePath(null), null);
eq("newline smuggle", ACS.sanitizeRelativePath("a/b.json\n"), null);

/* ------------------------------------------------------------------ *
 * appletConfigStore: captureConfigs
 * ------------------------------------------------------------------ */

ATOMIC.ensurePrivateDir(SPICES + "/multi@x");
writeRaw(SPICES + "/multi@x/17.json", "{\"multi\":true}");
ATOMIC.ensurePrivateDir(SPICES + "/single@x");
writeRaw(SPICES + "/single@x/single@x.json", "{\"single\":true}");
ATOMIC.ensurePrivateDir(SPICES + "/both@x");
writeRaw(SPICES + "/both@x/5.json", "{\"byId\":true}");
writeRaw(SPICES + "/both@x/both@x.json", "{\"byUuid\":true}");

suite("captureConfigs");
const captured = ACS.captureConfigs([
    { uuid: "multi@x", instanceId: "17" },
    { uuid: "multi@x", instanceId: "17" },           /* duplicate entry */
    { uuid: "single@x", instanceId: "3" },           /* file is uuid-named */
    { uuid: "both@x", instanceId: "5" },             /* both styles exist */
    { uuid: "missing@x", instanceId: "1" },          /* nothing on disk */
    { uuid: "self@me", instanceId: "9" },            /* self, excluded */
    { not: "an entry" }
]);
eq("three configs captured", captured.length, 3);
const byPath = {};
captured.forEach(function (c) { byPath[c.relativePath] = c; });
eq("multi-instance probes <id>.json",
    byPath["multi@x/17.json"] !== undefined &&
    byPath["multi@x/17.json"].uuid, "multi@x");
eq("instanceId recorded", byPath["multi@x/17.json"].instanceId, "17");
check("single-instance probes <uuid>.json",
    byPath["single@x/single@x.json"] !== undefined);
check("instance-first when both exist",
    byPath["both@x/5.json"] !== undefined &&
    byPath["both@x/both@x.json"] === undefined);
check("sha256 matches content",
    byPath["multi@x/17.json"].sha256 === ATOMIC.sha256Hex("{\"multi\":true}"));
check("content verbatim",
    byPath["multi@x/17.json"].content === "{\"multi\":true}");
check("self excluded", captured.every(function (c) { return c.uuid !== "self@me"; }));
check("missing file absent",
    captured.every(function (c) { return c.uuid !== "missing@x"; }));
eq("bad input yields empty", ACS.captureConfigs(null), []);
eq("bad input yields empty (not array)", ACS.captureConfigs("x"), []);

suite("configHashList");
eq("sorted uuid|instanceId|sha256 strings",
    ACS.configHashList(captured),
    [
        "both@x|5|" + ATOMIC.sha256Hex("{\"byId\":true}"),
        "multi@x|17|" + ATOMIC.sha256Hex("{\"multi\":true}"),
        "single@x|3|" + ATOMIC.sha256Hex("{\"single\":true}")
    ].sort());
eq("empty for null", ACS.configHashList(null), []);

/* ------------------------------------------------------------------ *
 * appletConfigStore: restoreConfigs
 * ------------------------------------------------------------------ */

suite("restoreConfigs");
const goodContent = "{\"restored\":true}";
const goodSha = ATOMIC.sha256Hex(goodContent);
const restoreBatch = [
    { uuid: "evil@x", instanceId: "7", relativePath: "/abs/7.json", content: "{}", sha256: "" },
    { uuid: "evil@x", instanceId: "7", relativePath: "../7.json", content: "{}", sha256: "" },
    { uuid: "evil@x", instanceId: "7", relativePath: "a\\7.json", content: "{}", sha256: "" },
    { uuid: "evil@x", instanceId: "7", relativePath: "a/b/7.json", content: "{}", sha256: "" },
    { uuid: "evil@x", instanceId: "7", relativePath: "a/7.txt", content: "{}", sha256: "" },
    { uuid: "evil@x", instanceId: "7", relativePath: "a//7.json", content: "{}", sha256: "" },
    { uuid: "self@me", instanceId: "9", relativePath: "self@me/9.json", content: "{}", sha256: "" },
    { uuid: "good@x", instanceId: "7", relativePath: "good@x/7.json",
        content: goodContent, sha256: goodSha }
];
const restoreResult = ACS.restoreConfigs(restoreBatch);
eq("invalid batch writes nothing", restoreResult.written, 0);
eq("seven skipped", restoreResult.skipped, 7);
eq("six warnings (self skip is silent)",
    restoreResult.warnings.length, 6,
    JSON.stringify(restoreResult.warnings));
check("invalid batch reports failure", restoreResult.ok === false);
const goodRestore = ACS.restoreConfigs([restoreBatch[7]]);
check("valid batch succeeds", goodRestore.ok && goodRestore.written === 1);
check("good file written verbatim",
    readRaw(SPICES + "/good@x/7.json") === goodContent);
check("created uuid dir mode 0700", fileMode(SPICES + "/good@x") === 0o700);
check("written file mode 0600",
    fileMode(SPICES + "/good@x/7.json") === 0o600);
check("no traversal escape", !exists(SPICES + "/../7.json"));
check("self file never written", !exists(SPICES + "/self@me/9.json"));

suite("restoreConfigs hash verification");
const badSha = ACS.restoreConfigs([{
    uuid: "good@x", instanceId: "8", relativePath: "good@x/8.json",
    content: goodContent, sha256: "0000"
}]);
eq("hash mismatch prevents write", badSha.written, 0);
eq("mismatch warned", badSha.warnings.length, 1);
check("mismatched content not written", !exists(SPICES + "/good@x/8.json"));
const wrongContentSha = ACS.restoreConfigs([{
    uuid: "good@x", instanceId: "8b", relativePath: "good@x/8b.json",
    content: goodContent, sha256: ATOMIC.sha256Hex("different content")
}]);
check("well-formed digest must match saved content",
    wrongContentSha.ok === false && wrongContentSha.written === 0);
check("content digest mismatch does not write a file",
    !exists(SPICES + "/good@x/8b.json"));
const noSha = ACS.restoreConfigs([{
    uuid: "good@x", instanceId: "9", relativePath: "good@x/9.json", content: goodContent
}]);
check("missing sha256 rejects restore", noSha.ok === false &&
    noSha.written === 0 && noSha.warnings.length === 1);
const badContent = ACS.restoreConfigs([{
    uuid: "good@x", instanceId: "10", relativePath: "good@x/10.json", content: 42, sha256: ""
}]);
eq("non-string content skipped", badContent.written, 0);
eq("non-string content warned", badContent.warnings.length, 1);

suite("config ownership and rollback state");
const spoofSelf = ACS.restoreConfigs([{
    uuid: "other@x", instanceId: "9", relativePath: "self@me/9.json",
    content: "{}", sha256: ATOMIC.sha256Hex("{}")
}]);
check("spoofed self path fails the whole batch", spoofSelf.ok === false);
check("spoofed self path is never written",
    !exists(SPICES + "/self@me/9.json"));
const wrongOwner = ACS.restoreConfigs([{
    uuid: "owner@x", instanceId: "2", relativePath: "other@x/2.json",
    content: "{}", sha256: ATOMIC.sha256Hex("{}")
}]);
check("uuid directory mismatch rejected", wrongOwner.ok === false);

const outside = CONFIG_DIR + "/outside-config";
ATOMIC.ensurePrivateDir(outside);
try {
    Gio.File.new_for_path(SPICES + "/linked@x").make_symbolic_link(outside, null);
} catch (ignored) {
}
const linked = ACS.restoreConfigs([{
    uuid: "linked@x", instanceId: "1", relativePath: "linked@x/1.json",
    content: "{}", sha256: ATOMIC.sha256Hex("{}")
}]);
check("symlinked uuid directory rejected", linked.ok === false);
check("symlink target remains untouched", !exists(outside + "/1.json"));

const batchGood = {
    uuid: "batch@x", instanceId: "1", relativePath: "batch@x/1.json",
    content: "{\"good\":true}",
    sha256: ATOMIC.sha256Hex("{\"good\":true}")
};
const batchBadRemoval = {
    uuid: "wrong@x", instanceId: "2", relativePath: "batch@x/2.json"
};
const allOrNothing = ACS.restoreConfigState([batchGood], [batchBadRemoval]);
check("write and removal batches preflight together", allOrNothing.ok === false);
check("invalid removal prevents the valid write",
    !exists(SPICES + "/batch@x/1.json"));

ATOMIC.ensurePrivateDir(SPICES + "/dormant@x");
writeRaw(SPICES + "/dormant@x/4.json", "{\"before\":true}");
const targetConfigs = [{
    uuid: "dormant@x", instanceId: "4", relativePath: "dormant@x/4.json",
    content: "{\"after\":true}",
    sha256: ATOMIC.sha256Hex("{\"after\":true}")
}, {
    uuid: "new@x", instanceId: "5", relativePath: "new@x/5.json",
    content: "{\"new\":true}", sha256: ATOMIC.sha256Hex("{\"new\":true}")
}];
const rollbackState = ACS.captureRollbackState([], targetConfigs);
check("rollback capture succeeds", rollbackState.ok === true,
    JSON.stringify(rollbackState.warnings));
eq("dormant target content captured", rollbackState.configs.length, 1);
eq("missing target becomes one tombstone", rollbackState.tombstones.length, 1);
check("target config state writes both files",
    ACS.restoreConfigState(targetConfigs, []).ok === true);
eq("dormant target overwritten", readRaw(SPICES + "/dormant@x/4.json"),
    "{\"after\":true}");
check("new target created", exists(SPICES + "/new@x/5.json"));
const rolledBack = ACS.restoreConfigState(
    rollbackState.configs, rollbackState.tombstones);
check("rollback config state succeeds", rolledBack.ok === true,
    JSON.stringify(rolledBack.warnings));
eq("dormant target restored", readRaw(SPICES + "/dormant@x/4.json"),
    "{\"before\":true}");
check("tombstone removes newly created target",
    !exists(SPICES + "/new@x/5.json"));

/* ------------------------------------------------------------------ *
 * appletConfigStore: watchConfigs (mainloop, never hangs)
 * ------------------------------------------------------------------ */

suite("watchConfigs");
ATOMIC.ensurePrivateDir(SPICES + "/watchme@x");
writeRaw(SPICES + "/watchme@x/3.json", "{\"v\":1}");
const watchEvents = [];
let watchLoop = null;
function onChangeSeen(rel) {
    watchEvents.push(rel);
    if (watchLoop)
        watchLoop.quit();
}
const watchHandle = ACS.watchConfigs(
    [{ uuid: "watchme@x", instanceId: "3", relativePath: "watchme@x/3.json" }],
    onChangeSeen);
check("handle alive", watchHandle.alive === true);
check("one monitor for the uuid dir", watchHandle.monitors.length === 1);

watchLoop = GLib.MainLoop.new(null, false);
let timedOut = false;
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, function () {
    timedOut = true;
    watchLoop.quit();
    return false;
});
GLib.idle_add(GLib.PRIORITY_DEFAULT, function () {
    /* Rewrite through the production atomic path: the interesting event is
     * the rename carrying the final name as other_file. */
    ATOMIC.writePrivateFileAtomic(SPICES + "/watchme@x/3.json", "{\"v\":2}");
    return false;
});
watchLoop.run();
check("watched-file change observed (FileMonitor works headless here)",
    watchEvents.indexOf("watchme@x/3.json") !== -1,
    timedOut ? "timed out with events " + JSON.stringify(watchEvents)
             : "events " + JSON.stringify(watchEvents));
check("unwatched sibling noise filtered out",
    watchEvents.every(function (e) { return e === "watchme@x/3.json"; }),
    JSON.stringify(watchEvents));

ACS.unwatchConfigs(watchHandle);
check("handle dead after unwatch", watchHandle.alive === false);
ACS.unwatchConfigs(watchHandle); /* idempotent */
ACS.unwatchConfigs(null);        /* tolerant */

/* After cancel, further writes must not fire. */
const loop2 = GLib.MainLoop.new(null, false);
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, function () {
    loop2.quit();
    return false;
});
GLib.idle_add(GLib.PRIORITY_DEFAULT, function () {
    writeRaw(SPICES + "/watchme@x/3.json", "{\"v\":3}");
    return false;
});
loop2.run();
check("no events after unwatch", watchEvents.length === 1,
    JSON.stringify(watchEvents));
watchLoop = null;

suite("watchConfigs guards");
eq("dead handle for bad args", ACS.watchConfigs(null, onChangeSeen).alive, false);
eq("dead handle for missing callback",
    ACS.watchConfigs([{ relativePath: "a@x/1.json" }], null).alive, false);

/* ------------------------------------------------------------------ *
 * Failure isolation: hostile injected dependencies must not crash out
 * ------------------------------------------------------------------ *
 * The sibling modules cannot be evicted from the importer headlessly, so
 * "no siblings" is not a state we can produce here. What we CAN pin down
 * is that every injected dependency throwing is survivable: nothing may
 * escape into a GObject signal handler. */

suite("failure isolation with hostile deps");
function boom() { throw new Error("boom"); }
PS.setDependencies({
    logger: { warn: boom, error: boom },
    validateProfile: boom,
    migrateProfile: boom
});
check("init survives throwing logger", PS.init().state !== null);
check("listProfiles survives throwing logger", Array.isArray(PS.listProfiles()));
check("loadProfile survives a throwing validator",
    PS.loadProfile("zz-broken").error !== null);
check("saveProfile survives a throwing logger",
    PS.saveProfile({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "x" }) === true);
check("getState survives", PS.getState().schemaVersion === 3);
check("mutateState survives", PS.mutateState(function () { return null; }) === null);

ACS.setDependencies({
    selfUuid: boom,
    logger: { warn: boom, error: boom },
    configRoot: SPICES
});
const hostileCapture = ACS.captureConfigs([{ uuid: "multi@x", instanceId: "17" }]);
check("captureConfigs survives a throwing selfUuid (falls back to default uuid)",
    hostileCapture.length === 1 && hostileCapture[0].relativePath === "multi@x/17.json",
    JSON.stringify(hostileCapture));
const hostileRestore = ACS.restoreConfigs([{
    uuid: "a@x", instanceId: "1", relativePath: "a@x/1.json", content: "{}",
    sha256: ATOMIC.sha256Hex("{}")
}]);
check("restoreConfigs survives a throwing selfUuid",
    hostileRestore.written === 1, JSON.stringify(hostileRestore));
const hostileHandle = ACS.watchConfigs(
    [{ relativePath: "a@x/1.json" }], function () {});
check("watchConfigs survives hostile deps", hostileHandle.alive === true);
ACS.unwatchConfigs(hostileHandle);
check("unwatchConfigs survives a junk handle",
    ACS.unwatchConfigs({ alive: true, monitors: null, ids: "x" }) === undefined);

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

print("\n" + "=".repeat(60));
if (failures.length === 0) {
    print("All " + passed + " assertions passed.");
    System.exit(0);
} else {
    print(passed + " passed, " + failures.length + " FAILED:");
    failures.forEach(function (f) { print("  - " + f); });
    System.exit(1);
}
