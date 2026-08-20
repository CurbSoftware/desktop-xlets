Duplicate an existing applet for a good reference and starting point.

I want you to build at the level of the most recent Linux Mint developer to perfection. It should be utterly perfect, visually beautiful, with every single thing done at AAA quality—from layouts & UI, to integration with backend data handling, and user config/settings and everything  and anything else you can think of.

Fan out sub-agents and have sub-agents tackle each one individually so that the project is utterly perfect. You should /loop on each item and have a separate sub-agent check it visually to ensure it looks triple A. That separate sub-agent should be a really harsh critic, and if it doesn't look tripple A, it should keep going.

Don't stop until each sub-agent is completely and absolutely wowed with the quality when compared with all other great Linux Mint Cinnamon applets. It should literally compare some side by side blind and say which one looks better. Do this in properly coded monorepo structure, practices referencing docs, mcp, frequently. /loop until it's utterly perfect. Fan out sub-agents and ultracode.



# Project: Cinnamon Panel Profiles

Build a production-quality Cinnamon desktop applet named **Panel Profiles**.

Suggested UUID:

`panel-profiles@curbsoftware.com`

The applet manages named Cinnamon panel configurations. A user must be able to configure their panels normally using Cinnamon — add/remove panels, move panels between monitors, change panel height/autohide settings, add/remove/rearrange applets, configure individual applets — and then save that complete state as a named profile.

Later, clicking a saved profile in the Panel Profiles applet must restore that panel environment.

This project exists primarily to solve unreliable multi-monitor panel persistence, especially Linux Mint Cinnamon VMs using SPICE/virt-viewer with multiple virtual heads, but it must be useful as a general Cinnamon panel-profile manager as well.

Do not build this as a fragile collection of shell commands. Integrate with Cinnamon's native GJS, Gio, GLib, GSettings, panel, applet, popup-menu, dialog, file, and monitor APIs wherever practical.

Do not stop after scaffolding or planning. Implement the complete working applet, installation instructions, error handling, persistence, migration-ready profile format, and testing documentation.

---

# 1. Core Product Concept

The applet provides named snapshots of the user's **Cinnamon panel environment**.

Examples:

* `Dual Monitor`
* `Laptop`
* `VM Two Screens`
* `Presentation`
* `Minimal`
* `Development`

A profile represents the Cinnamon panel state, not the entire desktop.

A profile should include:

* number and placement of Cinnamon panels
* which monitor each panel belongs to
* panel position
* panel height
* panel autohide mode
* panel show/hide delays
* panel icon sizing
* panel symbolic icon sizing
* panel text sizing
* applets enabled on every panel
* applet panel assignment
* applet left/center/right zone
* applet order
* applet instance IDs
* Cinnamon-managed configuration of those applet instances
* enough monitor-topology metadata to safely determine whether the profile can be restored

Do not save unrelated desktop state such as:

* wallpaper
* Cinnamon theme
* GTK theme
* windows
* workspace contents
* running applications
* display resolution
* monitor arrangement
* desklets
* extensions

The application is specifically a **panel profile manager**.

---

# 2. Important Architecture Revision

Do not implement profiles as only:

`org.cinnamon panels-enabled`

That is insufficient.

Cinnamon separates panel topology from enabled applets and other panel properties.

The applet must treat a profile as a coordinated snapshot containing:

1. relevant `org.cinnamon` GSettings values
2. Cinnamon applet placement information
3. Cinnamon-managed configuration files for referenced applet instances
4. monitor-topology metadata
5. profile metadata

The restore process must behave like a transaction.

Never partially modify the desktop and then abandon the operation without leaving a rollback path.

---

# 3. Cinnamon Settings to Capture

Research the installed/current Cinnamon source before finalizing the implementation and verify the exact current schema.

At minimum, capture these `org.cinnamon` keys when they exist:

```text
panels-enabled
enabled-applets
panels-autohide
panels-show-delay
panels-hide-delay
panels-height
panel-zone-icon-sizes
panel-zone-symbolic-icon-sizes
panel-zone-text-sizes
```

Cinnamon defines panel topology in `panels-enabled` using a structure equivalent to:

```text
panelID:monitor:position
```

For example:

```text
1:0:bottom
2:1:bottom
```

Monitor `0` represents the primary monitor in this panel configuration model.

Preserve the values precisely.

Do not reconstruct values unnecessarily.

For GSettings values, preserve their GLib Variant types.

Preferred representation:

```json
{
  "key": "panels-enabled",
  "type": "as",
  "value": "['1:0:bottom', '2:1:bottom']"
}
```

Use:

* `Gio.Settings.get_value()`
* GLib Variant type information
* GLib Variant serialization/parsing
* `Gio.Settings.set_value()`

rather than shelling out to `gsettings`.

Do **not** restore Cinnamon's `next-applet-id`.

That setting is an allocator/counter rather than part of the visible panel layout. Rewinding it could create instance-ID collisions.

---

# 4. Enabled Applet Preservation

Treat `enabled-applets` as authoritative placement information.

Do not normalize, renumber, or unnecessarily regenerate entries.

Preserve each saved string verbatim.

Handle both Cinnamon layouts where entries contain no explicit instance suffix and layouts containing an explicit applet instance ID.

The parser must be defensive and version-aware.

Conceptually an entry can contain information equivalent to:

```text
panel1:right:3:calendar@cinnamon.org:27
```

which identifies:

* panel
* zone
* ordering position
* applet UUID
* applet instance

Profiles must preserve this relationship.

Third-party applets and multi-instance applets must work.

---

# 5. Applet Configuration Preservation

