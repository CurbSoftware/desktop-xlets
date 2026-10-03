/*
 * config.qml
 *
 * Configuration page: a clock list editor (name plus timezone) and the
 * two format strings. KConfigXT keys arrive as cfg_* properties on the
 * root item and write back on assignment. The timezone field offers
 * common zones in a dropdown and accepts any IANA id as typed text,
 * because QML cannot enumerate /usr/share/zoneinfo.
 */

import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts

import org.kde.kirigami as Kirigami

import "../lib/tz.js" as TZ
import "../lib/format.js" as Fmt

ColumnLayout {
    id: page

    property string cfg_clocksJson
    property string cfg_timeFormat
    property string cfg_dateFormat

    property var clocks: Fmt.parseClocks(cfg_clocksJson)

    function commit() {
        const serialized = JSON.stringify(page.clocks);
        if (serialized !== page.cfg_clocksJson)
            page.cfg_clocksJson = serialized;
    }

    function updateClock(index, patch) {
        const next = page.clocks.slice();
        next[index] = Object.assign({}, next[index], patch);
        page.clocks = next;
        page.commit();
    }

    QQC2.Label {
        Layout.fillWidth: true
        text: "Clocks"
        font.bold: true
    }

    Repeater {
        model: page.clocks.length

        RowLayout {
            id: row
            required property int index
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing

            QQC2.TextField {
                Layout.preferredWidth: Math.max(80, row.width * 0.3)
                placeholderText: "Name"
                text: page.clocks[row.index].name
                onEditingFinished: page.updateClock(row.index, { name: text })
            }

            QQC2.ComboBox {
                id: zoneBox
                Layout.fillWidth: true
                editable: true
                model: Fmt.commonZones()
                editText: page.clocks[row.index].timezone
                onActivated: page.updateClock(row.index, { timezone: model[index] })
                onEditFinished: page.updateClock(row.index, { timezone: editText })
            }

            QQC2.Button {
                icon.name: "list-remove"
                enabled: page.clocks.length > 1
                onClicked: {
                    const next = page.clocks.slice();
                    next.splice(row.index, 1);
                    page.clocks = next;
                    page.commit();
                }
            }
        }
    }

    QQC2.Button {
        icon.name: "list-add"
        text: "Add clock"
        enabled: page.clocks.length < 36
        onClicked: {
            const next = page.clocks.slice();
            next.push({ id: "clock-" + Date.now(), name: "", timezone: "UTC" });
            page.clocks = next;
            page.commit();
        }
    }

    Item { Layout.fillHeight: true; Layout.preferredHeight: Kirigami.Units.gridUnit }

    QQC2.Label {
        Layout.fillWidth: true
        text: "Formats"
        font.bold: true
    }

    QQC2.TextField {
        Layout.fillWidth: true
        placeholderText: "Time format"
        text: page.cfg_timeFormat
        onEditingFinished: page.cfg_timeFormat = text
    }

    QQC2.TextField {
        Layout.fillWidth: true
        placeholderText: "Date format"
        text: page.cfg_dateFormat
        onEditingFinished: page.cfg_dateFormat = text
    }
}
