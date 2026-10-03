.pragma library
/**
 * launcher.js
 *
 * The single seam for launching things from the Command Launcher
 * plasmoid. Plasma 6 removed the executable dataengine, so v1 launches
 * applications and .desktop entries through Qt.openUrlExternally,
 * which routes through KDE's application launcher. Arbitrary shell
 * commands need a C++ helper; swap this implementation when one lands.
 */

function normalize(entry) {
    return String(entry || "").trim();
}

function isDesktopEntry(entry) {
    return /\.desktop$/i.test(entry) || /^[a-zA-Z0-9._-]+$/.test(entry);
}

function urlFor(entry) {
    const value = normalize(entry);
    if (!value)
        return "";
    if (value.indexOf("/") === 0)
        return "file://" + value;
    if (!/\.desktop$/i.test(value))
        return value + ".desktop";
    return value;
}

function run(entry) {
    const url = urlFor(entry);
    if (!url)
        return false;
    Qt.openUrlExternally(url);
    return true;
}
