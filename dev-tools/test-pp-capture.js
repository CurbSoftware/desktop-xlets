#!/usr/bin/env gjs
/* global imports, print */
/**
 * Headless unit tests for the Panel Profiles capture core:
 * lib/cinnamonState.js, lib/fingerprint.js, lib/profileSchema.js.
 *
 * St/Clutter cannot be loaded outside the Cinnamon process, so these
 * modules are built dependency-injected; the tests drive them with a fake
 * org.cinnamon settings provider (real GLib.Variant values, no dconf
 * writes). Live behaviour of the restore phases is covered separately by
 * dev-tools/live-test-panel-profiles.py.
 *
 * Usage:  gjs dev-tools/test-pp-capture.js
 * Exits non-zero on any failing assertion.
 */

const System = imports.system;

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const SCRIPT_DIR = GLib.path_get_dirname(
    Gio.File.new_for_commandline_arg(System.programInvocationName).get_path());
const REPO_ROOT = GLib.path_get_dirname(SCRIPT_DIR);
const APPLET_DIR = REPO_ROOT + "/cinnamon-panel-profiles-applet@curbsoftware";

imports.searchPath.unshift(APPLET_DIR + "/lib");
const C = imports.constants;
const AF = imports.atomicFile;
const CS = imports.cinnamonState;
const FP = imports.fingerprint;
const PS = imports.profileSchema;

/* ------------------------------------------------------------------ *
 * Tiny assertion framework
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
 * Fake settings provider
 * ------------------------------------------------------------------ */

/* Variant from a GVariant text form. */
function V(text) {
    return GLib.Variant.parse(null, text, null, null);
}

/* The self uuid used by the anchor tests. */
const SELF = "self@test";

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
            values[key] = variant;
            if (opts.corruptReadback === key)
                values[key] = V("['zzz:corrupted']");
        },
        list_keys: function () { return Object.keys(values); },
        _values: values,
        writes: writes
    };
}

/* A live-box-shaped org.cinnamon state (2 panels, 2 heads). */
function baseState() {
    return {
        "panels-enabled": V("['1:0:bottom', '2:1:bottom']"),
        "enabled-applets": V("['panel1:left:0:menu@cinnamon.org:0', " +
            "'panel1:left:1:grouped-window-list@cinnamon.org:2', " +
            "'panel1:right:0:systray@cinnamon.org:3', " +
            "'panel1:right:1:calendar@cinnamon.org:13', " +
            "'panel2:left:0:menu@cinnamon.org:15', " +
            "'panel2:center:0:windows-quick-list@cinnamon.org:20']"),
        "panels-autohide": V("['1:1', '2:1', '3:1']"),
        "panels-show-delay": V("['1:0', '2:0']"),
        "panels-hide-delay": V("['1:0', '2:0']"),
        "panels-height": V("['1:28', '2:30']"),
        "panel-scale-text-icons": V("true"),
        /* Verified live on Cinnamon 6.6: the zone-size keys are single "s"
         * strings holding the whole JSON array, with arbitrary key order
         * and phantom panel entries (panel 3 here has no panels-enabled
         * entry). */
        "panel-zone-icon-sizes": V("'[{\"panelId\": 1, \"left\": 0, \"center\": 0, \"right\": 0}, " +
            "{\"left\": 0, \"center\": 0, \"right\": 0, \"panelId\": 2}, " +
            "{\"left\": 0, \"center\": 0, \"right\": 0, \"panelId\": 3}]'"),
        "panel-zone-symbolic-icon-sizes": V("'[{\"panelId\": 1, \"left\": 16, \"center\": 16, \"right\": 16}]'"),
        "panel-zone-text-sizes": V("'[{\"panelId\": 1, \"left\": 0.9, \"center\": 0.9, \"right\": 0.9}]'"),
        "next-applet-id": V("22")
    };
}

function inject(provider) {
    CS.setDependencies({ selfUuid: SELF, settingsProvider: provider, logger: null });
}

/* ------------------------------------------------------------------ *
 * Variant codec
 * ------------------------------------------------------------------ */

suite("variant codec");

