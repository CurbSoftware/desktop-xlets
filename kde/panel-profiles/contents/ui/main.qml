/*
 * main.qml
 *
 * Plasma Layouts plasmoid: save the current Plasma layout (panels,
 * widgets, their configuration) as a named profile, and restore it
 * later. Ported in spirit from the Cinnamon Panel Profiles applet;
 * the KDE domain file is plasma-org.kde.plasma.desktop-appletsrc,
 * captured by reading it (XHR on file://) and stored as JSON in the
 * plasmoid configuration.
 *
 * Two QML sandbox limits shape this port:
 * - Restoring must rewrite that file and restart plasmashell, which
 *   needs the executable dataengine. Plasma builds that removed it
 *   get saving and a clear explanation instead of silent failure.
 * - QML has no home-path API. It is asked from the engine when
 *   available, and derived from the package URL for user installs.
 */

import QtQuick
import QtQuick.Layouts

import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PC3
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasmoid

import "lib/layouts.js" as Layouts

Item {
    id: root

    property string profilesJson: Plasmoid.configuration.profilesJson
    property string statusText: ""
    property bool applyAvailable: false
    property string homePath: ""

    PlasmaCore.DataSource {
        id: runner

        engine: "executable"
        interval: 0

        onNewData: {
            if (sourceName === "echo $HOME") {
                root.homePath = String(data.stdout || "").trim();
                root.applyAvailable = root.homePath !== "";
            }
            disconnectSource(sourceName);
        }
    }

    Component.onCompleted: runner.connectSource("echo $HOME")

    function effectiveHome() {
        if (homePath)
            return homePath;
        /* User installs live under ~/.local, so the package URL leaks
         * the home path. System installs fall back empty and the UI
         * explains itself. */
        const url = Qt.resolvedUrl(".");
        const index = url.indexOf("/.local/");
        return index > 0 ? url.slice(0, index) : "";
    }

    function readFile(path) {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "file://" + path, false);
        try {
            xhr.send(null);
        } catch (e) {
            return null;
        }
        if (xhr.status !== 200 && xhr.status !== 0)
            return null;
        return xhr.responseText;
    }

    function saveLayout(name) {
        const home = effectiveHome();
        if (!home) {
            statusText = "could not locate the home directory";
            return false;
        }
        const appletsrc = readFile(home + "/.config/plasma-org.kde.plasma.desktop-appletsrc");
        if (appletsrc === null) {
            statusText = "could not read the layout file";
            return false;
        }
        profilesJson = Layouts.upsertProfile(profilesJson, name, {
            appletsrc: appletsrc
        });
        Plasmoid.configuration.profilesJson = profilesJson;
        statusText = "saved " + name;
        return true;
    }

    function applyLayout(name) {
        const profile = Layouts.getProfile(profilesJson, name);
        const commands = Layouts.applyCommands(
            profile, effectiveHome() + "/.config");
        if (commands.length === 0) {
            statusText = "profile is empty";
            return;
        }
        for (let i = 0; i < commands.length; i++)
            runner.connectSource(commands[i]);
        statusText = "applying " + name + "; the shell restarts";
    }

    Plasmoid.preferredRepresentation: Plasmoid.compactRepresentation

    Plasmoid.compactRepresentation: PC3.ToolButton {
        icon.name: "document-save-symbolic"
        text: "Plasma Layouts"
        onClicked: Plasmoid.expanded = !Plasmoid.expanded
    }

    Plasmoid.fullRepresentation: ColumnLayout {
        spacing: Kirigami.Units.smallSpacing
        Layout.minimumWidth: Kirigami.Units.gridUnit * 18
        Layout.minimumHeight: Kirigami.Units.gridUnit * 12

        PC3.Label {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            visible: !root.applyAvailable
            text: "Restoring needs the executable dataengine, which this Plasma build does not provide. Saving still works: export the saved file over plasma-org.kde.plasma.desktop-appletsrc and restart plasmashell to apply by hand."
            font.italic: true
        }

        PC3.Label {
            Layout.fillWidth: true
            text: "Saved layouts"
            font.bold: true
        }

        Repeater {
            model: Layouts.listNames(root.profilesJson)

            RowLayout {
                id: profileRow
                required property string modelData
                Layout.fillWidth: true

                PC3.Label {
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                    text: {
                        const profile = Layouts.getProfile(root.profilesJson, profileRow.modelData);
                        const info = Layouts.summarize(profile ? profile.appletsrc : "");
                        return profileRow.modelData + "  (" + info.panels + " panels, " +
                            info.widgets + " widgets)";
                    }
                }

                PC3.Button {
                    icon.name: "dialog-ok-apply"
                    text: "Apply"
                    enabled: root.applyAvailable
                    onClicked: root.applyLayout(profileRow.modelData)
                }

                PC3.Button {
                    icon.name: "list-remove"
                    onClicked: {
                        root.profilesJson = Layouts.removeProfile(
                            root.profilesJson, profileRow.modelData);
                        Plasmoid.configuration.profilesJson = root.profilesJson;
                    }
                }
            }
        }

        PC3.Label {
            Layout.fillWidth: true
            visible: Layouts.listNames(root.profilesJson).length === 0
            text: "No saved layouts yet"
            font.italic: true
        }

        Item { Layout.fillHeight: true }

        PC3.TextField {
            id: nameField
            Layout.fillWidth: true
            placeholderText: "New layout name"
            onAccepted: {
                if (root.saveLayout(Layouts.safeName(text)))
                    text = "";
            }
        }

        PC3.Button {
            Layout.fillWidth: true
            icon.name: "document-save"
            text: "Save current layout"
            onClicked: {
                if (root.saveLayout(Layouts.safeName(nameField.text)))
                    nameField.text = "";
            }
        }

        PC3.Label {
            Layout.fillWidth: true
            text: root.statusText
            visible: root.statusText !== ""
            font.italic: true
        }
    }
}
