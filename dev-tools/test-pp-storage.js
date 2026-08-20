#!/usr/bin/env gjs
/* global imports, print */
/**
 * Headless unit tests for the Panel Profiles storage layer:
 * lib/profileStore.js and lib/appletConfigStore.js.
 *
 * St/Clutter cannot be instantiated outside the Cinnamon process, so this
 * harness covers only what runs headless: profile CRUD, state recovery,
 * rollback rotation, config capture/restore/watch and path sanitization.
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

/* A schema v1 snapshot input shaped like a real capture. */
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
            relativePath: "x@x/1.json", sha256: "deadbeef", content: "{}"
        }],
        configHashes: ["x@x|1|deadbeef"],
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
    schemaVersion: 1,
    activeProfileId: null,
    startupProfileId: null,
    pendingApply: null,
    lastSuccessfulApply: null,
    lastFailure: null,
    warnedPrimaryPlacement: false
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

suite("partial state.json is merged, not quarantined");
writeRaw(STATE_FILE, "{\"schemaVersion\": 1, \"activeProfileId\": \"keepme\"}");
const merged = PS.init();
eq("no spurious recovery", merged.recoveredWarnings, []);
eq("known key kept", merged.state.activeProfileId, "keepme");
eq("missing keys defaulted", merged.state.startupProfileId, null);
/* Two quarantine files by now: the garbage one and the wrong-shape one. */
check("no extra quarantine files beyond the two corruptions",
    listDirNames(STATE_DIR).filter(function (n) {
        return n.indexOf("state.json.corrupt-") === 0;
    }).length === 2);
PS.init(); /* rewrite clean state for later suites */

/* ------------------------------------------------------------------ *
 * save / load / list
 * ------------------------------------------------------------------ */

suite("createFromSnapshot builds schema v1");
const created = PS.createFromSnapshot(snapshotInput("Work"));
check("returns a profile", created !== null);
check("schemaVersion 1", created.schemaVersion === 1);
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
eq("fingerprint recorded", created.fingerprint, "fp-Work");
eq("managerAnchor set", created.managerAnchor,
    { uuid: CONSTANTS.selfUuid(), required: true });
check("configHashes not duplicated into the profile",
    !("configHashes" in created));
check("createFromSnapshot without a name fails",
    PS.createFromSnapshot({ snapshot: {} }) === null);

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

suite("listProfiles");
PS.createFromSnapshot(snapshotInput("Bravo"));
PS.createFromSnapshot(snapshotInput("alpha"));
PS.createFromSnapshot(snapshotInput("delta"));
const listed = PS.listProfiles();
eq("all files listed (invalid included)", listed.length, 5);
eq("locale-sorted by name, invalid file last",
    listed.map(function (p) { return p.name; }),
    ["alpha", "Bravo", "delta", "Work", "zz-broken"]);
eq("valid flags", listed.map(function (p) { return p.valid; }),
    [true, true, true, true, false]);
eq("invalid entry name comes from the filename",
    listed[4].name, "zz-broken");
eq("expectedCount surfaced from topology", listed[0].expectedCount, 2);
check("updatedAt surfaced", typeof listed[0].updatedAt === "string");
eq("expectedCount null for invalid", listed[4].expectedCount, null);

/* ------------------------------------------------------------------ *
 * updateFromSnapshot
 * ------------------------------------------------------------------ */

suite("updateFromSnapshot");
const before = PS.loadProfile(created.id).profile;
const stale = "2020-01-01T00:00:00+00:00";
before.updatedAt = stale;
PS.saveProfile(before);
const newConfigs = [{ uuid: "y@y", instanceId: "2",
    relativePath: "y@y/2.json", sha256: "ab", content: "{}" }];
