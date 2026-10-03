/*
 * main.qml
 *
 * Command Launcher plasmoid. KDE removed the executable dataengine,
 * and QML plasmoids cannot spawn shell commands without a C++ helper,
 * so this port launches applications and .desktop entries through the
 * standard URL mechanism: give it an application id (org.kde.kate), a
 * .desktop file name, or an absolute path to one. Arbitrary shell
 * commands are a documented gap; the run() seam in lib/launcher.js is
 * the upgrade point for a future helper.
 *
 * Ported from the Cinnamon Command Launcher applet.
 */

import QtQuick

import org.kde.kirigami as Kirigami
import org.kde.plasma.plasmoid

import "lib/launcher.js" as Launcher

Item {
    id: root

    readonly property string entry: (Plasmoid.configuration.entry || "").trim()

    function run() {
        if (!entry) {
            const configure = Plasmoid.internalAction("configure");
            if (configure)
                configure.trigger();
            return;
        }
        Launcher.run(entry);
    }

    Plasmoid.icon: entry ? "system-run-symbolic" : "preferences-system-symbolic"
    Plasmoid.toolTipMainText: Plasmoid.configuration.tooltipText || "Command Launcher"

    Plasmoid.compactRepresentation: MouseArea {
        onClicked: root.run()

        Kirigami.Icon {
            anchors.centerIn: parent
            width: Math.min(parent.width, parent.height) - 4
            height: width
            source: Plasmoid.icon
            isMask: true
            color: Kirigami.Theme.textColor
        }
    }
}
