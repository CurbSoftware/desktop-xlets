# Profile schema

Schema version 1. `migrateProfile()` is identity-plus-defaults for v1 and must keep older files loadable when the version increases.

## Profile file

Path: `~/.config/cinnamon-panel-profiles/profiles/<uuid>.json`

```json
{
  "schemaVersion": 1,
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
    "panels-enabled": { "type": "as", "value": "['1:0:bottom', '2:1:bottom']" }
  },
  "appletConfigs": [
    {
      "uuid": "calendar@cinnamon.org",
      "instanceId": "16",
      "relativePath": "calendar@cinnamon.org/16.json",
      "sha256": "…",
      "content": "{…}"
    }
  ],
  "managerAnchor": {
    "uuid": "cinnamon-panel-profiles-applet@curbsoftware",
    "required": true
  },
  "fingerprint": "…"
}
```

`cinnamonSettings.*.value` is `GLib.Variant.print(true)` text. Types must match the running schema (`as` vs `s` for zone icon JSON).

`fingerprint` hashes sorted setting prints plus applet-config SHA-256 values. Names and timestamps are excluded.

`appletConfigs[].relativePath` is jail-checked: no `..`, no absolute paths, must remain under `uuid/`.

## state.json

```json
{
  "schemaVersion": 1,
  "activeProfileId": null,
  "startupProfileId": null,
  "pendingApply": null,
  "lastSuccessfulApply": null,
  "lastFailure": null,
  "primaryMonitorWarningShown": false
}
```

`pendingApply` is written before `enabled-applets` is changed so a recreated applet instance can verify and finish the transaction.

## Rollback

`backups/last-good.json` uses the same profile schema. Optional rotated files `last-good-*.json` are kept when "Keep rollback history" is enabled. They never appear in the named profile list.
