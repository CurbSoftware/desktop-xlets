/* Node headless tests for cardActions.js (no St/Clutter). */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = path.join(__dirname, "..", "cardActions.js");
const code = fs.readFileSync(file, "utf8");
const sandbox = { console: console };
vm.createContext(sandbox);
vm.runInContext(
    code +
    "\nthis.exports = {" +
    "DAY_SECONDS, parseColor, rgbaToCss, rgbaToKey, normalizeSchedule, evaluate," +
    "contrastColors, computeFittedFontSizes, computeCardInnerSize, fitKinds," +
    "worstTimeSample, CARD_LAYOUT, DEFAULT_CLOCK_SCHEDULE" +
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
assert(A.worstTimeSample("%H:%M:%S", { hundredths: true }) === "23:59:59.99", "hundredths sample");
assert(A.worstTimeSample("%I:%M %p") === "12:59 PM", "12-hour sample");

const inner = A.computeCardInnerSize(840, 260, 1, 3, 6);
assert(inner.width > 100 && inner.height > 80, "card inner size");

const shortFit = A.computeFittedFontSizes(inner.width, inner.height, {
    time: "23:59",
    date: "Wednesday, 31 December",
    label: "Clock"
}, { time: 48, date: 13, timezone: 11 });

const longFit = A.computeFittedFontSizes(inner.width, inner.height, {
    time: "23:59:59",
    date: "Wednesday, 31 December",
    label: "Clock"
}, { time: 48, date: 13, timezone: 11 });

assert(longFit.time <= shortFit.time, "seconds shrink time font");

const milliFit = A.computeFittedFontSizes(inner.width, inner.height, {
    time: "99:59:59.99",
    date: "",
    label: "Chronometer"
}, { time: 48, date: 13, timezone: 11 });
assert(milliFit.time <= longFit.time, "hundredths shrink further or equal");

const kinds = A.fitKinds(["clock", "timer", "chrono"], 840, 6);
assert(kinds.length === 3, "three cards fit at 840");

const parsed = A.parseColor("#3949ab");
assert(parsed.ok && parsed.rgba[2] === 171, "parse hex color");

const sched = A.normalizeSchedule(A.DEFAULT_CLOCK_SCHEDULE, A.DAY_SECONDS);
assert(sched.stops.length === 3, "default clock schedule");
const color = A.evaluate(sched.stops, 12 * 3600, { wrap: true, smooth: true });
assert(Array.isArray(color) && color.length === 4, "evaluate noon color");

console.log("cardActions tests passed");
