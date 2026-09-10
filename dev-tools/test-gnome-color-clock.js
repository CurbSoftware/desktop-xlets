#!/usr/bin/env gjs
/**
 * Headless tests for the GNOME Color Timer Clock port's engine copy.
 * Assertions mirror the Cinnamon test-card-actions.js one for one, so
 * the two copies cannot silently drift.
 *
 * Usage:  gjs -m dev-tools/test-gnome-color-clock.js
 * Exits non-zero if any assertion fails.
 */

import { suite as _suite, check as _check, eq as _eq, finish } from './esm-harness.js';
import GLib from 'gi://GLib';

import * as CA from '../gnome-color-clock@curbsoftware/lib/cardActions.js';

const WIDGET_DIR = GLib.path_get_dirname(
    GLib.filename_from_uri(import.meta.url)[0]) +
    '/../gnome-color-clock@curbsoftware';

function suite(name) { _suite(name); }
function check(label, condition, detail) { _check(label, condition, detail); }
function eq(label, actual, expected) { _eq(label, actual, expected); }

const RED = [255, 0, 0, 1];
const BLUE = [0, 0, 255, 1];
const GREEN = [0, 128, 0, 1];
const YELLOW = [253, 216, 53, 1];

function stops(list) {
    return list.map(function (s) { return { t: s[0], rgba: s[1] }; });
}

/* ------------------------------------------------------------------ *
 * parseColor
 * ------------------------------------------------------------------ */

suite("parseColor (hex)");
eq("#f00", CA.parseColor("#f00"), { ok: true, rgba: RED });
eq("#f008 alpha doubles", CA.parseColor("#f008"), { ok: true, rgba: [255, 0, 0, 136 / 255] });
eq("#ff0000", CA.parseColor("#ff0000"), { ok: true, rgba: RED });
eq("#ff000080 alpha 0x80", CA.parseColor("#ff000080"), { ok: true, rgba: [255, 0, 0, 128 / 255] });
eq("uppercase hex", CA.parseColor("#FF00FF"), { ok: true, rgba: [255, 0, 255, 1] });
eq("surrounding whitespace trimmed", CA.parseColor("  #00ff00  "), { ok: true, rgba: [0, 255, 0, 1] });

suite("parseColor (named)");
eq("red", CA.parseColor("red"), { ok: true, rgba: RED });
eq("named is case-insensitive", CA.parseColor("Blue"), { ok: true, rgba: BLUE });
eq("NAMED_COLORS has 13 entries", Object.keys(CA.NAMED_COLORS).length, 13);
check("every named value parses", Object.keys(CA.NAMED_COLORS).every(function (name) {
    return CA.parseColor(CA.NAMED_COLORS[name]).ok;
}));

suite("parseColor (rejections)");
eq("notacolor", CA.parseColor("notacolor"), { ok: false });
eq("empty string", CA.parseColor(""), { ok: false });
eq("null", CA.parseColor(null), { ok: false });
eq("non-string", CA.parseColor(16711680), { ok: false });
eq("5-digit hex", CA.parseColor("#12345"), { ok: false });
eq("7-digit hex", CA.parseColor("#1234567"), { ok: false });
eq("non-hex digits", CA.parseColor("#12g456"), { ok: false });
eq("rgba() unsupported", CA.parseColor("rgba(255, 0, 0, 1)"), { ok: false });

/* ------------------------------------------------------------------ *
 * rgbaToCss / rgbaToKey
 * ------------------------------------------------------------------ */

suite("rgbaToCss");
eq("opaque", CA.rgbaToCss(RED), "rgba(255, 0, 0, 1.00)");
eq("two-decimal alpha", CA.rgbaToCss([10, 20, 30, 0.5]), "rgba(10, 20, 30, 0.50)");
eq("lerp alpha", CA.rgbaToCss([128, 0, 128, 0.75]), "rgba(128, 0, 128, 0.75)");
eq("alpha clamps to 1", CA.rgbaToCss([0, 0, 0, 1.5]), "rgba(0, 0, 0, 1.00)");
eq("channels clamp", CA.rgbaToCss([300, -5, 0, 1]), "rgba(255, 0, 0, 1.00)");