const updated = PS.updateFromSnapshot(before, {
    snapshot: { "panels-enabled": { type: "as", value: "['2:1:bottom']" } },
    configs: newConfigs,
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
    { "panels-enabled": { type: "as", value: "['2:1:bottom']" } });
eq("appletConfigs replaced", updated.appletConfigs, newConfigs);
eq("monitorTopology replaced", updated.monitorTopology,
    { expectedCount: 1, monitors: [] });
eq("fingerprint replaced", updated.fingerprint, "fp-changed");
check("update persisted to disk",
    PS.loadProfile(created.id).profile.fingerprint === "fp-changed");
const emptied = PS.updateFromSnapshot(updated, { configs: [] });
eq("explicit empty configs clears the list", emptied.appletConfigs, []);

/* ------------------------------------------------------------------ *
 * duplicateProfile
 * ------------------------------------------------------------------ */

suite("duplicateProfile");
PS.mutateState(function (s) {
    s.activeProfileId = created.id;
    s.startupProfileId = created.id;
});
/* Force a stale createdAt so the restamp assertion is deterministic
 * (second-resolution timestamps can otherwise collide within a test run). */
const staleCreated = "2019-01-01T00:00:00+00:00";
created.createdAt = staleCreated;
PS.saveProfile(created);
const dup1 = PS.duplicateProfile(created.id);
check("duplicate returned", dup1 !== null);
check("new id", dup1.id !== created.id && /^[0-9a-f-]{36}$/.test(dup1.id));
eq("copy name", dup1.name, "Work Copy");
check("duplicate persisted", PS.loadProfile(dup1.id).error === null);
check("createdAt restamped", dup1.createdAt !== staleCreated, dup1.createdAt);
const dup2 = PS.duplicateProfile(created.id);
eq("collision gets suffix 2", dup2.name, "Work Copy 2");
const dup3 = PS.duplicateProfile(created.id);
eq("second collision gets suffix 3", dup3.name, "Work Copy 3");
eq("active designation NOT copied",
    PS.getState().activeProfileId, created.id);
eq("startup designation NOT copied",
    PS.getState().startupProfileId, created.id);
check("duplicate of unknown profile fails", PS.duplicateProfile("nope") === null);

/* ------------------------------------------------------------------ *
 * renameProfile
 * ------------------------------------------------------------------ */

suite("renameProfile");
check("rename works", PS.renameProfile(dup2.id, "Renamed") === true);
eq("name changed on disk", PS.loadProfile(dup2.id).profile.name, "Renamed");
check("rename to empty fails", PS.renameProfile(dup2.id, "") === false);
check("rename of unknown profile fails", PS.renameProfile("nope", "X") === false);

/* ------------------------------------------------------------------ *
 * deleteProfile fixes state.json
 * ------------------------------------------------------------------ */

suite("deleteProfile");
const other = PS.createFromSnapshot(snapshotInput("Other"));
PS.mutateState(function (s) {
    s.activeProfileId = created.id;
    s.startupProfileId = other.id;
    s.lastSuccessfulApply = "keep-this";
});
check("delete returns true", PS.deleteProfile(created.id) === true);
check("profile file gone", !exists(PROFILES_DIR + "/" + created.id + ".json"));
eq("activeProfileId cleared", PS.getState().activeProfileId, null);
eq("startupProfileId left alone", PS.getState().startupProfileId, other.id);
eq("unrelated state keys untouched",
    PS.getState().lastSuccessfulApply, "keep-this");
check("deleting the startup profile clears it too",
    PS.deleteProfile(other.id) === true);
eq("startupProfileId now null", PS.getState().startupProfileId, null);
check("deleting a missing profile returns false",
    PS.deleteProfile("no-such-profile") === false);
check("deleting a traversal id returns false",
    PS.deleteProfile("../../etc") === false);

/* ------------------------------------------------------------------ *
 * Rollback rotation
 * ------------------------------------------------------------------ */

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
check("last-good-2 exists", exists(BACKUPS_DIR + "/last-good-2.json"));
check("last-good-3 exists", exists(BACKUPS_DIR + "/last-good-3.json"));
check("last-good-4 pruned (keep 3 total)", !exists(BACKUPS_DIR + "/last-good-4.json"));
eq("newest bundle in last-good",
    JSON.parse(readRaw(BACKUPS_DIR + "/last-good.json")).fingerprint, "rb5");
eq("second newest in last-good-2",
    JSON.parse(readRaw(BACKUPS_DIR + "/last-good-2.json")).fingerprint, "rb4");
eq("third newest in last-good-3",
    JSON.parse(readRaw(BACKUPS_DIR + "/last-good-3.json")).fingerprint, "rb3");
eq("readRollback returns the newest", PS.readRollback(), rollbackBundle(5));
check("rollback file mode 0600", fileMode(BACKUPS_DIR + "/last-good.json") === 0o600);
check("one more write rotates again", PS.writeRollback(rollbackBundle(6)) === true);
eq("rotation after overwrite",
    JSON.parse(readRaw(BACKUPS_DIR + "/last-good.json")).fingerprint, "rb6");
eq("shifted -2",
    JSON.parse(readRaw(BACKUPS_DIR + "/last-good-2.json")).fingerprint, "rb5");
eq("shifted -3",
    JSON.parse(readRaw(BACKUPS_DIR + "/last-good-3.json")).fingerprint, "rb4");
check("still only three total", !exists(BACKUPS_DIR + "/last-good-4.json"));
check("writeRollback rejects garbage", PS.writeRollback(null) === false);

/* ------------------------------------------------------------------ *
 * getState / mutateState
 * ------------------------------------------------------------------ */

suite("mutateState");
PS.init();
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
    { uuid: "evil@x", relativePath: "/abs/7.json", content: "{}", sha256: "" },
    { uuid: "evil@x", relativePath: "../7.json", content: "{}", sha256: "" },
    { uuid: "evil@x", relativePath: "a\\7.json", content: "{}", sha256: "" },
    { uuid: "evil@x", relativePath: "a/b/7.json", content: "{}", sha256: "" },
    { uuid: "evil@x", relativePath: "a/7.txt", content: "{}", sha256: "" },
    { uuid: "evil@x", relativePath: "a//7.json", content: "{}", sha256: "" },
    { uuid: "self@me", relativePath: "self@me/9.json", content: "{}", sha256: "" },
    { uuid: "good@x", relativePath: "good@x/7.json",
        content: goodContent, sha256: goodSha }
];
const restoreResult = ACS.restoreConfigs(restoreBatch);
eq("one written", restoreResult.written, 1);
eq("seven skipped", restoreResult.skipped, 7);
eq("six warnings (self skip is silent)",
    restoreResult.warnings.length, 6,
    JSON.stringify(restoreResult.warnings));
