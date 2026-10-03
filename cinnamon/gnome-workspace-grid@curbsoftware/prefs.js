/**
 * prefs.js
 *
 * Preferences for the Workspace Grid extension.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import { DEFAULTS } from './lib/defaults.js';
import { Store } from './lib/store.js';

const LAYOUT_MODES = ["auto", "fixed"];
const SCROLL_MODES = ["off", "switch", "reversed"];
const LAYERS = ["desktop", "overlay"];

export default class WorkspaceGridPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._store = new Store(this.uuid, DEFAULTS);

        const page = new Adw.PreferencesPage({
            title: "Layout",
            icon_name: "preferences-desktop-symbolic"
        });

        const layout = new Adw.PreferencesGroup({ title: "Layout" });
        const mode = new Adw.ComboRow({
            title: "Grid layout mode",
            model: Gtk.StringList.new(["Auto (near-square)", "Fixed (rows x cols)"])
        });
        mode.set_selected(Math.max(0, LAYOUT_MODES.indexOf(this._store.get("layoutMode"))));
        mode.connect("notify::selected", () => {
            this._store.set("layoutMode", LAYOUT_MODES[mode.get_selected()] || "auto");
            this._store.save();
        });
        layout.add(mode);
        const rows = this._spinRow("Rows (fixed layout)", "fixedRows",
            this._store.get("fixedRows"), 1, 10, 1);
        const cols = this._spinRow("Columns (fixed layout)", "fixedCols",
            this._store.get("fixedCols"), 1, 10, 1);
        const syncFixed = (sensitive) => {
            rows.set_sensitive(sensitive);
            cols.set_sensitive(sensitive);
        };
        syncFixed(LAYOUT_MODES[mode.get_selected()] === "fixed");
        mode.connect("notify::selected", () =>
            syncFixed(LAYOUT_MODES[mode.get_selected()] === "fixed"));
        layout.add(rows);
        layout.add(cols);
        layout.add(this._switchRow("Prefix names with the workspace number", "showIndex"));
        layout.add(this._spinRow("Tile spacing (px)", "tileSpacing",
            this._store.get("tileSpacing"), 0, 24, 1));
        page.add(layout);

        const behaviour = new Adw.PreferencesGroup({ title: "Behaviour" });
        const scroll = new Adw.ComboRow({
            title: "Scroll wheel",
            model: Gtk.StringList.new(["Off", "Switch workspace", "Switch (reversed)"])
        });
        scroll.set_selected(Math.max(0, SCROLL_MODES.indexOf(this._store.get("scrollWheelBehavior"))));
        scroll.connect("notify::selected", () => {
            this._store.set("scrollWheelBehavior", SCROLL_MODES[scroll.get_selected()] || "off");
            this._store.save();
        });
        behaviour.add(scroll);
        behaviour.add(this._switchRow("Allow adding, renaming and removing workspaces", "enableEditing",
            "Adding and removing also needs dynamic workspaces off in GNOME Tweaks"));
        behaviour.add(this._switchRow("Show a \"+\" tile", "showAddTile"));
        page.add(behaviour);

        const size = new Adw.PreferencesGroup({ title: "Widget size and placement" });
        size.add(this._spinRow("Width (px)", "width", this._store.get("width"), 200, 2000, 50));
        size.add(this._spinRow("Height (px)", "height", this._store.get("height"), 150, 2000, 50));
        size.add(this._spinRow("Position X (px)", "positionX", this._store.get("positionX"), 0, 8000, 10));
        size.add(this._spinRow("Position Y (px)", "positionY", this._store.get("positionY"), 0, 8000, 10));
        const layer = new Adw.ComboRow({
            title: "Layer",
            model: Gtk.StringList.new(["Desktop (under windows)", "Overlay (always visible)"])
        });
        layer.set_selected(Math.max(0, LAYERS.indexOf(this._store.get("layer"))));
        layer.connect("notify::selected", () => {
            this._store.set("layer", LAYERS[layer.get_selected()] || "desktop");
            this._store.save();
        });
        size.add(layer);
        page.add(size);

        window.add(page);
        window.set_default_size(480, 560);
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
