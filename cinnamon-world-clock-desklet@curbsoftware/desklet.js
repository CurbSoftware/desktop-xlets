const Clutter = imports.gi.Clutter;
const St = imports.gi.St;

const Desklet = imports.ui.desklet;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;
const Settings = imports.ui.settings;
const SignalManager = imports.misc.signalManager;
const DND = imports.ui.dnd;
const ModalDialog = imports.ui.modalDialog;

const Gettext = imports.gettext;
const UUID = "cinnamon-world-clock-desklet@curbsoftware";

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
}

const DEFAULT_CLOCK = {
    name: "Local",
    timezone: "local",
    timeFormat: "%H:%M:%S",
    dateFormat: "%A, %e %B",
    timeSize: 40,
    dateSize: 15,
    timezoneSize: 12
};

const MIN_FONT_SIZE = 6;
const SIZE_STEP = 2;

function ClockConfigDialog(title, initial, onSave) {
    this._init(title, initial, onSave);
}

ClockConfigDialog.prototype = {
    __proto__: ModalDialog.ModalDialog.prototype,

    _init: function(title, initial, onSave) {
        ModalDialog.ModalDialog.prototype._init.call(this);

        this._onSave = onSave;
        this._entries = {};
        this.contentLayout.set_style("spacing: 10px; padding: 12px;");

        const header = new St.Label({ text: title, style_class: "world-clock-dialog-title" });
        this.contentLayout.add_actor(header);

        this._addEntry(_("Name"), "name", initial.name || "");
        this._addEntry(_("Timezone"), "timezone", initial.timezone || "local");
        this._addEntry(_("Time format"), "timeFormat", initial.timeFormat || DEFAULT_CLOCK.timeFormat);
        this._addEntry(_("Date format"), "dateFormat", initial.dateFormat || DEFAULT_CLOCK.dateFormat);
        this._addEntry(_("Time size (pt)"), "timeSize", String(initial.timeSize || DEFAULT_CLOCK.timeSize));
        this._addEntry(_("Date size (pt)"), "dateSize", String(initial.dateSize || DEFAULT_CLOCK.dateSize));
        this._addEntry(_("Timezone size (pt)"), "timezoneSize", String(initial.timezoneSize || DEFAULT_CLOCK.timezoneSize));

        this.setButtons([
            {
                label: _("Cancel"),
                action: Lang.bind(this, this._onCancel),
                key: Clutter.Escape
            },
            {
                label: _("Save"),
                action: Lang.bind(this, this._onAccept),
                key: Clutter.Return
            }
        ]);

        this.open();
        global.stage.set_key_focus(this._entries.name);
    },

    _addEntry: function(label, key, value) {
        const row = new St.BoxLayout({ vertical: false, style_class: "world-clock-dialog-row" });
        const labelActor = new St.Label({ text: label, style_class: "world-clock-dialog-label" });
        const entry = new St.Entry({ text: value, can_focus: true, style_class: "world-clock-dialog-entry" });

        row.add(labelActor, { x_fill: false, x_align: St.Align.START });
        row.add(entry, { expand: true, x_fill: true, x_align: St.Align.START });

        this.contentLayout.add_actor(row);
        this._entries[key] = entry;
    },

    _onAccept: function() {
        const result = {};
        Object.keys(this._entries).forEach((key) => {
            result[key] = this._entries[key].get_text();
        });

        this.close();
        if (this._onSave) {
            this._onSave(result);
        }
    },

    _onCancel: function() {
        this.close();
    }
};

function ClockWidget(clockData, desklet) {
    this._init(clockData, desklet);
}