Restoring only `enabled-applets` is not sufficient.

Panel applets can have their own Cinnamon-managed configuration.

Capture the relevant configuration belonging to the applets referenced by the saved profile from Cinnamon's user configuration area, including the current:

```text
~/.config/cinnamon/spices/
```

structure where applicable.

Do not blindly copy the entire directory.

Determine the UUIDs and instance IDs referenced by `enabled-applets`, then capture only Cinnamon-managed configuration belonging to those referenced applets.

Do not assume every applet uses exactly the same filename convention.

The implementation must support:

* single-instance applet configuration
* multi-instance applet configuration
* applets without configuration
* configuration filename differences between Cinnamon versions
* missing configuration directories
* third-party applets that use Cinnamon's normal settings framework

Store the original configuration file contents exactly, preferably as raw UTF-8 text inside the profile snapshot together with:

* relative source path
* applet UUID
* instance ID when determinable
* SHA-256 hash
* optional parsed metadata

Do not modify or normalize third-party applet JSON.

Use atomic file writes during restoration.

Never touch arbitrary files outside Cinnamon-managed applet configuration paths.

---

# 6. Exclude Panel Profiles' Own Persistent State

The Panel Profiles applet itself requires persistent state.

Do not include its own profile database or application state inside profile snapshots.

Otherwise saving a profile can recursively capture the profile manager's own profile definitions.

Maintain Panel Profiles' state separately.

Recommended directory:

```text
~/.config/cinnamon-panel-profiles/
```

Recommended structure:

```text
~/.config/cinnamon-panel-profiles/
├── state.json
├── profiles/
│   ├── <profile-uuid>.json
│   ├── <profile-uuid>.json
│   └── ...
└── backups/
    ├── last-good.json
    └── ...
```

Create directories with mode:

```text
0700
```

Create profile/state files with mode:

```text
0600
```

Applet configurations can theoretically contain private information, tokens, usernames, service data, or other settings. Treat profile files as private user configuration.

---

# 7. Profile Data Model

Use a versioned profile schema.

Example:

```json
{
  "schemaVersion": 1,
  "id": "cf48e773-22c4-4cf6-a836-b13f7e6a4cb9",
  "name": "VM Two Screens",
  "description": "",
  "createdAt": "2026-08-19T20:00:00-07:00",
  "updatedAt": "2026-08-19T20:00:00-07:00",

  "environment": {
    "cinnamonVersion": "6.x",
    "sessionType": "x11"
  },

  "monitorTopology": {
    "expectedCount": 2,
    "monitors": [
      {
        "savedIndex": 0,
        "primary": true,
        "x": 0,
        "y": 0,
        "width": 1920,
        "height": 1080,
        "scale": 1
      },
      {
        "savedIndex": 1,
        "primary": false,
        "x": 1920,
        "y": 0,
        "width": 1920,
        "height": 1080,
        "scale": 1
      }
    ]
  },

  "cinnamonSettings": {
    "panels-enabled": {
      "type": "as",
      "value": "['1:0:bottom', '2:1:bottom']"
    },
    "enabled-applets": {
      "type": "as",
      "value": "[...]"
    }
  },

  "appletConfigs": [
    {
      "uuid": "calendar@cinnamon.org",
      "instanceId": "17",
      "relativePath": "calendar@cinnamon.org/17.json",
      "sha256": "...",
      "content": "{...}"
    }
  ],

  "managerAnchor": {
    "uuid": "panel-profiles@curbsoftware.com",
    "required": true
  }
}
```

The exact schema may improve during implementation, but retain:

* schema version
* immutable ID
* human-readable name
* timestamps
* Cinnamon compatibility metadata
* monitor expectations
* typed Cinnamon settings
* applet configuration snapshots
* manager anchor information

Write migration functions from the beginning:

```text
migrateProfile(profile)
```

Even though only schema version 1 currently exists.

Future profile schema changes must not require destroying existing profiles.

---

# 8. Applet as a Persistent Anchor

The Panel Profiles applet is the user's control mechanism.

A saved profile must never accidentally remove the only Panel Profiles applet instance.

For version 1, make the applet a single-instance applet.

Recommended:

```json
"max-instances": 1
```

Profiles saved through the applet must include the Panel Profiles applet in `enabled-applets`.

Before restoring an imported or old profile, verify that its target `enabled-applets` contains the manager.

If it does not, repair the profile at runtime by adding the manager to a valid panel on the primary monitor.

Do not silently create duplicate manager applets.

Document that for startup recovery the Panel Profiles applet should reside on the primary-monitor panel.

If runtime APIs can reliably determine that the applet is on a non-primary monitor, show a non-intrusive warning when startup recovery is enabled:

> Move Panel Profiles to a panel on the primary monitor for reliable startup recovery.

Do not repeatedly nag the user.

---

# 9. Main Panel Popover

Left-clicking Panel Profiles must open a native Cinnamon popup menu.

Use Cinnamon's standard applet popup/menu APIs rather than creating a GTK application window for the main interaction.

Desired structure:

```text
Panel Profiles
────────────────────────

✓ VM Two Screens
  Laptop
  Presentation
  Minimal

────────────────────────

Current: VM Two Screens
Status: Modified

Save current layout…
Update “VM Two Screens”
Restore previous layout

────────────────────────

Manage profiles…
```

Only display `Update “Profile”` when an active profile exists.

Only display `Restore previous layout` when a rollback snapshot exists.

Show a small status indication when applicable:

```text
Displays: 2 / 2
```

or:

```text
Waiting for display 2…
```

Profiles should be the dominant part of the menu.