const AS_VALUE = "['panel1:right:3:cal@cinnamon.org:27', 'a:b', 'café ünicode ✓']";
const AS_ONCE = CS.variantToString(CS.parseVariant(null, AS_VALUE));
check("print of parsed as roundtrips",
    CS.variantToString(CS.parseVariant(null, AS_ONCE)) === AS_ONCE);
check("parse + print + parse is stable",
    (function () {
        const p = CS.variantToString(CS.parseVariant("as", AS_VALUE));
        return CS.variantToString(CS.parseVariant("as", p)) === p;
    })());
check("boolean roundtrip",
    CS.variantToString(CS.parseVariant("b", "true")) === "true");
check("typed parse rejects wrong type", CS.parseVariant("as", "true") === null);
check("garbage parse returns null", CS.parseVariant("as", "['unterminated") === null);
check("parse of empty string returns null", CS.parseVariant("as", "") === null);
check("variantToString of null returns null", CS.variantToString(null) === null);
check("untyped parse accepts bool", CS.parseVariant(null, "false").get_type_string() === "b");
check("untyped parse accepts int", CS.parseVariant(null, "22").get_type_string() === "i");

/* The zone-size keys also exist in an "as" shape on some Cinnamon versions
 * (one JSON object per element); the codec must move the bytes verbatim
 * either way. */
const ZONE_A = "['{\"right\": 0, \"panelId\": 1, \"left\": 0, \"center\": 0}']";
const ZONE_B = "['{\"panelId\":1,\"left\":0,\"center\":0,\"right\":0}']";
check("zone JSON roundtrips verbatim",
    CS.variantToString(CS.parseVariant("as", ZONE_A)) === ZONE_A);
check("different spacing prints differently (raw differs)",
    CS.variantToString(CS.parseVariant("as", ZONE_A)) !==
    CS.variantToString(CS.parseVariant("as", ZONE_B)));

/* ------------------------------------------------------------------ *
 * captureSettings
 * ------------------------------------------------------------------ */

suite("captureSettings");

inject(fakeProvider(baseState()));
let cap = CS.captureSettings();
eq("all panel keys captured", Object.keys(cap.cinnamonSettings).sort(), C.PANEL_SETTING_KEYS.slice().sort());
eq("no missing keys", cap.missingKeys, []);
eq("type comes from the live variant", cap.cinnamonSettings["panel-scale-text-icons"].type, "b");
eq("as type recorded", cap.cinnamonSettings["panels-enabled"].type, "as");
eq("value is verbatim print", cap.cinnamonSettings["panels-enabled"].value, "['1:0:bottom', '2:1:bottom']");
check("phantom panel 3 preserved in autohide",
    cap.cinnamonSettings["panels-autohide"].value.indexOf("'3:1'") !== -1);

const partial = baseState();
delete partial["panels-hide-delay"];
inject(fakeProvider(partial));
cap = CS.captureSettings();
eq("missing key reported", cap.missingKeys, ["panels-hide-delay"]);
check("missing key absent from capture", !cap.cinnamonSettings["panels-hide-delay"]);

inject(fakeProvider({}));
cap = CS.captureSettings();
eq("empty provider captures nothing but survives",
    { n: Object.keys(cap.cinnamonSettings).length, missing: cap.missingKeys.length },
    { n: 0, missing: C.PANEL_SETTING_KEYS.length });

/* ------------------------------------------------------------------ *
 * parseEnabledApplets
 * ------------------------------------------------------------------ */

suite("parseEnabledApplets");

let parsed = CS.parseEnabledApplets([
    "panel1:right:3:calendar@cinnamon.org:27",
    "panel1:left:0:menu@cinnamon.org:0",
    "panel2:center:0:windows-quick-list@cinnamon.org",
    "garbage",
    "panel1:middle:2:bad-zone@cinnamon.org:9",
    "panel1:left:x:nan-order@cinnamon.org:10",
    "panel9:left:0:ghost-panel@cinnamon.org:11"
]);
eq("5-field entry parsed", parsed.entries[0].instanceId, "27");
eq("id 0 kept as string", parsed.entries[1].instanceId, "0");
eq("4-field entry has null instanceId", parsed.entries[2].instanceId, null);
eq("field math", [parsed.entries[0].panelId, parsed.entries[0].zone, parsed.entries[0].order],
    [1, "right", 3]);
