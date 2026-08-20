/* Panel Profiles profile schema: ids, names, validation, migration.
 *
 * validate() is the gate every loaded profile passes through (files on disk
 * are foreign input: hand-edited, copied between machines, or written by a
 * future version). migrate() upgrades what it understands and passes the
 * rest through untouched for validate() to reject.
 *
 * Every public function catches exceptions and returns a failure value.
 *
 * No St/Clutter imports and no require() calls: loadable headless.
 *
 * Copyright (C) 2026 curbsoftware
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

const GLib = imports.gi.GLib;

/* Injected logger; optional, silent without one. */
let _logger = null;
let _constantsModule = null;

/**
 * setDependencies:
 * @deps (object): { logger, constants (optional) }
 *
 * Test/init seam. Unknown keys are ignored.
 */
function setDependencies(deps) {
    if (deps && typeof deps === "object") {
        _logger = deps.logger || null;
        if (deps.constants)
            _constantsModule = deps.constants;
    }
}

/**
 * resetDependencies:
 *
 * Restores defaults. Test teardown helper.
 */
function resetDependencies() {
    _logger = null;
    _constantsModule = null;
}

function _warn(msg) {
    try {
        if (_logger && typeof _logger.warn === "function")
            _logger.warn(msg);
    } catch (ignored) {
        /* logging must never take the caller down */
    }
}

/* Frozen schema constants, taken from the constants module when it can be
 * reached (headless tests put lib/ on imports.searchPath; applet.js passes
 * it via setDependencies({constants})). */
function _constants() {
    if (_constantsModule)
        return _constantsModule;
    try {
        return imports.constants;
    } catch (ignored) {
        return null;
    }
}

function _schemaVersion() {
    const c = _constants();
    return (c && typeof c.SCHEMA_VERSION === "number") ? c.SCHEMA_VERSION : 1;
}

function _nameMax() {
    const c = _constants();
    return (c && typeof c.PROFILE_NAME_MAX === "number")
        ? c.PROFILE_NAME_MAX : 80;
}

/* relativePath shape pre-check. Full sanitization (resolution, containment)
 * belongs to appletConfigStore; this only warns early on obviously wrong
 * shapes so a load reports something actionable. */
var RELATIVE_PATH_RE = /^[A-Za-z0-9._+@-]+\/[A-Za-z0-9._+@-]+\.json$/;

/**
 * newProfileId:
 *
 * Returns (string): a fresh random uuid, or "" if generation throws (the
 * empty string then fails validation like any other missing id).
 */
function newProfileId() {
    try {
        return GLib.uuid_string_random();
    } catch (e) {
        _warn("newProfileId failed: " + e);
        return "";
    }
}

/**
 * sanitizeName:
 * @name: candidate profile name.
 *
 * Returns (string|null): the trimmed name, or null when it is empty after
 * trimming, not a string, or longer than PROFILE_NAME_MAX.
 */
function sanitizeName(name) {
    try {
        if (typeof name !== "string")
            return null;
        const trimmed = name.trim();
        if (trimmed.length === 0 || trimmed.length > _nameMax())
            return null;
        return trimmed;
    } catch (e) {
        return null;
    }
}

/* One validation finding. errors block loading; warnings ride along. */
function _finding(list, msg) {
    list.push(msg);
}

/**
 * validate:
 * @profileObj: parsed profile JSON (or anything; this is foreign input).
 *
 * Structural check of schema v1. Both panels-enabled and enabled-applets are
 * required in cinnamonSettings: without them there is no panel state to
 * restore, so the profile is inert. A missing managerAnchor only warns;
 * ensureManagerAnchor repairs it during load.
 *
 * Returns (object): {ok, errors, warnings}. ok is true only when errors is
 * empty; warnings never affect ok.
 */
