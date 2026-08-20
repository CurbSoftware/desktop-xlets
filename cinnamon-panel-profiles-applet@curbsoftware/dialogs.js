/* global imports, global */
/**
 * dialogs.js
 *
 * Modal dialogs for the Panel Profiles applet: save (new or replace),
 * manage profiles, rename, confirmations, and the first-run startup offer.
 *
 * All dialogs follow the renameDialog.js pattern: MessageDialogContent,
 * setButtons with KEY_Escape, setInitialKeyFocus after setButtons, a
 * _settled guard so no path can settle twice, and Enter committing through
 * the entry's clutter_text "activate" signal.
 *
 * This file talks to St/Clutter only. It never imports the applet's lib/
 * modules and never require()s anything: every profile list, every
 * operation, and the translator arrive through constructor arguments,
 * callbacks, or setDependencies()/setTranslate().
 */

const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Pango = imports.gi.Pango;
const St = imports.gi.St;

const Dialog = imports.ui.dialog;
const ModalDialog = imports.ui.modalDialog;

const Mainloop = imports.mainloop;

/* Spec limit for profile names (spec section 11). */
const MAX_NAME_LENGTH = 80;

/* Size of the small status icons in manage-dialog rows. */
const ICON_SIZE = 16;

/* Gettext support. The applet injects its own UUID-bound _() translator
 * via setTranslate(); the default is the identity function so this module
 * is safe to load on its own. */
let _translate = function (str) { return str; };

function setTranslate(fn) {
    if (typeof fn === "function")
        _translate = fn;
}

/* Call sites use _() so cinnamon-xlet-makepot's default keyword extracts
 * them; _() always routes through the injected translator. */
function _(str) {
    return _translate(str);
}

/* Optional logger injected by the applet. Falls back to global.logError so
 * headless loading of this module never throws on a missing logger. */
let _logger = null;

function setDependencies(deps) {
    if (deps && deps.logger)
        _logger = deps.logger;
}

function _warn(msg) {
    try {
        if (_logger && typeof _logger.warn === "function") {
            _logger.warn(msg);
            return;
        }
    } catch (ignored) {
        /* fall through to global */
    }
    try {
        if (typeof global !== "undefined" && global.logError)
            global.logError("[PanelProfiles] " + msg);
    } catch (ignored) {
        /* nothing left to try; swallow rather than throw */
    }
}

function _error(msg, e) {
    try {
        if (_logger && typeof _logger.error === "function") {
            _logger.error(msg, e);
            return;
        }
    } catch (ignored) {
        /* fall through to global */
    }
    try {
        if (typeof global !== "undefined" && global.logError)
            global.logError("[PanelProfiles] " + msg + ": " + e);
    } catch (ignored) {
        /* nothing left to try; swallow rather than throw */
    }
}

/* Trim and enforce the 80-character cap. Applied on commit and before any
 * name comparison; the entry's clutter_text also caps typing via
 * max_length so paste is the only path that can exceed it. */
function _cleanName(raw) {
    let text = typeof raw === "string" ? raw : "";
    text = text.trim();
    if (text.length > MAX_NAME_LENGTH)
        text = text.slice(0, MAX_NAME_LENGTH);
    return text;
}

/* Defensive copy of a caller-supplied profile list. Dialogs never trust
 * field types: anything missing degrades to a safe value. */
function _normalizeProfiles(list) {
    let out = [];
    if (!Array.isArray(list))
        return out;
    for (let i = 0; i < list.length; i++) {
        let p = list[i];
        if (!p || typeof p !== "object")
            continue;
        out.push({
            id: String(p.id !== undefined && p.id !== null ? p.id : ""),
            name: typeof p.name === "string" ? p.name : "",
            updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : "",
            expectedCount: Number.isFinite(p.expectedCount) ? p.expectedCount : 0,
            valid: p.valid !== false,
            isActive: !!p.isActive,
            isStartup: !!p.isStartup
        });
    }
    return out;
}

/* Locale date for the manage rows. Profiles store ISO 8601 with offset;
 * strings without an offset (older or hand-edited files) are parsed against
 * the local timezone. Anything unparseable just drops the date part. */
function _formatDate(iso) {
    try {
        if (!iso)
            return "";
        let dt = GLib.DateTime.new_from_iso8601(iso, null);
        if (!dt)
            dt = GLib.DateTime.new_from_iso8601(iso, GLib.TimeZone.new_local());
        if (!dt)
            return "";
        return dt.to_local().format("%x %H:%M");
    } catch (e) {
        return "";
    }
}