Selecting a profile row immediately initiates loading that profile after validation.

Use a check/radio indicator for the active profile.

---

# 10. Dirty / Modified Profile Detection

This is an important usability feature.

After loading:

```text
VM Two Screens
```

consider it the active profile.

Monitor relevant Cinnamon panel settings for changes.

If the user subsequently:

* moves an applet
* adds an applet
* removes an applet
* creates/removes a panel
* changes panel height
* changes autohide
* changes icon sizing
* changes other captured panel properties

mark the active state:

```text
Modified
```

The menu can then show:

```text
Current: VM Two Screens
Status: Modified
```

and offer:

```text
Update “VM Two Screens”
Save current layout…
```

Do not automatically overwrite a profile when Cinnamon settings change.

A profile changes only when the user explicitly saves.

Suppress dirty-state detection while the applet itself is restoring a profile.

Avoid signal loops.

Applet configuration changes are harder to monitor generically. At minimum detect global panel/applet placement changes. If practical, monitor captured Cinnamon spices configuration files using `Gio.FileMonitor` and mark the active profile modified when a referenced applet configuration changes.

---

# 11. Save Current Layout Workflow

Selecting:

```text
Save current layout…
```

opens a Cinnamon-native modal dialog.

The dialog should include:

```text
Save Panel Profile

Name:
[ VM Two Screens                     ]

Save as:
(o) New profile
( ) Replace existing profile

Existing profile:
[ dropdown when replacement selected ]

[ ] Use this profile at startup

                      Cancel     Save
```

If an existing profile is selected, clearly change the primary action to:

```text
Overwrite
```

and require confirmation:

```text
Replace “VM Two Screens”?

The saved version of this profile will be replaced by your
current panel configuration.

Cancel    Replace
```

Never overwrite another profile simply because two profiles share a name.

Profiles are identified internally by UUID.

Names need not be globally unique, although the UI should warn if duplicate names would be confusing.

Trim whitespace.

Disallow empty profile names.

Reasonable maximum name length:

```text
80 characters
```

---

# 12. Update Existing Profile

If the current active profile is modified, provide a direct menu action:

```text
Update “VM Two Screens”
```

This captures the current panel configuration and replaces that profile's snapshot while preserving:

* profile ID
* original creation timestamp
* profile name
* description
* startup designation

Update:

* panel state
* applet state
* topology
* updated timestamp

Require a lightweight confirmation.

---

# 13. Manage Profiles Dialog

Provide:

```text
Manage profiles…
```

Open a modal management interface.

Each profile row should show:

* name
* active indicator
* startup indicator
* expected display count
* last modified timestamp

Actions:

* Load
* Rename
* Duplicate
* Set as startup
* Remove startup designation
* Delete

A profile can also be duplicated without first loading it.

Duplicate should:

* generate a new UUID
* copy the saved snapshot
* use a default name such as:

```text
VM Two Screens Copy
```

* set a new `createdAt`
* set a new `updatedAt`
* not automatically become the startup profile

Deleting the active profile should not change the current desktop.

It only removes the saved profile and clears `activeProfileId`.

Deleting the startup profile must also clear `startupProfileId`.

Require confirmation before deletion.

---

# 14. Profile Loading

Selecting a profile must perform a safe transactional restore.

Use an application-level state machine such as:

```text
IDLE
VALIDATING
WAITING_FOR_MONITORS
SNAPSHOTTING_ROLLBACK
RESTORING_PANEL_SETTINGS
RESTORING_APPLET_CONFIGS
RESTORING_ENABLED_APPLETS
VERIFYING
COMPLETE
FAILED
```

Do not scatter the operation among unrelated callbacks.

Implement a central controller such as:

```text
ProfileApplyController
```

---

# 15. Pre-Apply Validation

Before changing anything:

1. Parse the profile.
2. Validate `schemaVersion`.
3. Run migration if needed.
4. Validate required GSettings keys that exist on the current Cinnamon version.
5. Validate monitor requirements.
6. Validate referenced applet data.
7. Verify the manager anchor.
8. Check for malformed values.
9. Check filesystem permissions.
10. Determine which referenced applets are currently unavailable.

A profile referring to a missing third-party applet must not destroy the entire restoration.

Continue restoring the rest of the profile and report:

```text
Profile loaded with warnings.

Missing applets:
• some-applet@example
```

Do not automatically download applets.

---

# 16. Automatic Rollback Snapshot

Before every profile load, save the current working panel environment into:

```text
backups/last-good.json
```

This should use the same snapshot engine as normal profiles.

Do this before any modification occurs.

Expose:

```text
Restore previous layout
```

from the applet menu.

Optionally retain the last 3–5 rollback snapshots, but `last-good` is mandatory.

Rollback profiles are internal and should not appear in the normal named profile list.

If profile application throws an error before `enabled-applets` is changed, automatically restore the rollback snapshot where safe.

If an error occurs after Cinnamon has begun reloading panel applets, preserve the rollback snapshot and notify the user rather than repeatedly attempting potentially destructive operations.

---

# 17. Restore Ordering

The restore sequence is critical.

Do not simply loop randomly over saved settings.

Preferred sequence:

### Phase A — prepare

* pause dirty-state monitoring
* validate profile
* write a `pendingApply` marker
* make rollback snapshot

### Phase B — restore panel topology

Restore panel-related settings except `enabled-applets`.

For example:

* `panels-enabled`
* `panels-autohide`
* `panels-show-delay`
* `panels-hide-delay`
* `panels-height`
* zone icon sizing
* symbolic icon sizing
* text sizing

### Phase C — restore applet configuration files

