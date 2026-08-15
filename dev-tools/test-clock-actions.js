#!/usr/bin/env gjs
/* global imports, print */
/**
 * Headless unit tests for clockActions.js.
 *
 * St/Clutter cannot be instantiated outside the Cinnamon process (libst.so is
 * not on the loader path), so this harness covers only the pure helpers:
 * layout maths and clock-list mutations. Widget behaviour is verified live.
 *
 * Usage:  gjs dev-tools/test-clock-actions.js
 * Exits non-zero if any assertion fails.
 */

const System = imports.system;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const SCRIPT_DIR = GLib.path_get_dirname(
    Gio.File.new_for_commandline_arg(System.programInvocationName).get_path());
const REPO_ROOT = GLib.path_get_dirname(SCRIPT_DIR);
const DESKLET_DIR = REPO_ROOT + "/cinnamon-world-clock-desklet@curbsoftware";

imports.searchPath.unshift(DESKLET_DIR);
const CA = imports.clockActions;

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

let seq = 0;
function nextId() {
    seq++;
    return "id-" + seq;
}

function ids(opts) {
    opts = opts || {};
    opts.generateId = opts.generateId || nextId;
    return opts;
}

function clock(id, name, timezone) {
    return { id: id, name: name, timezone: timezone };
}

/* ------------------------------------------------------------------ *
 * computeGridDims
 * ------------------------------------------------------------------ */

suite("computeGridDims (auto, near-square)");
eq("1 cell",  CA.computeGridDims(1,  "auto"), { rows: 1, cols: 1 });
eq("2 cells", CA.computeGridDims(2,  "auto"), { rows: 1, cols: 2 });
eq("3 cells", CA.computeGridDims(3,  "auto"), { rows: 2, cols: 2 });
eq("4 cells", CA.computeGridDims(4,  "auto"), { rows: 2, cols: 2 });
eq("5 cells", CA.computeGridDims(5,  "auto"), { rows: 2, cols: 3 });
eq("9 cells", CA.computeGridDims(9,  "auto"), { rows: 3, cols: 3 });
eq("10 cells", CA.computeGridDims(10, "auto"), { rows: 3, cols: 4 });
eq("17 cells", CA.computeGridDims(17, "auto"), { rows: 4, cols: 5 });
eq("36 cells", CA.computeGridDims(36, "auto"), { rows: 6, cols: 6 });

suite("computeGridDims (guards)");
eq("0 cells clamps to 1",      CA.computeGridDims(0,  "auto"), { rows: 1, cols: 1 });
eq("negative clamps to 1",     CA.computeGridDims(-5, "auto"), { rows: 1, cols: 1 });
eq("undefined clamps to 1",    CA.computeGridDims(undefined, "auto"), { rows: 1, cols: 1 });
eq("NaN clamps to 1",          CA.computeGridDims(NaN, "auto"), { rows: 1, cols: 1 });

suite("computeGridDims (fixed)");
eq("2x3 honoured",             CA.computeGridDims(10, "fixed", 2, 3), { rows: 2, cols: 3 });
eq("rows 0 clamps to 1",       CA.computeGridDims(10, "fixed", 0, 3), { rows: 1, cols: 3 });
eq("undefined dims clamp to 1", CA.computeGridDims(10, "fixed"),      { rows: 1, cols: 1 });
eq("string dims parsed",       CA.computeGridDims(10, "fixed", "3", "4"), { rows: 3, cols: 4 });

/* ------------------------------------------------------------------ *
 * planCells
 * ------------------------------------------------------------------ */

function kinds(cells) {
    return cells.map(function (c) { return c.kind === "add" ? "+" : String(c.index); }).join(",");
}

suite("planCells (no add tile)");
eq("exact fit",        kinds(CA.planCells(4, false, 2, 2)), "0,1,2,3");
eq("under capacity",   kinds(CA.planCells(2, false, 2, 2)), "0,1");
eq("truncates",        kinds(CA.planCells(10, false, 2, 2)), "0,1,2,3");
eq("zero clocks",      kinds(CA.planCells(0, false, 2, 2)), "");
check("kind is clock", CA.planCells(1, false, 1, 1)[0].kind === "clock");

