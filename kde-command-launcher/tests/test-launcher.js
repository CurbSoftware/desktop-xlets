#!/usr/bin/env node
/**
 * tests/test-launcher.js
 *
 * Node tests for the launcher seam: URL construction for application
 * ids, .desktop names, and absolute paths. run() itself needs a live
 * session and stays on the live checklist.
 *
 * Usage:  node kde-command-launcher/tests/test-launcher.js
 * Exits non-zero if any assertion fails.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(
    path.join(__dirname, "..", "contents", "ui", "lib", "launcher.js"), "utf8")
    .replace(/^.pragma library.*$/m, "");
const sandbox = vm.createContext({ Qt: {} });
vm.runInContext(
    source + "\nthis.Launcher = { normalize, isDesktopEntry, urlFor };", sandbox);
const Launcher = sandbox.Launcher;

let passed = 0;
const failures = [];

function eq(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
        passed++;
        console.log("  OK   " + label);
    } else {
        failures.push(label);
        console.log("  FAIL " + label + ": got " + JSON.stringify(actual) +
            ", want " + JSON.stringify(expected));
    }
}

eq("application id gains .desktop", Launcher.urlFor("org.kde.kate"), "org.kde.kate.desktop");
eq("explicit desktop name kept", Launcher.urlFor("firefox.desktop"), "firefox.desktop");
eq("absolute path becomes a file url",
   Launcher.urlFor("/usr/share/applications/kate.desktop"),
   "file:///usr/share/applications/kate.desktop");
eq("blank entry stays blank", Launcher.urlFor("   "), "");
eq("whitespace trimmed", Launcher.urlFor("  org.kde.kate  "), "org.kde.kate.desktop");
eq("path with trailing .desktop untouched",
   Launcher.urlFor("/opt/app/my tool.desktop"), "file:///opt/app/my tool.desktop");
eq("desktop-entry detection", [
    Launcher.isDesktopEntry("org.kde.kate"),
    Launcher.isDesktopEntry("firefox.desktop"),
    Launcher.isDesktopEntry("touch /tmp/x")
], [true, true, false]);

console.log("");
if (failures.length) {
    for (const failure of failures)
        console.log("FAIL " + failure);
    console.log(passed + " passed, " + failures.length + " FAILED");
    process.exit(1);
}
console.log(passed + " passed, 0 failed");
