# Refactoring Plan V2: Live Workspace Updates

**Objective:** Enhance the Workspace Grid desklet to dynamically update its grid and labels in real-time when workspaces are added, removed, or renamed, without introducing instability.

**Current State:** The desklet is stable and functional but static. It only builds the workspace grid once at startup and does not react to changes in the workspace environment.

**Key Challenge:** The previous attempt to add live updates caused crashes. The new implementation must be more robust, carefully managing signal connections and disconnections, and ensuring that any updates to the UI are performed safely.

## Step-by-Step Implementation Plan:

1.  **Isolate Signal Handling:**
    *   Create a dedicated function, `_connectWorkspaceSignals()`, to manage all `global.workspace_manager` signal connections (`workspace-added`, `workspace-removed`, `workspace-name-changed`).
    *   Create a corresponding `_disconnectWorkspaceSignals()` function to disconnect all signals cleanly. This is crucial for preventing memory leaks and crashes when the desklet is removed or reloaded.

2.  **Smart Rebuilding:**
    *   Create a new handler function, `_onWorkspacesChanged()`, which will be called by the workspace signals.
    *   Instead of unconditionally calling `_rebuildGrid()` for every signal, introduce a slight delay using `Mainloop.idle_add()`. This is a common technique in Cinnamon applets and desklets to prevent rapid, successive rebuilds which can cause instability. It ensures that if multiple workspace events happen in quick succession, the grid is only rebuilt once after the events have settled.

3.  **Safe Signal Connection and Disconnection:**
    *   In the `_init` function, call `_connectWorkspaceSignals()` after the main UI components have been initialized.
    *   In the `on_desklet_removed` function, ensure `_disconnectWorkspaceSignals()` is called to clean up all connections.

4.  **Code Implementation (diff format):**

    *   **Add to `_init`:**
        ```javascript
        this._connectWorkspaceSignals();
        ```

    *   **Add to `on_desklet_removed`:**
        ```javascript
        this._disconnectWorkspaceSignals();
        ```

    *   **Add new functions:**
        ```javascript
        _connectWorkspaceSignals: function() {
            this.ws_added_id = global.workspace_manager.connect('workspace-added', Lang.bind(this, this._onWorkspacesChanged));
            this.ws_removed_id = global.workspace_manager.connect('workspace-removed', Lang.bind(this, this._onWorkspacesChanged));
            this.ws_name_id = global.workspace_manager.connect('workspace-name-changed', Lang.bind(this, this._onWorkspacesChanged));
        },

        _disconnectWorkspaceSignals: function() {
            if (this.ws_added_id) {
                global.workspace_manager.disconnect(this.ws_added_id);
            }
            if (this.ws_removed_id) {
                global.workspace_manager.disconnect(this.ws_removed_id);
            }
            if (this.ws_name_id) {
                global.workspace_manager.disconnect(this.ws_name_id);
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
        },
        ```

5.  **Testing and Verification:**
    *   After implementing the changes, the desklet will be tested by:
        *   Adding new workspaces.
        *   Removing workspaces.
        *   Renaming workspaces.
    *   Each action should result in the desklet grid updating correctly without any crashes or freezes.

This revised plan introduces a more cautious and robust approach to handling live updates, which should prevent the previous stability issues.