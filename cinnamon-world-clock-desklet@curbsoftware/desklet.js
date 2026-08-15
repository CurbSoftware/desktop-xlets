/* global imports, global */
const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Lang = imports.lang;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const ModalDialog = imports.ui.modalDialog;
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;

const uuid = "cinnamon-world-clock-desklet@curbsoftware";

Gettext.bindtextdomain(uuid, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(uuid, str);
}

/* Xlet-local modules. Cinnamon exposes a desklet's own directory through
 * imports.ui.deskletManager.desklets[uuid]; resolved lazily in _init() so a
 * load-order problem surfaces as a logged error instead of a load failure. */
let ClockActions = null;
let ClockDialog = null;

function _loadModules() {
    if (ClockActions && ClockDialog)
        return true;
    try {
        const dir = imports.ui.deskletManager.desklets[uuid];
        ClockActions = dir.clockActions;
        ClockDialog = dir.clockDialog;
        return !!(ClockActions && ClockDialog);
    } catch (e) {
        global.logError(uuid + " could not load helper modules: " + e);
        return false;
    }
}

const DEFAULT_TIME_FORMAT = "%H:%M:%S";
const DEFAULT_DATE_FORMAT = "%A, %e %B";

function ClockWidget(clockData, desklet) {
    this._init(clockData, desklet);
}

ClockWidget.prototype = {
    _init: function (clockData, desklet) {
        this.desklet = desklet;
        this.data = clockData;
        this.id = clockData.id;

        this.actor = new St.Button({
            style_class: "world-clock-tile",
            reactive: true,
            can_focus: true,
            x_expand: true,
            y_expand: true
        });
        /* Accept right-click too, so a tile can raise its own context menu.
         * St.Button consumes the release, so the Desklet base class right-click
         * handler does not also open the desklet menu. */
        this.actor.set_button_mask(St.ButtonMask.ONE | St.ButtonMask.THREE);

        const box = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true
        });

        this._time = new St.Label({ style_class: "world-clock-time" });
        this._date = new St.Label({ style_class: "world-clock-date" });
        this._timezoneLabel = new St.Label({ style_class: "world-clock-timezone" });

        box.add(this._time, { x_fill: false, x_align: St.Align.MIDDLE });
        box.add(this._date, { x_fill: false, x_align: St.Align.MIDDLE });
        box.add(this._timezoneLabel, { x_fill: false, x_align: St.Align.MIDDLE });

        this.actor.set_child(box);
        this._applySizes();
    },

    _applySizes: function () {
        const timeSize = Number(this.desklet.timeSize) || 40;
        const dateSize = Number(this.desklet.dateSize) || 15;
        const timezoneSize = Number(this.desklet.timezoneSize) || 12;
        this._time.set_style("font-size: " + timeSize + "pt;");
        this._date.set_style("font-size: " + dateSize + "pt;");
        this._timezoneLabel.set_style("font-size: " + timezoneSize + "pt;");
    },

    update: function (baseDate) {
        let displayDate = baseDate;
        let timezoneName = this.data.timezone || "local";

        if (timezoneName !== "local") {
            try {
                const timeString = baseDate.toLocaleString("en-US", { timeZone: timezoneName });
                displayDate = new Date(timeString);
            } catch (e) {
                global.logError(uuid + " invalid timezone: " + timezoneName + ": " + e);
                timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
                displayDate = baseDate;
            }
        }

        const label = ClockActions
            ? ClockActions.getClockLabel(this.data)
            : (this.data.name || timezoneName);

        try {
            const timeFormat = this.desklet.timeFormat || DEFAULT_TIME_FORMAT;
            const dateFormat = this.desklet.dateFormat || DEFAULT_DATE_FORMAT;
            this._time.set_text(displayDate.toLocaleFormat(timeFormat));
            this._date.set_text(displayDate.toLocaleFormat(dateFormat));
        } catch (e) {
            global.logError(uuid + " could not format clock: " + e);
            this._time.set_text("");
            this._date.set_text("");
        }

        this._timezoneLabel.set_text(label);
    }
};