Restore saved Cinnamon-managed applet configuration using atomic file operations.

Do not overwrite the Panel Profiles applet's own state/configuration snapshot.

### Phase D — restore enabled applets LAST

Set:

```text
enabled-applets
```

last.

This is intentional.

Changing enabled applets can cause Cinnamon to destroy, recreate, move, or reload applet instances — including potentially the Panel Profiles applet itself.

By doing this last, the important restoration work is already complete before Cinnamon may reload this applet.

### Phase E — resume after reinitialization

Because the applet may be recreated after `enabled-applets` changes, persist:

```text
pendingApply
```

to Panel Profiles' separate state file before Phase D.

When a new Panel Profiles instance starts, it must detect:

```text
pendingApply
```

verify the target state, mark the requested profile active, clear `pendingApply`, and optionally display:

```text
Panel profile loaded: VM Two Screens
```

This makes profile switching resilient to the applet's own lifecycle.

---

# 18. Startup Recovery

This feature is mandatory because it addresses the original problem.

Allow one profile to be designated:

```text
Startup Profile
```

Applet settings:

```text
Automatically restore startup profile: true/false
Wait for required displays: true/false
Display wait timeout: 60 seconds
Show notifications: true/false
```

Recommended defaults:

```text
Automatically restore startup profile: true
Wait for required displays: true
Display wait timeout: 60
Show notifications: true
```

When Cinnamon starts:

1. load Panel Profiles state
2. determine startup profile
3. inspect current monitor topology
4. compare active monitor count with profile's `expectedCount`
5. if enough monitors exist, wait briefly for the Cinnamon layout to settle
6. restore the profile
7. verify the result

For a two-monitor profile, never immediately restore while Cinnamon currently exposes only one monitor.

Example:

```text
Profile expects: 2 monitors
Current monitors: 1

→ wait
→ listen for monitor topology changes
→ second SPICE/virt-viewer head appears
→ current monitors becomes 2
→ small stabilization delay
→ restore profile
```

This is essential.

It prevents Cinnamon from interpreting the profile while the virtual display topology is incomplete.

---

# 19. Monitor Detection

Do not depend on `xrandr` as the primary implementation.

Use Cinnamon/Muffin/native GJS monitor APIs so the design does not unnecessarily hard-code an X11-only architecture.

Inspect the current Cinnamon version and use the supported monitor/layout APIs.

Prefer data available from Cinnamon such as:

* monitor count
* index
* primary monitor
* x/y
* width/height
* scale
* connector/name when a stable native API exposes it

Listen for monitor-topology changes through the appropriate Cinnamon signal.

Create a `MonitorTopology` abstraction so Cinnamon-version-specific code is isolated.

Example methods:

```javascript
getCurrentTopology()
getMonitorCount()
matchesRequiredTopology(profile)
waitForTopology(profile, timeout)
mapSavedMonitorsToCurrent(profile)
```

---

# 20. Monitor Index Stability

Do not assume physical monitors will always receive the same index forever.

Profiles should store enough metadata to make a best-effort logical match.

Potential matching priority:

1. stable connector/name when available
2. primary-monitor status
3. geometry
4. resolution
5. relative position
6. saved index as final fallback

Do not make monitor connector names mandatory because VM/virtual display environments may expose limited information.

The system must work with simple index-based virt-viewer heads while allowing more robust mapping when richer metadata is available.

---

# 21. Do Not Manage Display Configuration

Panel Profiles must **not** modify:

* screen resolution
* refresh rate
* rotation
* primary display assignment
* monitor enable/disable state
* display scaling
* physical monitor arrangement

It only observes monitor topology so it can safely place Cinnamon panels.

Display profiles could be a future product feature but are explicitly outside version 1.

---

# 22. Safe Startup Timeout Behavior

If a profile expects two monitors but only one arrives before the timeout:

Do not force a two-monitor profile onto the one-monitor topology by default.

Leave the current desktop unchanged.

Display one notification:

```text
Panel Profiles

“VM Two Screens” was not restored because only
1 of 2 required displays became available.
```

Provide no notification spam.

If the second monitor appears later in the session, optionally re-offer restoration, but do not repeatedly force the layout unless a future `continuous topology recovery` setting explicitly enables that behavior.

---

# 23. Active Profile vs Startup Profile

These are separate concepts.

Example:

```text
Active profile: Presentation
Startup profile: VM Two Screens
```

The active profile means:

> This is the most recently loaded profile that corresponds to the current panel state.

The startup profile means:

> This is the profile Panel Profiles should attempt to restore when Cinnamon starts.

Loading a profile must not automatically change the startup profile.

Provide an explicit command:

```text
Set as startup
```

---

# 24. Profile State Persistence

Recommended `state.json`:

```json
{
  "schemaVersion": 1,
  "activeProfileId": "...",
  "startupProfileId": "...",
  "pendingApply": null,
  "lastSuccessfulApply": "...",
  "lastFailure": null
}
```

Use atomic writes.

If `state.json` is corrupt:

* rename it to a timestamped `.corrupt` backup
* initialize a safe default state
* do not delete profile files
* notify/log the recovery

---

# 25. File Safety

Use Gio/GLib filesystem APIs.

Do not construct shell strings.

Do not invoke:

```text
cp
rm
sed
bash
gsettings
dconf
```

for normal app functionality.

Use:

* `Gio.File`
* safe directory creation
* atomic replacement
* explicit file permissions
* JSON parsing
* SHA-256 hashing where useful

If an optional utility process eventually becomes necessary, use `Gio.Subprocess` with an argument array — never shell interpolation — but version 1 should preferably remain a self-contained Cinnamon applet.