suite("rgbaToKey");
eq("opaque key", CA.rgbaToKey(RED), "#ff0000ff");
eq("transparent key", CA.rgbaToKey([255, 0, 0, 0]), "#ff000000");
eq("#ff000080 round-trips", CA.rgbaToKey(CA.parseColor("#ff000080").rgba), "#ff000080");
eq("#f008 round-trips", CA.rgbaToKey(CA.parseColor("#f008").rgba), "#ff000088");
eq("evaluate output is key-stable",
    CA.rgbaToKey(CA.evaluate(stops([[0, RED], [100, BLUE]]), 50, { smooth: true })),
    CA.rgbaToKey(CA.evaluate(stops([[0, RED], [100, BLUE]]), 50, { smooth: true })));

/* ------------------------------------------------------------------ *
 * normalizeSchedule
 * ------------------------------------------------------------------ */

suite("normalizeSchedule (basics)");
let norm = CA.normalizeSchedule([
    { hour: 18, minute: 0, color: "#f00" },
    { hour: 6, minute: 0, color: "#00f" }
], CA.DAY_SECONDS);
eq("sorts ascending", norm.stops, [
    { t: 21600, rgba: BLUE },
    { t: 64800, rgba: RED }
]);
check("nothing dropped", norm.dropped === 0);

eq("clock row combines hour and minute",
    CA.normalizeSchedule([{ hour: 6, minute: 30, color: "#fff" }], CA.DAY_SECONDS).stops,
    [{ t: 23400, rgba: [255, 255, 255, 1] }]);
eq("missing minute defaults to 0",
    CA.normalizeSchedule([{ hour: 6, color: "#fff" }], CA.DAY_SECONDS).stops,
    [{ t: 21600, rgba: [255, 255, 255, 1] }]);
eq("timer rows use remaining",
    CA.normalizeSchedule([{ remaining: 90, color: "#fff" }], 3600).stops,
    [{ t: 90, rgba: [255, 255, 255, 1] }]);
eq("chrono rows use elapsed",
    CA.normalizeSchedule([{ elapsed: 1800, color: "#fff" }], 86400).stops,
    [{ t: 1800, rgba: [255, 255, 255, 1] }]);
eq("bare t key works",
    CA.normalizeSchedule([{ t: 120, color: "#00f" }], 3600).stops,
    [{ t: 120, rgba: BLUE }]);
eq("string values coerce",
    CA.normalizeSchedule([{ hour: "6", minute: "30", color: "#ffffff" }], CA.DAY_SECONDS).stops,
    [{ t: 23400, rgba: [255, 255, 255, 1] }]);
eq("timer remaining coerces",
    CA.normalizeSchedule([{ remaining: "90", color: "#ffffff" }], 3600).stops,
    [{ t: 90, rgba: [255, 255, 255, 1] }]);

suite("normalizeSchedule (clamp)");
norm = CA.normalizeSchedule([{ hour: 25, minute: 0, color: "#f00" }], CA.DAY_SECONDS);
eq("clock time clamps to DAY_SECONDS", norm.stops, [{ t: 86400, rgba: RED }]);

norm = CA.normalizeSchedule([{ remaining: -5, color: "#f00" }], 3600);
eq("negative clamps to 0", norm.stops, [{ t: 0, rgba: RED }]);

suite("normalizeSchedule (drops)");
norm = CA.normalizeSchedule([
    { remaining: 60, color: "#gggggg" },
    { remaining: 30, color: "#0f0" },
    { color: "#f00" },
    { remaining: "nope", color: "#00f" }
], 3600);
eq("invalid colour and unparsable time rows dropped", norm.stops, [{ t: 30, rgba: [0, 255, 0, 1] }]);
check("dropped rows are counted", norm.dropped === 3);

suite("normalizeSchedule (equal-t merge)");
eq("equal t keeps the later row",
    CA.normalizeSchedule([{ t: 300, color: "#f00" }, { t: 300, color: "#00f" }], 3600).stops,
    [{ t: 300, rgba: BLUE }]);
