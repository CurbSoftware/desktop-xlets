/* global imports */
const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Lang = imports.lang;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;

const uuid = "workspace-grid-desklet@curb.software";

function MyDesklet(metadata, deskletId) {
    this._init(metadata, deskletId);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], deskletId);
        this.settings.bind("layout-mode", "layoutMode", this.on_setting_changed);
        this.settings.bind("fixed-rows", "fixedRows", this.on_setting_changed);
        this.settings.bind("fixed-cols", "fixedCols", this.on_setting_changed);
        this.settings.bind("show-index", "showIndex", this.on_setting_changed);
        this.settings.bind("tile-spacing", "tileSpacing", this.on_setting_changed);
        this.settings.bind("width", "width", this.on_setting_changed);
        this.settings.bind("height", "height", this.on_setting_changed);
        this.settings.bind("scroll-wheel-behavior", "scrollWheelBehavior", this._onScrollSettingChanged);

        /* Prepare button array for grid tiles */
        this.buttons = [];

        this.mainContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'workspace-grid-container'
        });
        /* Apply fallback sizing to prevent undefined → NaN crashes */
        this.mainContainer.set_width(this.width || 600);
        this.mainContainer.set_height(this.height || 400);

        this.setContent(this.mainContainer);

        this.switch_id = global.window_manager.connect('switch-workspace', Lang.bind(this, this._update));

        /* connect scroll handler based on current setting */
        this._connectScrollHandler();

        this._rebuildGrid();
        this._connectWorkspaceSignals();
    },

    on_desklet_removed: function () {
        if (this.switch_id)
            global.window_manager.disconnect(this.switch_id);
        if (this.scroll_id)
            this.mainContainer.disconnect(this.scroll_id);
        this._disconnectWorkspaceSignals();
    },

    _onScrollSettingChanged: function () {
        this._connectScrollHandler(); // reconnect with new mode
    },

    _connectScrollHandler: function () {
        /* disconnect if already connected */
        if (this.scroll_id) {
            this.mainContainer.disconnect(this.scroll_id);
            this.scroll_id = null;
        }
        if (!this.scrollWheelBehavior || this.scrollWheelBehavior === "off")
            return;

        this.scroll_id = this.mainContainer.connect('scroll-event', Lang.bind(this, this._onScrollEvent));
    },

    _onScrollEvent: function (actor, event) {
        /* scroll-up = 0, scroll-down = 1 */
        const direction = event.get_scroll_direction();
        const active = global.workspace_manager.get_active_workspace_index();
        const dims = this._computeGridDims();
        let target = active;

        if (this.scrollWheelBehavior === "col") {
            target += (direction === 0 ? -1 : 1);
        } else if (this.scrollWheelBehavior === "row") {
            /* translate to row/col grid */
            let row = Math.floor(active / dims.cols);
            let col = active % dims.cols;

            if (direction === 0) row--; else row++;
            if (row < 0) { row = dims.rows - 1; col--; }
            if (row >= dims.rows) { row = 0; col++; }
            target = row * dims.cols + col;
        }

        /* clamp */
        if (target < 0 || target >= this._getWorkspaceCount()) return;
        const ws = global.workspace_manager.get_workspace_by_index(target);
        if (ws) ws.activate(global.get_current_time());
    },

    on_setting_changed: function () {
        this.mainContainer.set_width(this.width);
        this.mainContainer.set_height(this.height);
        this._rebuildGrid();
    },

    _rebuildGrid: function () {
        this.mainContainer.destroy_all_children();

        /* reset list & compute target dimensions */
        this.buttons = [];
        const dims = this._computeGridDims();

        const table = new St.Table({ homogeneous: true, reactive: true });
        this.mainContainer.add(table, { expand: true, x_expand: true, y_expand: true, x_fill: true, y_fill: true });

        for (let r = 0; r < dims.rows; r++) {
            for (let c = 0; c < dims.cols; c++) {
                const i = r * dims.cols + c;
                if (i >= this._getWorkspaceCount()) break;

                const button = new St.Button({
                    style_class: 'workspace-button',
                    reactive: true,
                    can_focus: true
                });
                const label = new St.Label({
                    text: this._getWorkspaceName(i),
                    style_class: 'workspace-label'
                });
                button.set_child(label);
                button.index = i;
                button.connect('clicked', Lang.bind(this, this._onWorkspaceButtonClicked));
                button.set_style("margin:" + Math.max(0, this.tileSpacing || 0) + "px;");

                this.buttons.push(button);
                table.add(button, { row: r, col: c, x_expand: true, y_expand: true, x_fill: true, y_fill: true });
            }
        }

        /* refresh active highlight now that buttons exist */
        this._update();
    },

    _onWorkspaceButtonClicked: function (actor) {
        const ws = global.workspace_manager.get_workspace_by_index(actor.index);
        if (ws) {
            ws.activate(global.get_current_time());
        }
    },

    _getWorkspaceCount: function () {
        return global.workspace_manager.n_workspaces;
    },

    _getWorkspaceName: function (index) {
        /* Use Cinnamon's Main.getWorkspaceName() which handles name overrides properly */
        let name = Main.getWorkspaceName(index);
        return this.showIndex ? (index + 1) + ". " + name : name;
    },

    _computeGridDims: function () {
        const n = this._getWorkspaceCount();
        if (this.layoutMode === "fixed") {
            return { rows: Math.max(1, this.fixedRows), cols: Math.max(1, this.fixedCols) };
        }
        // Auto near-square
        let cols = Math.ceil(Math.sqrt(n));
        let rows = Math.ceil(n / cols);
        return { rows, cols };
    },

    _update: function () {
        const active_ws_index = global.workspace_manager.get_active_workspace_index();
        for (let i = 0; i < this.buttons.length; i++) {
            const button = this.buttons[i];
            if (button.index === active_ws_index) {
                button.add_style_pseudo_class('outlined');
            } else {
                button.remove_style_pseudo_class('outlined');
            }
        }
    },

    _connectWorkspaceSignals: function() {
        this.ws_added_id = global.workspace_manager.connect('workspace-added', Lang.bind(this, this._onWorkspacesChanged));
        this.ws_removed_id = global.workspace_manager.connect('workspace-removed', Lang.bind(this, this._onWorkspacesChanged));
        /* Listen for workspace name changes via global settings */
        this.ws_name_id = global.settings.connect('changed::workspace-name-overrides', Lang.bind(this, this._onWorkspacesChanged));
    },

    _disconnectWorkspaceSignals: function() {
        if (this.ws_added_id) {
            global.workspace_manager.disconnect(this.ws_added_id);
        }
        if (this.ws_removed_id) {
            global.workspace_manager.disconnect(this.ws_removed_id);
        }
        if (this.ws_name_id) {
            global.settings.disconnect(this.ws_name_id);
        }
    },

    _onWorkspacesChanged: function() {
        // Use Mainloop.idle_add to prevent rapid, successive rebuilds
        if (this._rebuildTimeout) {
            Mainloop.source_remove(this._rebuildTimeout);
        }
        this._rebuildTimeout = Mainloop.timeout_add(100, () => {
            this._rebuildGrid();
            this._rebuildTimeout = null;
            return false; // Don't repeat
        });
    }
};

function main(metadata, deskletId) {
    return new MyDesklet(metadata, deskletId);
}