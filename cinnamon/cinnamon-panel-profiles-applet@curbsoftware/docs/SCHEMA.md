# Profile schema

Schema version 4. `migrateProfile()` chains every known step from v1 to v4
and keeps older files loadable without dropping captured data.

## Profile file

Path: `~/.config/cinnamon-panel-profiles/profiles/<uuid>.json`

```json
{
  "schemaVersion": 4,
  "id": "cf48e773-22c4-4cf6-a836-b13f7e6a4cb9",
  "name": "VM Two Screens",
  "description": "",
  "createdAt": "2026-08-19T20:00:00-07:00",
  "updatedAt": "2026-08-19T20:00:00-07:00",
  "environment": {
    "cinnamonVersion": "6.6.9",
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
        "scale": 1,
        "name": ""
      }
    ]
  },
  "cinnamonSettings": {
    "panels-enabled": { "type": "as", "value": "['1:0:bottom', '2:1:bottom']" },
    "enabled-applets": { "type": "as", "value": "['panel1:left:0:menu@cinnamon.org:0']" },
    "enabled-desklets": { "type": "as", "value": "['clock@x:0:1275:125']" }
  },
  "appletConfigs": [
    {
      "uuid": "calendar@cinnamon.org",
      "instanceId": "16",
      "relativePath": "calendar@cinnamon.org/16.json",
      "sha256": "32c8948b8231b273e9af2992b04ae43fe805214edb9664dd29015bebbdb1912e",
      "content": "{...}"
    }
  ],
  "deskletConfigs": [
    {
      "uuid": "clock@curbsoftware",
      "instanceId": "0",
      "relativePath": "clock@curbsoftware/clock@curbsoftware.json",
      "sha256": "32c8948b8231b273e9af2992b04ae43fe805214edb9664dd29015bebbdb1912e",
      "content": "{...}"
    }
  ],
  "includeDesklets": true,
  "managerAnchor": {
    "uuid": "cinnamon-panel-profiles-applet@curbsoftware",
    "required": true
  },
  "fingerprint": "..."
}
```

`cinnamonSettings.*.value` is `GLib.Variant.print(true)` text. Types must
match the running schema, including `as` versus `s` for zone icon JSON.

All Cinnamon keys are captured verbatim for portability. Every profile
restores the panel layout keys, `enabled-applets` and applet config files.
When `includeDesklets` is true it also restores `enabled-desklets`, the three
desklet scalar keys and desklet config files. `enabled-desklets` entries use
`uuid:instanceId:x:y`.

`fingerprint` is stamped over the data the profile will restore. Apply
verification and modified detection recompute it at use, so migrations and
temporary monitor remapping cannot leave a stale digest authoritative. An
empty fingerprint in a hand-crafted file skips the digest check and relies
on per-key verification.

`appletConfigs[]` and `deskletConfigs[]` share one entry shape.
`relativePath` is jail-checked before a restore: no absolute paths, no `..`,
no symlinked target or UUID directory, and exactly the UUID-owned instance
or singleton JSON filename. The applet's own settings path is forbidden.
Applet and desklet config batches are checked together before the first
Cinnamon or config mutation.
Every `sha256` is exactly 64 lowercase hexadecimal characters and must match
the UTF-8 config content. Migration backfills a missing or empty digest in a
legacy profile from its saved content. A present malformed or mismatched
digest is rejected.

### Migrations

- v1 to v2 backfills `scope: "applets"` and `deskletConfigs: []`.
- v2 to v3 converts the old scope to a legacy `kind` value.
- v3 to v4 replaces `kind` and `scope` with `includeDesklets`. Old `desklet`
  and `both` profiles include desklets. Old `panel` profiles do not. The
  captured panel and desklet data remains intact in either case.
- A file newer than v4 is refused before any Cinnamon setting changes.

## state.json

```json
{
  "schemaVersion": 3,
  "activeProfileId": null,
  "pendingApply": null,
  "lastSuccessfulApply": null,
  "lastFailure": null
}
```

State v1 preserves its single `activeProfileId` while removing retired
startup fields. State v2 prefers `activePanelProfileId`, then its old single
active ID, then `activeDeskletProfileId`. The result is one active profile in
v3. Rename, duplicate and delete operations preserve this contract.

Profile and state reads and writes use `store.lock`. The GJS store and Python
settings widget share this reentrant lock, so update, rename, duplicate,
delete, verification and state repair serialize across processes.
Lock contention is reported explicitly. Startup recovery and successful
verification retry it for a bounded interval; they never substitute an empty
state or announce success before the durable commit lands. Saving a profile
uses the same rule before marking the new snapshot active.

`pendingApply` is a durable transaction marker. It is confirmed on disk
before the first Cinnamon mutation and advances through these phases:
`prepared`, `settings-written`, `configs-written`, `writing-lists`,
`lists-written`, and `verifying`. It carries the transaction ID, target
settings and whether desklets are included. If restoring the panel or applet
list destroys the host applet, the successor reads the phase. A `verifying`
transaction resumes verification. Every earlier or unknown phase restores
the complete existing `last-good.json` snapshot first, then verifies and
clears the marker.

## Rollback

`backups/last-good.json` is a schema v4 snapshot with
`includeDesklets: true`. It is captured before the transaction changes
Cinnamon, so it can restore the full pre-apply world after any failure.
Rollback bundles also carry `rollbackConfigFiles` for active and dormant
target files, plus `configTombstones` for target files that did not exist.
This restores overwritten dormant files and removes files created by the
failed transaction.
The single snapshot is exposed as Restore previous layout in the applet
menu. Restoring it does not replace it. The next user profile apply captures
a new one, so there is no hidden rollback history.
