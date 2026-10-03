# Changelog

## v1.3.0 - 2026-08-25

- Profiles now always restore panels and applets, with an optional Include
  desklets choice. Existing profile files migrate without losing captured
  data.
- Restores survive deleting the panel that hosts Panel Profiles. The new
  applet instance reuses the live manager identity and completes the same
  durable transaction.
- Failed restores automatically roll back panel, applet, desklet and config
  changes. Restore previous layout is available from the menu.
- Configuration batches are validated before any file is written. Monitor
  mapping and applet ID allocation now fail safely on ambiguous input.
- Profile schema v4 and state schema v3 replace separate active panel and
  desklet slots with one active profile.

## v1.2.0 - 2026-08-22

- Two profile kinds. Panel profiles save panels, applets and each applet's
  settings; desklet profiles save the desklet list, desklet settings and
  each desklet's config. Each list lives in its own section of the menu
  and restores only its own world, so loading a profile always changes
  something you can see.
- Profiles apply only when you click them. Cinnamon boots with whatever
  layout it saved itself; there is no startup designation, no boot-time
  restore and no primary-monitor nag anymore.
- Profile data management moved into the applet's settings window: a
  profiles page lists both kinds with Rename, Duplicate and Delete. The
  popover's Manage and Duplicate dialogs are gone. Loading stays in the
  menu.
- The menu is simpler: the two profile lists, Save panel layout, Save
  desklet layout, Configure and Restart Cinnamon. Restore previous layout
  is gone from the menu (the rollback machinery still protects every
  apply internally).
- Fix: Configure now reliably opens the applet's settings window
  (argv-array spawn instead of the shell-string form).
- Schema v3: profiles carry a kind instead of a scope; v1 and v2 files
  migrate on load (scope "desklets" becomes a desklet profile; "both" and
  "none" become panel profiles). state.json v2 tracks the active panel
  and desklet profiles separately.
- Fix: verification and modified-detection recompute digests under the
  profile's current kind, so a migrated profile verifies instead of
  showing a phantom mismatch.

## v1.0.0 - 2026-08-20

First release.

- Named panel profiles: save the full panel environment, restore it exactly.
- Captures panel keys, enabled applets, zones, order and each applet's own
  settings, with monitor-topology metadata.
- Transactional apply with a rollback snapshot before every load and
  Restore previous layout from the menu.
- Startup recovery: restore the startup profile after the expected displays
  arrive, with a fingerprint short-circuit, a stabilization delay and a
  single timeout warning.
- Manager anchor repair: a profile that does not contain the applet gets it
  injected on the primary monitor's panel.
- Modified detection with Update and restore actions.
- Native menu and dialogs for save, overwrite, duplicate, rename, delete and
  startup designation.
- Private storage under ~/.config/cinnamon-panel-profiles, atomic writes,
  dirs 0700, files 0600.
- Gettext support with a translatable template in po/.

Hardening fixes from live acceptance testing:

- Dialogs register unique GType names per module evaluation, so removing and
  re-adding the applet can no longer die on "Type name ... is already
  registered".
- Verification timers are cancel-before-schedule: a profile apply that moves
  the applet itself no longer produces a double success notification when the
  successor instance resumes the pending apply.
- Restore readback and verification failures now log the live and saved panel
  key values (panel layout keys only), so a Cinnamon rewrite is visible
  immediately instead of a bare key name.
- A profile referencing a missing third-party applet now surfaces its warning
  notification instead of only collecting it silently.
- Scroll-list rows are unparented before destroy and carry no tooltips, and
  dialogs disconnect every tracked signal on destroy: without this, Cinnamon
  6.6 can segfault in st_scroll_view_style_changed walking freed children.
