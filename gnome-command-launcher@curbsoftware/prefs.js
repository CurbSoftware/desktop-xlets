/**
 * prefs.js
 *
 * Preferences for the Command Launcher extension.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import { DEFAULTS } from './lib/defaults.js';
import { Store } from './lib/store.js';

export default class CommandLauncherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._store = new Store(this.uuid, DEFAULTS);

        const page = new Adw.PreferencesPage({
            title: "Command",
            icon_name: "utilities-terminal-symbolic"
        });

        const group = new Adw.PreferencesGroup({
            title: "Command",
            description: "Leave empty to open the preferences on click"
        });
        group.add(this._entryRow("Command", "command"));
        group.add(this._entryRow("Tooltip text", "tooltipText"));
        group.add(this._entryRow("Panel icon (theme name or absolute path)", "panelIcon"));
        page.add(group);

        const behaviour = new Adw.PreferencesGroup({ title: "Behaviour" });
        behaviour.add(this._switchRow("Notify when the process starts and ends", "showNotifications"));
        behaviour.add(this._switchRow("Run as root (pkexec)", "useRoot"));
        behaviour.add(this._switchRow("Run in a different working directory", "useAltEnv"));
        behaviour.add(this._entryRow("Working directory", "altEnv"));
        page.add(behaviour);

        window.add(page);
        window.set_default_size(480, 420);
    }

    _save() {
        this._store.save();
    }

    _entryRow(title, key) {
        const row = new Adw.EntryRow({ title });
        row.set_text(this._store.get(key) || "");
        row.connect("changed", () => {
            this._store.set(key, row.get_text());
            this._save();
        });
        return row;
    }

    _switchRow(title, key) {
        const row = new Adw.SwitchRow({ title });
        row.set_active(!!this._store.get(key));
        row.connect("notify::active", () => {
            this._store.set(key, row.get_active());
            this._save();
        });
        return row;
    }
}
