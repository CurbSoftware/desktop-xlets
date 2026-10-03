/**
 * prefs.js
 *
 * Preferences for the Workspace Names extension.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import { DEFAULTS } from './lib/defaults.js';
import { Store } from './lib/store.js';

const DISPLAY_MODES = ["name", "number", "both"];
const SCROLL_MODES = ["disabled", "normal", "reversed"];

export default class WorkspaceNamesPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._store = new Store(this.uuid, DEFAULTS);

        const page = new Adw.PreferencesPage({
            title: "Display",
            icon_name: "preferences-desktop-symbolic"
        });

        const display = new Adw.PreferencesGroup({ title: "Display" });
        const mode = new Adw.ComboRow({
            title: "Button text",
            model: Gtk.StringList.new(["Name", "Number", "Number and name"])
        });
        mode.set_selected(Math.max(0, DISPLAY_MODES.indexOf(this._store.get("displayMode"))));
        mode.connect("notify::selected", () => {
            this._store.set("displayMode", DISPLAY_MODES[mode.get_selected()] || "name");
            this._store.save();
        });
        display.add(mode);
        display.add(this._spinRow("Maximum label width (px)", "maximumLabelWidth",
            this._store.get("maximumLabelWidth"), 24, 400, 4));
        page.add(display);

        const behaviour = new Adw.PreferencesGroup({ title: "Behaviour" });
        const scroll = new Adw.ComboRow({
            title: "Scroll wheel",
            model: Gtk.StringList.new(["Disabled", "Switch workspace", "Switch (reversed)"])
        });
        scroll.set_selected(Math.max(0, SCROLL_MODES.indexOf(this._store.get("scrollBehavior"))));
        scroll.connect("notify::selected", () => {
            this._store.set("scrollBehavior", SCROLL_MODES[scroll.get_selected()] || "disabled");
            this._store.save();
        });
        behaviour.add(scroll);
        behaviour.add(this._switchRow("Allow adding, renaming and removing workspaces", "enableEditing",
            "Adding and removing also needs dynamic workspaces off in GNOME Tweaks"));
        behaviour.add(this._switchRow("Show a trailing add button", "showAddButton"));
        page.add(behaviour);

        window.add(page);
        window.set_default_size(480, 420);
    }

    _switchRow(title, key, subtitle) {
        const row = new Adw.SwitchRow({ title });
        if (subtitle)
            row.set_subtitle(subtitle);
        row.set_active(this._store.get(key) !== false);
        row.connect("notify::active", () => {
            this._store.set(key, row.get_active());
            this._store.save();
        });
        return row;
    }

    _spinRow(title, key, value, lower, upper, step) {
        const row = new Adw.SpinRow({
            title,
            adjustment: new Gtk.Adjustment({
                value: Number(value) || lower,
                lower,
                upper,
                step_increment: step
            })
        });
        row.connect("notify::value", () => {
            this._store.set(key, Math.round(row.get_value()));
            this._store.save();
        });
        return row;
    }
}
