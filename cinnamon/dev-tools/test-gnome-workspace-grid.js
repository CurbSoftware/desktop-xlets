#!/usr/bin/env gjs
/**
 * Headless tests for the Workspace Grid GNOME port: the pure grid
 * model in lib/gridModel.js plus the shared workspace-name logic
 * (same assertions as the Workspace Names port, run against this
 * tree's own copy so the duplicate cannot drift).
 *
 * Usage:  gjs -m dev-tools/test-gnome-workspace-grid.js
 * Exits non-zero if any assertion fails.
 */

import { suite, check, eq, finish } from './esm-harness.js';
import * as Grid from '../gnome-workspace-grid@curbsoftware/lib/gridModel.js';
import * as WS from '../gnome-workspace-grid@curbsoftware/lib/workspaces.js';

function kinds(cells) {
    return cells.map(c => c.kind === "add" ? "+" : String(c.index)).join(",");
}

/* ------------------------------------------------------------------ */

suite("computeGridDims");
eq("1 cell", Grid.computeGridDims(1, "auto"), { rows: 1, cols: 1 });
eq("2 cells", Grid.computeGridDims(2, "auto"), { rows: 1, cols: 2 });
eq("3 cells", Grid.computeGridDims(3, "auto"), { rows: 2, cols: 2 });
eq("5 cells", Grid.computeGridDims(5, "auto"), { rows: 2, cols: 3 });
eq("0 clamps to 1", Grid.computeGridDims(0, "auto"), { rows: 1, cols: 1 });
eq("fixed cols honoured, rows grow for the count",
   Grid.computeGridDims(10, "fixed", 2, 3), { rows: 4, cols: 3 });
eq("fixed rows grow for the count", Grid.computeGridDims(10, "fixed", 1, 3), { rows: 4, cols: 3 });
eq("fixed grid big enough stays fixed",
   Grid.computeGridDims(4, "fixed", 2, 3), { rows: 2, cols: 3 });
eq("bad fixed dims clamp", Grid.computeGridDims(10, "fixed", 0, 0), { rows: 10, cols: 1 });

suite("planCells");
eq("three workspaces", kinds(Grid.planCells(3, false)), "0,1,2");
eq("with add tile", kinds(Grid.planCells(3, true)), "0,1,2,+");
eq("zero workspaces with add", kinds(Grid.planCells(0, true)), "+");
eq("zero workspaces without add", kinds(Grid.planCells(0, false)), "");
check("cells carry their index", Grid.planCells(4, false)[2].index === 2);

suite("computeScrollTarget");
eq("column mode moves one row", Grid.computeScrollTarget(0, 9, 3, "row", 1), 3);
eq("column mode up clamps", Grid.computeScrollTarget(1, 9, 3, "row", -1), 1);
eq("row mode steps by a full row", Grid.computeScrollTarget(4, 9, 3, "row", 1), 7);
eq("linear mode steps sideways", Grid.computeScrollTarget(4, 9, 3, "linear", 1), 5);
eq("row mode slides to the end from mid-last-row",
   Grid.computeScrollTarget(5, 8, 3, "row", 1), 7);
eq("already at end stays", Grid.computeScrollTarget(7, 8, 3, "row", 1), 7);
eq("linear mode wraps down", Grid.computeScrollTarget(2, 5, 3, "linear", 1), 3);
eq("linear mode clamps at ends", Grid.computeScrollTarget(4, 5, 3, "linear", 1), 4);
eq("bad active is returned unchanged", Grid.computeScrollTarget(99, 5, 3, "linear", 1), 99);

/* ------------------------------------------------------------------ *
 * The duplicated workspace-name logic, mirrored from the names port.
 * ------------------------------------------------------------------ */

function fakeSettings(stored) {
    const data = { "workspace-names": stored.slice() };
    return {
        get_strv: key => data[key].slice(),
        set_strv: (key, value) => { data[key] = value.slice(); },
        data
    };
}

suite("workspace names (duplicated copy)");
eq("pads missing names",
   WS.paddedNames(fakeSettings(["Work"]), 3), ["Work", "2", "3"]);
eq("trims extras",
   WS.paddedNames(fakeSettings(["A", "B", "C"]), 1), ["A"]);
const renameStore = fakeSettings(["Main"]);
WS.setName(renameStore, 2, "Research", 3);
eq("rename pads and writes",
   renameStore.data["workspace-names"], ["Main", "", "Research"]);
eq("dynamic blocks management",
   WS.canManage({ get_boolean: () => true }), false);

finish();
