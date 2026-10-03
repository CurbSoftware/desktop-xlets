/*
 * main.qml
 *
 * Workspace Grid plasmoid: a clickable grid of the virtual desktops.
 * Names and the desktop list come from the virtualdesktops dataengine
 * (KWin is the source of truth; add, remove and rename desktops in
 * System Settings, as KDE owns that natively). Click a tile to switch.
 *
 * Ported from the Cinnamon Workspace Grid desklet. Live window
 * previews are not ported; tiles are name tiles. The compact panel
 * representation shows the current desktop number.
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

        readonly property int rows: {
            const data = engine.data["VirtualDesktops"];
            return data ? (data["rows"] || 1) : 1;
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

        function gridColumns() {
            const count = Math.max(1, desktops.length);
            const rows = Math.max(1, engine.rows);
            return Math.max(1, Math.ceil(count / rows));
        }
    }

    Plasmoid.preferredRepresentation: Plasmoid.compactRepresentation

    Plasmoid.compactRepresentation: PC3.Label {
        text: String(engine.current)
        color: Kirigami.Theme.textColor

        MouseArea {
            anchors.fill: parent
            onClicked: Plasmoid.expanded = !Plasmoid.expanded
        }
    }

    Plasmoid.fullRepresentation: Item {
        Layout.minimumWidth: Kirigami.Units.gridUnit * 6
        Layout.minimumHeight: Kirigami.Units.gridUnit * 4

        GridLayout {
            anchors.fill: parent
            anchors.margins: Kirigami.Units.smallSpacing
            columns: engine.gridColumns()
            columnSpacing: Kirigami.Units.smallSpacing
            rowSpacing: Kirigami.Units.smallSpacing

            Repeater {
                model: engine.desktops

                Rectangle {
                    id: tile

                    required property var modelData
                    required property int index

                    readonly property bool isActive: engine.current === index + 1
                    readonly property string name: modelData && modelData.name
                        ? modelData.name : String(index + 1)

                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    radius: 8
                    color: isActive ? Qt.rgba(0.29, 0.64, 1, 0.18) : Qt.rgba(0, 0, 0, 0.22)
                    border.width: isActive ? 2 : 1
                    border.color: isActive ? Qt.rgba(0.29, 0.64, 1, 0.8)
                                           : Qt.rgba(1, 1, 1, 0.25)

                    PC3.Label {
                        anchors.centerIn: parent
                        width: parent.width - 8
                        horizontalAlignment: Text.AlignHCenter
                        fontSizeMode: Text.Fit
                        minimumPixelSize: 7
                        font.pixelSize: 24
                        font.bold: true
                        color: "white"
                        text: Plasmoid.configuration.showIndex
                            ? String(tile.index + 1) + ": " + tile.name
                            : tile.name
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: engine.activate(tile.index)
                    }
                }
            }
        }
    }
}
