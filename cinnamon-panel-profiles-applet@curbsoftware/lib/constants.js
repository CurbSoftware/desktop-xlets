/* Panel Profiles constants and paths.
 *
 * Pure data plus a small self-uuid seam. No St/Clutter imports and no
 * require() calls: this module must stay loadable headless via
 * imports.searchPath so the dev-tools test harness can use it directly.
 *
 * Public names are declared with var/function so both the require()
 * auto-export inside Cinnamon and the plain imports.<mod> loader see them.
 *
 * Copyright (C) 2026 curbsoftware
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

const GLib = imports.gi.GLib;

/* Root for all applet-owned state. Everything we persist lives under here so
 * a user can wipe one directory to reset the applet completely. */
var STATE_DIR = GLib.get_user_config_dir() + "/cinnamon-panel-profiles";

/* Subdirectories of STATE_DIR and well-known file names. */
var PROFILES_SUBDIR = "profiles";
var BACKUPS_SUBDIR = "backups";
var STATE_FILE = "state.json";
var LAST_GOOD_FILE = "last-good.json";

/* Where Cinnamon keeps per-applet config JSON (~/.config/cinnamon/spices).
 * Restored relativePaths are resolved under this root after sanitization. */
var SPICES_CONFIG_ROOT = GLib.get_user_config_dir() + "/cinnamon/spices";

/* org.cinnamon keys captured into every profile, in fixed order.
 * panels-enabled is written last during restore (within the non-applet
 * phase) so new panels materialize with height and autohide already set.
 * enabled-applets is restored in its own final phase, never from here.
 *
 * panel-scale-text-icons is a BOOLEAN on Cinnamon 6.6, not `as`; the three
 * panel-zone-*-sizes keys are type `s` (one string variant holding the whole
 * JSON array) rather than `as`. Capture code must read the type from the live
 * variant, never from this list. */
var PANEL_SETTING_KEYS = [
    "panels-enabled",
    "enabled-applets",
    "panels-autohide",
    "panels-show-delay",
    "panels-hide-delay",
    "panels-height",
    "panel-scale-text-icons",
    "panel-zone-icon-sizes",
    "panel-zone-symbolic-icon-sizes",
    "panel-zone-text-sizes"
];

/* Subset checked by post-restore verification. The zone-size keys hold
 * JSON-in-string with arbitrary key order, so they are canonicalized before
 * compare rather than string-compared; they are verified as part of the full
 * fingerprint instead of this quick list. */
var VERIFY_KEYS = [
    "panels-enabled",
    "enabled-applets",
    "panels-height",
    "panels-autohide"
];

/* Profile and state file schema versions. Bump and write a migration when
 * the shape changes; existing profiles must survive upgrades. */
var SCHEMA_VERSION = 1;
var STATE_SCHEMA_VERSION = 1;

/* Profile names: trimmed, non-empty, capped. */
var PROFILE_NAME_MAX = 80;

/* How many last-good-<n>.json rollback snapshots to keep. */
var ROLLBACK_KEEP = 3;

/* Private directory and file modes (0o700 = 448 decimal, 0o600 = 384). */
var DIR_MODE = 0o700;
var FILE_MODE = 0o600;

/* Timings. Stabilization default and settle window are in milliseconds;
 * settings UI exposes seconds for the user-facing ones. */
var STABILIZE_MS_DEFAULT = 2000;
var VERIFY_SETTLE_MS = 1500;
var DIRTY_DEBOUNCE_MS = 500;

/* ------------------------------------------------------------------ *
 * Self-uuid seam
 * ------------------------------------------------------------------ *
 * The applet injects its real uuid (metadata.uuid) at init so lib code can
 * exclude itself from config capture. Tests inject a stub. Never hardcode
 * the uuid at call sites. */

let _selfUuid = "cinnamon-panel-profiles-applet@curbsoftware";

/**
 * setDependencies:
 * @deps (object): { selfUuid }
 *
 * Production init and tests both call this. Unknown keys are ignored.
 */
function setDependencies(deps) {
    if (deps && typeof deps.selfUuid === "string" && deps.selfUuid.length > 0)
        _selfUuid = deps.selfUuid;
}

/**
 * resetDependencies:
 *
 * Restores the default self-uuid. Test teardown helper.
 */
function resetDependencies() {
    _selfUuid = "cinnamon-panel-profiles-applet@curbsoftware";
}

/**
 * selfUuid:
 *
 * Returns (string): the uuid treated as "this applet" for exclusion rules.
 */
function selfUuid() {
    return _selfUuid;
}