eq("malformed collected verbatim", parsed.malformed,
    ["garbage", "panel1:middle:2:bad-zone@cinnamon.org:9", "panel1:left:x:nan-order@cinnamon.org:10"]);
check("raw preserved verbatim on good entries",
    parsed.entries[3].raw === "panel9:left:0:ghost-panel@cinnamon.org:11");
eq("non-array input", CS.parseEnabledApplets("nope"), { entries: [], malformed: [] });
eq("empty input", CS.parseEnabledApplets([]), { entries: [], malformed: [] });

/* ------------------------------------------------------------------ *
 * parsePanelsEnabled
 * ------------------------------------------------------------------ */

suite("parsePanelsEnabled");

let panels = CS.parsePanelsEnabled(["2:1:bottom", "1:0:top", "1:0:middle", "x:0:bottom", "1:0"]);
eq("valid panels parsed", panels.panels,
    [{ id: 2, monitor: 1, position: "bottom" }, { id: 1, monitor: 0, position: "top" }]);
eq("malformed collected", panels.malformed, ["1:0:middle", "x:0:bottom", "1:0"]);
eq("non-array input survives", CS.parsePanelsEnabled(null), { panels: [], malformed: [] });

/* ------------------------------------------------------------------ *
 * canonicalizeKeyValue
 * ------------------------------------------------------------------ */

suite("canonicalizeKeyValue");

function canonEq(label, key, a, b) {
    eq(label, CS.canonicalizeKeyValue(key, a), CS.canonicalizeKeyValue(key, b));
}
function canonNe(label, key, a, b) {
    check(label, CS.canonicalizeKeyValue(key, a) !== CS.canonicalizeKeyValue(key, b));
}

canonEq("reordered panels-enabled equals same",
    "panels-enabled",
    "['1:0:bottom', '2:1:bottom']",
    "['2:1:bottom', '1:0:bottom']");
canonNe("different panels-enabled differs",
    "panels-enabled",
    "['1:0:bottom', '2:1:bottom']",
    "['1:0:bottom', '2:1:top']");
canonEq("reordered enabled-applets across zones equals same",
    "enabled-applets",
    "['panel1:left:0:menu@x:0', 'panel1:right:0:sound@x:1', 'panel2:center:0:cal@x:2']",
    "['panel2:center:0:cal@x:2', 'panel1:right:0:sound@x:1', 'panel1:left:0:menu@x:0']");
canonEq("reordered within zone (same order values) equals same",
    "enabled-applets",
    "['panel1:left:0:a@x:0', 'panel1:left:1:b@x:1']",
    "['panel1:left:1:b@x:1', 'panel1:left:0:a@x:0']");
canonNe("order change within zone differs",
    "enabled-applets",
    "['panel1:left:0:a@x:0', 'panel1:left:1:b@x:1']",
    "['panel1:left:0:b@x:1', 'panel1:left:1:a@x:0']");
canonEq("phantom entry preserved equals same",
    "panels-height",
    "['1:28', '3:31', '2:30']",
    "['3:31', '1:28', '2:30']");
canonNe("phantom entry dropped differs",
    "panels-height",
    "['1:28', '3:31', '2:30']",
    "['1:28', '2:30']");
canonEq("duplicate per-panel id collapses (last wins)",
    "panels-autohide",
    "['1:1', '3:2', '3:0', '2:1']",
    "['1:1', '2:1', '3:0']");
canonEq("zone JSON key order and spacing do not matter",
    "panel-zone-icon-sizes",
    "'[{ \"right\": 24, \"panelId\": 1, \"left\": 0, \"center\": 0 }]'",
    "'[{\"panelId\":1,\"left\":0,\"center\":0,\"right\":24}]'");
canonNe("zone JSON value change differs",
    "panel-zone-icon-sizes",
    "'[{\"panelId\":1,\"right\":24}]'",
    "'[{\"panelId\":1,\"right\":16}]'");
canonEq("zone JSON panel order does not matter",
    "panel-zone-text-sizes",
    "'[{\"panelId\":2,\"left\":0.9}, {\"panelId\":1,\"left\":0.9}]'",
    "'[{\"panelId\": 1, \"left\": 0.90}, {\"panelId\": 2, \"left\": 0.9}]'");
