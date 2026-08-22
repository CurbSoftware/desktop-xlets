# Changelog

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
