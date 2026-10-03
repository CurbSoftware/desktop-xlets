/*
 * main.qml
 *
 * Workspace Names plasmoid: one button per virtual desktop, click to
 * switch, the active one highlighted. Desktop names come from the
 * virtualdesktops dataengine (KWin is the source of truth; rename
 * desktops in System Settings, as KDE owns naming natively).
 * Switching goes through the engine's activate service.
 *
 * Ported from the Cinnamon In Panel Workspace Name applet. Panel and
 * desktop are both served: compact shows the current name in a panel,
 * full shows every button.
 */

import QtQuick
import QtQuick.Layouts

import org.kde.kirigami as Kirigami
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.components as PC3
import org.kde.plasma.plasmoid

Item {
    id: root

    PlasmaCore.DataSource {
        id: engine

        engine: "virtualdesktops"
        interval: 0

        readonly property var desktops: {
            const data = engine.data["VirtualDesktops"];
            if (!data)
                return [];
            return data["desktops"] || [];
        }

        readonly property int current: {
            const data = engine.data["VirtualDesktops"];
            return data ? (data["currentDesktop"] || 1) : 1;
        }

        function activate(index) {
            const service = engine.serviceForSource("VirtualDesktops");
            if (!service)
                return;
            const operation = service.operationDescription("activate");
            const desktop = engine.desktops[index];
            operation.id = desktop ? desktop.id : index + 1;
            service.startOperationCall(operation);
        }
    }

    component DesktopButton: PC3.Button {
        id: desktopButton

        property var desktopData
        property int buttonIndex

        readonly property bool isActive: engine.current === buttonIndex + 1
        readonly property string name: desktopData && desktopData.name
            ? desktopData.name : String(buttonIndex + 1)

        text: {
            const mode = Plasmoid.configuration.displayMode;
            if (mode === "number")
                return String(buttonIndex + 1);
            if (mode === "both")
                return String(buttonIndex + 1) + ": " + name;
            return name;
        }
        flat: !isActive
        onClicked: engine.activate(buttonIndex)
    }

    Plasmoid.preferredRepresentation: Plasmoid.compactRepresentation

    Plasmoid.compactRepresentation: PC3.Label {
        text: {
            const desktop = engine.desktops[engine.current - 1];
            const mode = Plasmoid.configuration.displayMode;
            if (!desktop || mode === "number")
                return String(engine.current);
            const name = desktop.name || String(engine.current);
            return mode === "both" ? String(engine.current) + ": " + name : name;
        }
        color: Kirigami.Theme.textColor

        MouseArea {
            anchors.fill: parent
            onClicked: Plasmoid.expanded = !Plasmoid.expanded
        }
    }

    Plasmoid.fullRepresentation: RowLayout {
        spacing: Kirigami.Units.smallSpacing

        Repeater {
            model: engine.desktops

            DesktopButton {
                desktopData: modelData
                buttonIndex: index
            }
        }
    }
}