canonEq("zone JSON s and as shapes canonicalize alike",
    "panel-zone-icon-sizes",
    "'[{\"panelId\":1,\"left\":0},{\"panelId\":2,\"left\":0}]'",
    "['{\"left\": 0, \"panelId\": 2}', '{\"left\": 0, \"panelId\": 1}']");
canonNe("zone JSON unparseable falls back to raw (real difference)",
    "panel-zone-icon-sizes",
    "'[{broken json'",
    "'[{\"panelId\":1}]'");
check("boolean value passes through",
    CS.canonicalizeKeyValue("panel-scale-text-icons", "true") === "true");
check("unparseable as passes through verbatim",
    CS.canonicalizeKeyValue("panels-height", "not-a-variant") === "not-a-variant");
canonEq("malformed enabled-applets sorted deterministically",
    "enabled-applets",
    "['zz-garbage', 'panel1:left:0:a@x:0', 'aa-garbage']",
    "['aa-garbage', 'zz-garbage', 'panel1:left:0:a@x:0']");

/* Canonical output must itself parse back: verification compares canonical
 * strings built from both live and stored print forms. */
check("canonical panels-enabled reparses as as",
    (function () {
        const v = CS.parseVariant("as", CS.canonicalizeKeyValue("panels-enabled",
            "['1:0:bottom', '2:1:bottom']"));
        return v !== null && v.get_strv().length === 2;
    })());
check("canonical enabled-applets with quotes reparses",
    CS.parseVariant("as", CS.canonicalizeKeyValue("enabled-applets",
        "['panel1:left:0:quo\\'te@x:0']")) !== null);

/* ------------------------------------------------------------------ *
 * restore phases and verifyAgainst
 * ------------------------------------------------------------------ */

suite("restore and verify");

inject(fakeProvider(baseState()));
cap = CS.captureSettings();

/* Snapshot captured on a fuller schema than the live one: the stored
 * panels-hide-delay must be skipped with a warning, not an error. */
const liveState = baseState();
delete liveState["panels-hide-delay"];
inject(fakeProvider(liveState));
let restored = CS.restoreSettingsExceptEnabledApplets(cap);
check("restore succeeds with missing live key", restored.ok);
check("missing live key warns", restored.warnings.some(function (w) {
    return w.indexOf("panels-hide-delay") !== -1;
}));

const strictProvider = fakeProvider(baseState(), { failWrites: ["panels-height"] });
inject(strictProvider);
restored = CS.restoreSettingsExceptEnabledApplets(cap);
check("failed write flips ok", !restored.ok);
check("failed write warns", restored.warnings.some(function (w) {
    return w.indexOf("panels-height") !== -1;
}));

const corruptProvider = fakeProvider(baseState(), { corruptReadback: "panels-autohide" });
inject(corruptProvider);
restored = CS.restoreSettingsExceptEnabledApplets(cap);
check("readback mismatch flips ok", !restored.ok);
check("readback mismatch warns", restored.warnings.some(function (w) {
    return w.indexOf("panels-autohide") !== -1;
}));

/* Write ordering: panels-enabled last, everything else before it. */
(function () {
    const provider = fakeProvider(baseState());
    inject(provider);
    CS.restoreSettingsExceptEnabledApplets(cap);
    eq("panels-enabled written last", provider.writes[provider.writes.length - 1], "panels-enabled");
    check("enabled-applets not written", provider.writes.indexOf("enabled-applets") === -1);
    check("every other captured key written",
        provider.writes.length === Object.keys(cap.cinnamonSettings).length - 1);
})();

/* A provider without list_keys: the schema check falls back to catching
 * the write error, and a missing key still counts as skipped, not failed. */
(function () {
    const provider = fakeProvider(baseState());
    delete provider.list_keys;
    delete provider._values["panels-show-delay"];
    inject(provider);
    const verdict = CS.restoreSettingsExceptEnabledApplets(cap);
    check("no-list_keys provider still restores", verdict.ok);
    check("missing key skipped with warning via write error",
        verdict.warnings.some(function (w) {
            return w.indexOf("panels-show-delay") !== -1;
        }));
    check("other keys were written", provider.writes.length >= 8);
})();

