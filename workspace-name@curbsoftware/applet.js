const Applet = imports.ui.applet;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Lang = imports.lang;
const Settings = imports.ui.settings;
const SignalManager = imports.misc.signalManager;

function WorkspaceNameApplet(metadata, orientation, panel_height, instanceId) {
    this._init(metadata, orientation, panel_height, instanceId);
}

WorkspaceNameApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(metadata, orientation, panel_height, instanceId) {
        Applet.TextApplet.prototype._init.call(this, orientation, panel_height, instanceId);

        this.metadata = metadata;
        this._signalManager = new SignalManager.SignalManager(null);
        
        // Initialize settings
        this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
        this.settings.bind("display-mode", "displayMode", this.updateLabel);
        this.settings.bind("show-menu-on-click", "showMenuOnClick");
        this.settings.bind("scroll-to-switch", "scrollToSwitch");

        // Set up the menu
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menuManager.addMenu(this.menu);

        try {
            // Listen for workspace changes
            // Use global.workspace_manager if available (Cinnamon 4.0+), fallback to global.screen
            let wm = global.workspace_manager || global.screen;
            let windowManager = global.window_manager;

            this._signalManager.connect(windowManager, 'switch-workspace', Lang.bind(this, this.updateLabel));
            this._signalManager.connect(global.settings, 'changed::workspace-name-overrides', Lang.bind(this, this.updateLabel));
            
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

        let direction = event.get_scroll_direction();
        let wm = global.workspace_manager || global.screen;
        let activeIndex = wm.get_active_workspace_index();
        let count = wm.n_workspaces;

        if (direction == 0) { // UP
            activeIndex--;
        } else if (direction == 1) { // DOWN
            activeIndex++;
        }

        if (activeIndex < 0) activeIndex = 0;
        if (activeIndex >= count) activeIndex = count - 1;

        if (activeIndex != wm.get_active_workspace_index()) {
            this.activateWorkspace(wm.get_workspace_by_index(activeIndex));
        }
        
        return true;
    },

    on_applet_removed_from_panel: function() {
        this._signalManager.disconnectAllSignals();
        this.settings.finalize();
    },

    updateLabel: function() {
        let wm = global.workspace_manager || global.screen;
        let index = wm.get_active_workspace_index();
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
    },

    updateMenu: function() {
        this.menu.removeAll();
        let wm = global.workspace_manager || global.screen;
        let count = wm.n_workspaces;
        let activeIndex = wm.get_active_workspace_index();

        for (let i = 0; i < count; i++) {
            let workspaceName = Main.getWorkspaceName(i);
            let workspace = wm.get_workspace_by_index(i);
            
            let menuItem = new PopupMenu.PopupMenuItem(workspaceName);

            if (i === activeIndex) {
                menuItem.actor.reactive = false;
                menuItem.actor.can_focus = false;
                menuItem.label.add_style_class_name('popup-subtitle-menu-item');
            }

            menuItem.connect('activate', Lang.bind(this, function() { 
                this.activateWorkspace(workspace); 
            }));
            
            this.menu.addMenuItem(menuItem);
        }
    },

    activateWorkspace: function(workspace) {
        workspace.activate(global.get_current_time());
    }
};

function main(metadata, orientation, panel_height, instanceId) {
    return new WorkspaceNameApplet(metadata, orientation, panel_height, instanceId);
}