/* Open helper shared by every launcher and nested-confirm site so a failure
 * to open never escapes into a signal handler. */
function _openDialog(dialog) {
    try {
        dialog.open(global.get_current_time());
        return true;
    } catch (e) {
        _error("could not open dialog", e);
        try {
            dialog.destroy();
        } catch (ignored) {
            /* already gone */
        }
        return false;
    }
}

/* A small toggle that packs like ui.checkBox.CheckBox2 (theme class
 * "check-box-2") or like ui.radioButton (theme class "radiobutton"): an
 * St.Button wrapping an StBoxLayout of [glyph St.Bin, St.Label]. The theme
 * draws the glyph on the St.Bin and swaps it through the button's :checked
 * pseudo-class, so the look is fully native with no CSS of ours involved.
 * St itself offers no check or radio widget in Cinnamon 6.6. */
function _makeToggleButton(label, themeClass) {
    let box = new St.BoxLayout();
    box.add_child(new St.Bin());
    box.add_child(new St.Label({ text: label }));
    return new St.Button({
        style_class: themeClass,
        important: true,
        button_mask: St.ButtonMask.ONE,
        toggle_mode: true,
        can_focus: true,
        x_fill: true,
        y_fill: true,
        y_align: St.Align.MIDDLE,
        child: box
    });
}

/* Empty a container without ever leaving a destroyed child in its child
 * list. destroy_all_children() frees children in place; a style recompute
 * already in flight (any pseudo-class or theme change) can then walk a
 * freed widget and take Cinnamon down with it (st_scroll_view_style_changed
 * -> notify_children_of_style_change on freed memory). Unparenting every
 * child first means the cascade can only ever see live actors. */
function _clearContainer(box) {
    if (!box)
        return;
    let children = [];
    try {
        children = box.get_children();
    } catch (e) {
        return;
    }
    for (let i = 0; i < children.length; i++) {
        try {
            box.remove_child(children[i]);
        } catch (e) {
            /* already detached */
        }
    }
    for (let i = 0; i < children.length; i++) {
        try {
            children[i].destroy();
        } catch (e) {
            /* already destroyed */
        }
    }
}

var PanelProfilesConfirmDialog = GObject.registerClass(
class PanelProfilesConfirmDialog extends ModalDialog.ModalDialog {

    /**
     * _init:
     * @title (string): dialog title, already translated by the caller
     * @description (string): body text, already translated by the caller
     * @confirmLabel (string): label of the confirming button
     * @onConfirm (function): called with no arguments after confirmation.
     *                        Not called on cancel.
     * @destructive (boolean): style the confirm button as destructive
     *
     * modalDialog.ConfirmDialog has fixed "Yes"/"No" labels; the spec wants
     * Cancel/Replace and Cancel/Delete, so this is a local variant with the
     * same shape rather than an import of an external helper.
     */
    _init(title, description, confirmLabel, onConfirm, destructive) {
        super._init();

        this._onConfirm = onConfirm;
        this._settled = false;

        let content = new Dialog.MessageDialogContent({
            title: title,
            description: description
        });
        this.contentLayout.add_child(content);

        let confirmDescriptor = {
            label: confirmLabel,
            action: () => this._confirm(),
            default: true
        };
        if (destructive)
            confirmDescriptor.destructive_action = true;

        this.setButtons([
            {
                label: _("Cancel"),
                action: () => this._cancel(),
                key: Clutter.KEY_Escape
            },
            confirmDescriptor
        ]);
    }

    _cancel() {
        if (this._settled)
            return;
        this._settled = true;
        this.destroy();
    }

    _confirm() {
        if (this._settled)
            return;
        this._settled = true;

        let onConfirm = this._onConfirm;
        this._onConfirm = null;
        this.destroy();

        if (onConfirm) {
            try {
                onConfirm();
            } catch (e) {
                _error("confirm callback failed", e);
            }
        }
    }
});