/* restoreEnabledApplets: exactly one write of the stored value. */
(function () {
    const provider = fakeProvider(baseState());
    inject(provider);
    check("restoreEnabledApplets returns true", CS.restoreEnabledApplets(cap) === true);
    eq("single write", provider.writes, ["enabled-applets"]);
    eq("stored value written verbatim",
        CS.variantToString(provider._values["enabled-applets"]),
        cap.cinnamonSettings["enabled-applets"].value);
    check("restoreEnabledApplets without stored key returns false",
        CS.restoreEnabledApplets({ cinnamonSettings: {} }) === false);
})();

/* verifyAgainst. */
(function () {
    const provider = fakeProvider(baseState());
    inject(provider);
    let verdict = CS.verifyAgainst(cap);
    check("identical state verifies", verdict.ok && verdict.mismatchedKeys.length === 0);

    provider._values["panels-height"] = V("['1:40', '2:30']");
    verdict = CS.verifyAgainst(cap);
    eq("changed key mismatches", verdict.mismatchedKeys, ["panels-height"]);

    /* Reordered-but-equal live value must still verify. */
    provider._values["panels-height"] = V("['2:30', '1:28']");
    verdict = CS.verifyAgainst(cap);
    check("reordered equal value verifies", verdict.ok);

    delete provider._values["panel-zone-text-sizes"];
    verdict = CS.verifyAgainst(cap);
    check("key missing live warns not mismatches",
        verdict.ok === true && verdict.mismatchedKeys.length === 0 &&
        verdict.warnings.some(function (w) {
            return w.indexOf("panel-zone-text-sizes") !== -1;
        }));

    check("verifyAgainst with no snapshot fails closed",
        CS.verifyAgainst(null).ok === false);
})();

/* ------------------------------------------------------------------ *
 * ensureManagerAnchor
 * ------------------------------------------------------------------ */

suite("ensureManagerAnchor");

/* Already present: no-op. */
(function () {
    const state = {
        enabledApplets: ["panel1:left:0:menu@x:0", "panel1:right:5:" + SELF + ":21"],
        panelsEnabled: ["1:0:bottom", "2:1:bottom"],
        nextAppletId: 22,
        primaryMonitorIndex: 0
    };
    const out = CS.ensureManagerAnchor(state);
    eq("present: entries unchanged", out.enabledApplets, state.enabledApplets);
    eq("present: panels unchanged", out.panelsEnabled, state.panelsEnabled);
    eq("present: no allocation", out.allocatedId, null);
    eq("present: counter unchanged", out.nextAppletId, 22);
    check("present: not repaired", out.repaired === false);
    eq("present: inputs not mutated",
        [state.enabledApplets.length, state.panelsEnabled.length], [2, 2]);
})();

/* Duplicate self entries (including byte-identical copies) collapse. */
(function () {
    const state = {
        enabledApplets: [
            "panel1:right:5:" + SELF + ":21",
            "panel2:right:0:" + SELF + ":21",
            "panel1:right:5:" + SELF + ":21",
            "panel1:left:0:menu@x:0"
        ],
        panelsEnabled: ["1:0:bottom", "2:1:bottom"],
        nextAppletId: 22,
        primaryMonitorIndex: 0
    };
    const out = CS.ensureManagerAnchor(state);
    eq("duplicates collapse to first valid",
        out.enabledApplets,
        ["panel1:right:5:" + SELF + ":21", "panel1:left:0:menu@x:0"]);
    check("duplicates repaired", out.repaired === true);
    check("no new id allocated on collapse", out.allocatedId === null);
})();

/* Self entry on a dead panel is dropped and a new one synthesized. */
(function () {
    const state = {
        enabledApplets: ["panel9:right:0:" + SELF + ":7"],
        panelsEnabled: ["1:0:bottom"],
        nextAppletId: 8,
        primaryMonitorIndex: 0
    };
    const out = CS.ensureManagerAnchor(state);
    eq("dead-panel entry replaced",
        out.enabledApplets, ["panel1:right:0:" + SELF + ":8"]);
    eq("dead-panel: id allocated", out.allocatedId, "8");
    eq("dead-panel: counter bumped", out.nextAppletId, 9);
})();

