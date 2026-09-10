/*
 * config.qml
 *
 * Configuration for the Workspace Names plasmoid.
 */

import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts

ColumnLayout {
    property string cfg_displayMode
    property int cfg_maximumLabelWidth

    QQC2.Label {
        Layout.fillWidth: true
        text: "Desktop names live in System Settings, under Virtual Desktops; KDE owns naming natively."
        wrapMode: Text.WordWrap
    }

    QQC2.ComboBox {
        Layout.fillWidth: true
        textRole: "label"
        model: [
            { label: "Name", value: "name" },
            { label: "Number", value: "number" },
            { label: "Number and name", value: "both" }
        ]
        onActivated: cfg_displayMode = model[index].value
        Component.onCompleted: {
            for (let i = 0; i < model.length; i++)
                if (model[i].value === cfg_displayMode)
                    currentIndex = i;
        }
    }

    QQC2.SpinBox {
        from: 24
        to: 400
        stepSize: 4
        value: cfg_maximumLabelWidth
        onValueModified: cfg_maximumLabelWidth = value
    }
}
