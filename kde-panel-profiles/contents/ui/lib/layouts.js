.pragma library
/**
 * layouts.js
 *
 * Pure profile bookkeeping and appletsrc summarising for the Plasma
 * Layouts plasmoid. Ported in spirit from the Cinnamon Panel Profiles
 * applet's storage modules; KDE owns the desktop layout file
 * (plasma-org.kde.plasma.desktop-appletsrc), so a profile here is that
 * file's text plus a saved date, stored as JSON inside the plasmoid
 * configuration. No QML types are touched, so node tests cover it.
 */

const APPLET_SRC_GROUP = /^\[Containments\]\[([0-9]+)\](\[.*)?$/gm;

/**
 * parseProfiles:
 *
 * Returns (object): the profiles map, or {} for missing or invalid
 * JSON.
 */
function parseProfiles(json) {
    try {
        const value = JSON.parse(json);
        if (value && typeof value === "object" && !Array.isArray(value))
            return value;
    } catch (e) {
    }
    return {};
}

/**
 * safeName:
 *
 * Profile names become JSON keys; empty and over-long names are
 * refused, everything else passes through.
 */
function safeName(name) {
    const cleaned = String(name || "").trim();
    if (!cleaned || cleaned.length > 64)
        return "";
    return cleaned;
}

/**
 * summarize:
 *
 * Counts containments, panels and widgets in appletsrc text for menu
 * subtitles. Panels are containments whose plugin is "panel"; widgets
 * are plasmoids inside any containment.
 */
function summarize(appletsrcText) {
    const text = String(appletsrcText || "");
    const containments = new Set();
    let match;
    const re = new RegExp(APPLET_SRC_GROUP.source, "gm");
    while ((match = re.exec(text)) !== null)
        containments.add(match[1]);
    const panelPlugins = text.match(/^plugin=panel$/gm);
    const appletGroups = text.match(/\[Containments\]\[\d+\]\[Applets\]\[\d+\]/g);
    return {
        containments: containments.size,
        panels: panelPlugins ? panelPlugins.length : 0,
        widgets: appletGroups ? appletGroups.length : 0
    };
}

/**
 * upsertProfile:
 *
 * Returns (string): the new profiles JSON with @name added or
 * replaced. Existing profiles are kept.
 */
function upsertProfile(json, name, profile) {
    const profiles = parseProfiles(json);
    const clean = safeName(name);
    if (!clean)
        return json;
    profiles[clean] = {
        savedAt: new Date().toISOString(),
        appletsrc: String(profile.appletsrc || ""),
        kwinrc: typeof profile.kwinrc === "string" ? profile.kwinrc : null
    };
    return JSON.stringify(profiles);
}

/**
 * removeProfile / getProfile / listNames:
 */
function removeProfile(json, name) {
    const profiles = parseProfiles(json);
    if (!profiles[name])
        return json;
    delete profiles[name];
    return JSON.stringify(profiles);
}

function getProfile(json, name) {
    const profiles = parseProfiles(json);
    return profiles[name] || null;
}

function listNames(json) {
    return Object.keys(parseProfiles(json)).sort();
}

/**
 * applyCommands:
 *
 * Builds the shell command list that restores a profile: back up the
 * live files, write the saved ones, restart plasmashell so it reloads.
 * The plasmoid runs them through the executable dataengine when the
 * host Plasma still provides it (probed at runtime; see main.qml).
 *
 * Returns (array of strings), empty when the profile is unusable.
 */
function applyCommands(profile, configDir) {
    if (!profile || typeof profile.appletsrc !== "string" || !profile.appletsrc)
        return [];
    const base = String(configDir || "").replace(/\/+$/, "");
    const appletsrc = base + "/plasma-org.kde.plasma.desktop-appletsrc";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const commands = [
        "cp " + appletsrc + " " + appletsrc + ".plasma-layouts-backup-" + stamp,
        "cat > " + appletsrc + " <<'CURB_LAYOUT_EOF'\n" +
            profile.appletsrc + "\nCURB_LAYOUT_EOF"
    ];
    if (typeof profile.kwinrc === "string" && profile.kwinrc) {
        const kwinrc = base + "/kwinrc";
        commands.push("cp " + kwinrc + " " + kwinrc + ".plasma-layouts-backup-" + stamp);
        commands.push("cat > " + kwinrc + " <<'CURB_LAYOUT_EOF'\n" +
            profile.kwinrc + "\nCURB_LAYOUT_EOF");
    }
    commands.push("kquitapp6 plasmashell || kquitapp5 plasmashell || true");
    commands.push("sleep 1; kstart plasmashell || plasmashell --replace & disown || true");
    return commands;
}