/* Absent: synthesized on the lowest panel id on the primary monitor. */
(function () {
    const state = {
        enabledApplets: [
            "panel2:left:0:menu@x:15",
            "panel1:right:0:sound@x:3",
            "panel1:right:2:cal@x:13"
        ],
        panelsEnabled: ["2:1:bottom", "1:0:bottom"],
        nextAppletId: 22,
        primaryMonitorIndex: 0
    };
    const out = CS.ensureManagerAnchor(state);
    eq("synthesized on primary panel, right zone, order max+1",
        out.enabledApplets[out.enabledApplets.length - 1],
        "panel1:right:3:" + SELF + ":22");
    eq("allocated from max(maxNumericId, nextAppletId)", out.allocatedId, "22");
    eq("counter bumped past allocation", out.nextAppletId, 23);
    check("absent anchor repaired", out.repaired === true);
})();

/* Absent with counter already above every id: forward-only allocation. */
(function () {
    const state = {
        enabledApplets: ["panel1:right:0:sound@x:3"],
        panelsEnabled: ["1:0:bottom"],
        nextAppletId: 30,
        primaryMonitorIndex: 0
    };
    const out = CS.ensureManagerAnchor(state);
    eq("allocated id honours counter", out.allocatedId, "30");
    eq("counter never lowered", out.nextAppletId, 31);
})();

/* No panel on the primary monitor: fall back to monitor 0. */
(function () {
    const state = {
        enabledApplets: [],
        panelsEnabled: ["1:1:bottom", "2:0:bottom"],
        nextAppletId: 5,
        primaryMonitorIndex: 1
    };
    /* Monitor 1 has only panel 1, monitor 0 has panel 2: primary pick wins. */
    let out = CS.ensureManagerAnchor(state);
    eq("primary monitor panel preferred",
        out.enabledApplets, ["panel1:right:0:" + SELF + ":5"]);
    /* Swap: primary monitor has nothing, monitor 0 does. */
    state.panelsEnabled = ["1:1:bottom", "2:0:bottom"];
    state.primaryMonitorIndex = 0;
    state.nextAppletId = 5;
    /* Monitor 0 holds panel 2 only -> synthesized there. */
    out = CS.ensureManagerAnchor(state);
    eq("monitor 0 fallback",
        out.enabledApplets, ["panel2:right:0:" + SELF + ":5"]);
})();

/* Empty panels-enabled: a panel is appended and used. */
(function () {
    const state = {
        enabledApplets: [],
        panelsEnabled: [],
        nextAppletId: 4,
        primaryMonitorIndex: 1
    };
    const out = CS.ensureManagerAnchor(state);
    eq("panel appended", out.panelsEnabled, ["1:1:bottom"]);
    eq("anchor on the new panel",
        out.enabledApplets, ["panel1:right:0:" + SELF + ":4"]);
    eq("counter bumped", out.nextAppletId, 5);
    check("empty repaired", out.repaired === true);
})();

check("null state returns failure shape",
    CS.ensureManagerAnchor(null).repaired === false);
eq("missing arrays tolerated",
    CS.ensureManagerAnchor({ nextAppletId: 3, primaryMonitorIndex: 0 }).panelsEnabled,
    ["1:0:bottom"]);

CS.resetDependencies();

/* ------------------------------------------------------------------ *
 * next-applet-id allocator
 * ------------------------------------------------------------------ */

suite("next-applet-id");

(function () {
    const provider = fakeProvider({ "next-applet-id": V("22") });
    inject(provider);
    eq("read", CS.readNextAppletId(), 22);
    check("bump up writes and succeeds", CS.bumpNextAppletId(30) === true);
    eq("bumped value stored", CS.readNextAppletId(), 30);
    check("bump down is a no-op success", CS.bumpNextAppletId(10) === true);
    eq("value never lowered", CS.readNextAppletId(), 30);
    eq("only the counter was written", provider.writes, ["next-applet-id"]);
    check("non-numeric bump refused", CS.bumpNextAppletId("soon") === false);

    const broken = fakeProvider({});
    inject(broken);
    eq("missing key reads 0", CS.readNextAppletId(), 0);
})();

CS.resetDependencies();

/* ------------------------------------------------------------------ *
 * fingerprint
 * ------------------------------------------------------------------ */

