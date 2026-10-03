#!/usr/bin/env gjs
/**
 * esm-harness.js
 *
 * Shared assertion harness for the GNOME ESM port tests. Mirrors the
 * check/eq style of the legacy gjs harnesses (see test-clock-actions.js)
 * so ported tests read the same. dev-tools scripts may share code; the
 * no-cross-import rule is a Cinnamon xlet runtime constraint, not a
 * dev-tools one.
 *
 * Usage from a test file:
 *   import { suite, check, eq, finish } from './esm-harness.js';
 *
 * Run with:  gjs -m dev-tools/test-gnome-world-clock.js
 * Exits non-zero if any assertion fails.
 */

import System from 'system';

let passed = 0;
const failures = [];
let currentSuite = "";

export function suite(name) {
    currentSuite = name;
    console.log("\n• " + name);
}

export function check(label, condition, detail) {
    if (condition) {
        passed++;
        console.log("  ✓ " + label);
    } else {
        failures.push(currentSuite + " / " + label + (detail ? " -- " + detail : ""));
        console.log("  ✗ " + label + (detail ? " -- " + detail : ""));
    }
}

export function eq(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    check(label, a === e, a === e ? null : "got " + a + ", want " + e);
}

export function finish() {
    console.log("");
    if (failures.length > 0) {
        for (const failure of failures)
            console.log("FAIL " + failure);
        console.log(passed + " passed, " + failures.length + " FAILED");
        System.exit(1);
    }
    console.log(passed + " passed, 0 failed");
    System.exit(0);
}