norm = CA.normalizeSchedule([
    { hour: 6, minute: 0, color: "#f00" },
    { hour: 6, minute: 30, color: "#00f" },
    { hour: 6, minute: 0, color: "#ff0" }
], CA.DAY_SECONDS);
eq("clock-keyed merge keeps later row, keeps distinct time", norm.stops, [
    { t: 21600, rgba: [255, 255, 0, 1] },
    { t: 23400, rgba: BLUE }
]);

suite("normalizeSchedule (non-array)");
eq("null is empty", CA.normalizeSchedule(null, CA.DAY_SECONDS), { stops: [], dropped: 0 });
eq("string is empty", CA.normalizeSchedule("nope", CA.DAY_SECONDS), { stops: [], dropped: 0 });
eq("undefined is empty", CA.normalizeSchedule(undefined, CA.DAY_SECONDS), { stops: [], dropped: 0 });

suite("normalizeSchedule (notify)");
eq("notify flag carried onto the stop",
    CA.normalizeSchedule([{ hour: 12, minute: 0, color: "#f00", notify: true }], CA.DAY_SECONDS).stops,
    [{ t: 43200, rgba: RED, notify: true }]);
eq("missing notify flag stays off the stop",
    CA.normalizeSchedule([{ hour: 12, minute: 0, color: "#f00" }], CA.DAY_SECONDS).stops,
    [{ t: 43200, rgba: RED }]);

suite("thresholdsCrossed");
eq("forward crossing", CA.thresholdsCrossed(10, 20, [15, 25], false), [15]);
eq("exact boundary is inclusive", CA.thresholdsCrossed(10, 20, [20], false), [20]);
eq("no crossing stays empty", CA.thresholdsCrossed(10, 20, [5, 25], false), []);
eq("wrap crosses above prev and at/below cur",
    CA.thresholdsCrossed(86399, 1, [43200, 0], true), [0]);
eq("wrap forward at midnight boundary",
    CA.thresholdsCrossed(21599, 21600, [21600], true), [21600]);
eq("non-finite prev returns empty", CA.thresholdsCrossed(null, 20, [10], false), []);

suite("nextColor");
eq("clock next wraps past last",
    CA.nextColor(stops([[21600, RED], [64800, BLUE]]), 68400, { wrap: true }), RED);
eq("clock next forward",
    CA.nextColor(stops([[21600, RED], [64800, BLUE]]), 21600, { wrap: true }), BLUE);
eq("chrono next forward",
    CA.nextColor(stops([[0, RED], [1800, BLUE]]), 300, {}), BLUE);
eq("timer next below",
    CA.nextColor(stops([[0, RED], [30, YELLOW], [60, GREEN]]), 45, { reverse: true }), YELLOW);
eq("timer at stop snaps lower",
    CA.nextColor(stops([[0, RED], [30, YELLOW], [60, GREEN]]), 60, { reverse: true }), YELLOW);
eq("forward schedule past last has no next colour",
    CA.nextColor(stops([[0, RED], [1800, BLUE]]), 2000, {}), null);
eq("reverse schedule below last has no next colour",
    CA.nextColor(stops([[0, RED], [30, YELLOW]]), 0, { reverse: true }), null);
eq("no stops is null",
    CA.nextColor([], 50, {}), null);

suite("nextStop");
eq("returns stop time and a colour copy",
    CA.nextStop(stops([[0, RED], [1800, BLUE]]), 300, {}),
    { t: 1800, rgba: BLUE });
eq("clock wraps with stop metadata",
    CA.nextStop(stops([[21600, RED], [64800, BLUE]]), 68400, { wrap: true }),
    { t: 21600, rgba: RED });
eq("non-wrap schedule ends cleanly",
    CA.nextStop(stops([[0, RED], [1800, BLUE]]), 2000, {}), null);

suite("secondsUntilStop");
eq("forward countdown",
    CA.secondsUntilStop(300, 1800, {}), 1500);
eq("clock wrap over midnight",
    CA.secondsUntilStop(68400, 21600, { wrap: true }), 39600);
eq("clock wrap same instant is zero",
    CA.secondsUntilStop(21600, 21600, { wrap: true }), 0);
eq("timer reverse countdown",
    CA.secondsUntilStop(90, 60, { reverse: true }), 30);
eq("timer reverse past stop is null",
    CA.secondsUntilStop(30, 60, { reverse: true }), null);
