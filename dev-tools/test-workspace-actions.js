#!/usr/bin/env gjs
/* global imports, print */
/**
 * Headless unit tests for workspaceActions.js.
 *
 * St/Clutter cannot be instantiated outside the Cinnamon process (libst.so is
 * not on the loader path), so this harness covers only the parts that do not
 * touch widgets: layout maths, guard conditions, and the defensive wrappers
 * around Cinnamon's Main.* workspace API. Widget behaviour is verified live
 * via Looking Glass - see DEVELOPMENT.md.
 *
 * Usage:  gjs dev-tools/test-workspace-actions.js
 * Exits non-zero on the first failing assertion count.
 */

const System = imports.system;

/* Cinnamon installs String.prototype.format on every string; standalone gjs
 * (1.68+) dropped the extension. Shim it so the module under test behaves
 * identically headless and live. */
if (typeof String.prototype.format !== "function") {
    const Format = imports.format;
    String.prototype.format = function (...args) {
        return Format.vprintf(this, args);
    };
}

/* Load the module under test from the desklet directory. Both xlets ship an
 * identical copy; a sync check at the end guards against drift. */
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const SCRIPT_DIR = GLib.path_get_dirname(
    Gio.File.new_for_commandline_arg(System.programInvocationName).get_path());
const REPO_ROOT = GLib.path_get_dirname(SCRIPT_DIR);
const DESKLET_DIR = REPO_ROOT + "/cinnamon-workspace-grid-desklet@curbsoftware";
const APPLET_DIR = REPO_ROOT + "/cinnamon-workspace-name-applet@curbsoftware";

imports.searchPath.unshift(DESKLET_DIR);
const WA = imports.workspaceActions;
const Geometry = imports.previewGeometry;
const Grid = imports.gridModel;

/* ------------------------------------------------------------------ *
 * Tiny assertion framework
 * ------------------------------------------------------------------ */

let passed = 0;
let failures = [];
let currentSuite = "";

function suite(name) {
    currentSuite = name;
    print("\n" + name);
}

function check(label, condition, detail) {
    if (condition) {
        passed++;
        print("  PASS " + label);
    } else {
        failures.push(currentSuite + " / " + label + (detail ? " -- " + detail : ""));
        print("  FAIL " + label + (detail ? " -- " + detail : ""));
    }
}

function eq(label, actual, expected) {
    let a = JSON.stringify(actual);
    let e = JSON.stringify(expected);
    check(label, a === e, a === e ? null : "got " + a + ", want " + e);
}

/* ------------------------------------------------------------------ *
 * Stubs for Cinnamon's Main / ModalDialog / workspace manager
 * ------------------------------------------------------------------ */

function makeStubs(opts) {
    opts = opts || {};

    const state = {
        count: opts.count === undefined ? 4 : opts.count,
        activeIndex: opts.activeIndex || 0,
        /* index -> user-assigned name; absent means the default name */
        names: opts.names || {},
        added: 0,
        removed: [],
        renamed: [],
        activated: [],
        dialogs: [],
        throwOn: opts.throwOn || null
    };

    function maybeThrow(fn) {
        if (state.throwOn === fn)
            throw new Error("stub failure in " + fn);
    }

    const Main = {
        getWorkspaceName: function (i) {
            maybeThrow("getWorkspaceName");
            return state.names[i] !== undefined ? state.names[i] : "Workspace " + (i + 1);
        },
        setWorkspaceName: function (i, name) {
            maybeThrow("setWorkspaceName");
            state.renamed.push([i, name]);
            if (name === "")
                delete state.names[i];
            else
                state.names[i] = name;
        },
        hasDefaultWorkspaceName: function (i) {
            return state.names[i] === undefined;
        },
        _addWorkspace: function () {
            maybeThrow("_addWorkspace");
            state.added++;
            state.count++;
        },
        _removeWorkspace: function (ws) {
            maybeThrow("_removeWorkspace");
            state.removed.push(ws.index);
            state.count--;
        }
    };

    const ModalDialog = {
        ConfirmDialog: function (prompt, callback) {
            state.dialogs.push({ prompt: prompt, callback: callback });
            this.open = function () {};
        }
    };

    const wm = {
        get n_workspaces() { return state.count; },
        get_active_workspace_index: function () { return state.activeIndex; },
        get_workspace_by_index: function (i) {
            if (i < 0 || i >= state.count)
                return null;
            return {
                index: i,
                activate: function () { state.activated.push(i); }
            };
        }
    };

    WA.setDependencies({
        Main: Main,
        ModalDialog: ModalDialog,
        getWorkspaceManager: function () { return wm; },
        getCurrentTime: function () { return 0; }
    });

    return state;
}