---

# 26. Profile Export / Import

Implement local profile management first.

If export/import is implemented in version 1, treat it carefully.

Export should create one portable JSON profile file.

Before exporting a profile containing applet configuration, warn:

```text
Applet profiles can contain private configuration values.
Review the exported file before sharing it.
```

Import validation must:

* reject invalid JSON
* reject unsupported schema versions
* migrate older supported versions
* never execute profile contents
* sanitize filenames
* generate a new UUID if the imported ID conflicts with an existing profile
* repair the Panel Profiles manager anchor if missing

Do not automatically install missing third-party applets.

Import/export is lower priority than reliable save/load/startup restoration.

---

# 27. Settings UI

Provide a normal Cinnamon applet settings schema.

Suggested options:

## Startup

```text
Automatically restore startup profile
Wait for required displays
Display wait timeout
Stabilization delay
```

## Profiles

```text
Capture applet settings
Keep rollback history
Number of rollback snapshots
```

## Notifications

```text
Show successful restore notifications
Show warning/error notifications
```

## Advanced

```text
Enable debug logging
```

Do not expose internal implementation details to normal users.

Use sensible defaults.

---

# 28. User Experience Requirements

The applet must feel like a native Cinnamon utility.

Use Cinnamon-native:

* popup menu
* modal dialogs
* icons
* spacing
* labels
* separators
* confirmations
* notifications

Do not build a web UI.

Do not use Electron.

Do not require Node.js.

Do not require Python packages.

Do not require root privileges.

Do not require a background server.

Do not make the applet visually oversized.

A symbolic panel icon should be recognizable at typical panel sizes.

Concept:

```text
two stacked horizontal panel rectangles
+
small profile/check indicator
```

Create a simple symbolic SVG.

---

# 29. Suggested Applet Menu UX

Normal active profile:

```text
Panel Profiles
────────────────────

✓ VM Two Screens
  Laptop
  Minimal

────────────────────

Current: VM Two Screens

Save current layout…
Manage profiles…
```

Modified profile:

```text
Panel Profiles
────────────────────

✓ VM Two Screens      Modified
  Laptop
  Minimal

────────────────────

Update “VM Two Screens”
Save current layout…
Restore previous layout

Manage profiles…
```

Startup waiting:

```text
Panel Profiles
────────────────────

VM Two Screens
Laptop
Minimal

────────────────────

Startup profile:
VM Two Screens

Waiting for display 2…

Manage profiles…
```

---

# 30. Logging

Use a consistent prefix:

```text
[PanelProfiles]
```

Examples:

```text
[PanelProfiles] Saving profile: VM Two Screens
[PanelProfiles] Captured 2 panels
[PanelProfiles] Captured 14 applet instances
[PanelProfiles] Waiting for monitors: 1/2
[PanelProfiles] Applying profile: VM Two Screens
[PanelProfiles] Restored enabled-applets
[PanelProfiles] Profile verification succeeded
```

Errors:

```text
[PanelProfiles][ERROR] ...
```

Warnings:

```text
[PanelProfiles][WARN] ...
```

Debug logging should be disabled by default.

Never log captured secret/configuration contents.

---

# 31. Error Handling

A Cinnamon applet runs inside the desktop shell, so unhandled exceptions are unacceptable.

Guard:

* file reads
* file writes
* JSON parsing
* GLib Variant parsing
* missing GSettings keys
* unavailable applet directories
* malformed enabled-app applet entries
* missing monitors
* deleted profiles
* profile schema mismatches
* applet reload during application
* rapid repeated profile clicks
* shutdown while saving
* concurrent save/load attempts

Only one state-changing operation may run at a time.

Disable relevant menu actions while:

```text
Saving…
Loading…
Waiting…
```

Do not let the user trigger several simultaneous profile applications.

---

# 32. Verification After Restore

Do not assume `set_value()` means success.

After restore, compare the resulting relevant Cinnamon settings with the requested profile.

Verify at minimum:

```text
panels-enabled
enabled-applets
panels-height
panels-autohide
```

and other captured keys that exist.

Verification should ignore unsupported keys on older Cinnamon versions if they were already reported as compatibility warnings.

If verification succeeds:

```text
activeProfileId = targetProfileId
```

Clear:

```text
pendingApply
```

Record timestamp.

If verification fails:

* preserve rollback
* record failure
* log which keys differed
* show a concise user warning

Do not enter an infinite restore loop.

---

# 33. Profile Fingerprinting

Create a deterministic fingerprint of the captured panel state.

For example:

```text
SHA-256(
    normalized relevant GSettings values
    + hashes of captured applet config files
)
```

Store:

```json
"fingerprint": "..."
```

Use the fingerprint to help determine:

* whether current state still matches the loaded profile
* whether a profile is modified
* whether an overwrite would produce an identical snapshot

Do not hash timestamps or profile names as part of the panel-state fingerprint.

---

# 34. Profile Dirty State

Calculate current state against the active profile.

Possible UI state:

```text
ACTIVE
MODIFIED
UNKNOWN
```

`ACTIVE`

Current panel fingerprint matches saved active profile.

`MODIFIED`

Relevant panel state has changed.

`UNKNOWN`

Current state has not been compared yet or an applet configuration cannot be evaluated.

Do not label something modified merely because time passed.

---

# 35. Code Organization

Do not put the entire implementation into a single enormous `applet.js`.

Use modules.

Suggested structure:

