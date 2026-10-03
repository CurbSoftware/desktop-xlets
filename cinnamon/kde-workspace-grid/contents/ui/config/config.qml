/*
 * config.qml
 *
 * Configuration for the Workspace Grid plasmoid.
 */

import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts

ColumnLayout {
    property bool cfg_showIndex

    QQC2.Label {
        Layout.fillWidth: true
        text: "Desktops are added, removed and renamed in System Settings, under Virtual Desktops; KDE owns that natively."
        wrapMode: Text.WordWrap
    }

    QQC2.CheckBox {
        text: "Prefix names with the desktop number"
        checked: cfg_showIndex
        onToggled: cfg_showIndex = checked
    }
}