/* ------------------------------------------------------------------ *
 * computeGridDims - pure
 * ------------------------------------------------------------------ */

suite("computeGridDims (auto, near-square)");
eq("1 cell",  WA.computeGridDims(1,  "auto"), { rows: 1, cols: 1 });
eq("2 cells", WA.computeGridDims(2,  "auto"), { rows: 1, cols: 2 });
eq("3 cells", WA.computeGridDims(3,  "auto"), { rows: 2, cols: 2 });
eq("4 cells", WA.computeGridDims(4,  "auto"), { rows: 2, cols: 2 });
eq("5 cells", WA.computeGridDims(5,  "auto"), { rows: 2, cols: 3 });
eq("9 cells", WA.computeGridDims(9,  "auto"), { rows: 3, cols: 3 });
eq("10 cells", WA.computeGridDims(10, "auto"), { rows: 3, cols: 4 });
eq("17 cells", WA.computeGridDims(17, "auto"), { rows: 4, cols: 5 });
eq("36 cells", WA.computeGridDims(36, "auto"), { rows: 6, cols: 6 });

suite("computeGridDims (guards)");
eq("0 cells clamps to 1",      WA.computeGridDims(0,  "auto"), { rows: 1, cols: 1 });
eq("negative clamps to 1",     WA.computeGridDims(-5, "auto"), { rows: 1, cols: 1 });
eq("undefined clamps to 1",    WA.computeGridDims(undefined, "auto"), { rows: 1, cols: 1 });
eq("NaN clamps to 1",          WA.computeGridDims(NaN, "auto"), { rows: 1, cols: 1 });

suite("computeGridDims (fixed)");
eq("2x3 grows to fit",          WA.computeGridDims(10, "fixed", 2, 3), { rows: 4, cols: 3 });
eq("rows 0 grows to fit",       WA.computeGridDims(10, "fixed", 0, 3), { rows: 4, cols: 3 });
eq("undefined dims use one column", WA.computeGridDims(10, "fixed"),  { rows: 10, cols: 1 });
eq("larger requested rows stay", WA.computeGridDims(10, "fixed", "4", "4"), { rows: 4, cols: 4 });

/* ------------------------------------------------------------------ *
 * planCells - pure
 * ------------------------------------------------------------------ */

function kinds(cells) {
    return cells.map(function (c) { return c.kind === "add" ? "+" : String(c.index); }).join(",");
}

suite("planCells (no add tile)");
eq("exact fit",        kinds(WA.planCells(4, false, 2, 2)), "0,1,2,3");
eq("under capacity",   kinds(WA.planCells(2, false, 2, 2)), "0,1");
eq("overflow expands", kinds(WA.planCells(10, false, 2, 2)), "0,1,2,3,4,5,6,7,8,9");
eq("zero workspaces",  kinds(WA.planCells(0, false, 2, 2)), "");

suite("planCells (with add tile)");
eq("exact fit keeps +",   kinds(WA.planCells(3, true, 2, 2)), "0,1,2,+");
eq("under capacity",      kinds(WA.planCells(2, true, 2, 2)), "0,1,+");
eq("overflow keeps all and + last", kinds(WA.planCells(10, true, 2, 2)), "0,1,2,3,4,5,6,7,8,9,+");
eq("1x1 request still keeps all", kinds(WA.planCells(3, true, 1, 1)), "0,1,2,+");
eq("zero workspaces",     kinds(WA.planCells(0, true, 2, 2)), "+");
eq("bad dims never truncate", kinds(WA.planCells(5, true, 0, 0)), "0,1,2,3,4,+");

