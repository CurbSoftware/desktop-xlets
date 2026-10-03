/*
 * main.qml
 *
 * World Clock plasmoid: a grid of timezone clocks. One package serves
 * both placements: on the desktop the full grid shows directly, in a
 * panel the compact text shows the first clock and clicking opens the
 * grid in a popup.
 *
 * Ported from the Cinnamon World Clock desklet. Timezone maths lives
 * in lib/tz.js on top of the generated table; formatting in
 * lib/format.js (a strftime subset, English names).
 */

import QtQuick
import QtQuick.Layouts

import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PC3
import org.kde.plasma.plasmoid

import "lib/tz.js" as TZ
import "lib/format.js" as Fmt

Item {
    id: root

    readonly property var clocks: Fmt.parseClocks(Plasmoid.configuration.clocksJson)
    readonly property string timeFormat: Plasmoid.configuration.timeFormat
    readonly property string dateFormat: Plasmoid.configuration.dateFormat

    Plasmoid.preferredRepresentation: Plasmoid.compactRepresentation

    Timer {
        interval: 1000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.now = Date.now()
    }

    property double now: 0

    Plasmoid.compactRepresentation: Item {
        id: compact

        readonly property var first: root.clocks[0]

        PC3.Label {
            anchors.centerIn: parent
            text: {
                const wall = TZ.wallDate(compact.first.timezone, root.now);
                return wall ? Fmt.strftime(wall, "%H:%M") : "--:--";
            }
            color: Kirigami.Theme.textColor
            font.pixelSize: Math.max(10, parent.height - 6)
        }

        MouseArea {
            anchors.fill: parent
            onClicked: Plasmoid.expanded = !Plasmoid.expanded
        }
    }

    Plasmoid.fullRepresentation: Item {
        id: full

        Layout.minimumWidth: Kirigami.Units.gridUnit * 8
        Layout.minimumHeight: Kirigami.Units.gridUnit * 6
        Layout.preferredWidth: Kirigami.Units.gridUnit * 22
        Layout.preferredHeight: Kirigami.Units.gridUnit * 12

        GridLayout {
            anchors.fill: parent
            anchors.margins: Kirigami.Units.smallSpacing
            columns: Fmt.gridColumns(root.clocks.length)
            columnSpacing: Kirigami.Units.smallSpacing
            rowSpacing: Kirigami.Units.smallSpacing

            Repeater {
                model: root.clocks

                Rectangle {
                    id: tile

                    required property var modelData

                    readonly property var wall: TZ.wallDate(modelData.timezone, root.now)
                    readonly property bool isLocal: modelData.timezone === "local"
                    readonly property string name: modelData.name || TZ.displayName(modelData.timezone)

                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    radius: 8
                    color: Qt.rgba(0, 0, 0, modelData.timezone === "local" ? 0.30 : 0.22)
                    border.width: isLocal ? 2 : 1
                    border.color: isLocal ? Qt.rgba(0.29, 0.64, 1, 0.8)
                                          : Qt.rgba(1, 1, 1, 0.25)

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 6
                        spacing: 0

                        PC3.Label {
                            Layout.fillWidth: true
                            horizontalAlignment: Text.AlignHCenter
                            fontSizeMode: Text.Fit
                            minimumPixelSize: 8
                            font.pixelSize: 64
                            font.bold: true
                            color: "white"
                            text: tile.wall ? Fmt.strftime(tile.wall, root.timeFormat) : ""
                        }

                        PC3.Label {
                            Layout.fillWidth: true
                            horizontalAlignment: Text.AlignHCenter
                            fontSizeMode: Text.Fit
                            minimumPixelSize: 7
                            font.pixelSize: 18
                            color: "white"
                            text: tile.wall ? Fmt.strftime(tile.wall, root.dateFormat) : ""
                        }

                        PC3.Label {
                            Layout.fillWidth: true
                            horizontalAlignment: Text.AlignHCenter
                            fontSizeMode: Text.HorizontalFit
                            minimumPixelSize: 7
                            font.pixelSize: 14
                            color: "#cccccc"
                            font.italic: true
                            text: tile.name
                        }
                    }
                }
            }
        }
    }
}