function MyDesklet(metadata, deskletId) {
    this._init(metadata, deskletId);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        _loadModules();

        if (ClockActions)
            ClockActions.setTranslate(_);
        if (ClockDialog)
            ClockDialog.setTranslate(_);

        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], deskletId);
        this.settings.bind("layout-mode", "layoutMode", this.on_setting_changed);
        this.settings.bind("fixed-rows", "fixedRows", this.on_setting_changed);
        this.settings.bind("fixed-cols", "fixedCols", this.on_setting_changed);
        this.settings.bind("tile-spacing", "tileSpacing", this.on_setting_changed);
        this.settings.bind("width", "width", this.on_setting_changed);
        this.settings.bind("height", "height", this.on_setting_changed);
        this.settings.bind("enable-clock-editing", "enableEditing", this.on_setting_changed);
        this.settings.bind("show-add-tile", "showAddTile", this.on_setting_changed);
        this.settings.bind("confirm-remove", "confirmRemove");
        this.settings.bind("time-format", "timeFormat", this.on_setting_changed);
        this.settings.bind("date-format", "dateFormat", this.on_setting_changed);
        this.settings.bind("time-size", "timeSize", this.on_setting_changed);
        this.settings.bind("date-size", "dateSize", this.on_setting_changed);
        this.settings.bind("timezone-size", "timezoneSize", this.on_setting_changed);
        this.settings.bind("clocks", "clocks", this._onClocksChanged);

        this._clockWidgets = [];
        this.buttons = [];
        this._normalizedClocks = [];
        this._timeout = null;

        /* At most one transient tile menu is alive at a time. Tile menus are
         * parented to Main.uiGroup, so destroy_all_children() on our own
         * container will never reach them - they must be released by hand. */
        this._tileMenu = null;
        this._idleSources = [];

        this.mainContainer = new St.BoxLayout({
            vertical: true,
            style_class: "world-clock-container"
        });
        this.mainContainer.set_width(this.width || 600);
        this.mainContainer.set_height(this.height || 400);

        this.setContent(this.mainContainer);
        this.setHeader(_("World Clocks"));

        this._ensureClockDefaults();
        this._rebuildGrid();
        this._scheduleUpdate();

        /* Desklet.destroy() emits 'destroy' immediately but defers
         * on_desklet_removed() until a 500ms fade-out completes. Without this
         * hook our timeout keeps firing against a tearing-down desklet for
         * half a second. _cleanup() is idempotent. */
        this._destroyId = this.connect("destroy", Lang.bind(this, this._cleanup));
    },

    on_desklet_removed: function () {
        this._cleanup();
    },

    _cleanup: function () {
        if (this._cleanedUp)
            return;
        this._cleanedUp = true;

        this._destroyTileMenu();

        if (this._idleSources) {
            for (let i = 0; i < this._idleSources.length; i++)
                Mainloop.source_remove(this._idleSources[i]);
            this._idleSources = [];
        }
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }

        this._clockWidgets = [];
        this.buttons = [];

        if (this._destroyId) {
            this.disconnect(this._destroyId);
            this._destroyId = 0;
        }
    },

    on_setting_changed: function () {
        try {
            this.mainContainer.set_width(this.width);
            this.mainContainer.set_height(this.height);
            this._rebuildGrid();
        } catch (e) {
            global.logError(uuid + " setting change failed: " + e);
        }
    },

    _onClocksChanged: function () {
        try {
            if (!ClockActions || !this.mainContainer)
                return;
            const result = ClockActions.normalizeClockList(this.clocks);
            this._normalizedClocks = result.clocks;
            if (result.changed)
                this.settings.setValue("clocks", result.clocks);
            this._rebuildGrid();
        } catch (e) {
            global.logError(uuid + " clocks change failed: " + e);
        }
    },

    /* setValue does not fire the bind callback in-process, so the grid must
     * be rebuilt here. _normalizedClocks is the live list _getClockList uses. */
    _setClockList: function (list) {
        this._normalizedClocks = Array.isArray(list) ? list : [];
        this.settings.setValue("clocks", this._normalizedClocks);
        this._rebuildGrid();
    },

    /* ------------------------------------------------------------------ *
     * Grid construction
     * ------------------------------------------------------------------ */

    _rebuildGrid: function () {
        try {
            if (!_loadModules())
                return;

            this._destroyTileMenu();
            this.mainContainer.destroy_all_children();

            this._clockWidgets = [];
            this.buttons = [];

            const clocks = this._getClockList();
            const showAdd = !!(this.enableEditing && this.showAddTile && ClockActions.canAdd(clocks));
            const dims = this._computeGridDims();
            const cells = ClockActions.planCells(clocks.length, showAdd, dims.rows, dims.cols);

            const table = new St.Table({
                homogeneous: true,
                reactive: true,
                style_class: "world-clock-grid"
            });
            this.mainContainer.add(table, {
                expand: true,
                x_expand: true,
                y_expand: true,
                x_fill: true,
                y_fill: true
            });

            for (let i = 0; i < cells.length; i++) {
                const cell = cells[i];
                const row = Math.floor(i / dims.cols);
                const col = i % dims.cols;
                const actor = (cell.kind === "add")
                    ? this._createAddTile()
                    : this._createClockTile(clocks[cell.index], cell.index);

                table.add(actor, {
                    row: row,
                    col: col,
                    x_expand: true,
                    y_expand: true,
                    x_fill: true,
                    y_fill: true
                });
            }

            this._updateClocks();
            this._updateHighlight();
        } catch (e) {
            global.logError(uuid + " grid rebuild failed: " + e);
        }
    },

    _createClockTile: function (clock, index) {
        const widget = new ClockWidget(clock, this);
        widget.actor.index = index;
        widget.actor.clockId = clock.id;
        widget.actor.connect("clicked", Lang.bind(this, this._onClockTileClicked));
        widget.actor.set_style("margin:" + Math.max(0, this.tileSpacing || 0) + "px;");
        this._clockWidgets.push(widget);
        this.buttons.push(widget.actor);
        return widget.actor;
    },

    _createAddTile: function () {
        const button = new St.Button({
            style_class: "world-clock-add-tile",
            reactive: true,
            can_focus: true
        });
        const label = new St.Label({
            text: "+",
            style_class: "world-clock-add-label"
        });
        button.set_child(label);
        button.connect("clicked", Lang.bind(this, this._onAddClock));
        button.set_style("margin:" + Math.max(0, this.tileSpacing || 0) + "px;");
        return button;
    },

    _onClockTileClicked: function (actor, clickedButton) {
        try {
            if (clickedButton === 3) {
                if (this.enableEditing)
                    this._openTileMenu(actor);
            }
        } catch (e) {
            global.logError(uuid + " tile click failed: " + e);
        }
    },

    /* ------------------------------------------------------------------ *
     * Per-tile context menu
     * ------------------------------------------------------------------ */

    _openTileMenu: function (button) {
        try {
            this._destroyTileMenu();

            const index = button.index;
            const clocks = this._getClockList();
            const menu = new PopupMenu.PopupMenu(button, St.Side.TOP);
            Main.uiGroup.add_actor(menu.actor);
            menu.actor.hide();

            const editItem = new PopupMenu.PopupMenuItem(_("Edit…"));
            editItem.connect("activate", Lang.bind(this, function () {
                this._onEditClock(index);
            }));
            menu.addMenuItem(editItem);

            const removeItem = new PopupMenu.PopupMenuItem(_("Remove"));
            removeItem.setSensitive(ClockActions.canRemove(clocks));
            removeItem.connect("activate", Lang.bind(this, function () {
                this._onRemoveClock(index);
            }));
            menu.addMenuItem(removeItem);

            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const addItem = new PopupMenu.PopupMenuItem(_("Add clock"));
            addItem.setSensitive(ClockActions.canAdd(clocks));
            addItem.connect("activate", Lang.bind(this, this._onAddClock));
            menu.addMenuItem(addItem);

            if (this._menuManager)
                this._menuManager.addMenu(menu);

            this._tileMenu = menu;
            menu.open(true);
        } catch (e) {
            global.logError(uuid + " could not open tile menu: " + e);
            this._destroyTileMenu();
        }
    },

    _destroyTileMenu: function () {
        if (!this._tileMenu)
            return;
        const menu = this._tileMenu;
        this._tileMenu = null;
        try {
            if (menu.isOpen)
                menu.close(false);
            if (this._menuManager)
                this._menuManager.removeMenu(menu);
            menu.destroy();
        } catch (e) {
            global.logError(uuid + " could not destroy tile menu: " + e);
        }
    },

    /* Menu items must not act synchronously: PopupMenuBase closes the menu in
     * its own 'activate' handler, which runs after ours. Destroying the menu
     * or pushing a modal dialog before that has happened fights the menu's
     * grab. Defer to the next main loop turn and track the source so teardown
     * can cancel it.
     *
     * timeout_add(0), not idle_add: idle callbacks sit below Clutter's redraw
     * priority, so an action fired while a menu or dialog was still animating
     * could be starved for hundreds of milliseconds. */
    _deferAction: function (fn) {
        const self = this;
        let id = Mainloop.timeout_add(0, function () {
            self._idleSources = self._idleSources.filter(function (s) { return s !== id; });
            try {
                fn.call(self);
            } catch (e) {
                global.logError(uuid + " deferred action failed: " + e);
            }
            return false;
        });
        this._idleSources.push(id);
    },

    _onAddClock: function () {
        this._deferAction(function () {
            this._destroyTileMenu();
            if (!ClockActions.canAdd(this._getClockList()))
                return;
            const zones = ClockActions.listTimezones
                ? ClockActions.listTimezones()
                : null;
            ClockDialog.promptClock(_("Add Clock"), ClockActions.DEFAULT_CLOCK, Lang.bind(this, function (values) {
                this._setClockList(ClockActions.addClock(this._getClockList(), values));
            }), zones);
        });
    },

    _onEditClock: function (index) {
        this._deferAction(function () {
            this._destroyTileMenu();
            const clocks = this._getClockList();
            if (!ClockActions.isValidIndex(clocks, index))
                return;
            const current = clocks[index];
            const zones = ClockActions.listTimezones
                ? ClockActions.listTimezones()
                : null;
            ClockDialog.promptClock(_("Edit Clock"), current, Lang.bind(this, function (values) {
                this._setClockList(ClockActions.updateClock(this._getClockList(), current.id, values));
            }), zones);
        });
    },

    _onRemoveClock: function (index) {
        this._deferAction(function () {
            this._destroyTileMenu();
            const clocks = this._getClockList();
            if (!ClockActions.isValidIndex(clocks, index))
                return;
            if (!ClockActions.canRemove(clocks))
                return;

            const clock = clocks[index];
            const doRemove = Lang.bind(this, function () {
                this._setClockList(ClockActions.removeClock(this._getClockList(), clock.id));
            });

            if (this.confirmRemove && clock.name) {
                const prompt = _("Are you sure you want to remove clock \"%s\"?").format(clock.name);
                const dialog = new ModalDialog.ConfirmDialog(prompt, doRemove);
                dialog.open();
                return;
            }

            doRemove();
        });
    },

    /* ------------------------------------------------------------------ *
     * Helpers
     * ------------------------------------------------------------------ */

    _getClockList: function () {
        if (this._normalizedClocks && this._normalizedClocks.length)
            return this._normalizedClocks;
        if (!ClockActions)
            return [];
        const result = ClockActions.normalizeClockList(this.clocks);
        this._normalizedClocks = result.clocks;
        return this._normalizedClocks;
    },

    _computeGridDims: function () {
        if (!ClockActions)
            return { rows: 1, cols: 1 };
        const clocks = this._getClockList();
        const showAdd = !!(this.enableEditing && this.showAddTile && ClockActions.canAdd(clocks));
        const cellCount = clocks.length + (showAdd ? 1 : 0);
        return ClockActions.computeGridDims(cellCount, this.layoutMode, this.fixedRows, this.fixedCols);
    },

    _ensureClockDefaults: function () {
        if (!ClockActions)
            return;

        let raw = this.clocks;
        if (!Array.isArray(raw) || raw.length === 0 ||
                (raw.length === 1 && raw[0] && raw[0].id === "default")) {
            const legacy = this._legacyClockFromMetadata();
            if (legacy)
                raw = [legacy];
        }

        const replacedPlaceholder = raw !== this.clocks;
        const result = ClockActions.normalizeClockList(raw);
        this._normalizedClocks = result.clocks;
        if (result.changed || replacedPlaceholder)
            this.settings.setValue("clocks", result.clocks);
    },

    _legacyClockFromMetadata: function () {
        const legacy = this.metadata || {};
        const hasLegacy = legacy.timeFormat || legacy.dateFormat || legacy.timeSize ||
            legacy.timezone || legacy.name;
        if (!hasLegacy)
            return null;
        return ClockActions.buildClock({
            name: legacy.name || ClockActions.DEFAULT_CLOCK.name,
            timezone: legacy.timezone || ClockActions.DEFAULT_CLOCK.timezone
        }, "legacy");
    },

    _updateHighlight: function () {
        try {
            for (let i = 0; i < this._clockWidgets.length; i++) {
                const widget = this._clockWidgets[i];
                if (widget.data && widget.data.timezone === "local")
                    widget.actor.add_style_pseudo_class("outlined");
                else
                    widget.actor.remove_style_pseudo_class("outlined");
            }
        } catch (e) {
            global.logError(uuid + " highlight update failed: " + e);
        }
    },

    _updateClocks: function () {
        const now = new Date();
        this._clockWidgets.forEach(function (widget) {
            widget.update(now);
        });
    },

    _scheduleUpdate: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }
        this._timeout = Mainloop.timeout_add_seconds(1, Lang.bind(this, this._onTick));
    },

    _onTick: function () {
        if (this._cleanedUp)
            return false;
        this._updateClocks();
        return true;
    }
};

function main(metadata, deskletId) {
    return new MyDesklet(metadata, deskletId);
}
