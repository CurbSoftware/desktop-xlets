/*
 * config.qml
 *
 * Configuration for the Color Timer Clock plasmoid: card visibility,
 * per-card color schedules (rows of time plus hex color), timer
 * duration, and formats.
 */

import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts

import org.kde.kirigami as Kirigami

import "../lib/tz.js" as TZ
import "../lib/colorEngine.js" as Engine
import "../lib/format.js" as Fmt

ColumnLayout {
    id: page

    property bool cfg_showClock
    property bool cfg_showTimer
    property bool cfg_showChrono
    property string cfg_clockTimezone
    property string cfg_clockScheduleJson
    property string cfg_timerScheduleJson
    property string cfg_chronoScheduleJson
    property int cfg_timerMinutes
    property int cfg_timerSeconds
    property bool cfg_chronoMilliseconds
    property string cfg_timeFormat
    property string cfg_dateFormat

    function parseRows(json) {
        try {
            const value = JSON.parse(json);
            return Array.isArray(value) ? value : [];
        } catch (e) {
            return [];
        }
    }

    function commitRows(key, rows) {
        const serialized = JSON.stringify(rows);
        if (page[key] !== serialized)
            page[key] = serialized;
    }

    QQC2.Label {
        Layout.fillWidth: true
        text: "Cards"
        font.bold: true
    }

    QQC2.CheckBox {
        text: "Clock"
        checked: page.cfg_showClock
        onToggled: page.cfg_showClock = checked
    }
    QQC2.CheckBox {
        text: "Timer"
        checked: page.cfg_showTimer
        onToggled: page.cfg_showTimer = checked
    }
    QQC2.CheckBox {
        text: "Chronometer"
        checked: page.cfg_showChrono
        onToggled: page.cfg_showChrono = checked
    }
    QQC2.CheckBox {
        text: "Chronometer hundredths"
        checked: page.cfg_chronoMilliseconds
        onToggled: page.cfg_chronoMilliseconds = checked
    }

    QQC2.ComboBox {
        Layout.fillWidth: true
        editable: true
        model: Fmt.commonZones()
        editText: page.cfg_clockTimezone || "local"
        textRole: undefined
        onActivated: page.cfg_clockTimezone = model[index] === "local" ? "" : model[index]
        onEditFinished: page.cfg_clockTimezone = editText === "local" ? "" : editText
    }

    Item { Layout.preferredHeight: Kirigami.Units.gridUnit }

    QQC2.Label {
        Layout.fillWidth: true
        text: "Schedules"
        font.bold: true
    }

    ScheduleEditor {
        Layout.fillWidth: true
        title: "Clock (hour of day)"
        rows: page.parseRows(page.cfg_clockScheduleJson)
        timeRole: "hour"
        onCommit: rows => page.commitRows("cfg_clockScheduleJson", rows)
    }

    ScheduleEditor {
        Layout.fillWidth: true
        title: "Timer (seconds remaining)"
        rows: page.parseRows(page.cfg_timerScheduleJson)
        timeRole: "remaining"
        onCommit: rows => page.commitRows("cfg_timerScheduleJson", rows)
    }

    ScheduleEditor {
        Layout.fillWidth: true
        title: "Chronometer (seconds elapsed)"
        rows: page.parseRows(page.cfg_chronoScheduleJson)
        timeRole: "elapsed"
        onCommit: rows => page.commitRows("cfg_chronoScheduleJson", rows)
    }

    Item { Layout.preferredHeight: Kirigami.Units.gridUnit }

    QQC2.Label {
        Layout.fillWidth: true
        text: "Timer duration"
        font.bold: true
    }

    RowLayout {
        Layout.fillWidth: true
        QQC2.SpinBox {
            from: 0
            to: 1440
            value: page.cfg_timerMinutes
            onValueModified: page.cfg_timerMinutes = value
        }
        QQC2.Label { text: "m" }
        QQC2.SpinBox {
            from: 0
            to: 59
            value: page.cfg_timerSeconds
            onValueModified: page.cfg_timerSeconds = value
        }
        QQC2.Label { text: "s" }
        Item { Layout.fillWidth: true }
    }

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

    component ScheduleEditor: ColumnLayout {
        id: editor

        property string title
        property var rows
        property string timeRole
        signal commit(var rows)

        function updateRow(index, patch) {
            const next = editor.rows.slice();
            next[index] = Object.assign({}, next[index], patch);
            editor.rows = next;
            editor.commit(next);
        }

        QQC2.Label { text: editor.title }

        Repeater {
            model: editor.rows.length

            RowLayout {
                id: scheduleRow
                required property int index
                spacing: Kirigami.Units.smallSpacing

                QQC2.SpinBox {
                    from: 0
                    to: 86399
                    value: editor.rows[scheduleRow.index][editor.timeRole] || 0
                    onValueModified: {
                        const patch = {};
                        patch[editor.timeRole] = value;
                        editor.updateRow(scheduleRow.index, patch);
                    }
                }

                Rectangle {
                    width: Kirigami.Units.gridUnit * 1.5
                    height: Kirigami.Units.gridUnit
                    radius: 4
                    color: editor.rows[scheduleRow.index].color || "#888888"
                    border.width: 1
                    border.color: "black"
                }

                QQC2.TextField {
                    Layout.preferredWidth: 90
                    placeholderText: "#rrggbb"
                    text: editor.rows[scheduleRow.index].color || ""
                    color: Engine.parseColor(text).ok ? palette.text : "red"
                    onEditingFinished: editor.updateRow(scheduleRow.index, { color: text })
                }

                QQC2.Button {
                    icon.name: "list-remove"
                    onClicked: {
                        const next = editor.rows.slice();
                        next.splice(scheduleRow.index, 1);
                        editor.rows = next;
                        editor.commit(next);
                    }
                }
            }
        }

        QQC2.Button {
            icon.name: "list-add"
            text: "Add stop"
            onClicked: {
                const patch = {};
                patch[editor.timeRole] = 0;
                const next = editor.rows.slice();
                next.push(Object.assign({ color: "#888888" }, patch));
                editor.rows = next;
                editor.commit(next);
            }
        }
    }
}