var SaveProfileDialog = GObject.registerClass(
class SaveProfileDialog extends ModalDialog.ModalDialog {

    /**
     * _init:
     * @opts (object): {
     *   existingProfiles: [{ id, name }],
     *   activeProfileName: string or null,
     *   duplicateNameWarning: fn(name) -> bool, or null to use the built-in
     *                         name-collision check
     * }
     * @callback (function): called with null (cancel) or
     *                       { mode: "new"|"replace", name, targetId,
     *                         useAtStartup }
     */
    _init(opts, callback) {
        super._init();

        opts = opts && typeof opts === "object" ? opts : {};
        this._callback = callback;
        this._settled = false;
        this._destroyed = false;
        this._handlerIds = [];
        this._mode = "new";
        this._replaceId = null;
        this._useAtStartup = false;
        this._existing = _normalizeProfiles(opts.existingProfiles);
        this._duplicateNameWarning = typeof opts.duplicateNameWarning === "function"
            ? opts.duplicateNameWarning
            : null;

        let content = new Dialog.MessageDialogContent({
            title: _("Save Panel Profile")
        });
        this.contentLayout.add_child(content);

        this.contentLayout.add_child(new St.Label({
            text: _("Name"),
            style_class: "panel-profiles-field-label"
        }));

        this._entry = new St.Entry({
            style_class: "run-dialog-entry panel-profiles-entry",
            can_focus: true,
            track_hover: true,
            reactive: true,
            x_expand: true,
            hint_text: _("Profile name")
        });
        let text = this._entry.clutter_text;
        text.editable = true;
        text.activatable = true;
        text.single_line_mode = true;
        text.max_length = MAX_NAME_LENGTH;
        if (typeof opts.activeProfileName === "string" && opts.activeProfileName)
            this._entry.set_text(opts.activeProfileName);
        this.contentLayout.add_child(this._entry);

        /* Inline duplicate-name warning. Kept under the entry because it is
         * a property of the typed name, not of the chosen target. */
        this._warningLabel = new St.Label({
            text: _("A profile with this name already exists"),
            style_class: "panel-profiles-name-warning"
        });
        this._warningLabel.hide();
        this.contentLayout.add_child(this._warningLabel);

        this.contentLayout.add_child(new St.Label({
            text: _("Save as:"),
            style_class: "panel-profiles-field-label"
        }));

        /* Radio pair. St.Button already maintains the :checked pseudo-class
         * in toggle mode; exclusivity is re-asserted in the click handler
         * so a second click on the active radio cannot un-check it. */
        this._newRadio = _makeToggleButton(_("New profile"), "radiobutton panel-profiles-radio");
        this._newRadio.checked = true;
        this._handlerIds.push([this._newRadio,
            this._newRadio.connect("clicked", () => this._onRadioClicked("new"))]);

        this._replaceRadio = _makeToggleButton(_("Replace existing profile"), "radiobutton panel-profiles-radio");
        this._replaceRadio.checked = false;
        this._handlerIds.push([this._replaceRadio,
            this._replaceRadio.connect("clicked", () => this._onRadioClicked("replace"))]);
        if (!this._existing.length) {
            this._replaceRadio.reactive = false;
            this._replaceRadio.change_style_pseudo_class("insensitive", true);
        }

        let radioBox = new St.BoxLayout({
            vertical: true,
            style_class: "panel-profiles-radio-box"
        });
        radioBox.add_child(this._newRadio);
        radioBox.add_child(this._replaceRadio);
        this.contentLayout.add_child(radioBox);

        /* Replace target list, revealed only in replace mode. */
        this._replaceBox = new St.BoxLayout({ vertical: true });
        this._replaceBox.add_child(new St.Label({
            text: _("Existing profile:"),
            style_class: "panel-profiles-field-label"
        }));

        this._replaceList = new St.BoxLayout({ vertical: true });
        this._replaceScroll = new St.ScrollView({
            style_class: "panel-profiles-replace-scroll",
            x_expand: true,
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC
        });
        this._replaceScroll.add_actor(this._replaceList);
        this._replaceBox.add_child(this._replaceScroll);
        this._replaceBox.hide();
        this.contentLayout.add_child(this._replaceBox);

        /* "Use this profile at startup". The "check-box-2" theme class
         * styles the glyph box and its spacing with no help from us. */
        this._startupCheck = _makeToggleButton(_("Use this profile at startup"), "check-box-2");
        this._startupCheck.checked = false;
        this._handlerIds.push([this._startupCheck,
            this._startupCheck.connect("clicked", () => {
                if (this._destroyed)
                    return;
                this._useAtStartup = this._startupCheck.checked;
            })]);
        this.contentLayout.add_child(this._startupCheck);

        this._rebuildReplaceList();

        /* St.Entry's ClutterText consumes Enter, so the dialog's default
         * button key routing never sees it. Handle it here as well;
         * _settled guards against both paths firing. */
        this._activateId = text.connect("activate", () => this._commit());
        this._handlerIds.push([text,
            text.connect("text-changed", () => this._onNameChanged())]);

        this._primaryDescriptor = {
            label: _("Save"),
            action: () => this._commit(),
            default: true
        };
        this.setButtons([
            {
                label: _("Cancel"),
                action: () => this._cancel(),
                key: Clutter.KEY_Escape
            },
            this._primaryDescriptor
        ]);

        /* Must come after setButtons(): addButton() focuses a button when
         * nothing else has claimed focus. Focus the ClutterText, not the
         * St.Entry wrapper, since that is what receives typed characters. */
        this.setInitialKeyFocus(text);

        this.connect("opened", () => this._onOpened());
        this.connect("destroy", () => this._onDestroy());

        this._onNameChanged();
    }

    _onOpened() {
        if (this._destroyed)
            return;
        /* Select the pre-filled name so typing replaces it in one go. */
        try {
            let value = this._entry.get_text() || "";
            if (value)
                this._entry.clutter_text.set_selection(0, value.length);
        } catch (e) {
            _warn("could not select prefilled name");
        }
    }

    _onDestroy() {
        this._destroyed = true;
        try {
            if (this._activateId && this._entry)
                this._entry.clutter_text.disconnect(this._activateId);
        } catch (e) {
            /* entry already finalized - nothing to release */
        }
        this._activateId = 0;
        if (this._handlerIds) {
            this._handlerIds.forEach((pair) => {
                try {
                    pair[0].disconnect(pair[1]);
                } catch (e) {
                    /* source already gone */
                }
            });
            this._handlerIds = [];
        }
        this._callback = null;
    }

    _onRadioClicked(mode) {
        if (this._destroyed)
            return;
        /* Re-assert both states: a radio pair must never end up with both
         * or neither button checked. */
        this._newRadio.checked = mode === "new";
        this._replaceRadio.checked = mode === "replace";
        if (this._mode === mode)
            return;
        this._mode = mode;

        if (mode === "replace")
            this._replaceBox.show();
        else
            this._replaceBox.hide();
        this._onNameChanged();
    }

    _rebuildReplaceList() {
        if (this._destroyed)
            return;
        _clearContainer(this._replaceList);

        if (this._replaceId && !this._findById(this._replaceId))
            this._replaceId = null;

        for (let i = 0; i < this._existing.length; i++) {
            let profile = this._existing[i];
            let row = new St.Button({
                style_class: "panel-profiles-profile-row",
                label: profile.name,
                x_align: St.Align.START,
                x_expand: true,
                reactive: true,
                /* Keyboard-reachable so the target can be picked without
                 * the mouse. */
                can_focus: true
            });
            row.profileId = profile.id;
            row.connect("clicked", () => this._selectReplace(profile.id));
            this._replaceList.add_child(row);
        }
        this._highlightReplaceSelection();
    }

    _findById(id) {
        for (let i = 0; i < this._existing.length; i++) {
            if (this._existing[i].id === id)
                return this._existing[i];
        }
        return null;
    }

    _selectReplace(id) {
        if (this._destroyed)
            return;
        this._replaceId = id;
        this._highlightReplaceSelection();

        /* Only suggest the target's name while the field is untouched.
         * Never overwrite a name the user is typing or has already set
         * (same rule as the world clock's dialog). */
        try {
            if (!this._entry.get_text().trim()) {
                let profile = this._findById(id);
                if (profile)
                    this._entry.set_text(profile.name);
            }
            global.stage.set_key_focus(this._entry.clutter_text);
        } catch (e) {
            /* entry gone */
        }
        this._onNameChanged();
    }

    _highlightReplaceSelection() {
        let children = this._replaceList.get_children();
        for (let i = 0; i < children.length; i++) {
            let row = children[i];
            if (row.profileId === this._replaceId)
                row.add_style_pseudo_class("outlined");
            else
                row.remove_style_pseudo_class("outlined");
        }
    }

    _currentName() {
        try {
            return _cleanName(this._entry.get_text());
        } catch (e) {
            _error("could not read profile name", e);
            return "";
        }
    }

    /* True when the typed name collides with a profile that is not the
     * selected replace target. The applet can disable the whole check by
     * passing a duplicateNameWarning that returns false. */
    _nameConflicts(name) {
        if (!name)
            return false;
        let conflict = false;
        for (let i = 0; i < this._existing.length; i++) {
            let profile = this._existing[i];
            if (profile.name !== name)
                continue;
            if (this._mode === "replace" && profile.id === this._replaceId)
                continue;
            conflict = true;
            break;
        }
        if (!conflict)
            return false;
        if (this._duplicateNameWarning) {
            try {
                return !!this._duplicateNameWarning(name);
            } catch (e) {
                _error("duplicate name check failed", e);
                return false;
            }
        }
        return true;
    }

    _canCommit() {
        let name = this._currentName();
        if (!name)
            return false;
        if (this._mode === "replace" && !this._replaceId)
            return false;
        return true;
    }

    _onNameChanged() {
        if (this._destroyed)
            return;
        let name = this._currentName();
        if (this._nameConflicts(name))
            this._warningLabel.show();
        else
            this._warningLabel.hide();

        let button = this._primaryDescriptor.button;
        if (!button)
            return;
        button.set_label(this._mode === "replace" ? _("Overwrite") : _("Save"));
        let enabled = this._canCommit();
        button.reactive = enabled;
        button.change_style_pseudo_class("insensitive", !enabled);
    }

    _cancel() {
        if (this._settled)
            return;
        this._settled = true;

        let callback = this._callback;
        this._callback = null;
        this.destroy();

        if (callback) {
            try {
                callback(null);
            } catch (e) {
                _error("save cancel callback failed", e);
            }
        }
    }

    _commit() {
        if (this._settled)
            return;
        if (!this._canCommit())
            return;

        let name = this._currentName();
        let useAtStartup = this._useAtStartup;

        if (this._mode === "replace") {
            /* Replacing always asks once more (spec section 11). The save
             * dialog stays open underneath; the confirm settles it. */
            let targetId = this._replaceId;
            let target = this._findById(targetId);
            let title = _("Replace \"%s\"?").format(target ? target.name : name);
            let description = _("The saved version of this profile will be replaced by your current panel configuration.");
            let confirm = new PanelProfilesConfirmDialog(
                title,
                description,
                _("Replace"),
                () => this._finish({
                    mode: "replace",
                    name: name,
                    targetId: targetId,
                    useAtStartup: useAtStartup
                })
            );
            _openDialog(confirm);
            return;
        }

        this._finish({
            mode: "new",
            name: name,
            targetId: null,
            useAtStartup: useAtStartup
        });
    }

    _finish(result) {
        if (this._settled)
            return;
        this._settled = true;

        let callback = this._callback;
        this._callback = null;
        /* A settled promise survives even a dialog whose actor was torn down
         * underneath it (an external destroy of the modal stack); the
         * callback is plain JS and must still fire. */
        if (!this._destroyed) {
            try {
                this.destroy();
            } catch (e) {
                _warn("save dialog destroy failed: " + e);
            }
        }

        if (callback) {
            try {
                callback(result);
            } catch (e) {
                _error("save callback failed", e);
            }
        }
    }
});

