// Time And Date Cinnamon Desklet v0.3 - Added timezone name display
//
// This is a simple desklet to display the time and date. The size, format, and timezone are configurable.
// This can be launched from the Desklet itself by selecting Config from the menu.
//
// -Steve
// desklets [at] stargw [dot] eu

const Gio = imports.gi.Gio;
const St = imports.gi.St;

const Desklet = imports.ui.desklet;

const Lang = imports.lang;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;

const Gettext = imports.gettext;
const UUID = "TimeAndDate@desklet.user";

// l10n/translation support

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale")

function _(str) {
  return Gettext.dgettext(UUID, str);
}

function MyDesklet(metadata){
    this._init(metadata);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function(metadata){
        Desklet.Desklet.prototype._init.call(this, metadata);
        
        this.metadata = metadata
        this.dateFormat = this.metadata["dateFormat"];
        this.dateSize = this.metadata["dateSize"];
        this.timeFormat = this.metadata["timeFormat"];
        this.timeSize = this.metadata["timeSize"];
        this.timezone = this.metadata["timezone"];
        this.timezoneSize = this.metadata["timezoneSize"] || "12pt"; // Default size if not specified

            
        this._clockContainer = new St.BoxLayout({vertical:true, style_class: 'clock-container'});
        
        this._dateContainer =  new St.BoxLayout({vertical:false, style_class: 'date-container'});
        this._timeContainer =  new St.BoxLayout({vertical:false, style_class: 'time-container'});
        this._timezoneContainer =  new St.BoxLayout({vertical:false, style_class: 'timezone-container'});

        this._date = new St.Label();
        this._time = new St.Label();
        this._timezoneLabel = new St.Label();
        
        
        this._dateContainer.add(this._date);
        this._timeContainer.add(this._time);
        this._timezoneContainer.add(this._timezoneLabel);

        this._clockContainer.add(this._timeContainer, {x_fill: false, x_align: St.Align.MIDDLE});
        this._clockContainer.add(this._dateContainer, {x_fill: false, x_align: St.Align.MIDDLE});
        this._clockContainer.add(this._timezoneContainer, {x_fill: false, x_align: St.Align.MIDDLE});

        this.setContent(this._clockContainer);
        this.setHeader(_("Time And Date"));
        
        // Set the font sizes from .json file
        
        this._date.style="font-size: " + this.dateSize;
        this._time.style="font-size: " + this.timeSize;
        this._timezoneLabel.style="font-size: " + this.timezoneSize;
        
        this.configFile = GLib.get_home_dir() + "/.local/share/cinnamon/desklets/TimeAndDate@desklet.user/metadata.json";
        this.helpFile = GLib.get_home_dir() + "/.local/share/cinnamon/desklets/TimeAndDate@desklet.user/README";
        
        global.log("Config file " + this.configFile);
        
        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._menu.addAction(_("Edit Config"), Lang.bind(this, function() {
            Util.spawnCommandLine("xdg-open " + this.configFile);
        }));
        
        this._menu.addAction(_("Help"), Lang.bind(this, function() {
            Util.spawnCommandLine("xdg-open " + this.helpFile);
        }));
        
        
        this._updateDate();
    },

    on_desklet_removed: function() {
        Mainloop.source_remove(this.timeout);
    },

    _updateDate: function(){
        let displayDate = new Date();
        let timezoneName = this.timezone;
        
        // Apply timezone offset if specified
        if (this.timezone && this.timezone !== "local") {
            try {
                // Convert to specified timezone for correct time display
                const timeString = displayDate.toLocaleString("en-US", {timeZone: this.timezone});
                displayDate = new Date(timeString);
                
                // Prefer a user-friendly name from metadata if present
                timezoneName = this.metadata["name"] || this.timezone;
                
            } catch (e) {
                global.logError("Invalid timezone: " + this.timezone + ". Using local time. Error: " + e);
                timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
            }
        } else {
            // For local timezone, show the system's full identifier
            timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
        }
    
        this._time.set_text(displayDate.toLocaleFormat(this.timeFormat));
        this._date.set_text(displayDate.toLocaleFormat(this.dateFormat));
        this._timezoneLabel.set_text(timezoneName);
        
        this.timeout = Mainloop.timeout_add_seconds(1, Lang.bind(this, this._updateDate));
        
    }
}

function main(metadata, desklet_id){
    let desklet = new MyDesklet(metadata, desklet_id);
    return desklet;
}