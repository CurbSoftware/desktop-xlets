/* Node headless tests for clockActions.js (no St/Clutter). */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = path.join(__dirname, "..", "clockActions.js");
const code = fs.readFileSync(file, "utf8");
const sandbox = {
    console: console,
    imports: { gi: { GLib: { uuid_string_random: () => "test-id" } } },
    Intl: Intl
};
vm.createContext(sandbox);
vm.runInContext(
    code +
    "\nthis.exports = {" +
    "computeGridDims, planCells, computeFittedFontSizes, computeTileInnerSize," +
    "worstTimeSample, filterTimezones, listTimezones, timezoneListLabel," +
    "normalizeClockList, addClock, updateClock, removeClock, canAdd, canRemove," +
    "buildClock, TILE_LAYOUT, MAX_CLOCKS, MIN_CLOCKS" +
    "};",
    sandbox
);
const A = sandbox.exports;

function assert(cond, msg) {
    if (!cond)
        throw new Error(msg);
}

assert(A.worstTimeSample("%H:%M") === "23:59", "HH:MM sample");
assert(A.worstTimeSample("%H:%M:%S") === "23:59:59", "seconds sample");

const inner = A.computeTileInnerSize(500, 300, 2, 3, 4);
assert(inner.width > 50 && inner.height > 50, "tile inner size");

const shortFit = A.computeFittedFontSizes(inner.width, inner.height, {
    time: "18:58",
    date: "Saturday, 15 August",
    label: "World Clock"
}, { time: 40, date: 15, timezone: 12 });

const longFit = A.computeFittedFontSizes(inner.width, inner.height, {
    time: "18:58:45",
    date: "Saturday, 15 August",
    label: "World Clock"
}, { time: 40, date: 15, timezone: 12 });

assert(longFit.time <= shortFit.time, "seconds shrink tile time font");

const zones = ["local", "UTC", "America/Los_Angeles", "Asia/Manila", "Europe/Berlin"];
const filtered = A.filterTimezones(zones, "manila");
assert(filtered.length === 1 && filtered[0] === "Asia/Manila", "filter manila");
assert(A.filterTimezones(zones, "los angeles").indexOf("America/Los_Angeles") !== -1, "filter city spaces");
assert(A.timezoneListLabel("America/Los_Angeles").indexOf("Los Angeles") !== -1, "list label");
assert(A.timezoneListLabel("America/Los_Angeles").indexOf("\u2014") === -1, "no em dash");

const listed = A.listTimezones();
assert(listed[0] === "local", "local first");
assert(listed.length > 5, "timezone list populated");

let clocks = A.normalizeClockList([]).clocks;
assert(clocks.length === A.MIN_CLOCKS, "empty list becomes one clock");
clocks = A.addClock(clocks, { name: "UTC", timezone: "UTC" }, { generateId: () => "utc-1" });
assert(clocks.length === 2, "add clock");
clocks = A.updateClock(clocks, "utc-1", { name: "Coordinated", timezone: "UTC" });
assert(clocks[1].name === "Coordinated", "update clock");
clocks = A.removeClock(clocks, "utc-1");
assert(clocks.length === 1, "remove clock");

console.log("clockActions tests passed");
