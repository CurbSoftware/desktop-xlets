#!/usr/bin/env node
/**
 * tests/test-color-engine.js
 *
 * Node tests for the color engine ported from the Cinnamon
 * cardActions.js. The QML pragma is stripped before evaluation.
 * Assertions mirror the Cinnamon test-card-actions.js core.
 *
 * Usage:  node kde-color-clock/tests/test-color-engine.js
 * Exits non-zero if any assertion fails.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ENGINE_PATH = path.join(__dirname, "..", "contents", "ui", "lib", "colorEngine.js");
const source = fs.readFileSync(ENGINE_PATH, "utf8")
    .replace(/^.pragma library.*$/m, "");
const sandbox = vm.createContext({ console });
vm.runInContext(
    source + "\nthis.Engine = { parseColor, rgbaToCss, rgbaToKey, normalizeSchedule," +
    " evaluate, nextStop, secondsUntilStop, contrastColors, lerpRgba, luma," +
    " DEFAULT_CLOCK_SCHEDULE, DEFAULT_TIMER_SCHEDULE, DEFAULT_CHRONO_SCHEDULE," +
    " thresholdsCrossed, DAY_SECONDS };",
    sandbox);
const Engine = sandbox.Engine;

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

const RED = [255, 0, 0, 1];
const BLUE = [0, 0, 255, 1];

console.log("* parseColor");
eq("#f00", Engine.parseColor("#f00"), { ok: true, rgba: RED });
eq("named colour", Engine.parseColor("white"), { ok: true, rgba: [255, 255, 255, 1] });
eq("rejected", Engine.parseColor("nope"), { ok: false });
eq("rejected rgba()", Engine.parseColor("rgba(1,2,3,0.5)"), { ok: false });

console.log("* normalizeSchedule");
const schedule = Engine.normalizeSchedule([
    { hour: 6, color: "#f4433c" },
    { hour: 6, color: "#00ff00" },
    { hour: 25, color: "#0000ff" },
    { hour: 12, color: "bad" }
], Engine.DAY_SECONDS);
eq("clamped, deduped, dropped", schedule, {
    stops: [
        { t: 6 * 3600, rgba: [0, 255, 0, 1] },
        { t: Engine.DAY_SECONDS, rgba: [0, 0, 255, 1] }
    ],
    dropped: 1
});

console.log("* evaluate");
const stops = [
    { t: 0, rgba: RED },
    { t: 100, rgba: BLUE }
];
eq("negative position wraps to the day tail (clamped to the last stop)",
   Engine.evaluate(stops, -10, { wrap: true }), BLUE);
eq("at a stop is exact", Engine.evaluate(stops, 100), BLUE);
eq("midpoint lerps",
   Engine.evaluate(stops, 50, { smooth: true }),
   [Math.round((255 + 0) / 2), 0, Math.round((0 + 255) / 2), 1]);
eq("stepped holds the previous",
   Engine.evaluate(stops, 50, { smooth: false }), RED);
eq("past the end clamps", Engine.evaluate(stops, 5000), BLUE);
eq("wrapped wraps the ramp",
   Engine.evaluate(stops, 0, { wrap: true, smooth: true }),
   Engine.evaluate(stops, 0, { smooth: true }));

console.log("* nextStop and secondsUntilStop");
eq("next forward", Engine.nextStop(stops, 10, {}).t, 100);
eq("next wrapped returns the first", Engine.nextStop(stops, 150, { wrap: true }).t, 0);
eq("next reverse", Engine.nextStop(stops, 150, { reverse: true }).t, 100);
eq("seconds forward", Engine.secondsUntilStop(10, 100, {}), 90);
eq("seconds wrapped", Engine.secondsUntilStop(50, 100, { wrap: true }), 50);

console.log("* contrast");
const contrast = Engine.contrastColors(RED);
check("contrast returns fg and border", !!contrast.fg && !!contrast.border);
check("dark background flips to light text",
    Engine.contrastColors([0, 0, 0, 1]).fg[0] > 200,
    JSON.stringify(Engine.contrastColors([0, 0, 0, 1]).fg));
check("light background flips to dark text",
    Engine.contrastColors([255, 255, 255, 1]).fg[0] < 60,
    JSON.stringify(Engine.contrastColors([255, 255, 255, 1]).fg));

console.log("* thresholdsCrossed");
eq("monotonic crossing",
   Engine.thresholdsCrossed(0, 10, [5, 15], false), [5]);
eq("wrapped crossing only includes what the sweep passed",
   Engine.thresholdsCrossed(95, 5, [50, 2], true), [2]);
eq("wrapped crossing past midnight includes the high threshold",
   Engine.thresholdsCrossed(95, 5, [97, 3], true), [97, 3]);

console.log("");
if (failures.length) {
    for (const failure of failures)
        console.log("FAIL " + failure);
    console.log(passed + " passed, " + failures.length + " FAILED");
    process.exit(1);
}
console.log(passed + " passed, 0 failed");