var RenameProfileDialog = GObject.registerClass(
class RenameProfileDialog extends ModalDialog.ModalDialog {

    /**
     * _init:
     * @currentName (string): name to pre-fill the entry with
     * @callback (function): called with the trimmed new name on commit.
     *                        Not called on cancel. An empty name never
     *                        commits; the button stays insensitive.
     */
    _init(currentName, callback) {
        super._init();

        this._callback = callback;
        this._settled = false;
        this._destroyed = false;

        let content = new Dialog.MessageDialogContent({
            title: _("Rename profile"),
            description: _("Enter a new name for the profile.")
        });
        this.contentLayout.add_child(content);

        this._entry = new St.Entry({
            style_class: "run-dialog-entry panel-profiles-entry",
            can_focus: true,
            track_hover: true,
            reactive: true,
            x_expand: true,
            hint_text: _("Profile name")
        });
        let text = this._entry.clutter_text;
        text.editable = true;
        text.activatable = true;
        text.single_line_mode = true;
        text.max_length = MAX_NAME_LENGTH;
        this._entry.set_text(typeof currentName === "string" ? currentName : "");
        this.contentLayout.add_child(this._entry);

        this._activateId = text.connect("activate", () => this._commit());
        this._textChangedId = text.connect("text-changed", () => this._updateSensitivity());

        this._renameDescriptor = {
            label: _("Rename"),
            action: () => this._commit(),
            default: true
        };
        this.setButtons([
            {
                label: _("Cancel"),
                action: () => this._cancel(),
                key: Clutter.KEY_Escape
            },
            this._renameDescriptor
        ]);

        this.setInitialKeyFocus(text);

        this.connect("destroy", () => this._onDestroy());

        this._updateSensitivity();
    }

    _onDestroy() {
        this._destroyed = true;
        try {
            if (this._activateId && this._entry)
                this._entry.clutter_text.disconnect(this._activateId);
        } catch (e) {
            /* entry already finalized - nothing to release */
        }
        this._activateId = 0;
        if (this._textChangedId) {
            try {
                this._entry.clutter_text.disconnect(this._textChangedId);
            } catch (e) {
                /* already gone */
            }
            this._textChangedId = 0;
        }
        this._callback = null;
    }

    _currentName() {
        try {
            return _cleanName(this._entry.get_text());
        } catch (e) {
            return "";
        }
    }

    _updateSensitivity() {
        if (this._destroyed)
            return;
        let button = this._renameDescriptor.button;
        if (!button)
            return;
        let enabled = !!this._currentName();
        button.reactive = enabled;
        button.change_style_pseudo_class("insensitive", !enabled);
    }

    _cancel() {
        if (this._settled)
            return;
        this._settled = true;
        this.destroy();
    }

    _commit() {
        if (this._settled)
            return;
        let name = this._currentName();
        if (!name)
            return;
        this._settled = true;

        let callback = this._callback;
        this._callback = null;
        this.destroy();

        if (callback) {
            try {
                callback(name);
            } catch (e) {
                _error("rename callback failed", e);
            }
        }
    }
});