eq("forward past last is null",
    CA.secondsUntilStop(2000, 1800, {}), null);
eq("invalid inputs are null",
    CA.secondsUntilStop("nope", 10, {}), null);

/* ------------------------------------------------------------------ *
 * Default schedules
 * ------------------------------------------------------------------ */

suite("default schedules");
check("DAY_SECONDS is 86400", CA.DAY_SECONDS === 86400);
eq("clock default normalises",
    CA.normalizeSchedule(CA.DEFAULT_CLOCK_SCHEDULE, CA.DAY_SECONDS).stops.map(function (s) { return s.t; }),
    [21600, 43200, 64800]);
check("clock default rows use hour/minute/color",
    CA.DEFAULT_CLOCK_SCHEDULE.every(function (r) {
        return typeof r.hour === "number" && typeof r.minute === "number" &&
            CA.parseColor(r.color).ok;
    }));
eq("timer default rows use remaining",
    CA.normalizeSchedule(CA.DEFAULT_TIMER_SCHEDULE, 86400).stops.map(function (s) { return s.t; }),
    [0, 30, 60]);
check("timer default rows use remaining/color keys",
    CA.DEFAULT_TIMER_SCHEDULE.every(function (r) {
        return typeof r.remaining === "number" && CA.parseColor(r.color).ok;
    }));
eq("chrono default rows use elapsed",
    CA.normalizeSchedule(CA.DEFAULT_CHRONO_SCHEDULE, 86400).stops.map(function (s) { return s.t; }),
    [0, 1800]);
check("chrono default rows use elapsed/color keys",
    CA.DEFAULT_CHRONO_SCHEDULE.every(function (r) {
        return typeof r.elapsed === "number" && CA.parseColor(r.color).ok;
    }));
check("FALLBACK_COLOR is an rgba array",
    Array.isArray(CA.FALLBACK_COLOR) && CA.FALLBACK_COLOR.length === 4);

/* ------------------------------------------------------------------ *
 * evaluate (non-wrap)
 * ------------------------------------------------------------------ */

let ramp = stops([[0, RED], [100, BLUE]]);

suite("evaluate (empty and single)");
eq("no stops is null", CA.evaluate([], 50, {}), null);
eq("non-array stops is null", CA.evaluate(undefined, 50, { smooth: true }), null);
eq("single stop constant (step)", CA.evaluate(stops([[21600, [1, 2, 3, 0.4]]]), 0, {}), [1, 2, 3, 0.4]);
eq("single stop constant (smooth)", CA.evaluate(stops([[21600, [1, 2, 3, 0.4]]]), 999999, { smooth: true }), [1, 2, 3, 0.4]);
eq("single stop constant (wrap)", CA.evaluate(stops([[21600, [1, 2, 3, 0.4]]]), 100, { wrap: true }), [1, 2, 3, 0.4]);

suite("evaluate (non-wrap clamps)");
eq("before first holds first (step)", CA.evaluate(ramp, -10, {}), RED);
eq("before first holds first (smooth)", CA.evaluate(ramp, -10, { smooth: true }), RED);
eq("after last holds last (step)", CA.evaluate(ramp, 200, {}), BLUE);
eq("after last holds last (smooth)", CA.evaluate(ramp, 200, { smooth: true }), BLUE);

suite("evaluate (non-wrap at-stop)");
eq("at first stop returns it (step)", CA.evaluate(ramp, 0, {}), RED);
eq("at stop returns it (step)", CA.evaluate(ramp, 100, {}), BLUE);
eq("at stop returns it (smooth)", CA.evaluate(ramp, 100, { smooth: true }), BLUE);

suite("evaluate (non-wrap smooth)");
eq("midpoint red+blue is purple", CA.evaluate(ramp, 50, { smooth: true }), [128, 0, 128, 1]);
eq("quarter point", CA.evaluate(ramp, 25, { smooth: true }), [191, 0, 64, 1]);
eq("alpha interpolates too",
    CA.evaluate(stops([[0, RED], [100, [0, 0, 255, 0.5]]]), 50, { smooth: true }),
    [128, 0, 128, 0.75]);

