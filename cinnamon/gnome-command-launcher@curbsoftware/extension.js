/**
 * extension.js
 *
 * A panel button that runs a configured command. Ported from the
 * Cinnamon Command Launcher applet. GNOME differences:
 *
 * - Panel buttons open a menu on click by convention, so the menu
 *   leads with "Run" and the icon also runs on middle click.
 * - The keybinding is not ported: GNOME keybindings require a
 *   compiled gschema, which this port deliberately avoids.
 * - The Tweener bounce is not ported; GNOME removed Tweener.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { Extension } from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import { DEFAULTS } from './lib/defaults.js';
import { Store } from './lib/store.js';

const LauncherButton = GObject.registerClass(
class LauncherButton extends PanelMenu.Button {
    _init(extension, store) {
        super._init(0.0, extension.gettext("Command Launcher"));
        this._extension = extension;
        this._store = store;
        this.settings = store.values();

        this._icon = new St.Icon({
            style_class: "system-status-icon"
        });
        this.add_child(this._icon);

        this.connect("button-press-event", (actor, event) => {
            if (event.get_button() === 2) {
                this.launch();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._runItem = new PopupMenu.PopupMenuItem(extension.gettext("Run"));
        this._runItem.connect("activate", () => this.launch());
        this.menu.addMenuItem(this._runItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const prefs = new PopupMenu.PopupMenuItem(extension.gettext("Preferences"));
        prefs.connect("activate", () => extension.openPreferences());
        this.menu.addMenuItem(prefs);

        this._refresh();
    }

    _refresh() {
        const settings = this._store.values();
        const icon = String(settings.panelIcon || "");
        if (icon && GLib.path_is_absolute(icon) &&
            GLib.file_test(icon, GLib.FileTest.EXISTS)) {
            this._icon.set_gicon(Gio.Icon.new_for_string(icon));
        } else {
            this._icon.icon_name = icon || "utilities-terminal-symbolic";
        }
        this.set_name(String(settings.tooltipText || "Command Launcher"));
        this._runItem.label.set_text(this._extension.gettext("Run") +
            (settings.command ? ": " + settings.command : ""));
    }

    launch() {
        const settings = this._store.values();
        const command = String(settings.command || "").trim();
        if (!command) {
            this._extension.openPreferences();
            return;
        }

        let input = command.replace("~/", GLib.get_home_dir() + "/");
        if (settings.useRoot)
            input = "pkexec " + input;

        let argv;
        try {
            const [success, parsed] = GLib.shell_parse_argv(input);
            if (!success)
                throw new Error("parse failed");
            argv = parsed;
        } catch (e) {
            Main.notify(this._extension.gettext("Unable to parse") + " \"" + command + "\"");
            return;
        }

        let basePath = null;
        if (settings.useAltEnv && GLib.file_test(String(settings.altEnv || ""), GLib.FileTest.EXISTS))
            basePath = String(settings.altEnv);

        try {
            const flags = GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD;
            const [, pid] = GLib.spawn_async(basePath, argv, null, flags, null);
            if (settings.showNotifications)
                Main.notify(this._extension.gettext("Command Launcher"),
                    this._extension.gettext("Process started") + "\n" +
                    this._extension.gettext("Command") + ": " + command + "\n" +
                    this._extension.gettext("Process Id") + ": " + pid);
        } catch (e) {
            Main.notify(this._extension.gettext("Error while trying to run") + " \"" + command + "\"",
                String(e));
        }
    }
});

export default class CommandLauncherExtension extends Extension {
    enable() {
        this._store = new Store(this.uuid, DEFAULTS);
        this._store.watch();
        this._store.onChanged(() => this._button && this._button._refresh());

        this._button = new LauncherButton(this, this._store);
        Main.panel.addToStatusArea(this.uuid, this._button);
    }

    disable() {
        if (this._button) {
            this._button.destroy();
            this._button = null;
        }
        if (this._store) {
            this._store.unwatch();
            this._store = null;
        }
    }
}
