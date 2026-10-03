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
    "contrastColors, computeFittedFontSizes, computeCardInnerSize, computeResponsiveGrid," +
    "computeResponsiveHeight," +
    "nextStop, nextColor, secondsUntilStop," +
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

const wide = A.computeResponsiveGrid(3, 840, 6);
assert(wide.rows === 1 && wide.cols === 3, "three cards use one wide row");
const medium = A.computeResponsiveGrid(3, 600, 6);
assert(medium.rows === 2 && medium.cols === 2, "footer-safe cards wrap at medium width");
const narrow = A.computeResponsiveGrid(3, 200, 6);
assert(narrow.rows === 3 && narrow.cols === 1, "narrow layout keeps all cards");
assert(A.computeResponsiveHeight(3, 120, 6) === 512,
    "stacked layout gains safe height");

const parsed = A.parseColor("#3949ab");
assert(parsed.ok && parsed.rgba[2] === 171, "parse hex color");

const sched = A.normalizeSchedule(A.DEFAULT_CLOCK_SCHEDULE, A.DAY_SECONDS);
assert(sched.stops.length === 3, "default clock schedule");
const color = A.evaluate(sched.stops, 12 * 3600, { wrap: true, smooth: true });
assert(Array.isArray(color) && color.length === 4, "evaluate noon color");
const next = A.nextStop(sched.stops, 13 * 3600, { wrap: true });
assert(next.t === 18 * 3600 && Array.isArray(next.rgba), "next stop includes time and color");
assert(A.secondsUntilStop(13 * 3600, next.t, { wrap: true }) === 5 * 3600,
    "seconds until next clock stop");
assert(A.secondsUntilStop(90, 60, { reverse: true }) === 30, "timer countdown");
assert(A.secondsUntilStop(2000, 1800, {}) === null, "forward past last is null");

console.log("cardActions tests passed");