suite("evaluate (non-wrap step)");
eq("between stops holds earlier colour", CA.evaluate(ramp, 50, {}), RED);
eq("quarter point steps to earlier colour", CA.evaluate(ramp, 25, {}), RED);
eq("just before stop still holds earlier colour", CA.evaluate(ramp, 99, {}), RED);

/* ------------------------------------------------------------------ *
 * evaluate (wrap)
 * ------------------------------------------------------------------ */

/* 06:00 red -> 18:00 blue, wrapping over midnight. */
let day = stops([[21600, RED], [64800, BLUE]]);

suite("evaluate (wrap smooth)");
eq("00:00 is the exact midnight midpoint",
    CA.evaluate(day, 0, { wrap: true, smooth: true }), [128, 0, 128, 1]);
eq("05:59 is nearly red",
    CA.evaluate(day, 21540, { wrap: true, smooth: true }), [255, 0, 0, 1]);
eq("18:01 is nearly blue",
    CA.evaluate(day, 64860, { wrap: true, smooth: true }), [0, 0, 255, 1]);
eq("18:00 at stop returns blue",
    CA.evaluate(day, 64800, { wrap: true, smooth: true }), BLUE);
eq("06:00 at stop returns red",
    CA.evaluate(day, 21600, { wrap: true, smooth: true }), RED);
eq("negative t wraps",
    CA.evaluate(day, -60, { wrap: true, smooth: true }),
    CA.evaluate(day, 86340, { wrap: true, smooth: true }));

suite("evaluate (wrap step)");
eq("19:00 gets the 18:00 stop", CA.evaluate(day, 68400, { wrap: true }), BLUE);
eq("05:00 gets the 18:00 stop", CA.evaluate(day, 18000, { wrap: true }), BLUE);
eq("07:00 gets the 06:00 stop", CA.evaluate(day, 25200, { wrap: true }), RED);
eq("stop present at exactly 00:00 returns it (step)",
    CA.evaluate(stops([[0, GREEN], [43200, RED]]), 0, { wrap: true }), GREEN);
eq("stop present at exactly 00:00 returns it (smooth)",
    CA.evaluate(stops([[0, GREEN], [43200, RED]]), 0, { wrap: true, smooth: true }), GREEN);

/* ------------------------------------------------------------------ *
 * luma / contrastColors
 * ------------------------------------------------------------------ */

suite("luma");
check("opaque white is 1", CA.luma([255, 255, 255, 1]) === 1);
check("opaque black is 0", CA.luma([0, 0, 0, 1]) === 0);
check("alpha 100 over backing reads dark", CA.luma([255, 255, 255, 100 / 255]) < 0.5);
check("opaque yellow is light", CA.luma(YELLOW) > 0.5);

suite("contrastColors");
eq("white card gets dark fg", CA.contrastColors([255, 255, 255, 1]).fg, [17, 17, 17, 0.92]);
eq("black card gets white fg", CA.contrastColors([0, 0, 0, 1]).fg, [255, 255, 255, 0.95]);
eq("yellow card gets dark fg", CA.contrastColors(YELLOW).fg, [17, 17, 17, 0.92]);
/* Selection is by WCAG ratio, not luma: mid-tone schedules must not get
 * sub-AA white text at rest. */
eq("green card (timer rest) gets dark fg",
    CA.contrastColors([67, 160, 71, 1]).fg, [17, 17, 17, 0.92]);
eq("teal card (chrono rest) falls back to solid black for AA",
    CA.contrastColors([0, 137, 123, 1]).fg, [0, 0, 0, 1]);
eq("purple card keeps white fg",
    CA.contrastColors([112, 71, 138, 1]).fg, [255, 255, 255, 0.95]);
eq("translucent white over backing reads mid-grey: solid black clears AA",
    CA.contrastColors([255, 255, 255, 100 / 255]).fg, [0, 0, 0, 1]);
eq("border reuses bg hue at 0.3", CA.contrastColors(RED).border, [255, 0, 0, 0.3]);

/* ------------------------------------------------------------------ *
 * Card inner size / fitted fonts (ported from test-clock-actions.js)
 * ------------------------------------------------------------------ */

suite("computeCardInnerSize");
const chrome = CA.CARD_LAYOUT;
check("chrome constants exist", !!(chrome && chrome.containerPad === 4 && chrome.padX === 6 && chrome.padY === 4));

