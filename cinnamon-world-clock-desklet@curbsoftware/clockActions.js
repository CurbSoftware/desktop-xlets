/* global imports */
/**
 * clockActions.js
 *
 * Pure clock-list and grid-layout helpers for the World Clock desklet.
 * Deliberately contains no St/Clutter widgets so the module can be exercised
 * headlessly by dev-tools/test-clock-actions.js (libst.so cannot be loaded
 * outside the Cinnamon process).
 *
 * computeGridDims / planCells are adapted from the Workspace Grid desklet's
 * workspaceActions.js. Cinnamon gives xlets no way to import across xlet
 * boundaries, so the maths is duplicated here rather than shared.
 */

let _translate = function (str) { return str; };

function setTranslate(fn) {
    if (typeof fn === "function")
        _translate = fn;
}

var MIN_CLOCKS = 1;
var MAX_CLOCKS = 36;

var DEFAULT_CLOCK = {
    name: "Local",
    timezone: "local"
};

function _newId(opts) {
    opts = opts || {};
    if (typeof opts.generateId === "function")
        return opts.generateId();
    try {
        return imports.gi.GLib.uuid_string_random();
    } catch (e) {
        return "clock-" + Date.now() + "-" + Math.floor(Math.random() * 1e9);
    }
}

function _toPositiveInt(value, fallback) {
    let n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1)
        return fallback;
    return n;
}

/* ------------------------------------------------------------------ *
 * Pure layout helpers
 * ------------------------------------------------------------------ */

/**
 * computeGridDims:
 * @cellCount (int): total cells to lay out, including the "+" tile
 * @mode (string): "fixed" or anything else for auto
 * @fixedRows (int): rows to use in fixed mode
 * @fixedCols (int): columns to use in fixed mode
 *
 * Returns (object): { rows, cols }. Auto mode produces a near-square grid.
 * Fixed mode returns the requested dimensions verbatim, which may be smaller
 * than @cellCount - planCells() handles that overflow.
 */
function computeGridDims(cellCount, mode, fixedRows, fixedCols) {
    let n = _toPositiveInt(cellCount, 1);

    if (mode === "fixed") {
        return {
            rows: _toPositiveInt(fixedRows, 1),
            cols: _toPositiveInt(fixedCols, 1)
        };
    }

    let cols = Math.ceil(Math.sqrt(n));
    let rows = Math.ceil(n / cols);
    return { rows: rows, cols: cols };
}

/**
 * planCells:
 * @clockCount (int): number of clocks to show
 * @showAddTile (boolean): whether to reserve a cell for the "+" tile
 * @rows (int): grid rows
 * @cols (int): grid columns
 *
 * Decides what goes in each grid cell, in row-major order. When the grid is
 * too small to hold everything, clocks are truncated but the "+" tile keeps
 * the final cell so it stays reachable.
 *
 * Returns (array): [{ kind: "clock"|"add", index: int }, ...]
 */
function planCells(clockCount, showAddTile, rows, cols) {
    let n = parseInt(clockCount, 10);
    if (!Number.isFinite(n) || n < 0)
        n = 0;

    let capacity = _toPositiveInt(rows, 1) * _toPositiveInt(cols, 1);
    let cells = [];

    if (capacity <= 0)
        return cells;

    if (!showAddTile) {
        let limit = Math.min(n, capacity);
        for (let i = 0; i < limit; i++)
            cells.push({ kind: "clock", index: i });
        return cells;
    }

    let clockSlots = Math.min(n, capacity - 1);
    for (let i = 0; i < clockSlots; i++)
        cells.push({ kind: "clock", index: i });
    cells.push({ kind: "add", index: -1 });
    return cells;
}

/* ------------------------------------------------------------------ *
 * Clock list helpers
 * ------------------------------------------------------------------ */

/**
 * buildClock:
 * @values (object): { name, timezone }
 * @existingId (string): keep this id when editing; omit to allocate a new one
 * @opts (object): optional { generateId: function }
 *
 * Returns (object): { id, name, timezone }
 */