suite("computeScrollTarget");
eq("cell mode moves backward", WA.computeScrollTarget(2, 6, 3, "col", -1), 1);
eq("cell mode moves forward", WA.computeScrollTarget(2, 6, 3, "col", 1), 3);
eq("cell mode stops at first", WA.computeScrollTarget(0, 6, 3, "col", -1), 0);
eq("row mode moves by columns", WA.computeScrollTarget(1, 8, 3, "row", 1), 4);
eq("partial row remains reachable", WA.computeScrollTarget(4, 8, 3, "row", 1), 7);
eq("row mode stops on final row", WA.computeScrollTarget(7, 8, 3, "row", 1), 7);

suite("workspace preview geometry");
eq("horizontal monitor union includes both monitors",
    Geometry.boundingRect([
        { x: 0, y: 0, width: 1920, height: 1040 },
        { x: 1920, y: 0, width: 1920, height: 1040 }
    ]), { x: 0, y: 0, width: 3840, height: 1040 });
eq("offset monitor union preserves negative coordinates",
    Geometry.boundingRect([
        { x: -1280, y: 0, width: 1280, height: 1024 },
        { x: 0, y: 200, width: 1920, height: 1080 }
    ]), { x: -1280, y: 0, width: 3200, height: 1280 });
eq("wide monitor union is fitted without distortion",
    Geometry.fitRect({ x: 0, y: 0, width: 3840, height: 1040 }, 210, 84),
    { x: 0, y: 14, width: 210, height: 57 });
eq("full desktop fills preview",
    Geometry.projectRect({ x: 0, y: 0, width: 1920, height: 1080 },
        { x: 0, y: 0, width: 1920, height: 1080 }, 192, 108),
    { x: 0, y: 0, width: 192, height: 108 });
eq("window scales into preview",
    Geometry.projectRect({ x: 960, y: 540, width: 960, height: 540 },
        { x: 0, y: 0, width: 1920, height: 1080 }, 192, 108),
    { x: 96, y: 54, width: 96, height: 54 });
eq("window clips at desktop edge",
    Geometry.projectRect({ x: -100, y: -50, width: 200, height: 100 },
        { x: 0, y: 0, width: 1000, height: 500 }, 100, 50),
    { x: 0, y: 0, width: 10, height: 5 });
eq("offscreen window omitted",
    Geometry.projectRect({ x: 2000, y: 0, width: 100, height: 100 },
        { x: 0, y: 0, width: 1920, height: 1080 }, 192, 108), null);
eq("second monitor maps into right half of fitted desktop",
    Geometry.projectRectInto(
        { x: 1920, y: 0, width: 1920, height: 1040 },
        { x: 0, y: 0, width: 3840, height: 1040 },
        { x: 0, y: 13, width: 210, height: 57 }),
    { x: 105, y: 13, width: 105, height: 57 });
eq("icon centered when it fits",
    Geometry.iconRect({ x: 10, y: 10, width: 40, height: 20 }, 12),
    { x: 24, y: 14, width: 12, height: 12 });
eq("icon omitted when too large",
    Geometry.iconRect({ x: 10, y: 10, width: 8, height: 20 }, 12), null);

suite("desklet grid model matches shared compatibility helpers");
eq("fixed dimensions match", Grid.computeGridDims(10, "fixed", 2, 3),
    WA.computeGridDims(10, "fixed", 2, 3));
eq("cell plan matches", Grid.planCells(5, true), WA.planCells(5, true, 1, 1));
eq("scroll target matches", Grid.computeScrollTarget(4, 8, 3, "row", 1),
    WA.computeScrollTarget(4, 8, 3, "row", 1));

/* ------------------------------------------------------------------ *
 * Query guards
 * ------------------------------------------------------------------ */

suite("canAdd / canRemove");
makeStubs({ count: 1 });
check("canRemove false at 1 workspace", WA.canRemove() === false);
check("canAdd true at 1 workspace", WA.canAdd() === true);