eq("600x400 1x1 spacing 4", CA.computeCardInnerSize(600, 400, 1, 1, 4), {
    width: 600 - 2 * 4 - 2 * 4 - 2 * 2 - 2 * 6,
    height: 400 - 2 * 4 - 2 * 4 - 2 * 2 - 2 * 4
});
eq("600x400 2x2 spacing 4", CA.computeCardInnerSize(600, 400, 2, 2, 4), {
    width: (600 - 8) / 2 - 8 - 4 - 12,
    height: (400 - 8) / 2 - 8 - 4 - 8
});
check("zero spacing is allowed", CA.computeCardInnerSize(200, 200, 1, 1, 0).width >
    CA.computeCardInnerSize(200, 200, 1, 1, 8).width);
check("more columns shrink width", CA.computeCardInnerSize(400, 400, 1, 4, 4).width <
    CA.computeCardInnerSize(400, 400, 1, 2, 4).width);
check("bad dims still return a box", CA.computeCardInnerSize(200, 200, 0, 0, 4).width > 0);

function fittedH(sizes) {
    const L = CA.CARD_LAYOUT;
    return (sizes.time + sizes.date + sizes.timezone) * L.ptToPx * L.lineHeight + 2 * L.lineGap;
}
function fittedW(text, pt, em) {
    return CA._textWidthPx(text, pt, CA.CARD_LAYOUT.ptToPx, em);
}

suite("computeFittedFontSizes");
let inner = { width: 560, height: 364 };
let fit = CA.computeFittedFontSizes(inner.width, inner.height, {
    time: "23:59:59",
    date: "Wednesday, 27 December",
    label: "Local"
}, { time: 40, date: 15, timezone: 12 });
check("large card keeps time cap", fit.time === 40);
check("large card keeps date cap", fit.date === 15);
check("large card keeps label cap", fit.timezone === 12);
check("large card add stays at cap", fit.add === 16);
check("short label does not ellipsize", fit.ellipsizeLabel === false);

inner = CA.computeCardInnerSize(200, 200, 1, 1, 4);
fit = CA.computeFittedFontSizes(inner.width, inner.height, {
    time: "23:59:59",
    date: "Wednesday, 27 December",
    label: "Local"
}, { time: 72, date: 40, timezone: 30 });
check("small card shrinks time below cap", fit.time < 72);
check("hierarchy time >= date", fit.time + 1e-9 >= fit.date);
check("hierarchy date >= timezone", fit.date + 1e-9 >= fit.timezone);
check("small card three lines fit height", fittedH(fit) <= inner.height + 0.75);
check("small card time fits width", fittedW("23:59:59", fit.time, CA.CARD_LAYOUT.timeEm) <= inner.width + 0.75);
check("small card date fits width",
    fittedW("Wednesday, 27 December", fit.date, CA.CARD_LAYOUT.dateEm) <= inner.width + 1.0);
check("small 1x1 add keeps cap", fit.add === 16);

fit = CA.computeFittedFontSizes(200, 200, {
    time: "12:00:00",
    date: "Fri, 1 Jan",
    label: "A Very Long Card Name That Should Ellipsize Because It Will Not Fit"
}, { time: 40, date: 15, timezone: 12 });
check("long label ellipsizes", fit.ellipsizeLabel === true);
check("long label does not crush time", fit.time >= 20);
check("time still at least date", fit.time + 1e-9 >= fit.date);

let tiny = CA.computeCardInnerSize(200, 200, 6, 6, 4);
fit = CA.computeFittedFontSizes(tiny.width, tiny.height, {
    time: "23:59:59",
    date: "Wed, 31 Dec",
    label: "Los Angeles"
}, { time: 40, date: 15, timezone: 12 });
check("dense grid still returns sizes", fit.time >= 1 && fit.date >= 1 && fit.timezone >= 1);
check("dense grid estimated height fits", tiny.height <= 0 || fittedH(fit) <= tiny.height + 1);
check("dense add is tiny", fit.add <= 8);

