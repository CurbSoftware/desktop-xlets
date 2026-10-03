#!/usr/bin/env gjs
/**
 * Headless tests for the Desktop Profiles GNOME port: profile storage
 * (isolated with XDG_CONFIG_HOME) and the capture/apply logic against
 * a fake backend, mirroring the Cinnamon panel-profiles test seams.
 *
 * Usage:  XDG_CONFIG_HOME=$(mktemp -d) gjs -m dev-tools/test-gnome-panel-profiles.js
 * Exits non-zero if any assertion fails.
 */

import GLib from 'gi://GLib';

import { suite, check, eq, finish } from './esm-harness.js';
import * as Profiles from '../gnome-panel-profiles@curbsoftware/lib/profiles.js';
import * as Snapshot from '../gnome-panel-profiles@curbsoftware/lib/desktopSnapshot.js';

const UUID = "gnome-panel-profiles@curbsoftware";

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

suite("safeName");
eq("plain name passes", Profiles.safeName("Work desk"), "Work desk");
eq("slashes become underscores", Profiles.safeName("a/b\\c"), "a_b_c");
eq("leading dot sanitized", Profiles.safeName(".hidden"), "_hidden");
eq("empty refused", Profiles.safeName("   "), "");

suite("profile storage");
check("empty store lists nothing", Profiles.listProfiles(UUID).length === 0);
check("save works", Profiles.saveProfile(UUID, "Work", { hello: 1 }));
eq("lists the profile", Profiles.listProfiles(UUID), ["Work"]);
eq("loads the snapshot", Profiles.loadProfile(UUID, "Work"), { hello: 1 });
check("missing profile loads null", Profiles.loadProfile(UUID, "Nope") === null);
check("second save is fine", Profiles.saveProfile(UUID, "Gaming", { a: 2 }));
eq("two profiles sorted", Profiles.listProfiles(UUID), ["Gaming", "Work"]);

suite("rename and delete");
check("rename works", Profiles.renameProfile(UUID, "Work", "Focus"));
eq("old name gone", Profiles.listProfiles(UUID), ["Focus", "Gaming"]);
eq("renamed snapshot kept", Profiles.loadProfile(UUID, "Focus"), { hello: 1 });
check("rename onto existing refused", !Profiles.renameProfile(UUID, "Focus", "Gaming"));
check("delete works", Profiles.deleteProfile(UUID, "Gaming"));
eq("only one left", Profiles.listProfiles(UUID), ["Focus"]);
check("delete missing is false", !Profiles.deleteProfile(UUID, "Nope"));

/* ------------------------------------------------------------------ *
 * Capture and apply
 * ------------------------------------------------------------------ */

function fakeBackend(initial) {
    const state = {
        schemas: initial.schemas || {},
        enabled: (initial.enabled || []).slice(),
        favorites: (initial.favorites || []).slice(),
        monitors: initial.monitors || null,
        extensionSchemas: (initial.extensionSchemas || []).slice(),
        writes: []
    };
    return {
        state,
        listExtensionSchemas() {
            return state.extensionSchemas;
        },
        readSchema(schema) {
            return state.schemas[schema] ? Object.assign({}, state.schemas[schema]) : null;
        },
        writeSchema(schema, values) {
            state.writes.push(schema);
            state.schemas[schema] = Object.assign({}, values);
        },
        getEnabledExtensions() {
            return state.enabled.slice();
        },
        setEnabledExtensions(uuids) {
            state.enabled = uuids.slice();
        },
        getFavorites() {
            return state.favorites.slice();
        },
        setFavorites(ids) {
            state.favorites = ids.slice();
        },
        readMonitorsXml() {
            return state.monitors;
        },
        writeMonitorsXml(text) {
            state.monitors = text;
            return true;
        }
    };
}

suite("capture");
const backendA = fakeBackend({
    schemas: {
        "org.gnome.desktop.wm.preferences": { "workspace-names": "['A', 'B']" },
        "org.gnome.shell.extensions.dash-to-dock": { "dock-position": "'BOTTOM'" }
    },
    enabled: ["a@x", "b@x"],
    favorites: ["firefox.desktop"],
    monitors: "<monitors/>",
    extensionSchemas: ["org.gnome.shell.extensions.dash-to-dock"]
});
const snap = Snapshot.capture(backendA);
eq("enabled captured", snap.enabledExtensions, ["a@x", "b@x"]);
eq("favorites captured", snap.favorites, ["firefox.desktop"]);
eq("monitors captured", snap.monitorsXml, "<monitors/>");
eq("fixed and extension schemas captured",
   Object.keys(snap.schemas).sort(),
   ["org.gnome.desktop.wm.preferences", "org.gnome.shell.extensions.dash-to-dock"]);

suite("apply");
const backendB = fakeBackend({
    schemas: { "org.gnome.shell.extensions.dash-to-dock": { "dock-position": "'LEFT'" } },
    enabled: ["c@x"],
    favorites: [],
    monitors: null,
    extensionSchemas: ["org.gnome.shell.extensions.dash-to-dock"]
});
const result = Snapshot.apply(backendB, snap);
check("apply succeeds", result.ok === true);
eq("schemas written", backendB.state.schemas["org.gnome.desktop.wm.preferences"]["workspace-names"], "['A', 'B']");
eq("extension settings written",
   backendB.state.schemas["org.gnome.shell.extensions.dash-to-dock"]["dock-position"], "'BOTTOM'");
eq("enabled swapped", backendB.state.enabled, ["a@x", "b@x"]);
eq("favorites written", backendB.state.favorites, ["firefox.desktop"]);
eq("monitors staged", backendB.state.monitors, "<monitors/>");
check("rollback is a capture of the old state",
   result.rollback.enabledExtensions.length === 1);

suite("apply: rollback path restores");
const undone = Snapshot.apply(backendB, result.rollback);
check("rollback apply succeeds", undone.ok === true);
eq("enabled restored", backendB.state.enabled, ["c@x"]);
eq("dock position restored",
   backendB.state.schemas["org.gnome.shell.extensions.dash-to-dock"]["dock-position"], "'LEFT'");

suite("apply: guards");
check("null snapshot fails cleanly", Snapshot.apply(backendB, null).ok === false);
const skip = Snapshot.apply(fakeBackend({}), snap, { skipMonitors: true });
check("skipMonitors leaves monitors alone", skip.ok === true);

suite("describe");
eq("counts",
   Snapshot.describe(snap),
   { extensions: 2, schemas: 2, monitors: true });
eq("empty snapshot", Snapshot.describe(null),
   { extensions: 0, schemas: 0, monitors: false });

suite("failing write surfaces in failures");
const failing = fakeBackend({});
failing.writeSchema = schema => {
    throw new Error("locked");
};
const failingResult = Snapshot.apply(failing, snap);
check("failure reported", failingResult.ok === false);
check("failure names the schema",
   failingResult.failures.join(";").indexOf("locked") !== -1);

finish();