var ManageProfilesDialog = GObject.registerClass(
class ManageProfilesDialog extends ModalDialog.ModalDialog {

    /**
     * _init:
     * @opts (object): {
     *   profiles: [{ id, name, updatedAt (ISO), expectedCount, valid,
     *                isActive, isStartup }],
     *   operations: {
     *     load(id),
     *     rename(id, newName, done),
     *     duplicate(id, done),
     *     setStartup(id, done),
     *     removeStartup(id, done),
     *     delete(id, done)
     *   }
     * }
     *
     * The done callbacks are how the applet pushes fresh list data: call
     * done(updatedProfiles) after an operation and the dialog re-renders
     * from it (refresh()). done() with no argument just re-renders the
     * current data. Extra done arguments are accepted by operations that
     * do not use them.
     */
    _init(opts) {
        super._init();

        opts = opts && typeof opts === "object" ? opts : {};
        this._settled = false;
        this._destroyed = false;
        this._loadTimeout = 0;
        this._firstFocusCandidate = null;
        this._profiles = _normalizeProfiles(opts.profiles);
        this._operations = opts.operations && typeof opts.operations === "object"
            ? opts.operations
            : {};

        let content = new Dialog.MessageDialogContent({
            title: _("Manage Profiles")
        });
        this.contentLayout.add_child(content);

        this._listBox = new St.BoxLayout({
            vertical: true,
            style_class: "panel-profiles-manage-list"
        });
        this._scroll = new St.ScrollView({
            style_class: "panel-profiles-manage-scroll",
            x_expand: true,
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC
        });
        this._scroll.add_actor(this._listBox);
        this.contentLayout.add_child(this._scroll);

        this._rerender();

        this.setButtons([
            {
                label: _("Close"),
                action: () => this._cancel(),
                key: Clutter.KEY_Escape
            }
        ]);

        /* Focus the scroll view, never a row button: key focus on an actor
         * inside a scroll list has been part of a Cinnamon 6.6 teardown
         * crash (freed child walked by st_scroll_view_style_changed), and
         * the view is a perfectly good tab root. */
        this.setInitialKeyFocus(this._scroll);

        this.connect("destroy", () => this._onDestroy());
    }

    _onDestroy() {
        this._destroyed = true;
        if (this._loadTimeout) {
            Mainloop.source_remove(this._loadTimeout);
            this._loadTimeout = 0;
        }
    }

    /**
     * refresh:
     * @profiles (array): fresh profile list in the constructor's format
     *
     * Re-renders the whole row list. Safe after destroy: a no-op.
     */
    refresh(profiles) {
        if (this._settled || this._destroyed)
            return;
        this._profiles = _normalizeProfiles(profiles);
        this._rerender();
    }

    _rerender() {
        if (this._settled || this._destroyed)
            return;
        this._firstFocusCandidate = null;
        _clearContainer(this._listBox);

        if (!this._profiles.length) {
            this._listBox.add_child(new St.Label({
                text: _("No panel profiles saved yet."),
                style_class: "panel-profiles-empty-label"
            }));
            return;
        }

        for (let i = 0; i < this._profiles.length; i++)
            this._listBox.add_child(this._buildRow(this._profiles[i]));
    }

    _buildRow(profile) {
        let row = new St.BoxLayout({
            style_class: profile.valid
                ? "panel-profiles-manage-row"
                : "panel-profiles-manage-row panel-profiles-row-invalid"
        });

        /* Status icons: check for active, star for startup. The column has
         * a fixed min-width so names line up across rows. */
        let icons = new St.BoxLayout({
            style_class: "panel-profiles-row-icons"
        });
        if (profile.isActive) {
            icons.add_child(this._statusIcon("object-select-symbolic", _("Active profile")));
        }
        if (profile.isStartup) {
            icons.add_child(this._statusIcon("starred-symbolic", _("Startup profile")));
        }
        row.add_child(icons);

        let textBox = new St.BoxLayout({ vertical: true, x_expand: true });
        let nameLabel = new St.Label({
            text: profile.name,
            x_expand: true
        });
        nameLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        textBox.add_child(nameLabel);
        textBox.add_child(new St.Label({
            text: this._metaText(profile),
            style_class: "panel-profiles-row-meta"
        }));
        row.add_child(textBox);

        let actions = new St.BoxLayout({
            style_class: "panel-profiles-row-actions"
        });

        if (!profile.valid) {
            /* Unreadable profiles keep only Delete available. */
            actions.add_child(this._rowButton(_("Delete"), profile,
                () => this._deleteProfile(profile), true));
            row.add_child(actions);
            return row;
        }

        if (this._hasOperation("load"))
            actions.add_child(this._rowButton(_("Load"), profile, () => this._loadProfile(profile)));
        if (this._hasOperation("rename"))
            actions.add_child(this._rowButton(_("Rename"), profile, () => this._renameProfile(profile)));
        if (this._hasOperation("duplicate"))
            actions.add_child(this._rowButton(_("Duplicate"), profile, () => this._duplicateProfile(profile)));
        if (this._hasOperation("setStartup") || this._hasOperation("removeStartup")) {
            let startup = profile.isStartup;
            actions.add_child(this._rowButton(
                startup ? _("Remove startup") : _("Set as startup"),
                profile,
                () => this._toggleStartup(profile, !startup)
            ));
        }
        if (this._hasOperation("delete"))
            actions.add_child(this._rowButton(_("Delete"), profile, () => this._deleteProfile(profile), true));

        row.add_child(actions);
        return row;
    }

    _statusIcon(iconName, tooltipText) {
        let icon = new St.Icon({
            icon_name: iconName,
            icon_type: St.IconType.SYMBOLIC,
            icon_size: ICON_SIZE
        });
        /* No Tooltips.Tooltip here on purpose. Each tooltip wires
         * notify::allocation, enter/leave and stage key-focus handlers onto
         * the icon; on rows inside a scroll list that combination took
         * Cinnamon 6.6 down during teardown (freed child walked by a style
         * cascade). The icon plus the row's meta text already say what the
         * tooltip said. */
        icon.accessible_name = tooltipText;
        return icon;
    }

    _metaText(profile) {
        if (!profile.valid)
            return _("unreadable");
        let date = _formatDate(profile.updatedAt);
        if (profile.expectedCount > 0 && date)
            return _("%d displays · updated %s").format(profile.expectedCount, date);
        if (profile.expectedCount > 0)
            return _("%d displays").format(profile.expectedCount);
        if (date)
            return _("updated %s").format(date);
        return "";
    }

    _rowButton(label, profile, handler, destructive) {
        let button = new St.Button({
            style_class: "dialog-button panel-profiles-row-button",
            label: label,
            reactive: true,
            can_focus: true
        });
        if (destructive)
            button.add_style_pseudo_class("destructive-action");
        button.connect("clicked", () => {
            if (this._destroyed)
                return;
            try {
                handler();
            } catch (e) {
                _error("row action failed for profile " + profile.id, e);
            }
        });
        if (!this._firstFocusCandidate && !destructive)
            this._firstFocusCandidate = button;
        return button;
    }

    _hasOperation(name) {
        return this._operations && typeof this._operations[name] === "function";
    }

    _callOperation(name) {
        let op = this._operations ? this._operations[name] : null;
        if (typeof op !== "function") {
            _warn("manage dialog operation missing: " + name);
            return;
        }
        /* Every operation gets a done callback as its last argument (the
         * replace/delete/rename contract) even where the applet ignores
         * it, so fresh data can always flow back through refresh(). */
        let args = Array.prototype.slice.call(arguments, 1);
        args.push(this._makeDone());
        try {
            op.apply(null, args);
        } catch (e) {
            _error("operation failed: " + name, e);
        }
        if (!this._destroyed)
            this._rerender();
    }

    /* done(updatedProfiles) is the applet's push channel. Called
     * synchronously by the operations; also safe to call later. */
    _makeDone() {
        return (profiles) => {
            if (this._settled || this._destroyed)
                return;
            if (Array.isArray(profiles))
                this.refresh(profiles);
            else
                this._rerender();
        };
    }

    _loadProfile(profile) {
        /* Loading rewrites the panel set, which can destroy this applet
         * instance entirely. Close first, act on the next main loop turn,
         * and never touch this dialog after close. The timeout is tracked
         * so an unrelated destroy still cancels it. */
        if (this._settled)
            return;
        this._settled = true;
        let op = this._operations ? this._operations.load : null;
        let id = profile.id;
        this.destroy();
        if (typeof op !== "function") {
            _warn("manage dialog operation missing: load");
            return;
        }
        this._loadTimeout = Mainloop.timeout_add(0, () => {
            this._loadTimeout = 0;
            try {
                op(id);
            } catch (e) {
                _error("load failed", e);
            }
            return false;
        });
    }

    _renameProfile(profile) {
        let dialog = new RenameProfileDialog(profile.name, (newName) => {
            if (!newName || newName === profile.name)
                return;
            this._callOperation("rename", profile.id, newName);
        });
        _openDialog(dialog);
    }

    _duplicateProfile(profile) {
        this._callOperation("duplicate", profile.id);
    }

    _toggleStartup(profile, on) {
        /* Optimistic in-place toggle: flip our own copy first so the row
         * reacts instantly, then let the operation confirm it. */
        if (!this._settled) {
            for (let i = 0; i < this._profiles.length; i++)
                this._profiles[i].isStartup = on && this._profiles[i].id === profile.id;
            this._rerender();
        }
        this._callOperation(on ? "setStartup" : "removeStartup", profile.id);
    }

    _deleteProfile(profile) {
        let title = _("Delete \"%s\"?").format(profile.name);
        let description = _("The saved profile will be removed. Your current panels are not changed.");
        let confirm = new PanelProfilesConfirmDialog(
            title,
            description,
            _("Delete"),
            () => this._callOperation("delete", profile.id),
            true
        );
        _openDialog(confirm);
    }

    _cancel() {
        if (this._settled)
            return;
        this._settled = true;
        this.destroy();
    }
});

