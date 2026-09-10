/**
 * defaults.js
 *
 * Default settings for the Workspace Grid extension. Mirrors the
 * Cinnamon desklet's schema defaults, plus the two GNOME-specific
 * keys: layer and position. Live window previews are not ported;
 * display-type "buttons" is the only mode.
 */

export const DEFAULTS = {
    layoutMode: "auto",
    fixedRows: 2,
    fixedCols: 2,
    showIndex: false,
    enableEditing: true,
    showAddTile: true,
    scrollWheelBehavior: "off",
    tileSpacing: 4,
    width: 600,
    height: 400,
    layer: "desktop",
    positionX: 64,
    positionY: 64
};
