/* global imports, global */
const Applet = imports.ui.applet;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Settings = imports.ui.settings;
const SignalManager = imports.misc.signalManager;
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;

const uuid = "cinnamon-workspace-name-applet@curbsoftware";

Gettext.bindtextdomain(uuid, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(uuid, str);
}

/* Xlet-local modules. Cinnamon exposes an applet's own directory through
 * imports.ui.appletManager.applets[uuid]; resolved lazily so a load-order
 * problem surfaces as a logged error instead of a load failure. */
let WorkspaceActions = null;
let RenameDialog = null;

function _loadModules() {
    if (WorkspaceActions && RenameDialog)
        return true;
    try {
        const dir = imports.ui.appletManager.applets[uuid];
        WorkspaceActions = dir.workspaceActions;
        RenameDialog = dir.renameDialog;
        return !!(WorkspaceActions && RenameDialog);
    } catch (e) {
        global.logError(uuid + " could not load helper modules: " + e);
        return false;
    }
}

function WorkspaceNameApplet(metadata, orientation, panel_height, instanceId) {
    this._init(metadata, orientation, panel_height, instanceId);
}

WorkspaceNameApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(metadata, orientation, panel_height, instanceId) {
        Applet.TextApplet.prototype._init.call(this, orientation, panel_height, instanceId);

        this.metadata = metadata;
        this._signalManager = new SignalManager.SignalManager(null);

        /* Pending idle sources created by _deferAction(). */
        this._idleSources = [];
        this._wsNameId = 0;

        _loadModules();

        if (WorkspaceActions)
            WorkspaceActions.setTranslate(_);
        if (RenameDialog)
            RenameDialog.setTranslate(_);

        // Initialize settings
        this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
        this.settings.bind("display-mode", "displayMode", this.updateLabel);
        this.settings.bind("show-menu-on-click", "showMenuOnClick");
        this.settings.bind("scroll-to-switch", "scrollToSwitch");
        this.settings.bind("enable-workspace-editing", "enableEditing");
        this.settings.bind("confirm-remove", "confirmRemove");

        // Set up the menu
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menuManager.addMenu(this.menu);

        try {
            this._signalManager.connect(global.window_manager, 'switch-workspace', Lang.bind(this, this.updateLabel));

            /* Workspace names live in org.cinnamon.desktop.wm.preferences. The
             * key this applet used to watch does not exist in the org.cinnamon
             * schema at all, so renames were never picked up. */
            if (WorkspaceActions)
                this._wsNameId = WorkspaceActions.connectNameChanges(Lang.bind(this, this.updateLabel));

            // Initial update
            this.updateLabel();
        } catch (e) {
            global.logError(this.metadata.uuid + " Exception: " + e.toString());
        }
    },

    on_applet_clicked: function(event) {
        if (this.showMenuOnClick) {
            this.updateMenu();
            this.menu.toggle();
        }
    },

    on_applet_scroll_event: function(actor, event) {
        if (!this.scrollToSwitch) return false;

        try {
            let count = WorkspaceActions ? WorkspaceActions.getWorkspaceCount() : 0;
            if (count <= 1) return false;

            let direction = event.get_scroll_direction();
            let activeIndex = WorkspaceActions.getActiveWorkspaceIndex();
            let target = activeIndex;

            if (direction == 0) { // UP
                target--;
            } else if (direction == 1) { // DOWN
                target++;
            }

            if (target < 0) target = 0;
            if (target >= count) target = count - 1;

            if (target != activeIndex)
                WorkspaceActions.activateWorkspaceByIndex(target);
        } catch (e) {
            global.logError(uuid + " scroll handler failed: " + e);
        }

        return true;
    },

    on_applet_removed_from_panel: function() {
        if (this._idleSources) {
            for (let i = 0; i < this._idleSources.length; i++)
                Mainloop.source_remove(this._idleSources[i]);
            this._idleSources = [];
        }
        if (this._wsNameId && WorkspaceActions) {
            WorkspaceActions.disconnectNameChanges(this._wsNameId);
            this._wsNameId = 0;
        }
        this._signalManager.disconnectAllSignals();
        this.settings.finalize();
    },

    updateLabel: function() {
        try {
            let index = WorkspaceActions ? WorkspaceActions.getActiveWorkspaceIndex()
                                         : global.workspace_manager.get_active_workspace_index();
            let name = Main.getWorkspaceName(index);

            let labelText = "";

            switch (this.displayMode) {
                case "number":
                    labelText = (index + 1).toString();
                    break;
                case "both":
                    labelText = (index + 1).toString() + ": " + name;
                    break;
                case "name":
                default:
                    labelText = name;
                    break;
            }

            this.set_applet_label(labelText);
            this.set_applet_tooltip(name);
        } catch (e) {
            global.logError(uuid + " label update failed: " + e);
        }
    },

    updateMenu: function() {
        try {
            this.menu.removeAll();

            if (!_loadModules())
                return;

            let count = WorkspaceActions.getWorkspaceCount();
            let activeIndex = WorkspaceActions.getActiveWorkspaceIndex();

            for (let i = 0; i < count; i++) {
                let index = i;
                let menuItem = new PopupMenu.PopupMenuItem(WorkspaceActions.getWorkspaceName(index));

                if (index === activeIndex) {
                    menuItem.actor.reactive = false;
                    menuItem.actor.can_focus = false;
                    menuItem.label.add_style_class_name('popup-subtitle-menu-item');
                }

                menuItem.connect('activate', Lang.bind(this, function() {
                    WorkspaceActions.activateWorkspaceByIndex(index);
                }));

                this.menu.addMenuItem(menuItem);
            }

            if (!this.enableEditing)
                return;

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            let renameItem = new PopupMenu.PopupMenuItem("Rename current workspace…");
            renameItem.connect('activate', Lang.bind(this, function() {
                this._onRenameWorkspace(WorkspaceActions.getActiveWorkspaceIndex());
            }));
            this.menu.addMenuItem(renameItem);

            let removeItem = new PopupMenu.PopupMenuItem("Remove current workspace");
            removeItem.setSensitive(WorkspaceActions.canRemove());
            removeItem.connect('activate', Lang.bind(this, function() {
                this._onRemoveWorkspace(WorkspaceActions.getActiveWorkspaceIndex());
            }));
            this.menu.addMenuItem(removeItem);

            let addItem = new PopupMenu.PopupMenuItem("Add workspace");
            addItem.setSensitive(WorkspaceActions.canAdd());
            addItem.connect('activate', Lang.bind(this, this._onAddWorkspace));
            this.menu.addMenuItem(addItem);
        } catch (e) {
            global.logError(uuid + " menu build failed: " + e);
        }
    },

    /* Menu items must not act synchronously: PopupMenuBase closes the menu in
     * its own 'activate' handler, which runs after ours. Pushing a modal
     * dialog before that has happened fights the menu's grab. Defer to the
     * next main loop turn and track the source so teardown can cancel it.
     *
     * timeout_add(0), not idle_add: idle callbacks sit below Clutter's redraw
     * priority, so an action fired while a menu or dialog was still animating
     * could be starved for hundreds of milliseconds. */
    _deferAction: function(fn) {
        const self = this;
        let id = Mainloop.timeout_add(0, function() {
            self._idleSources = self._idleSources.filter(function(s) { return s !== id; });
            try {
                fn.call(self);
            } catch (e) {
                global.logError(uuid + " deferred action failed: " + e);
            }
            return false;
        });
        this._idleSources.push(id);
    },

    _onAddWorkspace: function() {
        this._deferAction(function() {
            WorkspaceActions.addWorkspace();
            this.updateLabel();
        });
    },

    _onRemoveWorkspace: function(index) {
        this._deferAction(function() {
            WorkspaceActions.removeWorkspaceByIndex(index, { confirm: this.confirmRemove });
        });
    },

    _onRenameWorkspace: function(index) {
        this._deferAction(function() {
            if (!WorkspaceActions.isValidIndex(index))
                return;
            let current = WorkspaceActions.getWorkspaceName(index);
            RenameDialog.promptRename(current, function(newName) {
                WorkspaceActions.renameWorkspace(index, newName);
            });
        });
    }
};

function main(metadata, orientation, panel_height, instanceId) {
    return new WorkspaceNameApplet(metadata, orientation, panel_height, instanceId);
}