var StartupOfferDialog = GObject.registerClass(
class StartupOfferDialog extends ModalDialog.ModalDialog {

    /**
     * _init:
     * @profileName (string): name of the profile just saved
     * @callback (function): called with true (use at startup) or false
     *                       (not now). Always called exactly once.
     */
    _init(profileName, callback) {
        super._init();

        this._callback = callback;
        this._settled = false;
        let name = typeof profileName === "string" ? profileName : "";

        let content = new Dialog.MessageDialogContent({
            title: _("Use \"%s\" as your startup profile?").format(name),
            description: _("Its panels and applets will be restored automatically the next time Cinnamon starts. For the most reliable restore, keep this applet on a panel of your primary display.")
        });
        this.contentLayout.add_child(content);

        this.setButtons([
            {
                label: _("Not now"),
                action: () => this._settle(false),
                key: Clutter.KEY_Escape
            },
            {
                label: _("Use at startup"),
                action: () => this._settle(true),
                default: true
            }
        ]);

        this.connect("destroy", () => {
            this._callback = null;
        });
    }

    _settle(result) {
        if (this._settled)
            return;
        this._settled = true;

        let callback = this._callback;
        this._callback = null;
        this.destroy();

        if (callback) {
            try {
                callback(result);
            } catch (e) {
                _error("startup offer callback failed", e);
            }
        }
    }
});