function validate(profileObj) {
    const errors = [];
    const warnings = [];
    try {
        if (!profileObj || typeof profileObj !== "object" ||
            Array.isArray(profileObj)) {
            _finding(errors, "profile is not an object");
            return { ok: false, errors: errors, warnings: warnings };
        }

        /* Version gate. */
        const version = profileObj.schemaVersion;
        if (typeof version !== "number" || !Number.isFinite(version))
            _finding(errors, "schemaVersion missing or not a number");
        else if (version < 1)
            _finding(errors, "unsupported schemaVersion " + version);
        else if (version > _schemaVersion())
            _finding(errors, "schemaVersion " + version +
                " is newer than supported " + _schemaVersion());

        /* Identity. */
        if (typeof profileObj.id !== "string" || profileObj.id.length === 0)
            _finding(errors, "id missing or empty");
        if (sanitizeName(profileObj.name) === null)
            _finding(errors, "name missing, empty, or over " + _nameMax() +
                " characters");
        ["createdAt", "updatedAt"].forEach(function (field) {
            if (typeof profileObj[field] !== "string" || profileObj[field].length === 0)
                _finding(errors, field + " missing or not a string");
        });

        /* Monitor expectations. */
        const topology = profileObj.monitorTopology;
        if (!topology || typeof topology !== "object" ||
            Array.isArray(topology)) {
            _finding(errors, "monitorTopology missing or not an object");
        } else {
            if (!Number.isInteger(topology.expectedCount) ||
                topology.expectedCount < 1)
                _finding(errors, "monitorTopology.expectedCount must be an integer >= 1");
            if (!Array.isArray(topology.monitors))
                _finding(errors, "monitorTopology.monitors missing or not an array");
        }

        /* Panel state. */
        const settings = profileObj.cinnamonSettings;
        if (!settings || typeof settings !== "object" ||
            Array.isArray(settings)) {
            _finding(errors, "cinnamonSettings missing or not an object");
        } else {
            ["panels-enabled", "enabled-applets"].forEach(function (key) {
                if (!settings[key])
                    _finding(errors, "cinnamonSettings lacks " + key);
            });
        }

        /* Applet config snapshots. */
        const configs = profileObj.appletConfigs;
        if (!Array.isArray(configs)) {
            _finding(errors, "appletConfigs missing or not an array");
        } else {
            configs.forEach(function (config, i) {
                const where = "appletConfigs[" + i + "]";
                if (!config || typeof config !== "object" ||
                    Array.isArray(config)) {
                    _finding(errors, where + " is not an object");
                    return;
                }
                ["uuid", "relativePath", "content"].forEach(function (field) {
                    if (typeof config[field] !== "string" ||
                        config[field].length === 0)
                        _finding(errors, where + " lacks string " + field);
                });
                if (typeof config.relativePath === "string" &&
                    !RELATIVE_PATH_RE.test(config.relativePath))
                    _finding(warnings, where +
                        " relativePath has an unexpected shape");
            });
        }

        /* Manager anchor. */
        const anchor = profileObj.managerAnchor;
        const constants = _constants();
        const selfUuid = constants && typeof constants.selfUuid === "function"
            ? constants.selfUuid() : null;
        if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) {
            _finding(warnings, "managerAnchor missing; it will be repaired on load");
        } else if (typeof anchor.uuid !== "string" ||
            (selfUuid !== null && anchor.uuid !== selfUuid)) {
            _finding(errors, "managerAnchor uuid does not match this applet");
        }
    } catch (e) {
        _finding(errors, "validate failed: " + e);
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

/* Migrations known today. Version 1 is the current shape, so its migration
 * is the identity; future versions get entries here and a bump of
 * SCHEMA_VERSION in constants.js. */
var _MIGRATIONS = {
    1: function (profile, warnings) {
        return profile;
    }
};

/**
 * migrate:
 * @profileObj: parsed profile JSON.
 *
 * Returns (object): { profile, warnings }. The returned profile is always a
 * deep clone (JSON round-trip); the input is never mutated. A profile with
 * no schemaVersion is assumed to be version 1 with a warning. An unknown
 * future version passes through untouched with a warning; validate()
 * rejects it afterwards. A non-object also passes through with a warning
 * for the same reason.
 */
function migrate(profileObj) {
    const warnings = [];
    try {
        let profile = profileObj;
        try {
            profile = JSON.parse(JSON.stringify(profileObj));
        } catch (e) {
            _finding(warnings, "migrate could not deep-clone the profile: " + e);
        }
        if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
            _finding(warnings, "profile is not an object; passing through");
            return { profile: profile, warnings: warnings };
        }
        const version = profile.schemaVersion;
        if (typeof version !== "number" || !Number.isFinite(version)) {
            _finding(warnings, "profile has no schemaVersion; assuming 1");
            profile.schemaVersion = 1;
        }
        const migration = _MIGRATIONS[profile.schemaVersion];
        if (!migration) {
            _finding(warnings, "unknown schemaVersion " +
                profile.schemaVersion + "; passing through");
            return { profile: profile, warnings: warnings };
        }
        return { profile: migration(profile, warnings), warnings: warnings };
    } catch (e) {
        _finding(warnings, "migrate failed: " + e);
        return { profile: profileObj, warnings: warnings };
    }
}
