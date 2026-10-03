/**
 * widget.js
 *
 * The desktop widget: a grid of named workspace tiles plus an optional
 * "+" tile. Click a tile to switch, right-click it to rename or remove.
 * Ported from the Cinnamon Workspace Grid desklet. GNOME differences:
 *
 * - Container mechanics (layer, Alt+drag) as in the world-clock port.
 * - Live window previews are not ported; tiles are name tiles.
 * - Add and remove are offered only when org.gnome.mutter
 *   dynamic-workspaces is off, because GNOME's dynamic workspaces own
 *   the workspace count.
 * - Per-tile menus are standalone PopupMenus parented to Main.uiGroup
 *   and released by hand, exactly like the Cinnamon tile menus.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as Grid from './lib/gridModel.js';
import * as WS from './lib/workspaces.js';
import { promptRename } from './renameDialog.js';

const MAX_WORKSPACES = 36;

export class WorkspaceGridWidget {
    constructor(extension, store) {
        this.extension = extension;
        this.store = store;
        this.settings = store.values();

        this._rebuildTimeout = 0;
        this._destroyed = false;
        this._dragging = false;
        this._dragOffset = [0, 0];
        this._lastDragEnd = 0;
        this._tileMenu = null;
        this._signalIds = [];

        this._wmSettings = WS.wmSettings();
        this._mutterSettings = WS.mutterSettings();

        this.actor = new St.Bin({
            style_class: "curb-workspace-grid-container",
            reactive: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START
        });
        this._box = new St.BoxLayout({ vertical: true });
        this.actor.set_child(this._box);

        this._capturedId = this.actor.connect("captured-event", (a, event) =>
            this._onCaptured(event));
        this.actor.connect("scroll-event", (a, event) => this._onScroll(event));

        this._watchManager("notify::n-workspaces", () => this._queueRebuild());
        this._watchManager("workspace-added", () => this._queueRebuild());
        this._watchManager("workspace-removed", () => this._queueRebuild());
        this._watchManager("workspaces-reordered", () => this._queueRebuild());
        this._watchManager("active-workspace-changed", () => this._updateActiveState());
        this._signalIds.push(this._wmSettings.connect(
            "changed::workspace-names", () => this._queueRebuild()));

        store.onChanged(() => this._onSettingsReloaded());

        this._rebuild();
        this._applySize();
        this._applyLayer();
        this._applyPosition();
    }

    get settings() {
        return this._settings;
    }

    set settings(values) {
        this._settings = values;
    }

    _watchManager(signal, handler) {
        this._signalIds.push(global.workspace_manager.connect(signal, handler));
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

    _activate(index) {
        const workspace = global.workspace_manager.get_workspace_by_index(index);
        if (workspace)
            workspace.activate(global.get_current_time());
    }

    show() {
        if (this._destroyed)
            return;
        this._applyLayer();
        this._applyPosition();
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._destroyTileMenu();
        if (this._rebuildTimeout)
            GLib.source_remove(this._rebuildTimeout);
        this._rebuildTimeout = 0;
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
        if (this._capturedId) {
            this.actor.disconnect(this._capturedId);
            this._capturedId = 0;
        }
        if (this.actor.get_parent())
            this.actor.get_parent().remove_child(this.actor);
        this.actor.destroy();
    }

    _onSettingsReloaded() {
        if (this._destroyed)
            return;
        this.settings = this.store.values();
        this._applySize();
        this._applyLayer();
        this._applyPosition();
        this._queueRebuild();
    }

    _applySize() {
        this._box.width = Math.max(200, Number(this.settings.width) || 600);
        this._box.height = Math.max(150, Number(this.settings.height) || 400);
    }

    _applyLayer() {
        const parent = this.actor.get_parent();
        if (parent)
            parent.remove_child(this.actor);
        const group = this.settings.layer === "overlay"
            ? Main.uiGroup
            : Main.layoutManager._backgroundGroup;
        group.add_child(this.actor);
    }

    _applyPosition() {
        const monitor = Main.layoutManager.primaryMonitor;
        let x = Number(this.settings.positionX) || 0;
        let y = Number(this.settings.positionY) || 0;
        if (monitor) {
            x = Math.min(Math.max(x, monitor.x), monitor.x + Math.max(0, monitor.width - this._box.width));
            y = Math.min(Math.max(y, monitor.y), monitor.y + Math.max(0, monitor.height - this._box.height));
        }
        this.actor.set_position(Math.round(x), Math.round(y));
    }

    _onCaptured(event) {
        const type = event.type();
        if (type === Clutter.EventType.BUTTON_PRESS) {
            const button = event.get_button();
            const alt = (event.get_state() & Clutter.ModifierType.MOD1_MASK) !== 0;
            if (button === 1 && alt) {
                const [stageX, stageY] = event.get_coords();
                const [actorX, actorY] = this.actor.get_position();
                this._dragging = true;
                this._dragOffset = [stageX - actorX, stageY - actorY];
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }
        if (!this._dragging)
            return Clutter.EVENT_PROPAGATE;
        if (type === Clutter.EventType.MOTION) {
            const [stageX, stageY] = event.get_coords();
            this.actor.set_position(
                Math.round(stageX - this._dragOffset[0]),
                Math.round(stageY - this._dragOffset[1]));
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.BUTTON_RELEASE) {
            this._dragging = false;
            this._lastDragEnd = Date.now();
            const [x, y] = this.actor.get_position();
            this.store.set("positionX", x);
            this.store.set("positionY", y);
            this.store.save();
            this._applyPosition();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onScroll(event) {
        if (this.settings.scrollWheelBehavior === "off")
            return Clutter.EVENT_PROPAGATE;
        const direction = event.get_scroll_direction();
        if (direction !== Clutter.ScrollDirection.UP &&
            direction !== Clutter.ScrollDirection.DOWN)
            return Clutter.EVENT_PROPAGATE;

        const count = this._workspaceCount();
        const active = this._activeIndex();
        let delta = direction === Clutter.ScrollDirection.UP ? -1 : 1;
        if (this.settings.scrollWheelBehavior === "reversed")
            delta *= -1;
        const target = Math.max(0, Math.min(count - 1, active + delta));
        if (target !== active)
            this._activate(target);
        return Clutter.EVENT_STOP;
    }

    _queueRebuild() {
        if (this._destroyed || this._rebuildTimeout)
            return;
        this._rebuildTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 0, () => {
            this._rebuildTimeout = 0;
            this._rebuild();
            return GLib.SOURCE_REMOVE;
        });
    }

    _rebuild() {
        if (this._destroyed)
            return;
        try {
            this._destroyTileMenu();
            this._box.destroy_all_children();
            this._tiles = [];

            const count = this._workspaceCount();
            const showAdd = !!(this.settings.showAddTile && this._canManage() && count < MAX_WORKSPACES);
            const dims = Grid.computeGridDims(
                count + (showAdd ? 1 : 0), this.settings.layoutMode,
                this.settings.fixedRows, this.settings.fixedCols);
            const cells = Grid.planCells(count, showAdd);
            const names = WS.paddedNames(this._wmSettings, count);

            const table = new St.Widget({
                style_class: "curb-workspace-grid",
                layout_manager: new Clutter.GridLayout(),
                x_expand: true,
                y_expand: true
            });
            table.layout_manager.set_row_homogeneous(true);
            table.layout_manager.set_column_homogeneous(true);

            const spacing = Math.max(0, Number(this.settings.tileSpacing) || 0);
            for (let i = 0; i < cells.length; i++) {
                const cell = cells[i];
                const row = Math.floor(i / dims.cols);
                const col = i % dims.cols;
                const actor = cell.kind === "add"
                    ? this._createAddTile(spacing)
                    : this._createWorkspaceTile(cell.index, names[cell.index], spacing);
                table.layout_manager.attach(actor, col, row, 1, 1);
            }

            this._box.add_child(table);
            this._updateActiveState();
        } catch (e) {
            console.error("workspace-grid: rebuild failed: " + e);
        }
    }

    _tileLabel(index, name) {
        return this.settings.showIndex ? String(index + 1) + ": " + name : name;
    }

    _createWorkspaceTile(index, name, spacing) {
        const button = new St.Button({
            style_class: "curb-workspace-grid-tile",
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
            y_expand: true
        });
        button.index = index;
        const label = new St.Label({
            text: this._tileLabel(index, name),
            y_align: Clutter.ActorAlign.CENTER
        });
        label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        button.set_child(label);
        button.style = "margin:" + spacing + "px;";
        button.connect("clicked", () => {
            if (Date.now() - this._lastDragEnd < 350)
                return;
            this._activate(index);
        });
        button.connect("button-press-event", (actor, event) => {
            if (event.get_button() !== 3)
                return Clutter.EVENT_PROPAGATE;
            if (this.settings.enableEditing !== false)
                this._openTileMenu(actor);
            return Clutter.EVENT_STOP;
        });
        this._tiles = this._tiles || [];
        this._tiles.push(button);
        return button;
    }

    _createAddTile(spacing) {
        const button = new St.Button({
            style_class: "curb-workspace-grid-add-tile",
            reactive: true,
            can_focus: true,
            x_expand: true,
            y_expand: true
        });
        button.set_child(new St.Label({
            text: "+",
            y_align: Clutter.ActorAlign.CENTER
        }));
        button.style = "margin:" + spacing + "px;";
        button.connect("clicked", () => {
            if (Date.now() - this._lastDragEnd < 350)
                return;
            this._addWorkspace();
        });
        return button;
    }

    _updateActiveState() {
        const active = this._activeIndex();
        for (const tile of this._tiles || []) {
            if (tile.index === active)
                tile.add_style_pseudo_class("outlined");
            else
                tile.remove_style_pseudo_class("outlined");
        }
    }

    _addWorkspace() {
        if (!this._canManage() || this._workspaceCount() >= MAX_WORKSPACES)
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
        promptRename(this.extension.gettext("Rename workspace"), current, (newName) => {
            WS.setName(this._wmSettings, index, newName, this._workspaceCount());
        });
    }

    /* Tile menus are parented to Main.uiGroup, so they survive
     * destroy_all_children() on our own container and must be released
     * by hand. */
    _openTileMenu(button) {
        this._destroyTileMenu();
        const count = this._workspaceCount();
        const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
        Main.uiGroup.add_child(menu.actor);
        menu.actor.hide();

        const renameItem = new PopupMenu.PopupMenuItem(this.extension.gettext("Rename"));
        renameItem.connect("activate", () => this._renameWorkspace(button.index));
        menu.addMenuItem(renameItem);

        const removeItem = new PopupMenu.PopupMenuItem(this.extension.gettext("Remove"));
        removeItem.setSensitive(count > 1);
        removeItem.connect("activate", () => this._removeWorkspace(button.index));
        menu.addMenuItem(removeItem);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const addItem = new PopupMenu.PopupMenuItem(this.extension.gettext("Add workspace"));
        addItem.setSensitive(count < MAX_WORKSPACES);
        addItem.connect("activate", () => this._addWorkspace());
        menu.addMenuItem(addItem);

        this._tileMenu = menu;
        menu.open(true);
    }

    _destroyTileMenu() {
        if (!this._tileMenu)
            return;
        const menu = this._tileMenu;
        this._tileMenu = null;
        try {
            if (menu.isOpen)
                menu.close(false);
            menu.destroy();
        } catch (e) {
            console.error("workspace-grid: could not destroy tile menu: " + e);
        }
    }
}