check("good file written verbatim",
    readRaw(SPICES + "/good@x/7.json") === goodContent);
check("created uuid dir mode 0700", fileMode(SPICES + "/good@x") === 0o700);
check("written file mode 0600",
    fileMode(SPICES + "/good@x/7.json") === 0o600);
check("no traversal escape", !exists(SPICES + "/../7.json"));
check("self file never written", !exists(SPICES + "/self@me/9.json"));

suite("restoreConfigs hash verification");
const badSha = ACS.restoreConfigs([{
    uuid: "good@x", relativePath: "good@x/8.json",
    content: goodContent, sha256: "0000"
}]);
eq("written despite mismatch", badSha.written, 1);
eq("mismatch warned", badSha.warnings.length, 1);
check("content still written", readRaw(SPICES + "/good@x/8.json") === goodContent);
const noSha = ACS.restoreConfigs([{
    uuid: "good@x", relativePath: "good@x/9.json", content: goodContent
}]);
eq("no sha256 means no verify warning", noSha.warnings.length, 0);
const badContent = ACS.restoreConfigs([{
    uuid: "good@x", relativePath: "good@x/10.json", content: 42, sha256: ""
}]);
eq("non-string content skipped", badContent.written, 0);
eq("non-string content warned", badContent.warnings.length, 1);

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
check("getState survives", PS.getState().schemaVersion === 1);
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
    uuid: "a@x", relativePath: "a@x/1.json", content: "{}", sha256: ""
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
