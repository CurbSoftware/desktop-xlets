/*
 * config.qml
 *
 * Configuration for the Command Launcher plasmoid.
 */

import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts

ColumnLayout {
    property string cfg_entry
    property string cfg_tooltipText

    QQC2.Label {
        Layout.fillWidth: true
        wrapMode: Text.WordWrap
        text: "Enter an application id (org.kde.kate), a .desktop file name, or an absolute path to one. KDE removed the engine that ran arbitrary shell commands; plain commands need a helper and are not supported yet."
    }

    QQC2.TextField {
        Layout.fillWidth: true
        placeholderText: "Application or .desktop entry"
        text: cfg_entry
        onEditingFinished: cfg_entry = text
    }

    QQC2.TextField {
        Layout.fillWidth: true
        placeholderText: "Tooltip text"
        text: cfg_tooltipText
        onEditingFinished: cfg_tooltipText = text
    }
}