suite("planCells (with add tile)");
eq("exact fit keeps +",   kinds(CA.planCells(3, true, 2, 2)), "0,1,2,+");
eq("under capacity",      kinds(CA.planCells(2, true, 2, 2)), "0,1,+");
eq("truncates, + last",   kinds(CA.planCells(10, true, 2, 2)), "0,1,2,+");
eq("1x1 grid is + only",  kinds(CA.planCells(10, true, 1, 1)), "+");
eq("zero clocks",         kinds(CA.planCells(0, true, 2, 2)), "+");
eq("bad dims clamp",      kinds(CA.planCells(5, true, 0, 0)), "+");

/* ------------------------------------------------------------------ *
 * buildClock / normalize
 * ------------------------------------------------------------------ */

suite("buildClock");
seq = 0;
eq("defaults timezone", CA.buildClock({ name: "Tokyo" }, null, ids()),
    clock("id-1", "Tokyo", "local"));
seq = 0;
eq("trims fields", CA.buildClock({ name: "  LA  ", timezone: "  America/Los_Angeles  " }, "keep", ids()),
    clock("keep", "LA", "America/Los_Angeles"));
seq = 0;
eq("replaces default id", CA.buildClock({ name: "A", timezone: "local" }, "default", ids()),
    clock("id-1", "A", "local"));
seq = 0;
eq("empty values", CA.buildClock({}, null, ids()),
    clock("id-1", "", "local"));

suite("normalizeClockEntry");
seq = 0;
let n = CA.normalizeClockEntry({
    id: "abc",
    name: "Tokyo",
    timezone: "Asia/Tokyo",
    timeFormat: "%H:%M",
    timeSize: 40
}, ids());
check("strips legacy fields", n.changed === true);
eq("keeps id/name/timezone", n.clock, clock("abc", "Tokyo", "Asia/Tokyo"));

seq = 0;
n = CA.normalizeClockEntry({ id: "default", name: "Local", timezone: "local" }, ids());
check("default id is replaced", n.changed === true);
eq("new id assigned", n.clock, clock("id-1", "Local", "local"));

seq = 0;
n = CA.normalizeClockEntry({ id: "abc", name: "Local", timezone: "local" }, ids());
check("already slim is unchanged", n.changed === false);

suite("normalizeClockList");
seq = 0;
let list = CA.normalizeClockList([], ids());
check("empty list is changed", list.changed === true);
eq("empty becomes one default", list.clocks, [clock("id-1", "Local", "local")]);

seq = 0;
list = CA.normalizeClockList(null, ids());
check("null list is changed", list.changed === true);
eq("null becomes one default", list.clocks, [clock("id-1", "Local", "local")]);

seq = 0;
list = CA.normalizeClockList([
    { id: "a", name: "Local", timezone: "local" },
    { id: "b", name: "Tokyo", timezone: "Asia/Tokyo", dateSize: 15 }
], ids());
check("legacy field marks changed", list.changed === true);
eq("two clocks slimmed", list.clocks, [
    clock("a", "Local", "local"),
    clock("b", "Tokyo", "Asia/Tokyo")
]);

/* ------------------------------------------------------------------ *
 * canAdd / canRemove / isValidIndex
 * ------------------------------------------------------------------ */

suite("canAdd / canRemove");
check("canRemove false at 1 clock", CA.canRemove([clock("a", "Local", "local")]) === false);
check("canAdd true at 1 clock", CA.canAdd([clock("a", "Local", "local")]) === true);
check("canRemove true at 2 clocks", CA.canRemove([
    clock("a", "Local", "local"),
    clock("b", "Tokyo", "Asia/Tokyo")
]) === true);
check("MAX_CLOCKS is 36", CA.MAX_CLOCKS === 36);

let many = [];
for (let i = 0; i < 36; i++)
    many.push(clock("c" + i, "N", "local"));
check("canAdd false at 36 clocks", CA.canAdd(many) === false);