suite("fingerprint");

FP.setDependencies({
    canonicalize: CS.fingerprintSettingsPart,
    sha256: AF.sha256Hex
});

(function () {
    const provider = fakeProvider(baseState());
    inject(provider);
    const snap = CS.captureSettings();
    const hashes = ["bbbb", "aaaa", "cccc"];

    const fp1 = FP.computeFingerprint(snap, hashes);
    check("fingerprint is a 64-char hex sha256", /^[0-9a-f]{64}$/.test(fp1));
    eq("same state and hashes give same fingerprint",
        FP.computeFingerprint(snap, hashes.slice()), fp1);
    eq("config hash order does not matter",
        FP.computeFingerprint(snap, ["cccc", "aaaa", "bbbb"]), fp1);
    check("one changed config hash differs",
        FP.computeFingerprint(snap, ["bbbb", "aaaa", "XXcc"]) !== fp1);
    check("one dropped config hash differs",
        FP.computeFingerprint(snap, ["bbbb", "aaaa"]) !== fp1);

    /* Same settings, different live print formatting (reordered arrays):
     * the canonical part absorbs it. */
    provider._values["panels-autohide"] = V("['3:1', '1:1', '2:1']");
    const reordered = CS.captureSettings();
    eq("reordered live state fingerprints the same",
        FP.computeFingerprint(reordered, hashes), fp1);

    provider._values["panels-height"] = V("['1:40', '2:30']");
    const changed = CS.captureSettings();
    check("changed settings differ",
        FP.computeFingerprint(changed, hashes) !== fp1);

    /* No configs: digest covers the canonical part alone, no separator. */
    eq("empty config set equals sha of canonical part",
        FP.computeFingerprint(snap, []),
        AF.sha256Hex(CS.fingerprintSettingsPart(snap)));
    check("canonical part is not the empty string",
        CS.fingerprintSettingsPart(snap).length > 0);
})();

FP.resetDependencies();
eq("no dependencies give empty fingerprint", FP.computeFingerprint({}, []), "");

/* ------------------------------------------------------------------ *
 * profileSchema
 * ------------------------------------------------------------------ */

suite("profileSchema");

function validProfile() {
    return {
        schemaVersion: 1,
        id: "0cf48e773-22c4-4cf6-a836-b13f7e6a4cb9",
        name: "VM Two Screens",
        description: "",
        createdAt: "2026-08-19T20:00:00-07:00",
        updatedAt: "2026-08-19T20:00:00-07:00",
        environment: { cinnamonVersion: "6.6.9", sessionType: "x11" },
        monitorTopology: {
            expectedCount: 2,
            monitors: [
                { savedIndex: 0, primary: true, x: 0, y: 0, width: 1920, height: 1080, scale: 1 },
                { savedIndex: 1, primary: false, x: 1920, y: 0, width: 1920, height: 1080, scale: 1 }
            ]
        },
        cinnamonSettings: {
            "panels-enabled": { type: "as", value: "['1:0:bottom', '2:1:bottom']" },
            "enabled-applets": { type: "as", value: "[]" }
        },
        appletConfigs: [
            { uuid: "calendar@cinnamon.org", instanceId: "17",
              relativePath: "calendar@cinnamon.org/17.json", sha256: "ab", content: "{}" }
        ],
        managerAnchor: { uuid: C.selfUuid(), required: true }
    };
}

C.setDependencies({ selfUuid: SELF });
check("valid profile passes", PS.validate(validProfile()).ok);
eq("valid profile has no errors", PS.validate(validProfile()).errors, []);

function failsWith(label, mutate) {
    const profile = validProfile();
    mutate(profile);
    const verdict = PS.validate(profile);
    check(label, verdict.ok === false && verdict.errors.length > 0);
}