ClockWidget.prototype = {
    _init: function(clockData, desklet) {
        this.desklet = desklet;
        this.data = clockData;
        this.id = clockData.id;
        this.isWorldClock = true;

        this._signalManager = new SignalManager.SignalManager(null);

        this.actor = new St.BoxLayout({
            vertical: true,
            reactive: true,
            can_focus: true,
            style_class: "world-clock"
        });

        this.actor._delegate = this;

        this._time = new St.Label({ style_class: "world-clock-time" });
        this._date = new St.Label({ style_class: "world-clock-date" });
        this._timezoneLabel = new St.Label({ style_class: "world-clock-timezone" });

        this.actor.add(this._time, { x_fill: false, x_align: St.Align.MIDDLE });
        this.actor.add(this._date, { x_fill: false, x_align: St.Align.MIDDLE });
        this.actor.add(this._timezoneLabel, { x_fill: false, x_align: St.Align.MIDDLE });

        this._applySizes();
        this._enableDrag();
    },

    _applySizes: function() {
        this._time.style = "font-size: " + this.data.timeSize + "pt;";
        this._date.style = "font-size: " + this.data.dateSize + "pt;";
        this._timezoneLabel.style = "font-size: " + this.data.timezoneSize + "pt;";
    },

    _enableDrag: function() {
        this.draggable = DND.makeDraggable(this.actor, { restoreOnSuccess: true, dragActorMaxSize: 240 });
        this._signalManager.connect(this.draggable, "drag-begin", Lang.bind(this, this._onDragBegin));
        this._signalManager.connect(this.draggable, "drag-end", Lang.bind(this, this._onDragEnd));
        this._signalManager.connect(this.draggable, "drag-cancelled", Lang.bind(this, this._onDragEnd));
    },

    _onDragBegin: function() {
        this.actor.add_style_pseudo_class("outlined");
    },

    _onDragEnd: function() {
        this.actor.remove_style_pseudo_class("outlined");
        this.desklet._clearDropTargets();
    },

    update: function(baseDate) {
        let displayDate = baseDate;
        let timezoneName = this.data.timezone || "local";

        if (timezoneName !== "local") {
            try {
                const timeString = baseDate.toLocaleString("en-US", { timeZone: timezoneName });
                displayDate = new Date(timeString);
                timezoneName = this.data.name || timezoneName;
            } catch (e) {
                global.logError("Invalid timezone: " + timezoneName + ". Using local time. Error: " + e);
                timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
                displayDate = baseDate;
            }
        } else {
            timezoneName = this.data.name || Intl.DateTimeFormat().resolvedOptions().timeZone;
        }

        this._time.set_text(displayDate.toLocaleFormat(this.data.timeFormat));
        this._date.set_text(displayDate.toLocaleFormat(this.data.dateFormat));
        this._timezoneLabel.set_text(timezoneName);
    },

    setSpacing: function(px) {
        this.actor.set_style("margin: " + px + "px;");
    },

    handleDragOver: function(source) {
        if (!source || !source.isWorldClock || source.id === this.id) {
            return DND.DragMotionResult.NO_DROP;
        }

        this.desklet._setDropTarget(this.id);
        return DND.DragMotionResult.MOVE_DROP;
    },

    acceptDrop: function(source) {
        if (!source || !source.isWorldClock || source.id === this.id) {
            return false;
        }

        this.desklet._moveClock(source.id, this.id);
        return true;
    },

    getDragActorSource: function() {
        return this.actor;
    },

    getDragActor: function() {
        return new Clutter.Clone({ source: this.actor });
    },

    destroy: function() {
        this._signalManager.disconnectAllSignals();
        if (this.actor) {
            this.actor.destroy();
        }
        this.actor = null;
    }
};

