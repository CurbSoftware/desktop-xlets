# Development

Stub. Completed by the final work package; the workflow notes below are
already true and worth keeping.

## Iterating on this applet

- Install for live testing: `./dev-tools/install-extensions.sh -n '*panel-profiles*'`
- Reload after editing applet.js alone:
  `Win+L` (Looking Glass), Extensions tab, Reload Code, or
  `gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon \
    --method org.Cinnamon.ReloadXlet 'cinnamon-panel-profiles-applet@curbsoftware' APPLET`
- ReloadXlet re-runs applet.js but does NOT re-import lib/ modules and does
  NOT re-read stylesheet.css. After editing anything under lib/ or the css,
  restart Cinnamon: `cinnamon --replace &`
- Logs: `tail -f ~/.xsession-errors | grep PanelProfiles`

## Headless module checks

lib/ modules load without a Cinnamon session:

```bash
cd cinnamon-panel-profiles-applet@curbsoftware
cjs -c 'imports.searchPath.unshift("lib"); print(imports.constants.PANEL_SETTING_KEYS.length)'
```

The full headless suite (dev-tools/test-panel-profiles.js) arrives with the
capture work package.

## Test matrix

Live driver and VM reboot procedure are documented here once written.