function buildClock(values, existingId, opts) {
    values = values && typeof values === "object" ? values : {};

    let id = typeof existingId === "string" ? existingId.trim() : "";
    if (!id || id === "default")
        id = _newId(opts);

    let name = typeof values.name === "string" ? values.name.trim() : "";
    let timezone = typeof values.timezone === "string" ? values.timezone.trim() : "";
    if (!timezone)
        timezone = DEFAULT_CLOCK.timezone;

    return {
        id: id,
        name: name,
        timezone: timezone
    };
}

/**
 * normalizeClockEntry:
 * @clock (object): raw clock record, possibly with legacy size/format fields
 * @opts (object): optional { generateId: function }
 *
 * Drops per-clock format/size fields. Returns { changed, clock }.
 */
function normalizeClockEntry(clock, opts) {
    let input = clock && typeof clock === "object" ? clock : {};
    let changed = !(clock && typeof clock === "object");

    let id = typeof input.id === "string" ? input.id.trim() : "";
    if (!id || id === "default") {
        id = _newId(opts);
        changed = true;
    }

    let name = typeof input.name === "string" ? input.name.trim() : "";
    if (name !== input.name)
        changed = true;

    let timezone = typeof input.timezone === "string" ? input.timezone.trim() : "";
    if (!timezone) {
        timezone = DEFAULT_CLOCK.timezone;
        changed = true;
    } else if (timezone !== input.timezone) {
        changed = true;
    }

    for (let key in input) {
        if (key !== "id" && key !== "name" && key !== "timezone") {
            changed = true;
            break;
        }
    }

    return {
        changed: changed,
        clock: {
            id: id,
            name: name,
            timezone: timezone
        }
    };
}

/**
 * normalizeClockList:
 * @clockList (array): raw clocks setting
 * @opts (object): optional { generateId: function }
 *
 * Returns (object): { clocks, changed }. An empty list becomes one default clock.
 */
function normalizeClockList(clockList, opts) {
    let list = Array.isArray(clockList) ? clockList : [];
    let normalized = [];
    let changed = !Array.isArray(clockList);

    for (let i = 0; i < list.length; i++) {
        let result = normalizeClockEntry(list[i], opts);
        normalized.push(result.clock);
        if (result.changed)
            changed = true;
    }

    if (normalized.length === 0) {
        normalized.push(buildClock(DEFAULT_CLOCK, null, opts));
        changed = true;
    }

    return {
        clocks: normalized,
        changed: changed
    };
}

function _clocks(clocks) {
    return Array.isArray(clocks) ? clocks : [];
}

/**
 * canAdd:
 * @clocks (array)
 *
 * Returns (boolean): whether another clock may be created.
 */
function canAdd(clocks) {
    return _clocks(clocks).length < MAX_CLOCKS;
}

/**
 * canRemove:
 * @clocks (array)
 *
 * Returns (boolean): whether a clock may be removed. The last clock is kept.
 */
function canRemove(clocks) {
    return _clocks(clocks).length > MIN_CLOCKS;
}

/**
 * isValidIndex:
 * @clocks (array)
 * @index (int)
 *
 * Returns (boolean): whether @index addresses an existing clock.
 */
function isValidIndex(clocks, index) {
    let n = _clocks(clocks).length;
    return Number.isInteger(index) && index >= 0 && index < n;
}

/**
 * getClockLabel:
 * @clock (object)
 *
 * Returns (string): display name, falling back to a short timezone label.
 */
function getClockLabel(clock) {
    if (!clock || typeof clock !== "object")
        return _translate("Clock");
    if (typeof clock.name === "string" && clock.name.trim())
        return clock.name.trim();
    if (typeof clock.timezone === "string" && clock.timezone.trim())
        return timezoneDisplayName(clock.timezone);
    return _translate("Clock");
}

