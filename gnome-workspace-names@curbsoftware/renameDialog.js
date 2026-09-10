/**
 * renameDialog.js
 *
 * A small ModalDialog with one text entry, for renaming workspaces.
 * Ported from the Cinnamon renameDialog.js that the two workspace
 * xlets share. GNOME's ModalDialog needs a registered GObject class
 * and its own buttons, so the copy diverges in shape, not in job.
 *
 * promptRename(title, current, onAccept) opens the dialog modally and
 * fires onAccept(newName) only for a non-empty confirmation. Escape
 * and Cancel dismiss without effect.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

const RenameDialog = GObject.registerClass(
class RenameDialog extends ModalDialog.ModalDialog {
    _init(title, current, onAccept) {
        super._init({ styleClass: "curb-rename-dialog" });

        this._onAccept = onAccept;

        const box = new St.BoxLayout({
            vertical: true,
            style_class: "curb-rename-box"
        });

        const label = new St.Label({
            text: title,
            style_class: "curb-rename-label"
        });
        box.add_child(label);

        this._entry = new St.Entry({
            text: current || "",
            can_focus: true,
            x_align: Clutter.ActorAlign.FILL,
            style_class: "curb-rename-entry"
        });
        this._entry.clutter_text.connect("activate", () => this._confirm());
        box.add_child(this._entry);

        this.setChild(box);

        this.addButton({
            label: "Cancel",
            action: () => this.close(),
            key: Clutter.KEY_Escape
        });
        this.addButton({
            label: "Rename",
            action: () => this._confirm(),
            default: true
        });
    }

    _confirm() {
        const name = (this._entry.get_text() || "").trim();
        if (!name)
            return;
        this.close();
        if (typeof this._onAccept === "function")
            this._onAccept(name);
    }

    open() {
        super.open(global.get_current_time());
        this._entry.grab_key_focus();
    }
});

export function promptRename(title, current, onAccept) {
    const dialog = new RenameDialog(title, current, onAccept);
    dialog.connect("closed", () => dialog.destroy());
    dialog.open();
    return dialog;
}