let scaled = CA.computeFittedFontSizes(400, 300, {
    time: "23:59:59", date: "Wednesday, 27 December", label: "UTC"
}, { time: 20, date: 10, timezone: 8 });
check("does not scale above caps", scaled.time <= 20 && scaled.date <= 10 && scaled.timezone <= 8);

/* ------------------------------------------------------------------ *
 * Module surface
 * ------------------------------------------------------------------ */

suite("computeResponsiveGrid");
eq("wide width uses one row",
    CA.computeResponsiveGrid(3, 840, 6), { rows: 1, cols: 3 });
eq("medium width wraps without dropping a card",
    CA.computeResponsiveGrid(3, 600, 6), { rows: 2, cols: 2 });
eq("narrow width stacks every card",
    CA.computeResponsiveGrid(3, 200, 6), { rows: 3, cols: 1 });
eq("single card survives any width",
    CA.computeResponsiveGrid(1, 10, 6), { rows: 1, cols: 1 });
eq("zero cards returns an empty grid",
    CA.computeResponsiveGrid(0, 840, 6), { rows: 0, cols: 0 });
eq("invalid width uses default width",
    CA.computeResponsiveGrid(3, undefined, 6), { rows: 1, cols: 3 });
eq("string count is accepted",
    CA.computeResponsiveGrid("3", 200, 6), { rows: 3, cols: 1 });

suite("computeResponsiveHeight");
eq("one row preserves configured height",
    CA.computeResponsiveHeight(1, 260, 6), 260);
eq("two rows gain safe height",
    CA.computeResponsiveHeight(2, 120, 6), 344);
eq("three rows gain safe height",
    CA.computeResponsiveHeight(3, 120, 6), 512);
eq("large configured height is preserved",
    CA.computeResponsiveHeight(3, 600, 6), 600);
eq("invalid row count is safe",
    CA.computeResponsiveHeight(0, 120, 6), 176);

suite("widget source contracts");
const widgetSource = GLib.file_get_contents(
    WIDGET_DIR + "/widget.js")[1];
const widgetText = new TextDecoder().decode(widgetSource);
const stylesheetText = new TextDecoder().decode(
    GLib.file_get_contents(WIDGET_DIR + "/stylesheet.css")[1]);
check("never touches Cinnamon DND internals",
    widgetText.indexOf("_draggable") === -1 &&
    widgetText.indexOf("fakeRelease") === -1);
check("drag is handled in the capture phase",
    widgetText.indexOf('"captured-event"') !== -1);
check("no idle_add for user-visible actions",
    widgetText.indexOf("idle_add") === -1);
check("preview chip is 28px",
    widgetText.indexOf("const SWATCH_PX = 28") !== -1 &&
    widgetText.indexOf("set_size(SWATCH_PX, SWATCH_PX)") !== -1);
check("footer uses go-next icon and HH:MM:SS formatting",
    widgetText.indexOf("go-next-symbolic") !== -1 &&
    widgetText.indexOf("function _formatClock") !== -1);
check("swatch border matches the footer surface",
    widgetText.indexOf("10 / 255, 14 / 255, 18 / 255, 0.78") !== -1 &&
    stylesheetText.indexOf("rgba(10, 14, 18, 0.78)") !== -1);
check("timer adjusters are hour/minute/second on the card body",
    widgetText.indexOf('"minus-hour"') !== -1 &&
    widgetText.indexOf('"plus-minute"') !== -1 &&
    widgetText.indexOf('"plus-second"') !== -1);
check("chronometer has an on-card lap action",
    widgetText.indexOf('"lap"') !== -1 &&
    widgetText.indexOf('label: "Lap"') !== -1);
check("footer clock is tabular monospace",
    widgetText.indexOf('set_font_name("Monospace Bold 14")') !== -1);
check("timer and chrono state persist through the store",
    widgetText.indexOf("_persistTimer") !== -1 &&
    widgetText.indexOf("_persistChrono") !== -1);

suite("module surface");
check("lerpRgba exported", typeof CA.lerpRgba === "function");
eq("lerpRgba midpoint", CA.lerpRgba(RED, BLUE, 0.5), [128, 0, 128, 1]);
eq("lerpRgba clamps fraction", CA.lerpRgba(RED, BLUE, 2), BLUE);

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

finish();