/**
 * promptSaveProfile:
 * @opts (object): see SaveProfileDialog
 * @callback (function): see SaveProfileDialog
 *
 * Convenience wrapper that never throws into a signal handler.
 *
 * Returns (boolean): whether the dialog opened.
 */
function promptSaveProfile(opts, callback) {
    try {
        let dialog = new SaveProfileDialog(opts, callback);
        return _openDialog(dialog);
    } catch (e) {
        _error("could not create save dialog", e);
        return false;
    }
}

/**
 * openManageProfiles:
 * @opts (object): see ManageProfilesDialog
 *
 * Convenience wrapper that never throws into a signal handler.
 *
 * Returns (boolean): whether the dialog opened.
 */
function openManageProfiles(opts) {
    try {
        let dialog = new ManageProfilesDialog(opts);
        return _openDialog(dialog);
    } catch (e) {
        _error("could not create manage dialog", e);
        return false;
    }
}

/**
 * promptStartupOffer:
 * @profileName (string): name of the profile just saved
 * @callback (function): called with boolean
 *
 * First-run "use as startup?" offer after the first save.
 *
 * Returns (boolean): whether the dialog opened.
 */
function promptStartupOffer(profileName, callback) {
    try {
        let dialog = new StartupOfferDialog(profileName, callback);
        return _openDialog(dialog);
    } catch (e) {
        _error("could not create startup offer dialog", e);
        return false;
    }
}
