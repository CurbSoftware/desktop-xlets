# Workspace Names for KDE Plasma: development notes

## Layout

- `contents/ui/main.qml`: engine-backed buttons, compact and full
  representations.

## Port notes

- Same dataengine approach as the Workspace Grid port; see its
  DEVELOPMENT.md.
- Scroll switching is not ported: panel compact representations on
  Plasma route wheel events to the containment by default.

## Live checklist (needs a Plasma 6 session)

1. Install, add to a panel; the current desktop name shows.
2. Popup lists every desktop; clicking switches.
3. Renames in System Settings appear immediately.

## Versioning

Bump `KPlugin.Version` on every functional change.
