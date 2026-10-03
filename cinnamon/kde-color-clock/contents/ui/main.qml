/*
 * main.qml
 *
 * Color Timer Clock plasmoid: clock, timer and chronometer cards whose
 * background colors ramp along per-card schedules. Ported from the
 * Cinnamon desklet. Color ramps animate natively through a Behavior on
 * each card's color; timer and chronometer state persists in the
 * plasmoid configuration and survives removal and reboots.
 *
 * Not ported: desktop notifications on expiry and schedule thresholds
 * (QML plasmoids have no notification API without a C++ helper), and
 * per-card smooth toggles (the Behavior covers ramping globally).
 */

import QtQuick
import QtQuick.Layouts

import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PC3
import org.kde.plasma.plasmoid

import "lib/tz.js" as TZ
import "lib/colorEngine.js" as Engine
import "lib/format.js" as Fmt

Item {
    id: root

    readonly property bool showClock: Plasmoid.configuration.showClock
    readonly property bool showTimer: Plasmoid.configuration.showTimer
    readonly property bool showChrono: Plasmoid.configuration.showChrono
    readonly property string timeFormat: Plasmoid.configuration.timeFormat
    readonly property string dateFormat: Plasmoid.configuration.dateFormat
    readonly property string clockTimezone: Plasmoid.configuration.clockTimezone

    property var clockStops: []
    property var timerStops: []
    property var chronoStops: []
    property var timerState: parseState(Plasmoid.configuration.timerJson,
                                        { phase: "stopped", durationSec: 300, endMs: 0, remainingMs: 0 })
    property var chronoState: parseState(Plasmoid.configuration.chronoStateJson,
                                         { phase: "stopped", startMs: 0, accumMs: 0 })
    property var chronoLap: ({ count: 0, lastMs: 0 })
    property double now: 0

    function parseState(json, fallback) {
        try {
            const value = JSON.parse(json);
            if (value && typeof value === "object" && value.phase)
                return value;
        } catch (e) {
        }
        return fallback;
    }

    function reloadSchedules() {
        root.clockStops = Engine.normalizeSchedule(
            parseJson(Plasmoid.configuration.clockScheduleJson), Engine.DAY_SECONDS).stops;
        root.timerStops = Engine.normalizeSchedule(
            parseJson(Plasmoid.configuration.timerScheduleJson), 86400).stops;
        root.chronoStops = Engine.normalizeSchedule(
            parseJson(Plasmoid.configuration.chronoScheduleJson), 86400).stops;
    }

    function parseJson(text) {
        try {
            const value = JSON.parse(text);
            return Array.isArray(value) ? value : [];
        } catch (e) {
            return [];
        }
    }

    function persistTimer() {
        Plasmoid.configuration.timerJson = JSON.stringify(root.timerState);
    }

    function persistChrono() {
        Plasmoid.configuration.chronoStateJson = JSON.stringify(root.chronoState);
    }

    function timerDuration() {
        return Math.max(1, Math.min(86400,
            (Plasmoid.configuration.timerMinutes || 0) * 60 +
            (Plasmoid.configuration.timerSeconds || 0)));
    }

    function timerRemainingMs() {
        const t = root.timerState;
        if (t.phase === "running")
            return Math.max(0, t.endMs - root.now);
        if (t.phase === "paused")
            return Math.max(0, t.remainingMs);
        if (t.phase === "stopped")
            return t.durationSec * 1000;
        return 0;
    }

    function chronoElapsedMs() {
        const c = root.chronoState;
        if (c.phase === "running")
            return c.accumMs + (root.now - c.startMs);
        if (c.phase === "paused")
            return c.accumMs;
        return 0;
    }

    function formatDuration(ms, ceil, hundredths) {
        const total = Math.max(0, Number(ms) || 0);
        const secs = ceil ? Math.ceil(total / 1000) : Math.floor(total / 1000);
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        const pad = n => n < 10 ? "0" + n : "" + n;
        let out = h > 0 ? h + ":" + pad(m) + ":" + pad(s) : pad(m) + ":" + pad(s);
        if (hundredths && !ceil)
            out += "." + pad(Math.floor((total % 1000) / 10));
        return out;
    }

    function formatClock(ms) {
        const total = Math.max(0, Number(ms) || 0);
        const secs = Math.ceil(total / 1000);
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        const pad = n => n < 10 ? "0" + n : "" + n;
        return (h < 100 ? pad(h) : "" + h) + ":" + pad(m) + ":" + pad(s);
    }

    function clockPosition() {
        const wall = TZ.wallDate(clockTimezone || "local", root.now);
        if (!wall)
            return null;
        return wall.getUTCHours() * 3600 + wall.getUTCMinutes() * 60 + wall.getUTCSeconds();
    }

    function cardColor(kind) {
        let pos = 0;
        let opts = {};
        let stops = [];
        if (kind === "clock") {
            pos = clockPosition() || 0;
            opts = { wrap: true, smooth: true };
            stops = root.clockStops;
        } else if (kind === "timer") {
            pos = timerRemainingMs() / 1000;
            opts = { smooth: true };
            stops = root.timerStops;
        } else {
            pos = chronoElapsedMs() / 1000;
            opts = { smooth: true };
            stops = root.chronoStops;
        }
        const rgba = Engine.evaluate(stops, pos, opts);
        return rgba ? Engine.rgbaToCss(rgba) : "rgba(0, 0, 0, 0.25)";
    }

    function nextColorInfo(kind) {
        let pos = 0;
        let opts = {};
        let stops = [];
        if (kind === "clock") {
            pos = clockPosition() || 0;
            opts = { wrap: true };
            stops = root.clockStops;
        } else if (kind === "timer") {
            pos = timerRemainingMs() / 1000;
            opts = { reverse: true };
            stops = root.timerStops;
        } else {
            pos = chronoElapsedMs() / 1000;
            stops = root.chronoStops;
        }
        const stop = Engine.nextStop(stops, pos, opts);
        if (!stop)
            return null;
        const until = Engine.secondsUntilStop(pos, stop.t, opts);
        return { until: until > 0 ? until : 0, color: Engine.rgbaToCss(stop.rgba) };
    }

    function control(kind, action) {
        const t = root.timerState;
        const c = root.chronoState;
        if (kind === "timer") {
            if (action === "toggle") {
                if (t.phase === "running") {
                    t.remainingMs = Math.max(0, t.endMs - Date.now());
                    t.phase = t.remainingMs > 0 ? "paused" : "expired";
                } else {
                    const fromStopped = t.phase === "stopped" || t.phase === "expired";
                    t.remainingMs = fromStopped ? t.durationSec * 1000 : Math.max(0, t.remainingMs);
                    t.phase = "running";
                    t.endMs = Date.now() + t.remainingMs;
                }
                root.timerState = Object.assign({}, t);
                persistTimer();
            } else if (action === "reset") {
                root.timerState = {
                    phase: "stopped", durationSec: timerDuration(),
                    endMs: 0, remainingMs: 0
                };
                persistTimer();
            } else {
                const adjust = {
                    "minus-hour": -3600, "minus-minute": -60, "minus-second": -1,
                    "plus-hour": 3600, "plus-minute": 60, "plus-second": 1
                }[action];
                if (adjust !== undefined && t.phase === "stopped") {
                    t.durationSec = Math.max(1, Math.min(86400, t.durationSec + adjust));
                    root.timerState = Object.assign({}, t);
                    persistTimer();
                }
            }
        } else if (kind === "chrono") {
            if (action === "toggle") {
                if (c.phase === "running") {
                    c.accumMs += Date.now() - c.startMs;
                    c.phase = "paused";
                } else {
                    if (c.phase === "stopped") {
                        c.accumMs = 0;
                        root.chronoLap = { count: 0, lastMs: 0 };
                    }
                    c.startMs = Date.now();
                    c.phase = "running";
                }
                root.chronoState = Object.assign({}, c);
                persistChrono();
            } else if (action === "reset") {
                root.chronoState = { phase: "stopped", startMs: 0, accumMs: 0 };
                root.chronoLap = { count: 0, lastMs: 0 };
                persistChrono();
            } else if (action === "lap" && c.phase === "running") {
                root.chronoLap = {
                    count: root.chronoLap.count + 1,
                    lastMs: chronoElapsedMs()
                };
            }
        }
    }

    Component.onCompleted: {
        const t = root.timerState;
        if (t.phase === "stopped")
            t.durationSec = timerDuration();
        if (t.phase === "running" && t.endMs <= Date.now())
            t.phase = "expired";
        root.timerState = Object.assign({}, t);
        persistTimer();
        reloadSchedules();
    }

    onShowClockChanged: reloadSchedules()
    onShowTimerChanged: reloadSchedules()
    onShowChronometerChanged: reloadSchedules()

    Timer {
        interval: 1000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: {
            root.now = Date.now();
            const t = root.timerState;
            if (t.phase === "running" && t.endMs <= root.now) {
                t.phase = "expired";
                root.timerState = Object.assign({}, t);
                root.persistTimer();
            }
        }
    }

    Timer {
        interval: 50
        running: root.chronoState.phase === "running" &&
                  Plasmoid.configuration.chronoMilliseconds && root.showChrono
        repeat: true
        onTriggered: root.now = Date.now()
    }

    Plasmoid.preferredRepresentation: Plasmoid.fullRepresentation

    Plasmoid.fullRepresentation: Item {
        Layout.minimumWidth: Kirigami.Units.gridUnit * 10
        Layout.minimumHeight: Kirigami.Units.gridUnit * 4
        Layout.preferredWidth: Kirigami.Units.gridUnit * 26
        Layout.preferredHeight: Kirigami.Units.gridUnit * 8

        RowLayout {
            id: cardsRow
            anchors.fill: parent
            anchors.margins: Kirigami.Units.smallSpacing
            spacing: Kirigami.Units.smallSpacing

            Card {
                id: clockCard
                visible: root.showClock
                Layout.fillWidth: true
                Layout.fillHeight: true
                kind: "clock"
                title: "Clock"
            }

            Card {
                id: timerCard
                visible: root.showTimer
                Layout.fillWidth: true
                Layout.fillHeight: true
                kind: "timer"
                title: root.timerState.phase === "expired" ? "Time is up" : "Timer"
            }

            Card {
                id: chronoCard
                visible: root.showChrono
                Layout.fillWidth: true
                Layout.fillHeight: true
                kind: "chrono"
                title: "Chronometer"
            }
        }
    }

    component Card: Rectangle {
        id: card

        property string kind
        property string title

        readonly property var nextInfo: root.nextColorInfo(card.kind)
        readonly property color fgColor: {
            const rgba = root.parseRgbaCss(root.cardColor(card.kind));
            const contrast = Engine.contrastColors(rgba);
            return contrast ? Engine.rgbaToCss(contrast.fg) : "white";
        }
        readonly property bool running_: card.kind === "timer"
            ? root.timerState.phase === "running"
            : root.chronoState.phase === "running"
        readonly property bool stopped_: card.kind === "timer"
            ? root.timerState.phase === "stopped"
            : root.chronoState.phase === "stopped"

        radius: 8
        border.width: card.kind === "timer" && root.timerState.phase === "expired" ? 2 : 1
        border.color: Qt.rgba(1, 1, 1, 0.25)
        color: root.cardColor(card.kind)

        Behavior on color {
            ColorAnimation { duration: 1000 }
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 6
            spacing: 0

            PC3.Label {
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
                fontSizeMode: Text.Fit
                minimumPixelSize: 8
                font.pixelSize: 16
                color: card.fgColor
                text: card.title
            }

            PC3.Label {
                Layout.fillWidth: true
                Layout.fillHeight: true
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter
                fontSizeMode: Text.Fit
                minimumPixelSize: 10
                font.pixelSize: 72
                font.bold: true
                color: card.fgColor
                text: {
                    if (card.kind === "clock") {
                        const wall = TZ.wallDate(root.clockTimezone || "local", root.now);
                        return wall ? Fmt.strftime(wall, root.timeFormat) : "";
                    }
                    if (card.kind === "timer") {
                        if (root.timerState.phase === "expired")
                            return "00:00";
                        return root.formatDuration(root.timerRemainingMs(), true, false);
                    }
                    return root.formatDuration(root.chronoElapsedMs(), false,
                        Plasmoid.configuration.chronoMilliseconds);
                }
            }

            PC3.Label {
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
                fontSizeMode: Text.HorizontalFit
                minimumPixelSize: 7
                font.pixelSize: 14
                color: card.fgColor
                text: {
                    if (card.kind === "clock") {
                        const wall = TZ.wallDate(root.clockTimezone || "local", root.now);
                        return wall ? Fmt.strftime(wall, root.dateFormat) : "";
                    }
                    if (card.kind === "timer") {
                        return root.timerState.phase === "stopped" ? "Ready" :
                            root.timerState.phase === "paused" ? "Paused" : "";
                    }
                    return root.chronoLap.count > 0
                        ? "Lap " + root.chronoLap.count + "  " +
                          root.formatDuration(root.chronoLap.lastMs, false,
                              Plasmoid.configuration.chronoMilliseconds)
                        : "";
                }
            }

            RowLayout {
                Layout.alignment: Qt.AlignHCenter
                Layout.topMargin: 2
                spacing: Kirigami.Units.smallSpacing
                visible: card.kind !== "clock"

                PC3.ToolButton {
                    visible: card.kind !== "clock"
                    icon.name: card.running_ ? "media-playback-pause" : "media-playback-start"
                    onClicked: root.control(card.kind, "toggle")
                }

                PC3.ToolButton {
                    icon.name: "view-refresh"
                    onClicked: root.control(card.kind, "reset")
                }

                PC3.ToolButton {
                    visible: card.kind === "timer"
                    enabled: card.stopped_
                    text: "-h"
                    onClicked: root.control("timer", "minus-hour")
                }

                PC3.ToolButton {
                    visible: card.kind === "timer"
                    enabled: card.stopped_
                    text: "-m"
                    onClicked: root.control("timer", "minus-minute")
                }

                PC3.ToolButton {
                    visible: card.kind === "timer"
                    enabled: card.stopped_
                    text: "-s"
                    onClicked: root.control("timer", "minus-second")
                }

                PC3.ToolButton {
                    visible: card.kind === "timer"
                    enabled: card.stopped_
                    text: "+s"
                    onClicked: root.control("timer", "plus-second")
                }

                PC3.ToolButton {
                    visible: card.kind === "timer"
                    enabled: card.stopped_
                    text: "+m"
                    onClicked: root.control("timer", "plus-minute")
                }

                PC3.ToolButton {
                    visible: card.kind === "timer"
                    enabled: card.stopped_
                    text: "+h"
                    onClicked: root.control("timer", "plus-hour")
                }

                PC3.ToolButton {
                    visible: card.kind === "chrono"
                    enabled: card.running_
                    text: "Lap"
                    onClicked: root.control("chrono", "lap")
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 2
                spacing: Kirigami.Units.smallSpacing
                visible: card.nextInfo !== null

                PC3.Label {
                    Layout.fillWidth: true
                    horizontalAlignment: Text.AlignHCenter
                    font.family: "monospace"
                    font.pixelSize: 14
                    color: "white"
                    text: card.nextInfo ? root.formatClock(card.nextInfo.until * 1000) : ""
                }

                Rectangle {
                    width: Kirigami.Units.gridUnit
                    height: Kirigami.Units.gridUnit
                    radius: 4
                    color: card.nextInfo ? card.nextInfo.color : "transparent"
                    border.width: 1
                    border.color: "rgba(10, 14, 18, 0.78)"
                }
            }
        }
    }

    function parseRgbaCss(css) {
        const match = /rgba?\(([^)]+)\)/.exec(css || "");
        if (!match)
            return [0, 0, 0, 1];
        const parts = match[1].split(",").map(p => parseFloat(p));
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
    }
}