makeStubs({ count: 2 });
check("canRemove true at 2 workspaces", WA.canRemove() === true);

makeStubs({ count: 35 });
check("canAdd true at 35 workspaces", WA.canAdd() === true);

makeStubs({ count: 36 });
check("canAdd false at 36 workspaces (gsettings max)", WA.canAdd() === false);
check("MAX_WORKSPACES is 36", WA.MAX_WORKSPACES === 36);

suite("isValidIndex");
makeStubs({ count: 3 });
check("0 valid", WA.isValidIndex(0) === true);
check("2 valid", WA.isValidIndex(2) === true);
check("3 out of range", WA.isValidIndex(3) === false);
check("-1 out of range", WA.isValidIndex(-1) === false);
check("non-integer rejected", WA.isValidIndex(1.5) === false);
check("undefined rejected", WA.isValidIndex(undefined) === false);

/* ------------------------------------------------------------------ *
 * addWorkspace
 * ------------------------------------------------------------------ */

suite("addWorkspace");
let s = makeStubs({ count: 4 });
check("returns true", WA.addWorkspace() === true);
check("appended once", s.added === 1);

s = makeStubs({ count: 36 });
check("refuses at the maximum", WA.addWorkspace() === false);
check("nothing appended", s.added === 0);

s = makeStubs({ count: 4, throwOn: "_addWorkspace" });
check("returns false when Cinnamon throws", WA.addWorkspace() === false);

/* ------------------------------------------------------------------ *
 * renameWorkspace
 * ------------------------------------------------------------------ */

suite("renameWorkspace");
s = makeStubs({ count: 3 });
check("renames", WA.renameWorkspace(1, "Build") === true);
eq("passed through trimmed", s.renamed, [[1, "Build"]]);

s = makeStubs({ count: 3 });
check("trims whitespace", WA.renameWorkspace(0, "  Mail  ") === true);
eq("stored trimmed", s.renamed, [[0, "Mail"]]);

s = makeStubs({ count: 3, names: { 0: "Mail" } });
check("empty string resets to default", WA.renameWorkspace(0, "") === true);
eq("empty passed to Cinnamon", s.renamed, [[0, ""]]);

s = makeStubs({ count: 3, names: { 0: "Mail" } });
check("no-op when unchanged", WA.renameWorkspace(0, "Mail") === false);
eq("nothing written", s.renamed, []);

s = makeStubs({ count: 3 });
check("rejects out-of-range index", WA.renameWorkspace(9, "X") === false);
check("rejects negative index", WA.renameWorkspace(-1, "X") === false);
check("rejects non-string name", WA.renameWorkspace(0, 42) === false);
check("rejects null name", WA.renameWorkspace(0, null) === false);
eq("nothing written for bad input", s.renamed, []);

s = makeStubs({ count: 3, throwOn: "setWorkspaceName" });
check("returns false when Cinnamon throws", WA.renameWorkspace(0, "Zap") === false);

/* ------------------------------------------------------------------ *
 * removeWorkspaceByIndex
 * ------------------------------------------------------------------ */

suite("removeWorkspaceByIndex");
s = makeStubs({ count: 4 });
check("removes with default name, no prompt", WA.removeWorkspaceByIndex(2, { confirm: true }) === true);
eq("removed index 2", s.removed, [2]);
eq("no dialog raised", s.dialogs.length, 0);

s = makeStubs({ count: 4, names: { 2: "Crypto" } });
check("named workspace raises a prompt", WA.removeWorkspaceByIndex(2, { confirm: true }) === true);
eq("nothing removed yet", s.removed, []);
eq("one dialog raised", s.dialogs.length, 1);
check("prompt names the workspace", s.dialogs[0].prompt.indexOf("Crypto") !== -1, s.dialogs[0].prompt);
s.dialogs[0].callback();
eq("confirming removes it", s.removed, [2]);

s = makeStubs({ count: 4, names: { 2: "Crypto" } });
check("confirm:false skips the prompt", WA.removeWorkspaceByIndex(2, { confirm: false }) === true);
eq("removed immediately", s.removed, [2]);
eq("no dialog", s.dialogs.length, 0);

