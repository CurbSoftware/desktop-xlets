#!/usr/bin/env node
/**
 * tests/test-tz.js
 *
 * Node tests for the KDE world clock's pure JS: the tz.js lookup on
 * the generated table (cross-checked against Node's own Intl with its
 * full timezone database) and the format.js helpers.
 *
 * QML libraries carry .pragma and .import lines Node cannot parse, so
 * they are stripped before evaluation.
 *
 * Usage:  node kde-world-clock/tests/test-tz.js
 * Exits non-zero if any assertion fails.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const LIB = path.join(__dirname, "..", "contents", "ui", "lib");

function loadTz() {
    const source = fs.readFileSync(path.join(LIB, "tz.js"), "utf8")
        .replace(/^.pragma library.*$/m, "")
        .replace(/^.import\s+"tzdata.js"\s+as\s+TZData.*$/m, "");
    const tzdataSource = fs.readFileSync(path.join(LIB, "tzdata.js"), "utf8");
    const sandbox = vm.createContext({ console });
    vm.runInContext(tzdataSource, sandbox);
    // Rebuild what the stripped .import provided: the namespace object.
    vm.runInContext(
        "var TZData = { TZ_TABLE: TZ_TABLE, TZ_ALIASES: TZ_ALIASES };", sandbox);
    vm.runInContext(source + "\nthis.TZ = { offsetFor, wallDate, nextTransition, isValid, displayName, canonical };", sandbox);
    return sandbox.TZ;
}

function loadFormat() {
    const source = fs.readFileSync(path.join(LIB, "format.js"), "utf8")
        .replace(/^.pragma library.*$/m, "");
    const sandbox = vm.createContext({ console });
    vm.runInContext(source + "\nthis.Fmt = { strftime, parseClocks, gridColumns, commonZones };", sandbox);
    return sandbox.Fmt;
}

const TZ = loadTz();
const Fmt = loadFormat();

let passed = 0;
const failures = [];

function check(label, condition, detail) {
    if (condition) {
        passed++;
        console.log("  OK   " + label);
    } else {
        failures.push(label + (detail ? ": " + detail : ""));
        console.log("  FAIL " + label + (detail ? ": " + detail : ""));
    }
}

function eq(label, actual, expected) {
    check(label, JSON.stringify(actual) === JSON.stringify(expected),
        "got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected));
}

/* ------------------------------------------------------------------ */

console.log("* table presence and lookup");

check("table is generated", TZ.offsetFor("America/New_York", 0) !== undefined);
eq("unknown zone is null", TZ.offsetFor("Mars/Olympus_Mons", 0), null);
check("alias resolves", TZ.offsetFor("US/Eastern", 0) === TZ.offsetFor("America/New_York", 0));
check("local resolves through the system clock",
    TZ.offsetFor("local", 1770000000) ===
    -new Date(1770000000000).getTimezoneOffset() * 60);
const localWall = TZ.wallDate("local", Date.UTC(2026, 5, 15, 18, 30, 0));
const directLocal = new Date(Date.UTC(2026, 5, 15, 18, 30, 0));
eq("local wall clock matches local getters",
   [localWall.getUTCHours(), localWall.getUTCMinutes()],
   [directLocal.getHours(), directLocal.getMinutes()]);

console.log("* offsets cross-checked against Intl");

function intlOffset(zone, epochSeconds) {
    // Intl formats in the zone; derive the offset from a round trip.
    const date = new Date(epochSeconds * 1000);
    const formatted = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false
    }).formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    const asUTC = Date.UTC(Number(formatted.year), Number(formatted.month) - 1,
        Number(formatted.day), Number(formatted.hour) % 24,
        Number(formatted.minute), Number(formatted.second));
    return Math.round((asUTC - epochSeconds * 1000) / 1000);
}

const PROBE_ZONES = [
    "America/New_York", "Europe/Berlin", "Pacific/Kiritimati",
    "Australia/Lord_Howe", "Asia/Kolkata", "UTC", "Pacific/Apia"
];
const PROBES = [];
for (let year = 2025; year <= 2027; year++)
    for (const [month, day] of [[0, 15], [2, 20], [6, 15], [9, 15], [11, 15]])
        PROBES.push(Math.floor(Date.UTC(year, month, day, 12, 0, 0) / 1000));

for (const zone of PROBE_ZONES) {
    let mismatches = 0;
    for (const epoch of PROBES) {
        if (TZ.offsetFor(zone, epoch) !== intlOffset(zone, epoch))
            mismatches++;
    }
    check(zone + " matches Intl at " + PROBES.length + " probes", mismatches === 0);
}

console.log("* wall clock");

const wall = TZ.wallDate("America/New_York", Date.UTC(2026, 5, 15, 18, 30, 0));
eq("New York wall clock at 18:30 UTC", wall.toISOString(), "2026-06-15T14:30:00.000Z");
const wallTokyo = TZ.wallDate("Asia/Tokyo", Date.UTC(2026, 5, 15, 18, 30, 0));
eq("Tokyo wall clock at 18:30 UTC", wallTokyo.toISOString(), "2026-06-16T03:30:00.000Z");

console.log("* formatter");

const d = new Date(Date.UTC(2026, 11, 27, 23, 59, 9));
eq("time", Fmt.strftime(d, "%H:%M:%S"), "23:59:09");
eq("12h clock", Fmt.strftime(d, "%I:%M %p"), "11:59 PM");
eq("date", Fmt.strftime(d, "%A, %e %B"), "Sunday, 27 December");
eq("short date", Fmt.strftime(d, "%a %d %b %y"), "Sun 27 Dec 26");
eq("unknown specifier survives", Fmt.strftime(d, "%q"), "%q");
eq("percent escape", Fmt.strftime(d, "100%%"), "100%");

console.log("* clock list parsing");

eq("empty json yields one local clock",
   Fmt.parseClocks(""),
   [{ id: "default", name: "Local", timezone: "local" }]);
eq("garbage json yields one local clock",
   Fmt.parseClocks("{oops"),
   [{ id: "default", name: "Local", timezone: "local" }]);
eq("keeps valid entries and fills gaps",
   Fmt.parseClocks('[{"name":"Tokyo","timezone":"Asia/Tokyo"},null,{"name":"X"}]'),
   [
       { id: "clock-0", name: "Tokyo", timezone: "Asia/Tokyo" },
       { id: "clock-2", name: "X", timezone: "local" }
   ]);

console.log("* grid columns");

eq("1 clock", Fmt.gridColumns(1), 1);
eq("3 clocks", Fmt.gridColumns(3), 2);
eq("9 clocks", Fmt.gridColumns(9), 3);
eq("bad count", Fmt.gridColumns("x"), 1);

console.log("");
if (failures.length) {
    for (const failure of failures)
        console.log("FAIL " + failure);
    console.log(passed + " passed, " + failures.length + " FAILED");
    process.exit(1);
}
console.log(passed + " passed, 0 failed");
