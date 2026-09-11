/**
 * extension.js
 *
 * Composition root for the Workspace Grid GNOME extension.
 */

import { Extension } from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import { DEFAULTS } from './lib/defaults.js';
import { Store } from './lib/store.js';
import { WorkspaceGridWidget } from './widget.js';

export default class WorkspaceGridExtension extends Extension {
    enable() {
        this._store = new Store(this.uuid, DEFAULTS);
        this._store.watch();

        this._widget = new WorkspaceGridWidget(this, this._store);
        this._widget.show();
    }

    disable() {
        if (this._widget) {
            this._widget.destroy();
            this._widget = null;
        }
        if (this._store) {
            this._store.unwatch();
            this._store = null;
        }
    }
}