failsWith("missing schemaVersion fails", p => { delete p.schemaVersion; });
failsWith("future schemaVersion fails", p => { p.schemaVersion = C.SCHEMA_VERSION + 1; });
failsWith("missing id fails", p => { delete p.id; });
failsWith("empty id fails", p => { p.id = ""; });
failsWith("missing name fails", p => { delete p.name; });
failsWith("blank name fails", p => { p.name = "   "; });
failsWith("overlong name fails", p => { p.name = "x".repeat(C.PROFILE_NAME_MAX + 1); });
failsWith("missing createdAt fails", p => { delete p.createdAt; });
failsWith("non-string updatedAt fails", p => { p.updatedAt = 42; });
failsWith("expectedCount 0 fails", p => { p.monitorTopology.expectedCount = 0; });
failsWith("non-integer expectedCount fails", p => { p.monitorTopology.expectedCount = 1.5; });
failsWith("missing monitors array fails", p => { delete p.monitorTopology.monitors; });
failsWith("missing monitorTopology fails", p => { delete p.monitorTopology; });
failsWith("missing cinnamonSettings fails", p => { delete p.cinnamonSettings; });
failsWith("missing panels-enabled fails", p => { delete p.cinnamonSettings["panels-enabled"]; });
failsWith("missing enabled-applets fails", p => { delete p.cinnamonSettings["enabled-applets"]; });
failsWith("appletConfigs not an array fails", p => { p.appletConfigs = {}; });
failsWith("appletConfig without content fails",
    p => { delete p.appletConfigs[0].content; });
failsWith("appletConfig with non-string uuid fails",
    p => { p.appletConfigs[0].uuid = 7; });
failsWith("managerAnchor uuid mismatch fails",
    p => { p.managerAnchor = { uuid: "other@x", required: true }; });
check("null profile fails", PS.validate(null).ok === false);
check("array profile fails", PS.validate([1, 2]).ok === false);

check("name at the cap still passes", PS.validate(validProfile()).ok &&
    (function () {
        const p = validProfile();
        p.name = "y".repeat(C.PROFILE_NAME_MAX);
        return PS.validate(p).ok;
    })());

(function () {
    const p = validProfile();
    delete p.managerAnchor;
    const verdict = PS.validate(p);
    check("missing anchor warns only", verdict.ok === true &&
        verdict.warnings.some(function (w) { return w.indexOf("managerAnchor") !== -1; }));
})();

(function () {
    const p = validProfile();
    /* Note: ".." segments pass the shape check by design (the character
     * class allows dots); containment is enforced at resolution time in
     * appletConfigStore. Only structurally wrong shapes warn here. */
    p.appletConfigs[0].relativePath = "calendar@cinnamon.org/sub/17.json";
    const verdict = PS.validate(p);
    check("bad relativePath warns only", verdict.ok === true &&
        verdict.warnings.some(function (w) { return w.indexOf("relativePath") !== -1; }));
})();

eq("sanitizeName trims", PS.sanitizeName("  spaced  "), "spaced");
eq("sanitizeName rejects empty", PS.sanitizeName("   "), null);
eq("sanitizeName rejects non-string", PS.sanitizeName(5), null);
eq("sanitizeName rejects overlong",
    PS.sanitizeName("z".repeat(C.PROFILE_NAME_MAX + 1)), null);
check("newProfileId gives uuid-shaped strings",
    /^[0-9a-f-]{36}$/.test(PS.newProfileId()));
check("newProfileId is random", PS.newProfileId() !== PS.newProfileId());

/* migrate */
(function () {
    const original = validProfile();
    const result = PS.migrate(original);
    eq("v1 migrate is identity", result.profile, original);
    eq("v1 migrate is quiet", result.warnings, []);
    check("migrate deep-clones", result.profile !== original);
    check("migrate clone is detached",
        (result.profile.name = "changed") && original.name === "VM Two Screens");
})();

(function () {
    const noVersion = validProfile();
    delete noVersion.schemaVersion;
    const result = PS.migrate(noVersion);
    eq("missing version assumed 1", result.profile.schemaVersion, 1);
    check("missing version warns", result.warnings.length === 1);
    check("input not mutated", noVersion.schemaVersion === undefined);
})();

(function () {
    const future = validProfile();
    future.schemaVersion = 99;
    const result = PS.migrate(future);
    eq("future version passes through unchanged", result.profile, future);
    check("future version warns", result.warnings.length === 1);
})();

eq("migrate of non-object passes through with warning",
    PS.migrate(42).profile, 42);
check("migrate of null survives", PS.migrate(null).warnings.length >= 1);

C.resetDependencies();
PS.resetDependencies();

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