/**
 * timezoneDisplayName:
 * @tz (string): "local" or an IANA timezone id
 *
 * Returns (string): a short label, e.g. "Local" or "Los Angeles".
 */
function timezoneDisplayName(tz) {
    if (!tz || tz === "local")
        return _translate("Local");
    let parts = String(tz).split("/");
    return parts[parts.length - 1].replace(/_/g, " ");
}

/**
 * timezoneListLabel:
 * @tz (string)
 *
 * Returns (string): list-row text, e.g. "Los Angeles — America/Los_Angeles".
 */
function timezoneListLabel(tz) {
    if (!tz || tz === "local")
        return _translate("Local (system timezone)");
    let pretty = timezoneDisplayName(tz);
    if (pretty === tz)
        return tz;
    return pretty + " — " + tz;
}

function _uniqueSorted(list) {
    let seen = Object.create(null);
    let out = [];
    for (let i = 0; i < list.length; i++) {
        let tz = list[i];
        if (typeof tz !== "string" || !tz || tz === "local" || seen[tz])
            continue;
        seen[tz] = true;
        out.push(tz);
    }
    out.sort();
    return out;
}

var FALLBACK_TIMEZONES = [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Anchorage",
    "America/Honolulu",
    "America/Toronto",
    "America/Mexico_City",
    "America/Sao_Paulo",
    "America/Argentina/Buenos_Aires",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Madrid",
    "Europe/Rome",
    "Europe/Moscow",
    "Africa/Cairo",
    "Africa/Johannesburg",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Shanghai",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Asia/Seoul",
    "Australia/Sydney",
    "Pacific/Auckland"
];

/**
 * listTimezones:
 *
 * Returns (array): ["local", ...IANA ids]. Uses Intl when available.
 */
function listTimezones() {
    let zones = [];
    try {
        if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function")
            zones = Intl.supportedValuesOf("timeZone");
    } catch (e) {
        zones = [];
    }
    if (!zones || !zones.length)
        zones = FALLBACK_TIMEZONES.slice();
    return ["local"].concat(_uniqueSorted(zones));
}

/**
 * filterTimezones:
 * @zones (array)
 * @query (string)
 *
 * Returns (array): zones whose id or display name contains @query.
 */
function filterTimezones(zones, query) {
    let list = Array.isArray(zones) ? zones : [];
    let q = typeof query === "string" ? query.trim().toLowerCase() : "";
    if (!q)
        return list.slice();
    return list.filter(function (tz) {
        let id = String(tz).toLowerCase();
        let label = timezoneListLabel(tz).toLowerCase();
        return id.indexOf(q) !== -1 || label.indexOf(q) !== -1;
    });
}

/**
 * addClock:
 * @clocks (array)
 * @values (object): { name, timezone }
 * @opts (object): optional { generateId: function }
 *
 * Returns (array): a new list with the clock appended, or a copy if at max.
 */
function addClock(clocks, values, opts) {
    let list = _clocks(clocks).slice();
    if (!canAdd(list))
        return list;
    list.push(buildClock(values, null, opts));
    return list;
}

/**
 * updateClock:
 * @clocks (array)
 * @clockId (string)
 * @values (object): { name, timezone }
 *
 * Returns (array): a new list with the matching clock replaced.
 */
function updateClock(clocks, clockId, values) {
    let list = _clocks(clocks);
    if (typeof clockId !== "string" || !clockId)
        return list.slice();

    let found = false;
    let next = list.map(function (clock) {
        if (clock.id !== clockId)
            return clock;
        found = true;
        return buildClock(values, clock.id);
    });
    return found ? next : list.slice();
}

/**
 * removeClock:
 * @clocks (array)
 * @clockId (string)
 *
 * Returns (array): a new list without that clock. Refuses to empty the list.
 */
function removeClock(clocks, clockId) {
    let list = _clocks(clocks);
    if (!canRemove(list) || typeof clockId !== "string" || !clockId)
        return list.slice();
    return list.filter(function (clock) {
        return clock.id !== clockId;
    });
}
