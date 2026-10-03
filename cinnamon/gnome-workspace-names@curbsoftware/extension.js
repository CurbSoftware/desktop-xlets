/**
 * extension.js
 *
 * One panel button per workspace; click to switch, right-click to
 * rename, scroll to move. Ported from the Cinnamon In Panel Workspace
 * Name applet. GNOME differences:
 *
 * - Names are the workspace-names strv in org.gnome.desktop.wm
 *   .preferences (see lib/workspaces.js); there is no
 *   Main.setWorkspaceName equivalent.
 * - Add and remove are only offered when org.gnome.mutter
 *   dynamic-workspaces is off, because GNOME's dynamic workspaces own
 *   the workspace count.
 * - Panel space is one status-area button holding the workspace
 *   buttons, since GNOME panels take one indicator per role.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { Extension } from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import { DEFAULTS } from './lib/defaults.js';
import { Store } from './lib/store.js';
import * as WS from './lib/workspaces.js';
import { promptRename } from './renameDialog.js';

const MIN_SWITCH_INTERVAL_MS = 220;

const WorkspaceNamesButton = GObject.registerClass(
class WorkspaceNamesButton extends PanelMenu.Button {
    _init(extension, store) {
        super._init(0.0, extension.gettext("Workspace Names"));

        this._extension = extension;
        this._store = store;
        this.settings = store.values();

        this._box = new St.BoxLayout({ style_class: "curb-workspace-names-box" });
        this.add_child(this._box);

        this._buttons = [];
        this._rebuildSource = 0;
        this._destroyed = false;
        this._lastSwitchTime = 0;
        this._signalIds = [];

        this._wmSettings = WS.wmSettings();
        this._mutterSettings = WS.mutterSettings();

        this._buildMenu();

        this.connect("scroll-event", (actor, event) => this._onScroll(event));

        this._watch("notify::n-workspaces", this._queueRebuild);
        this._watch("workspace-added", this._queueRebuild);
        this._watch("workspace-removed", this._queueRebuild);
        this._watch("workspaces-reordered", this._queueRebuild);
        this._watch("active-workspace-changed", () => this._updateActiveState());
        this._signalIds.push(this._wmSettings.connect(
            "changed::workspace-names", () => this._queueRebuild()));

        this._queueRebuild();
    }

    _watch(signal, handler) {
        this._signalIds.push(global.workspace_manager.connect(
            signal, () => handler.call(this)));
    }

    _buildMenu() {
        const extension = this._extension;
        this._addItem = new PopupMenu.PopupMenuItem(extension.gettext("Add workspace"));
        this._addItem.connect("activate", () => this._addWorkspace());
        this.menu.addMenuItem(this._addItem);

        this._renameItem = new PopupMenu.PopupMenuItem(extension.gettext("Rename current workspace"));
        this._renameItem.connect("activate", () =>
            this._renameWorkspace(this._activeIndex()));
        this.menu.addMenuItem(this._renameItem);

        this._removeItem = new PopupMenu.PopupMenuItem(extension.gettext("Remove current workspace"));
        this._removeItem.connect("activate", () =>
            this._removeWorkspace(this._activeIndex()));
        this.menu.addMenuItem(this._removeItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._dynamicItem = new PopupMenu.PopupMenuItem(
            extension.gettext("Dynamic workspaces own the workspace count"));
        this._dynamicItem.setSensitive(false);
        this.menu.addMenuItem(this._dynamicItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const prefs = new PopupMenu.PopupMenuItem(extension.gettext("Preferences"));
        prefs.connect("activate", () => extension.openPreferences());
        this.menu.addMenuItem(prefs);
    }

    _activeIndex() {
        return global.workspace_manager.get_active_workspace_index();
    }

    _workspaceCount() {
        return global.workspace_manager.get_n_workspaces();
    }

    _canManage() {
        return this.settings.enableEditing !== false && WS.canManage(this._mutterSettings);
    }

    _onScroll(event) {
        if (this.settings.scrollBehavior === "disabled")
            return Clutter.EVENT_PROPAGATE;
        const direction = event.get_scroll_direction();
        if (direction !== Clutter.ScrollDirection.UP &&
            direction !== Clutter.ScrollDirection.DOWN)
            return Clutter.EVENT_PROPAGATE;

        const now = GLib.get_monotonic_time() / 1000;
        if (now - this._lastSwitchTime < MIN_SWITCH_INTERVAL_MS)
            return Clutter.EVENT_STOP;

        const count = this._workspaceCount();
        const active = this._activeIndex();
        let delta = direction === Clutter.ScrollDirection.UP ? -1 : 1;
        if (this.settings.scrollBehavior === "reversed")
            delta *= -1;
        const target = Math.max(0, Math.min(count - 1, active + delta));
        if (target !== active) {
            this._activate(target);
            this._lastSwitchTime = now;
        }
        return Clutter.EVENT_STOP;
    }

    _activate(index) {
        const workspace = global.workspace_manager.get_workspace_by_index(index);
        if (workspace)
            workspace.activate(global.get_current_time());
    }

    _queueRebuild() {
        if (this._destroyed || this._rebuildSource)
            return;
        this._rebuildSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 0, () => {
            this._rebuildSource = 0;
            this._rebuild();
            return GLib.SOURCE_REMOVE;
        });
    }

    _rebuild() {
        if (this._destroyed)
            return;
        this._box.destroy_all_children();
        this._buttons = [];

        const count = this._workspaceCount();
        const names = WS.paddedNames(this._wmSettings, count);
        const labelWidth = Math.max(12, Number(this.settings.maximumLabelWidth) || 140);

        for (let index = 0; index < count; index++)
            this._box.add_child(this._workspaceButton(index, names[index], labelWidth));

        if (this.settings.showAddButton && this._canManage() && count < 36)
            this._box.add_child(this._addButton());

        this._refreshMenu();
        this._updateActiveState();
    }

    _workspaceButton(index, name, labelWidth) {
        const button = new St.Button({
            style_class: "curb-workspace-names-button",
            reactive: true,
            can_focus: true,
            track_hover: true
        });
        const label = new St.Label({
            text: this._workspaceLabel(index, name),
            style_class: "curb-workspace-names-label",
            y_align: Clutter.ActorAlign.CENTER
        });
        label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        label.style = "max-width: " + labelWidth + "px;";
        button.set_child(label);
        button.connect("clicked", () => this._activate(index));
        button.connect("button-press-event", (actor, event) => {
            if (event.get_button() !== 3)
                return Clutter.EVENT_PROPAGATE;
            this._renameWorkspace(index);
            return Clutter.EVENT_STOP;
        });
        this._buttons.push(button);
        return button;
    }

    _workspaceLabel(index, name) {
        if (this.settings.displayMode === "number")
            return String(index + 1);
        if (this.settings.displayMode === "both")
            return String(index + 1) + ": " + name;
        return name;
    }

    _addButton() {
        const button = new St.Button({
            style_class: "curb-workspace-names-add-button",
            reactive: true,
            can_focus: true
        });
        button.set_child(new St.Icon({
            icon_name: "list-add-symbolic",
            icon_size: 16
        }));
        button.connect("clicked", () => this._addWorkspace());
        return button;
    }

    _refreshMenu() {
        const manage = this._canManage();
        this._addItem.setSensitive(manage && this._workspaceCount() < 36);
        this._renameItem.setSensitive(this.settings.enableEditing !== false);
        this._removeItem.setSensitive(manage && this._workspaceCount() > 1);
        this._dynamicItem.visible = !manage;
    }

    _updateActiveState() {
        if (this._destroyed)
            return;
        const active = this._activeIndex();
        const count = this._workspaceCount();
        const names = WS.paddedNames(this._wmSettings, count);
        for (const button of this._buttons) {
            const index = this._buttons.indexOf(button);
            const isActive = index === active;
            if (isActive)
                button.add_style_pseudo_class("outlined");
            else
                button.remove_style_pseudo_class("outlined");
        }
    }

    _addWorkspace() {
        if (!this._canManage())
            return;
        global.workspace_manager.append_new_workspace(false, global.get_current_time());
    }

    _removeWorkspace(index) {
        if (!this._canManage() || this._workspaceCount() <= 1)
            return;
        const workspace = global.workspace_manager.get_workspace_by_index(index);
        if (workspace)
            workspace.remove(global.get_current_time());
    }

    _renameWorkspace(index) {
        if (this.settings.enableEditing === false || index < 0 || index >= this._workspaceCount())
            return;
        const current = WS.nameAt(this._wmSettings, index);
        promptRename(this._extension.gettext("Rename workspace"), current, (newName) => {
            WS.setName(this._wmSettings, index, newName, this._workspaceCount());
        });
    }

    refresh() {
        this.settings = this._store.values();
        this._queueRebuild();
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        if (this._rebuildSource)
            GLib.source_remove(this._rebuildSource);
        for (const id of this._signalIds) {
            try {
                global.workspace_manager.disconnect(id);
            } catch (e) {
            }
            try {
                this._wmSettings.disconnect(id);
            } catch (e) {
            }
        }
        this._signalIds = [];
        super.destroy();
    }
});

export default class WorkspaceNamesExtension extends Extension {
    enable() {
        this._store = new Store(this.uuid, DEFAULTS);
        this._store.watch();
        this._store.onChanged(() => this._button && this._button.refresh());

        this._button = new WorkspaceNamesButton(this, this._store);
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
