/**
 * defaults.js
 *
 * Default settings for the Command Launcher extension. Mirrors the
 * Cinnamon applet's schema defaults; the keybinding is not ported
 * because GNOME keybindings need a compiled gschema.
 */

export const DEFAULTS = {
    command: "",
    panelIcon: "utilities-terminal-symbolic",
    tooltipText: "Command Launcher",
    showNotifications: false,
    useRoot: false,
    useAltEnv: false,
    altEnv: ""
};