```text
panel-profiles@curbsoftware.com/
├── metadata.json
├── applet.js
├── settings-schema.json
├── stylesheet.css
├── icon-symbolic.svg
│
├── lib/
│   ├── constants.js
│   ├── profileStore.js
│   ├── profileSchema.js
│   ├── cinnamonState.js
│   ├── appletConfigStore.js
│   ├── monitorTopology.js
│   ├── applyController.js
│   ├── fingerprint.js
│   ├── dialogs.js
│   └── logger.js
│
├── README.md
├── CHANGELOG.md
└── LICENSE
```

Adapt module syntax to the actual supported Cinnamon/CJS environment.

Do not use JavaScript/ES module syntax that the target Cinnamon runtime does not support.

Inspect current first-party Cinnamon applets before selecting syntax.

---

# 36. Major Class Responsibilities

## `PanelProfilesApplet`

Responsible for:

* applet lifecycle
* icon
* popup menu
* reacting to user actions
* displaying state

It must not contain low-level storage logic.

## `ProfileStore`

Responsible for:

* listing profiles
* loading profile files
* creating profiles
* updating profiles
* deleting profiles
* duplication
* atomic writes
* state.json
* schema migrations

## `CinnamonState`

Responsible for:

* reading relevant GSettings
* serializing variants
* restoring variants
* parsing enabled applets
* generating a panel snapshot

## `AppletConfigStore`

Responsible for:

* determining referenced applet UUIDs/instances
* finding Cinnamon-managed config
* reading configs
* hashing configs
* restoring configs atomically
* excluding Panel Profiles' own state

## `MonitorTopology`

Responsible for:

* current monitor count
* monitor metadata
* monitor-change signal handling
* saved/current topology matching
* delayed startup restoration

## `ProfileApplyController`

Responsible for:

* validation
* rollback snapshot
* operation locking
* state machine
* restore ordering
* pendingApply
* post-reload continuation
* verification

---

# 37. Lifecycle Cleanup

Implement `on_applet_removed_from_panel()` correctly.

Disconnect:

* GSettings signals
* monitor signals
* Gio file monitors
* timers
* Mainloop sources
* popup/menu signals

Do not leave timers or signal handlers behind after applet removal/reload.

Track every signal/source ID.

---

# 38. Timing

Avoid arbitrary long sleeps.

Use event-driven monitor changes where possible.

A small stabilization delay after the expected topology appears is acceptable.

Recommended default:

```text
2 seconds
```

Startup flow:

```text
monitor count insufficient
    ↓
listen for topology changes
    ↓
required count reached
    ↓
2-second stabilization timer
    ↓
verify count remains sufficient
    ↓
restore
```

If topology changes again during stabilization, restart the stabilization timer.

---

# 39. SPICE / virt-viewer Scenario

Explicitly test this use case.

Environment:

```text
Linux Mint Cinnamon VM
libvirt/QEMU/KVM
SPICE
virt-viewer
2 virtual heads
```

Desired profile:

```text
Monitor 0:
    bottom panel
    standard applets

Monitor 1:
    bottom panel
    customized applets
```

Failure being solved:

```text
VM reboot
↓
Cinnamon starts before second virtual head fully appears
↓
secondary panel disappears or loses state
↓
user has to recreate it
```

Desired Panel Profiles behavior:

```text
VM reboot
↓
Panel Profiles starts from primary panel
↓
startup profile expects 2 monitors
↓
only 1 currently available
↓
do not restore yet
↓
virt-viewer exposes second head
↓
Cinnamon monitor count becomes 2
↓
stabilization delay
↓
Panel Profiles restores saved topology
↓
second panel returns
↓
correct applets return
↓
applet configuration returns
↓
profile verifies successfully
```

This scenario is a release-blocking acceptance test.

---

# 40. Missing Second Monitor Safety Test

Also test:

```text
startup profile expects 2 monitors
↓
only one monitor is connected
↓
60-second timeout occurs
```

Expected behavior:

* do not create an invalid off-screen panel configuration
* do not continuously retry
* current panel remains usable
* one warning is shown
* user can manually choose a one-monitor profile

---

# 41. Manual Profile Switching Test

Create:

```text
Profile A
```

with:

```text
2 bottom panels
panel heights 40/40
specific applet order
```

Create:

```text
Profile B
```

with:

```text
1 bottom panel
different height
different applets
```

Load A.

Verify A exactly.

Load B.

Verify B exactly.

Load A again.

Verify:

* second panel restored
* correct monitor
* correct height
* correct applet order
* correct applet settings

Repeat at least five cycles.

There must be no accumulation of duplicate applet instances.

---

# 42. Configuration Persistence Test

Choose an applet with visible settings.

For example:

* grouped window list
* calendar
* menu
* panel launcher
* another configurable installed applet

Set configuration A.

Save Profile A.

Change that configuration.

Save Profile B.

Load Profile A.

Verify configuration A returns.

Load Profile B.

Verify configuration B returns.

This test proves the project is saving more than `enabled-applets`.

---

# 43. Reorder Test

Save:

```text
Menu
Launchers
Window List
...
Clock
Sound
Network
```

Move several applets.

Load the profile.

The exact saved zone/order must return.

---

# 44. Rollback Test

Create a deliberately invalid test profile in the development environment.

Attempt to load it.

Expected:

* validation rejects it before destructive changes where possible
* last-good snapshot remains valid
* Panel Profiles remains usable
* no Cinnamon crash
* Restore previous layout works when appropriate

---

# 45. Missing Third-Party Applet Test

Save a profile containing a third-party applet.

Temporarily uninstall/remove its applet code.

Load the profile.

Expected:

* Panel Profiles does not crash
* remaining panel structure restores
* remaining applets restore
* user receives a missing-applet warning
* no automatic download occurs
* rollback remains available