s = makeStubs({ count: 1 });
check("refuses to remove the last workspace", WA.removeWorkspaceByIndex(0, { confirm: false }) === false);
eq("nothing removed", s.removed, []);

s = makeStubs({ count: 3 });
check("rejects out-of-range index", WA.removeWorkspaceByIndex(7, {}) === false);
check("rejects negative index", WA.removeWorkspaceByIndex(-1, {}) === false);
check("tolerates missing params", WA.removeWorkspaceByIndex(1) === true);

/* Deferred confirm: the world changed while the dialog was open. */
s = makeStubs({ count: 2, names: { 1: "Crypto" } });
WA.removeWorkspaceByIndex(1, { confirm: true });
s.count = 1; /* something else removed a workspace meanwhile */
s.dialogs[0].callback();
eq("deferred remove re-checks canRemove", s.removed, []);

s = makeStubs({ count: 3, names: { 1: "Crypto" } });
WA.removeWorkspaceByIndex(1, { confirm: true });
s.count = 1; /* index 1 no longer exists */
s.dialogs[0].callback();
eq("deferred remove re-resolves the workspace", s.removed, []);

s = makeStubs({ count: 4, throwOn: "_removeWorkspace" });
check("swallows Cinnamon errors", WA.removeWorkspaceByIndex(1, { confirm: false }) === true);
eq("nothing recorded", s.removed, []);

/* onRemoved callback */
s = makeStubs({ count: 4 });
let notified = 0;
WA.removeWorkspaceByIndex(1, { confirm: false, onRemoved: function () { notified++; } });
check("onRemoved fired", notified === 1);

/* ------------------------------------------------------------------ *
 * activateWorkspaceByIndex
 * ------------------------------------------------------------------ */

suite("activateWorkspaceByIndex");
s = makeStubs({ count: 4 });
check("activates", WA.activateWorkspaceByIndex(3) === true);
eq("activated index 3", s.activated, [3]);
check("rejects out-of-range", WA.activateWorkspaceByIndex(4) === false);
eq("still only one activation", s.activated, [3]);

/* ------------------------------------------------------------------ *
 * Failure isolation - nothing may escape into a signal handler
 * ------------------------------------------------------------------ */

suite("failure isolation");
WA.setDependencies({
    Main: null,
    ModalDialog: null,
    getWorkspaceManager: function () { throw new Error("no workspace manager"); },
    getCurrentTime: function () { return 0; }
});
check("getWorkspaceCount survives", WA.getWorkspaceCount() === 0);
check("getActiveWorkspaceIndex survives", WA.getActiveWorkspaceIndex() === 0);
check("canAdd survives", WA.canAdd() === false);
check("canRemove survives", WA.canRemove() === false);
check("addWorkspace survives", WA.addWorkspace() === false);
check("renameWorkspace survives", WA.renameWorkspace(0, "X") === false);
check("removeWorkspaceByIndex survives", WA.removeWorkspaceByIndex(0, {}) === false);
check("activateWorkspaceByIndex survives", WA.activateWorkspaceByIndex(0) === false);
check("getWorkspaceName survives", WA.getWorkspaceName(0) === "");

WA.resetDependencies();

/* ------------------------------------------------------------------ *
 * The two xlet copies must not drift apart
 * ------------------------------------------------------------------ */

suite("shared module copies are in sync");
const decoder = new TextDecoder("utf-8");

function readFile(path) {
    let [ok, bytes] = GLib.file_get_contents(path);
    return ok ? decoder.decode(bytes) : null;
}

["workspaceActions.js", "renameDialog.js"].forEach(function (name) {
    let textA = readFile(DESKLET_DIR + "/" + name);
    let textB = readFile(APPLET_DIR + "/" + name);
    check(name + " identical in both xlets", textA !== null && textA === textB);
});

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

print("\n" + "=".repeat(60));
if (failures.length === 0) {
    print("All " + passed + " assertions passed.");
    System.exit(0);
} else {
    print(passed + " passed, " + failures.length + " FAILED:");
    failures.forEach(function (f) { print("  - " + f); });
    System.exit(1);
}
