/**
 * workspaces.js
 *
 * Workspace-name bookkeeping for the GNOME workspace ports. GNOME has
 * no Main.setWorkspaceName helper: names are the workspace-names strv
 * in org.gnome.desktop.wm.preferences, and callers must pad and trim
 * the array themselves. All functions take the settings object as a
 * parameter (a Gio.Settings in the shell, a plain fake in tests) so
 * the module stays headless-testable.
 *
 * Ported from the Cinnamon workspaceActions.js name handling. Same
 * convention as the other ports: each tree carries its own copy, no
 * cross-tree imports.
 */

import GLib from 'gi://GLib';

const WM_SCHEMA = "org.gnome.desktop.wm.preferences";
const MUTTER_SCHEMA = "org.gnome.mutter";
const NAMES_KEY = "workspace-names";

export function wmSettings() {
    return new GLib.Settings({ schema_id: WM_SCHEMA });
}

function readNames(settings) {
    try {
        const value = settings.get_strv(NAMES_KEY);
        if (Array.isArray(value))
            return value.map(name => String(name));
    } catch (e) {
    }
    return [];
}

/**
 * paddedNames:
 * @settings: Gio.Settings-like with get_strv
 * @count: workspace count to pad or trim to
 *
 * Returns (array): exactly @count entries; missing names fall back to
 * the shell default ("N", GNOME's own placeholder).
 */
export function paddedNames(settings, count) {
    const names = readNames(settings);
    const out = [];
    for (let i = 0; i < count; i++)
        out.push(names[i] && names[i].trim() ? names[i] : String(i + 1));
    return out;
}

/**
 * nameAt:
 *
 * Returns (string): the stored name at @index, or the default.
 */
export function nameAt(settings, index) {
    const names = readNames(settings);
    const name = names[index];
    return name && name.trim() ? name : String(index + 1);
}

/**
 * setName:
 *
 * Writes @name at @index, padding with empty strings up to @index so
 * intermediate slots survive, and returns the written array.
 */
export function setName(settings, index, name, count) {
    const total = Math.max(index + 1, Number.isFinite(count) ? count : index + 1);
    const names = readNames(settings);
    while (names.length < total)
        names.push("");
    names[index] = String(name || "").trim();
    settings.set_strv(NAMES_KEY, names);
    return names;
}

/**
 * trimmedNames:
 *
 * Returns (array): the RAW stored names trimmed to @count entries with
 * trailing blanks removed (floor one entry). For writing back a tidy
 * array; displays want paddedNames instead, since the workspace count
 * comes from the workspace manager, not the names.
 */
export function trimmedNames(settings, count) {
    const names = readNames(settings)
        .slice(0, Math.max(1, count))
        .map(name => String(name || ""));
    while (names.length > 1 && !names[names.length - 1].trim())
        names.pop();
    return names;
}

/**
 * canManage:
 * @mutterSettings: Gio.Settings-like for org.gnome.mutter
 *
 * GNOME's dynamic workspaces (the default) own the workspace count, so
 * add and remove are only offered when they are off.
 */
export function canManage(mutterSettings) {
    try {
        return !mutterSettings.get_boolean("dynamic-workspaces");
    } catch (e) {
        return false;
    }
}

export function mutterSettings() {
    return new GLib.Settings({ schema_id: MUTTER_SCHEMA });
}