---

# 46. Self-Preservation Test

Construct/import a profile that does not contain:

```text
panel-profiles@curbsoftware.com
```

Attempt to load it.

Expected:

* validator detects missing anchor
* manager entry is safely injected/repaired
* profile restoration completes
* Panel Profiles remains accessible

---

# 47. Corrupted File Test

Corrupt:

```text
state.json
```

Expected:

* applet still loads
* corrupt file preserved for diagnosis
* safe default state created
* profiles remain untouched

Corrupt one profile JSON.

Expected:

* other profiles remain usable
* corrupt profile is marked invalid
* selecting it does not alter Cinnamon

---

# 48. Rapid Click Test

Rapidly click several profiles.

Expected:

Only the first accepted state-changing operation runs.

Others are ignored or menu actions remain disabled until completion.

Never interleave two restorations.

---

# 49. Cinnamon Restart Test

During development, restart Cinnamon after:

* saving a profile
* loading a profile
* modifying a profile
* setting startup profile

Expected:

All profile metadata persists.

The correct startup profile remains designated.

No duplicate applet instances appear.

---

# 50. Compatibility

Determine the Cinnamon version at runtime.

Do not assume every Cinnamon release exposes every captured key.

When saving:

* capture supported keys

When restoring:

* restore supported keys
* warn about unavailable keys
* do not crash

The profile should retain its original values even if a current Cinnamon release temporarily lacks support so future versions can still use them.

Use a compatibility abstraction instead of scattering Cinnamon-version checks throughout the code.

---

# 51. Current Cinnamon Development Practices

Before implementation, inspect current first-party Linux Mint Cinnamon applets and current Cinnamon Spices code.

Prefer current GJS/Cinnamon patterns.

Avoid deprecated patterns where current APIs exist.

In particular:

* use modern callback syntax supported by the target Cinnamon release
* avoid obsolete `Lang.bind()` patterns
* use Cinnamon's settings API
* use native Cinnamon menu/dialog APIs
* properly disconnect signals

Do not copy old Cinnamon 2.x/3.x tutorials without verifying the API.

---

# 52. Installation

Provide a development install helper or clear commands that place the applet into:

```text
~/.local/share/cinnamon/applets/panel-profiles@curbsoftware.com/
```

No root permissions should be required.

Document how to:

1. install
2. restart Cinnamon if necessary
3. add Panel Profiles to the primary panel
4. configure the desired panel layout
5. save the first profile
6. set the profile as startup
7. reboot and verify recovery

---

# 53. README

Write a high-quality README containing:

## Overview

What Panel Profiles does.

## Primary Use Case

Multi-monitor Cinnamon panel persistence.

## Features

Named profiles, restore, overwrite, duplicate, startup restore, monitor waiting, applet settings, rollback.

## Installation

Exact commands.

## Usage

Save → modify → restore.

## Startup Recovery

Explain why the applet should live on the primary panel.

## Profile Storage

Document:

```text
~/.config/cinnamon-panel-profiles/
```

## Privacy

Explain that profile files can contain applet configuration and should be treated as private.

## Troubleshooting

Include:

```text
journalctl --user
```

where useful, Cinnamon Looking Glass/logging, profile paths, and recovery instructions.

## Development

Explain project layout and Cinnamon restart workflow.

---

# 54. Security Requirements

The applet operates entirely as the current user.

Never:

* use `sudo`
* write system directories
* evaluate profile JavaScript
* evaluate arbitrary shell commands
* execute profile contents
* accept arbitrary filesystem paths from imported profile data
* follow profile paths outside approved Cinnamon configuration roots
* log secret configuration values

When restoring paths from a profile:

* normalize path
* require it to remain beneath an approved Cinnamon applet configuration root
* reject traversal such as `../`
* reject absolute imported paths

Profile data is data only.

---

# 55. Performance

This applet should be essentially idle when not being used.

Do not poll every second indefinitely.

Use:

* GSettings change signals
* monitor-change signals
* Gio file monitoring where appropriate
* short temporary timers only during startup/profile switching

No continuous filesystem scans.

No persistent high-frequency callbacks.

---

# 56. Notifications

Use Cinnamon notifications sparingly.

Good:

```text
Panel profile loaded: VM Two Screens
```

```text
Profile saved: VM Two Screens
```

```text
Waiting for 2 displays…
```

```text
Profile not restored: only 1 of 2 displays is available.
```

Do not notify on every internal step.

A successful startup restore notification should be configurable.

Warnings and failures should remain enabled by default.

---

# 57. First-Run Experience

When no profiles exist, clicking the applet should show:

```text
Panel Profiles
────────────────────

No panel profiles saved yet.

Save your current panel layout to create one.

Save current layout…
```

Do not automatically create a profile without user action.

After first save, optionally ask:

```text
Use “VM Two Screens” as your startup profile?
```

with:

```text
Not now
Use at startup
```

---

# 58. Profile Menu Ordering

Default:

* active profile first
* remaining profiles alphabetically

Or preserve user-defined ordering if implementing manual reorder.

Do not sort by internal UUID.

If the number of profiles becomes large, support scrolling or a manageable submenu rather than expanding beyond the screen.

---

# 59. Future-Ready Features — Design For Them, Do Not Block v1

Architect the code so these could be added later:

* automatic profile selection based on monitor topology
* keyboard shortcuts for profiles
* profile import/export
* profile icons
* profile descriptions
* scheduled switching
* multiple Panel Profiles applet instances
* synchronization between machines
* display configuration profiles
* profile-specific Cinnamon themes

