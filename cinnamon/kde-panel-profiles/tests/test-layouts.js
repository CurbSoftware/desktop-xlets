#!/usr/bin/env node
/**
 * tests/test-layouts.js
 *
 * Node tests for the Plasma Layouts profile bookkeeping: parse, safe
 * name, upsert, remove, summarize, and the apply command builder.
 *
 * Usage:  node kde-panel-profiles/tests/test-layouts.js
 * Exits non-zero if any assertion fails.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(
    path.join(__dirname, "..", "contents", "ui", "lib", "layouts.js"), "utf8")
    .replace(/^.pragma library.*$/m, "");
const sandbox = vm.createContext({ console });
vm.runInContext(
    source + "\nthis.Layouts = { parseProfiles, safeName, summarize," +
    " upsertProfile, removeProfile, getProfile, listNames, applyCommands };",
    sandbox);
const Layouts = sandbox.Layouts;

let passed = 0;
const failures = [];

function check(label, condition, detail) {
    if (condition) {
        passed++;
        console.log("  OK   " + label);
    } else {
        failures.push(label);
        console.log("  FAIL " + label + (detail ? ": " + detail : ""));
    }
}

function eq(label, actual, expected) {
    check(label, JSON.stringify(actual) === JSON.stringify(expected),
        "got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected));
}

console.log("* parse and names");

eq("invalid json yields {}", Layouts.parseProfiles("{nope"), {});
eq("array json yields {}", Layouts.parseProfiles("[1,2]"), {});
eq("empty name refused", Layouts.safeName("   "), "");
check("over-long name refused", Layouts.safeName("x".repeat(65)) === "");
eq("normal name kept", Layouts.safeName("  Work  "), "Work");

console.log("* upsert and remove");

let json = Layouts.upsertProfile("{}", "Work", { appletsrc: "[Containments][1]\nplugin=panel" });
eq("one profile listed", Layouts.listNames(json), ["Work"]);
const profile = Layouts.getProfile(json, "Work");
check("profile carries appletsrc", profile.appletsrc.indexOf("plugin=panel") !== -1);
check("profile carries a saved date", typeof profile.savedAt === "string");

json = Layouts.upsertProfile(json, "Gaming", { appletsrc: "b" });
eq("two profiles sorted", Layouts.listNames(json), ["Gaming", "Work"]);

json = Layouts.upsertProfile(json, "Work", { appletsrc: "replaced" });
eq("upsert replaces in place", Layouts.listNames(json), ["Gaming", "Work"]);
eq("replacement landed", Layouts.getProfile(json, "Work").appletsrc, "replaced");

json = Layouts.removeProfile(json, "Gaming");
eq("remove works", Layouts.listNames(json), ["Work"]);
json = Layouts.removeProfile(json, "Missing");
eq("removing a missing profile is a no-op", Layouts.listNames(json), ["Work"]);

console.log("* summarize");

const appletsrc = [
    "[Containments][1]",
    "plugin=org.kde.plasma.desktop",
    "",
    "[Containments][2]",
    "plugin=panel",
    "",
    "[Containments][2][Applets][3]",
    "plugin=org.kde.plasma.kickoff",
    "",
    "[Containments][2][Applets][4]",
    "plugin=org.kde.plasma.pager",
    "",
    "[Containments][3]",
    "plugin=panel"
].join("\n");
eq("counts panels, widgets, containments", Layouts.summarize(appletsrc),
   { containments: 3, panels: 2, widgets: 2 });
eq("empty text is all zeros", Layouts.summarize(""), { containments: 0, panels: 0, widgets: 0 });

console.log("* applyCommands");

const commands = Layouts.applyCommands(
    { appletsrc: "DATA", kwinrc: "KWIN" }, "/home/user/.config");
check("backup comes first", commands[0].indexOf(".plasma-layouts-backup-") !== -1);
check("appletsrc written via heredoc",
    commands.some(c => c.indexOf("cat > /home/user/.config/plasma-org.kde.plasma.desktop-appletsrc") !== -1 &&
        c.indexOf("DATA") !== -1));
check("kwinrc written too",
    commands.some(c => c.indexOf("/kwinrc <<") !== -1 && c.indexOf("KWIN") !== -1));
check("plasmashell restarted",
    commands.some(c => c.indexOf("plasmashell") !== -1));
check("empty profile yields no commands",
    Layouts.applyCommands({ appletsrc: "" }, "/x").length === 0);
check("null profile yields no commands",
    Layouts.applyCommands(null, "/x").length === 0);

console.log("");
if (failures.length) {
    for (const failure of failures)
        console.log("FAIL " + failure);
    console.log(passed + " passed, " + failures.length + " FAILED");
    process.exit(1);
}
console.log(passed + " passed, 0 failed");
