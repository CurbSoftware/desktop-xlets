#!/usr/bin/env gjs
/**
 * Headless tests for the Workspace Names GNOME port: the workspace-name
 * strv bookkeeping in lib/workspaces.js, run against a fake settings
 * object (no Gio schema installation needed).
 *
 * Usage:  gjs -m dev-tools/test-gnome-workspace-names.js
 * Exits non-zero if any assertion fails.
 */

import { suite, check, eq, finish } from './esm-harness.js';
import * as WS from '../gnome-workspace-names@curbsoftware/lib/workspaces.js';

function fakeSettings(stored) {
    const data = { "workspace-names": stored.slice() };
    return {
        get_strv(key) {
            return data[key].slice();
        },
        set_strv(key, value) {
            data[key] = value.slice();
        },
        data
    };
}

/* ------------------------------------------------------------------ */

suite("paddedNames");
eq("missing names fall back to numbers",
   WS.paddedNames(fakeSettings(["Work", "Browsing"]), 4),
   ["Work", "Browsing", "3", "4"]);
eq("empty strings fall back",
   WS.paddedNames(fakeSettings(["Work", ""]), 3),
   ["Work", "2", "3"]);
eq("extra names are trimmed",
   WS.paddedNames(fakeSettings(["A", "B", "C", "D"]), 2),
   ["A", "B"]);
eq("blank-only names fall back",
   WS.paddedNames(fakeSettings(["   "]), 2),
   ["1", "2"]);
eq("empty store yields numbers",
   WS.paddedNames(fakeSettings([]), 3),
   ["1", "2", "3"]);

suite("nameAt");
const one = fakeSettings(["Main", "", "Third"]);
eq("stored name", WS.nameAt(one, 0), "Main");
eq("blank slot defaults", WS.nameAt(one, 1), "2");
eq("third slot", WS.nameAt(one, 2), "Third");
eq("beyond store defaults", WS.nameAt(one, 5), "6");

suite("setName");
const two = fakeSettings(["Main"]);
eq("rename pads the array",
   WS.setName(two, 2, "Research", 3), ["Main", "", "Research"]);
eq("write lands in the store",
   two.data["workspace-names"], ["Main", "", "Research"]);
eq("rename in place keeps siblings",
   WS.setName(two, 0, "Focus", 3), ["Focus", "", "Research"]);
eq("blank rename is stored blank",
   WS.setName(two, 0, "  ", 3), ["", "", "Research"]);

suite("trimmedNames");
eq("trailing blanks collapse",
   WS.trimmedNames(fakeSettings(["A", "", ""]), 3), ["A"]);
eq("keeps interior blanks raw",
   WS.trimmedNames(fakeSettings(["A", "", "B"]), 3), ["A", "", "B"]);
eq("never below one entry",
   WS.trimmedNames(fakeSettings(["", "", ""]), 3), [""]);
eq("extras past the count drop",
   WS.trimmedNames(fakeSettings(["A", "B", "C"]), 2), ["A", "B"]);

suite("canManage");
eq("dynamic workspaces block management",
   WS.canManage({ get_boolean: () => true }), false);
eq("fixed workspaces allow management",
   WS.canManage({ get_boolean: () => false }), true);
eq("a broken settings object blocks safely",
   WS.canManage({ get_boolean: () => { throw new Error("no schema"); } }), false);

finish();