function MyDesklet(metadata, deskletId) {
    this._init(metadata, deskletId);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function(metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        this._signalManager = new SignalManager.SignalManager(null);
        this.settings = new Settings.DeskletSettings(this, UUID, deskletId);

        this.settings.bind("grid-columns", "gridColumns", Lang.bind(this, this._onLayoutChanged));
        this.settings.bind("clock-spacing", "clockSpacing", Lang.bind(this, this._onLayoutChanged));
        this.settings.bind("clocks", "clocks", Lang.bind(this, this._onClocksChanged));

        this._clockWidgets = [];
        this._dropTargetId = null;
        this._timeout = null;

        this._mainContainer = new St.BoxLayout({ vertical: true, style_class: "world-clock-container" });
        this._grid = new St.Table({ homogeneous: true, reactive: true, style_class: "world-clock-grid" });

        this._mainContainer.add(this._grid, { expand: true, x_expand: true, y_expand: true });
        this.setContent(this._mainContainer);
        this.setHeader(_("World Clocks"));

        this._initMenu();
        this._ensureClockDefaults();
        this._renderClocks();
        this._scheduleUpdate();
    },

    on_desklet_removed: function() {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }

        this._signalManager.disconnectAllSignals();
        this._destroyClocks();
    },

    _initMenu: function() {
        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._menu.addAction(_("Add Clock"), Lang.bind(this, this._openAddDialog));

        this._clockMenuSection = new PopupMenu.PopupMenuSection();
        this._menu.addMenuItem(this._clockMenuSection);

        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._menu.addAction(_("Help"), Lang.bind(this, this._openHelp));
    },

    _openHelp: function() {
        const helpFile = this.metadata.path + "/README.md";
        Util.spawnCommandLine("xdg-open " + GLib.shell_quote(helpFile));
    },

    _openAddDialog: function() {
        new ClockConfigDialog(_("Add Clock"), DEFAULT_CLOCK, Lang.bind(this, function(result) {
            const newClock = this._buildClockFromDialog(result, null);
            if (!newClock) {
                return;
            }
            const clocks = this._getClockList().slice();
            clocks.push(newClock);
            this._setClockList(clocks);
        }));
    },

    _openEditDialog: function(clockId) {
        const clocks = this._getClockList();
        const index = clocks.findIndex((clock) => clock.id === clockId);
        if (index === -1) {
            return;
        }

        const current = clocks[index];
        new ClockConfigDialog(_("Edit Clock"), current, Lang.bind(this, function(result) {
            const updated = this._buildClockFromDialog(result, current.id);
            if (!updated) {
                return;
            }
            const next = clocks.slice();
            next[index] = updated;
            this._setClockList(next);
        }));
    },

    _buildClockFromDialog: function(values, existingId) {
        const name = (values.name || "").trim();
        const timezone = (values.timezone || "").trim() || "local";
        const timeFormat = (values.timeFormat || "").trim() || DEFAULT_CLOCK.timeFormat;
        const dateFormat = (values.dateFormat || "").trim() || DEFAULT_CLOCK.dateFormat;

        const timeSize = this._coerceSize(values.timeSize, DEFAULT_CLOCK.timeSize);
        const dateSize = this._coerceSize(values.dateSize, DEFAULT_CLOCK.dateSize);
        const timezoneSize = this._coerceSize(values.timezoneSize, DEFAULT_CLOCK.timezoneSize);

        return {
            id: existingId || GLib.uuid_string_random(),
            name: name,
            timezone: timezone,
            timeFormat: timeFormat,
            dateFormat: dateFormat,
            timeSize: timeSize,
            dateSize: dateSize,
            timezoneSize: timezoneSize
        };
    },

    _onClocksChanged: function() {
        const normalized = this._normalizeClockList(this.clocks);
        if (!normalized) {
            return;
        }

        this._normalizedClocks = normalized;
        this._renderClocks();
    },

    _onLayoutChanged: function() {
        this._renderClocks();
    },

    _ensureClockDefaults: function() {
        if (!Array.isArray(this.clocks) || this.clocks.length === 0) {
            const legacy = this._getLegacyClock();
            this._setClockList([legacy || this._buildDefaultClock()]);
            return;
        }

        if (this.clocks.length === 1 && this.clocks[0].id === "default") {
            const legacy = this._getLegacyClock();
            if (legacy) {
                this._setClockList([legacy]);
            }
        }
    },

    _getLegacyClock: function() {
        const legacy = this.metadata || {};
        const hasLegacy = legacy.timeFormat || legacy.dateFormat || legacy.timeSize || legacy.timezone || legacy.name;
        if (!hasLegacy) {
            return null;
        }
        const normalized = this._normalizeClockEntry({
            id: "legacy",
            name: legacy.name || DEFAULT_CLOCK.name,
            timezone: legacy.timezone || DEFAULT_CLOCK.timezone,
            timeFormat: legacy.timeFormat || DEFAULT_CLOCK.timeFormat,
            dateFormat: legacy.dateFormat || DEFAULT_CLOCK.dateFormat,
            timeSize: legacy.timeSize || DEFAULT_CLOCK.timeSize,
            dateSize: legacy.dateSize || DEFAULT_CLOCK.dateSize,
            timezoneSize: legacy.timezoneSize || DEFAULT_CLOCK.timezoneSize
        });

        return normalized.clock;
    },

    _buildDefaultClock: function() {
        return {
            id: GLib.uuid_string_random(),
            name: DEFAULT_CLOCK.name,
            timezone: DEFAULT_CLOCK.timezone,
            timeFormat: DEFAULT_CLOCK.timeFormat,
            dateFormat: DEFAULT_CLOCK.dateFormat,
            timeSize: DEFAULT_CLOCK.timeSize,
            dateSize: DEFAULT_CLOCK.dateSize,
            timezoneSize: DEFAULT_CLOCK.timezoneSize
        };
    },

    _normalizeClockList: function(clockList) {
        const list = Array.isArray(clockList) ? clockList : [];
        const normalized = [];
        let changed = false;

        list.forEach((clock) => {
            const result = this._normalizeClockEntry(clock);
            normalized.push(result.clock);
            if (result.changed) {
                changed = true;
            }
        });

        if (normalized.length === 0) {
            normalized.push(this._buildDefaultClock());
            changed = true;
        }

        if (changed) {
            this._setClockList(normalized);
            return null;
        }

        return normalized;
    },

    _normalizeClockEntry: function(clock) {
        const input = clock && typeof clock === "object" ? clock : {};
        let changed = false;

        let id = typeof input.id === "string" ? input.id.trim() : "";
        if (!id || id === "default") {
            id = GLib.uuid_string_random();
            changed = true;
        }

        const name = typeof input.name === "string" ? input.name.trim() : "";
        if (name !== input.name) {
            changed = true;
        }

        let timezone = typeof input.timezone === "string" ? input.timezone.trim() : "";
        if (!timezone) {
            timezone = DEFAULT_CLOCK.timezone;
            changed = true;
        }

        const timeFormat = typeof input.timeFormat === "string" && input.timeFormat.trim()
            ? input.timeFormat.trim()
            : DEFAULT_CLOCK.timeFormat;
        if (timeFormat !== input.timeFormat) {
            changed = true;
        }

        const dateFormat = typeof input.dateFormat === "string" && input.dateFormat.trim()
            ? input.dateFormat.trim()
            : DEFAULT_CLOCK.dateFormat;
        if (dateFormat !== input.dateFormat) {
            changed = true;
        }

        const timeSize = this._coerceSize(input.timeSize, DEFAULT_CLOCK.timeSize);
        const dateSize = this._coerceSize(input.dateSize, DEFAULT_CLOCK.dateSize);
        const timezoneSize = this._coerceSize(input.timezoneSize, DEFAULT_CLOCK.timezoneSize);

        if (timeSize !== input.timeSize || dateSize !== input.dateSize || timezoneSize !== input.timezoneSize) {
            changed = true;
        }

        return {
            changed: changed,
            clock: {
                id: id,
                name: name,
                timezone: timezone,
                timeFormat: timeFormat,
                dateFormat: dateFormat,
                timeSize: timeSize,
                dateSize: dateSize,
                timezoneSize: timezoneSize
            }
        };
    },

    _coerceSize: function(value, fallback) {
        let size = fallback;

        if (typeof value === "number" && Number.isFinite(value)) {
            size = value;
        } else if (typeof value === "string") {
            const parsed = parseFloat(value);
            if (Number.isFinite(parsed)) {
                size = parsed;
            }
        }

        size = Math.round(size);
        return Math.max(MIN_FONT_SIZE, size);
    },

    _renderClocks: function() {
        if (!this._normalizedClocks) {
            this._normalizedClocks = this._normalizeClockList(this.clocks) || [];
        }

        this._destroyClocks();
        this._grid.destroy_all_children();

        const clocks = this._normalizedClocks;
        const columns = this._getColumnCount(clocks.length);
        const spacing = this._getSpacing();

        clocks.forEach((clock, index) => {
            const widget = new ClockWidget(clock, this);
            widget.setSpacing(spacing);

            const row = Math.floor(index / columns);
            const col = index % columns;

            this._grid.add(widget.actor, {
                row: row,
                col: col,
                x_expand: true,
                y_expand: true,
                x_fill: true,
                y_fill: true
            });

            this._clockWidgets.push(widget);
        });

        this._rebuildClockMenu();
        this._updateClocks();
    },

    _destroyClocks: function() {
        this._clockWidgets.forEach((widget) => widget.destroy());
        this._clockWidgets = [];
    },

    _updateClocks: function() {
        const now = new Date();
        this._clockWidgets.forEach((widget) => widget.update(now));
    },

    _scheduleUpdate: function() {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }

        this._timeout = Mainloop.timeout_add_seconds(1, Lang.bind(this, this._onTick));
    },

    _onTick: function() {
        this._updateClocks();

        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }

        this._scheduleUpdate();
        return false;
    },

    _getColumnCount: function(count) {
        const requested = Number(this.gridColumns) || 0;
        if (requested > 0) {
            return Math.min(requested, Math.max(1, count));
        }

        const safeCount = Math.max(1, count);
        return Math.ceil(Math.sqrt(safeCount));
    },

    _getSpacing: function() {
        const spacing = Number(this.clockSpacing);
        if (Number.isFinite(spacing)) {
            return Math.max(0, spacing);
        }
        return 8;
    },

    _rebuildClockMenu: function() {
        this._clockMenuSection.removeAll();

        const clocksSubmenu = new PopupMenu.PopupSubMenuMenuItem(_("Clocks"));
        this._clockMenuSection.addMenuItem(clocksSubmenu);

        const clocks = this._getClockList();
        if (clocks.length === 0) {
            clocksSubmenu.menu.addMenuItem(new PopupMenu.PopupMenuItem(_("No clocks configured"), { reactive: false }));
            return;
        }

        clocks.forEach((clock) => {
            const label = clock.name || clock.timezone || _("Clock");
            const clockItem = new PopupMenu.PopupSubMenuMenuItem(label);

            clockItem.menu.addAction(_("Edit"), Lang.bind(this, function() {
                this._openEditDialog(clock.id);
            }));
            clockItem.menu.addAction(_("Increase Size"), Lang.bind(this, function() {
                this._adjustClockSize(clock.id, SIZE_STEP);
            }));
            clockItem.menu.addAction(_("Decrease Size"), Lang.bind(this, function() {
                this._adjustClockSize(clock.id, -SIZE_STEP);
            }));
            clockItem.menu.addAction(_("Remove"), Lang.bind(this, function() {
                this._removeClock(clock.id);
            }));

            clocksSubmenu.menu.addMenuItem(clockItem);
        });
    },

    _adjustClockSize: function(clockId, delta) {
        const clocks = this._getClockList();
        const index = clocks.findIndex((clock) => clock.id === clockId);
        if (index === -1) {
            return;
        }

        const clock = clocks[index];
        const timeSize = this._coerceSize(clock.timeSize, DEFAULT_CLOCK.timeSize) + delta;
        const dateSize = this._coerceSize(clock.dateSize, DEFAULT_CLOCK.dateSize) + delta;
        const timezoneSize = this._coerceSize(clock.timezoneSize, DEFAULT_CLOCK.timezoneSize) + delta;
        const updated = Object.assign({}, clock, {
            timeSize: this._coerceSize(timeSize, clock.timeSize),
            dateSize: this._coerceSize(dateSize, clock.dateSize),
            timezoneSize: this._coerceSize(timezoneSize, clock.timezoneSize)
        });

        const next = clocks.slice();
        next[index] = updated;
        this._setClockList(next);
    },

    _removeClock: function(clockId) {
        const clocks = this._getClockList().filter((clock) => clock.id !== clockId);
        if (clocks.length === 0) {
            clocks.push(this._buildDefaultClock());
        }
        this._setClockList(clocks);
    },

    _moveClock: function(sourceId, targetId) {
        const clocks = this._getClockList().slice();
        const sourceIndex = clocks.findIndex((clock) => clock.id === sourceId);
        const targetIndex = clocks.findIndex((clock) => clock.id === targetId);

        if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
            return;
        }

        const [moved] = clocks.splice(sourceIndex, 1);
        clocks.splice(targetIndex, 0, moved);
        this._setClockList(clocks);
    },

    _setClockList: function(list) {
        this.settings.setValue("clocks", list);
    },

    _getClockList: function() {
        return this._normalizedClocks || this._normalizeClockList(this.clocks) || [];
    },

    _setDropTarget: function(clockId) {
        if (this._dropTargetId === clockId) {
            return;
        }

        this._dropTargetId = clockId;
        this._clockWidgets.forEach((widget) => {
            if (widget.id === clockId) {
                widget.actor.add_style_class_name("world-clock-drop-target");
            } else {
                widget.actor.remove_style_class_name("world-clock-drop-target");
            }
        });
    },

    _clearDropTargets: function() {
        this._dropTargetId = null;
        this._clockWidgets.forEach((widget) => {
            widget.actor.remove_style_class_name("world-clock-drop-target");
        });
    }
};

function main(metadata, desklet_id) {
    return new MyDesklet(metadata, desklet_id);
}