Do not implement speculative complexity if it compromises version 1 reliability.

Version 1 priorities are:

1. exact save
2. exact restore
3. applet configuration preservation
4. startup recovery
5. safe monitor waiting
6. rollback
7. simple native UX

---

# 60. Acceptance Criteria

The project is complete only when all of the following work.

* [ ] Applet installs without root.
* [ ] Applet can be added to a Cinnamon panel.
* [ ] Clicking it opens a native popup menu.
* [ ] Current panel state can be saved with a custom profile name.
* [ ] Multiple named profiles are supported.
* [ ] Current state can overwrite an existing profile after confirmation.
* [ ] Profiles can be duplicated.
* [ ] Profiles can be renamed.
* [ ] Profiles can be deleted.
* [ ] One profile can be designated as startup.
* [ ] Selecting a profile restores its panel topology.
* [ ] Panel monitor assignments restore.
* [ ] Panel heights restore.
* [ ] Autohide configuration restores.
* [ ] Icon/text sizing restores.
* [ ] Enabled applets restore.
* [ ] Applet zones restore.
* [ ] Applet ordering restores.
* [ ] Applet instance IDs remain consistent.
* [ ] Configurable applet settings restore.
* [ ] Panel Profiles never accidentally removes itself.
* [ ] A rollback snapshot is created before every load.
* [ ] Previous layout can be restored.
* [ ] Profiles are stored atomically.
* [ ] Profile files use private permissions.
* [ ] Corrupt profiles do not damage Cinnamon.
* [ ] Missing third-party applets do not abort the entire restore.
* [ ] Active profile can be detected as modified.
* [ ] Startup restore waits for the expected monitor count.
* [ ] A two-head virt-viewer VM recovers its second panel after reboot.
* [ ] Startup timeout does not force a two-monitor profile onto one monitor.
* [ ] Multiple profile switches do not accumulate duplicate applets.
* [ ] Cinnamon restart does not lose profile metadata.
* [ ] Applet cleanup disconnects all signals/timers.
* [ ] README contains complete installation and recovery instructions.

---

# 61. Development Procedure

Implement in this order.

### Phase 1 — Research

Inspect:

* installed Cinnamon version
* current Cinnamon source
* current first-party applets
* current Cinnamon Spices examples
* `org.cinnamon` schema
* actual `enabled-applets` values on a real machine
* actual applet configuration directories

Document findings in:

```text
RESEARCH.md
```

Do not rely solely on old blog posts.

### Phase 2 — Snapshot Engine

Implement:

```text
CinnamonState.capture()
```

Print/log a sanitized snapshot and verify it correctly represents an existing one- and two-panel layout.

### Phase 3 — Profile Store

Implement create/read/update/delete/duplicate and schema validation.

### Phase 4 — Restore Engine

Implement rollback and ordered application.

Test repeatedly before implementing startup automation.

### Phase 5 — Applet UI

Add popup, save dialogs, profile selection, management.

### Phase 6 — Dirty Tracking

Implement active/modified state.

### Phase 7 — Monitor Topology

Add safe monitor matching and monitor-change event handling.

### Phase 8 — Startup Restore

Implement last, once normal profile loading is highly reliable.

### Phase 9 — Hardening

Run every acceptance test.

---

# 62. Do Not Take Shortcuts

Do not deliver an implementation that:

* merely calls a Bash backup script
* only saves `panels-enabled`
* ignores per-applet configuration
* assumes one monitor
* assumes one panel
* assumes all applets are single-instance
* restores `enabled-applets` first
* uses long blind startup sleeps
* restores a two-monitor profile before the second monitor exists
* rewinds `next-applet-id`
* uses root privileges
* stores profiles inside the applet's captured config
* has no rollback
* has no validation
* uses one huge `applet.js`
* silently destroys unknown settings
* crashes because one third-party applet is missing

Build it as a reliable desktop configuration tool.

---

# 63. Final Deliverables

Produce:

```text
panel-profiles@curbsoftware.com/
```

with the complete implementation.

Also produce:

```text
README.md
RESEARCH.md
CHANGELOG.md
LICENSE
```

Include:

* installation commands
* development commands
* Cinnamon restart/testing instructions
* expected filesystem locations
* profile schema documentation
* troubleshooting
* manual test results

At the end of development, provide a concise implementation report containing:

```text
Implemented
Tested
Known limitations
Files created
Installation
First-use instructions
```

Do not declare the project complete until the two-head virt-viewer reboot/recovery scenario has been tested or, if the agent cannot control such an environment, until a precise manual test procedure has been supplied and all testable components have been verified.

The key success condition is:

> I configure my Cinnamon panels once, save the layout as a profile, and can reliably get those same panels, applets, positions, and applet settings back — including after a VM reboot where the second virtual monitor appears after Cinnamon starts.



I want you to build at the level of the most recent Linux mint developer to perfection. It should be utterly perfect, visually beautiful, with every single thing done at AAA quality—from layouts & UI, to integration with backend data handling, and user config/settings and everything  and anything else you can think of.

Fan out sub-agents and have sub-agents tackle each one individually so that the project is utterly perfect. You should /loop on each item and have a separate sub-agent check it visually to ensure it looks triple A. That separate sub-agent should be a really harsh critic, and if it doesn't look tripple A, it should keep going.

Don't stop until each sub-agent is completely and absolutely wowed with the quality when compared with all other great Linux Mint Cinnamon applets. It should literally compare some side by side blind and say which one looks better. Do this in properly coded monorepo structure, practices referencing docs, mcp, frequently. /loop until it's utterly perfect. Fan out sub-agents and ultracode.