suite("isValidIndex");
const two = [clock("a", "A", "local"), clock("b", "B", "local")];
check("0 valid", CA.isValidIndex(two, 0) === true);
check("1 valid", CA.isValidIndex(two, 1) === true);
check("2 out of range", CA.isValidIndex(two, 2) === false);
check("-1 out of range", CA.isValidIndex(two, -1) === false);
check("non-integer rejected", CA.isValidIndex(two, 1.5) === false);
check("undefined rejected", CA.isValidIndex(two, undefined) === false);

/* ------------------------------------------------------------------ *
 * add / update / remove
 * ------------------------------------------------------------------ */

suite("addClock");
seq = 0;
let clocks = [clock("a", "Local", "local")];
eq("appends", CA.addClock(clocks, { name: "Tokyo", timezone: "Asia/Tokyo" }, ids()), [
    clock("a", "Local", "local"),
    clock("id-1", "Tokyo", "Asia/Tokyo")
]);
eq("original unchanged", clocks, [clock("a", "Local", "local")]);

seq = 0;
eq("refuses at max", CA.addClock(many, { name: "X", timezone: "local" }, ids()), many);

suite("updateClock");
clocks = [
    clock("a", "Local", "local"),
    clock("b", "Tokyo", "Asia/Tokyo")
];
eq("updates matching id", CA.updateClock(clocks, "b", { name: "Japan", timezone: "Asia/Tokyo" }), [
    clock("a", "Local", "local"),
    clock("b", "Japan", "Asia/Tokyo")
]);
eq("unknown id is a copy", CA.updateClock(clocks, "missing", { name: "X", timezone: "local" }), clocks);
eq("empty timezone becomes local", CA.updateClock(clocks, "a", { name: "Home", timezone: "" }), [
    clock("a", "Home", "local"),
    clock("b", "Tokyo", "Asia/Tokyo")
]);

suite("removeClock");
clocks = [
    clock("a", "Local", "local"),
    clock("b", "Tokyo", "Asia/Tokyo")
];
eq("removes by id", CA.removeClock(clocks, "b"), [clock("a", "Local", "local")]);
eq("original unchanged", clocks, [
    clock("a", "Local", "local"),
    clock("b", "Tokyo", "Asia/Tokyo")
]);
eq("refuses last clock", CA.removeClock([clock("a", "Local", "local")], "a"), [
    clock("a", "Local", "local")
]);
eq("unknown id is a copy", CA.removeClock(clocks, "missing"), clocks);

suite("getClockLabel");
eq("prefers name", CA.getClockLabel(clock("a", "Tokyo", "Asia/Tokyo")), "Tokyo");
eq("falls back to timezone", CA.getClockLabel(clock("a", "", "Asia/Tokyo")), "Tokyo");
eq("falls back to Clock", CA.getClockLabel({}), "Clock");
eq("falls back to city name", CA.getClockLabel(clock("a", "", "America/Los_Angeles")), "Los Angeles");

suite("timezone labels");
eq("local display", CA.timezoneDisplayName("local"), "Local");
eq("city from id", CA.timezoneDisplayName("America/Los_Angeles"), "Los Angeles");
eq("nested city", CA.timezoneDisplayName("America/Argentina/Buenos_Aires"), "Buenos Aires");
eq("local list label", CA.timezoneListLabel("local"), "Local (system timezone)");
check("list label includes id", CA.timezoneListLabel("Asia/Tokyo").indexOf("Asia/Tokyo") !== -1);

suite("listTimezones / filterTimezones");
let zones = CA.listTimezones();
check("starts with local", zones[0] === "local");
check("has more than local", zones.length > 1);
check("includes Tokyo or fallback", zones.indexOf("Asia/Tokyo") !== -1);
eq("empty query keeps all", CA.filterTimezones(["local", "Asia/Tokyo"], "").length, 2);
eq("filters by city", CA.filterTimezones(["local", "Asia/Tokyo", "Europe/London"], "tokyo"), ["Asia/Tokyo"]);
eq("filters by region", CA.filterTimezones(["local", "America/Los_Angeles"], "america"), ["America/Los_Angeles"]);
eq("local matches system", CA.filterTimezones(["local", "UTC"], "system"), ["local"]);

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
