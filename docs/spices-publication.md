# Publishing the desklets to Cinnamon Spices

This is the A-to-Z path from this monorepo to two isolated GitHub repos and two
separate pull requests against
[linuxmint/cinnamon-spices-desklets](https://github.com/linuxmint/cinnamon-spices-desklets).

One spice per PR. Do not combine the two desklets.

Official rules: [README](https://github.com/linuxmint/cinnamon-spices-desklets/blob/master/README.md)
and [CONTRIBUTING](https://github.com/linuxmint/cinnamon-spices-desklets/blob/master/.github/CONTRIBUTING.md).

---

## 0. Confirm identity

`info.json` `author` must be the GitHub username that opens the PR (no spaces).
This machine is logged in as **RobertAlexanderH**; the org is **CurbSoftware**.
UUID suffix `@curbsoftware` can stay. The author field cannot be guessed — set it
to whichever account will submit and maintain the PRs, then keep both desklets
in sync.

Spices @mention that account on issues.

---

## 1. Finish product work (both desklets)

Still required before a Spices PR:

1. Recapture **screenshot.png** of the live desklet on a typical Mint wallpaper.
   Crop tightly; no IDE, no unrelated icons. World Clock has none yet. Workspace
   Grid's current file is a light mockup that does not match the live dark tiles.
2. Design **icon.png** at 128×128, square PNG, for `files/<uuid>/icon.png`.
   World Clock's 48×48 file is a crop of a clock tile, not an icon.
   Workspace Grid's 128×128 grid icon is usable.
3. No logo is required by Spices. Do not add a brand mark unless you want it
   only on GitHub READMEs (it will not appear in Cinnamon Settings).
4. Decide **GitHub author** (above) and put it in each `info.json`.
5. Theme pass: both stylesheets hard-code white text and translucent white
   borders. Verify on **Mint-Y** (light) and a light wallpaper. If tiles vanish,
   switch chrome to theme classes (`desklet`, `desklet-with-borders`) or add a
   dark/light setting.
6. Optional: add `tooltip` strings to `settings-schema.json` for translators.
7. Keep `DEVELOPMENT.md` out of the Spices zip (it stays in the standalone git
   repo root, not under `files/<uuid>/`).

Code already done in this pass:

- Spices-safe `metadata.json` (no `icon`, `dangerous`, or `last-edited`)
- `info.json` + GPL-3 `LICENSE` on World Clock
- World Clock Help menu removed (it opened `README.md`, which is not in the zip)
- Stale TimeAndDate `.po` / `.pot` files removed; new UUID-named `.pot`
- User-facing READMEs for both desklets

---

## 2. Required Spices layout

Cinnamon installs the **zip contents** (`files/<uuid>/`). The website uses the
**spice root** (`info.json`, `screenshot.png`, `README.md`).

```
<uuid>/                          # git root of the isolated repo, and the
                                 # directory you copy into cinnamon-spices-desklets
  info.json                      # { "author": "<GitHub username>" }
  screenshot.png                 # website screenshot (not shipped to Cinnamon)
  README.md                      # website + GitHub (optional but expected)
  LICENSE                        # not required by validate-spice; keep it
  CHANGELOG.md                   # optional, repo-only
  files/
    <uuid>/                      # ONLY child of files/
      metadata.json              # uuid, name, description; no icon/last-edited
      icon.png                   # MUST be square; MUST live here, not at spice root
      desklet.js
      stylesheet.css
      settings-schema.json
      clockActions.js            # world clock helpers
      clockDialog.js
      workspaceActions.js        # workspace grid helpers
      renameDialog.js
      po/
        <uuid>.pot               # exactly one .pot; no .mo files
```

`validate-spice` will fail if:

- `icon.png` is at the spice root (forbidden) instead of `files/<uuid>/`
- `screenshot.png` is missing at the spice root
- `files/` contains anything other than the UUID directory
- `metadata.json` has `icon`, `dangerous`, or `last-edited`
- metadata values contain non-ASCII
- translation files sit next to `desklet.js` instead of in `files/<uuid>/po/`
- more than one `.pot` exists

This monorepo still uses a **flat** layout (`desklet.js` next to `README.md`)
because `install-extensions.sh` copies that tree to
`~/.local/share/cinnamon/desklets/<uuid>/`. Reshape to the Spices tree when you
split the repos, then point local install at `files/<uuid>/`.

---

## 3. Split into isolated git repos

Do **not** `git filter-repo` this monorepo. History here includes unrelated
projects. Start each desklet from a clean initial commit.

```bash
# World Clock — repeat analogously for Workspace Grid
UUID=cinnamon-world-clock-desklet@curbsoftware
SRC=/home/user/projects/cinnamon--projects/$UUID
DEST=/home/user/projects/$UUID

mkdir -p "$DEST/files/$UUID/po"
cp "$SRC/info.json" "$SRC/README.md" "$SRC/LICENSE" "$DEST/"
# screenshot.png once you have a real capture
cp "$SRC/screenshot.png" "$DEST/"   # when it exists

# Runtime files go in the zip tree
cp "$SRC/metadata.json" "$SRC/desklet.js" "$SRC/stylesheet.css" \
   "$SRC/settings-schema.json" "$SRC/icon.png" \
   "$SRC/clockActions.js" "$SRC/clockDialog.js" \
   "$DEST/files/$UUID/"
cp "$SRC/po/"*.pot "$DEST/files/$UUID/po/"

# Optional repo-only files
cp "$SRC/DEVELOPMENT.md" "$DEST/"   # do not put this under files/

cd "$DEST"
git init
git add .
git commit -m "$(cat <<'EOF'
Initial import of World Clock for Cinnamon Spices.

EOF
)"

# Create the GitHub repo under the author/org that matches info.json
gh repo create CurbSoftware/cinnamon-world-clock-desklet --public --source=. --remote=origin
git push -u origin HEAD
```

Workspace Grid copy list: `desklet.js`, `workspaceActions.js`, `renameDialog.js`,
`stylesheet.css`, `settings-schema.json`, `metadata.json`, `icon.png`, `po/*.pot`.

Local Cinnamon install from a Spices-shaped repo:

```bash
mkdir -p ~/.local/share/cinnamon/desklets/$UUID
cp -a files/$UUID/. ~/.local/share/cinnamon/desklets/$UUID/
```

Or symlink:

```bash
ln -sfn "$(pwd)/files/$UUID" ~/.local/share/cinnamon/desklets/$UUID
```

Then reload:

```bash
gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon \
  --method org.Cinnamon.ReloadXlet "$UUID" DESKLET
```

Sibling modules (`clockActions.js`, `clockDialog.js`, …) stay in GJS's importer
cache across `ReloadXlet`. After editing those files, run `cinnamon --replace`.

---

## 4. Pre-flight checklist (run in the isolated repo)

```bash
# Clone spices next to your desklet repo for the official scripts
git clone https://github.com/linuxmint/cinnamon-spices-desklets.git
cd cinnamon-spices-desklets

# Copy the spice folder in (do not add other spices to your commit)
cp -a ../cinnamon-world-clock-desklet@curbsoftware \
      ./cinnamon-world-clock-desklet@curbsoftware

./validate-spice cinnamon-world-clock-desklet@curbsoftware
# Expect: "No errors found. Everything looks good."

# Refresh the .pot from source (run from the spices clone)
./cinnamon-spices-makepot cinnamon-world-clock-desklet@curbsoftware
```

Manual checks the script does not catch:

- No network calls, no downloading extra code, no GSettings schemas
- Settings only through `DeskletSettings` / `settings-schema.json`
- Timers and menus cleaned in both `destroy` and `on_desklet_removed`
- User strings wrapped in `_()` / `_translate()`
- README has no “download the full version from …” links
- PR title: `World Clock: initial submission` (spice name, then what it does)

---

## 5. Compatibility matrix (tested 2026-08-14, Cinnamon 6.6.9)

| Surface | Result |
| --- | --- |
| Both desklets enabled together | Load; no JS errors; CSS prefixes do not collide (`world-clock-*` vs workspace tile classes) |
| Stock desklets (`clock@cinnamon.org`, photoframe, launcher) | No class or settings overlap |
| Stock applets (calendar, grouped window list, …) | No conflict. World Clock is not a panel clock. |
| Enabled extensions | None in the test session |
| Theme Mint-L-Dark | Readable. Hard-coded white tile text. |
| Light themes / light wallpaper | Not verified. High risk: white text on a light desktop. |
| `workspace-grid@hernejj` applet | Not installed. Different spice. That applet remaps workspace keys and forces a 2D grid; this desklet only displays/clicks workspaces via `Main._addWorkspace` / `_removeWorkspace`. Test together before claiming compatibility. |
| `TimeAndDate@nightflame` | Different UUID. Can coexist. Do not ship leftover TimeAndDate translations (already removed). |
| `calendar@simonwiles.net` World Clock Calendar applet | Panel applet; no shared settings. Mention the distinction in the README. |
| Workspace names GSettings | Desklet watches `org.cinnamon.desktop.wm.preferences` `workspace-names` (the real key). |
| `num-workspaces` cap | 36; matches muffin range. Live test hit the ceiling and restored. |
| Dual monitor | Positions are global coordinates. Tested on a 3840×1080 span. |

Live Workspace Grid matrix (`python3 dev-tools/live-test-desklet.py`): add, rename
modal, remove confirm, active-workspace remove, 10× burst, 36 cap, fixed 2×2 and
1×1 overflow, editing off, left-click switch — all passed. The script then failed
because `cinnamon-workspace-name-applet@curbsoftware` is not installed; that is
the applet suite, not the desklet.

Live World Clock smoke: add UTC, times offset correctly (local / Asia/Manila /
UTC), local tile `:outlined`, remove restored, no idle-source leak.

---

## 6. Open the Spices pull request

```bash
# Fork linuxmint/cinnamon-spices-desklets on GitHub, then:
git clone git@github.com:CurbSoftware/cinnamon-spices-desklets.git
cd cinnamon-spices-desklets
git remote add upstream https://github.com/linuxmint/cinnamon-spices-desklets.git
git fetch upstream
git checkout -b world-clock-initial upstream/master

cp -a /path/to/cinnamon-world-clock-desklet@curbsoftware .
git add cinnamon-world-clock-desklet@curbsoftware
git commit -m "$(cat <<'EOF'
World Clock: initial submission

EOF
)"
git push -u origin world-clock-initial

gh pr create --repo linuxmint/cinnamon-spices-desklets \
  --title "World Clock: initial submission" \
  --body "$(cat <<'EOF'
## Summary
- New desklet: grid of named clocks with per-tile timezones
- UUID: cinnamon-world-clock-desklet@curbsoftware

## Test plan
- [ ] Add desklet, add/edit/remove clocks, confirm last clock cannot be removed
- [ ] Local timezone tile is outlined
- [ ] Settings: auto vs fixed layout, formats, font sizes
- [ ] Reload and cinnamon --replace after helper-module edits
- [ ] Light and dark Cinnamon themes

EOF
)"
```

Repeat on a **new branch** for Workspace Grid. Never two UUIDs in one PR.

After merge, [cinnamon-spices.linuxmint.com](https://cinnamon-spices.linuxmint.com)
updates from master. Users see the spice under Desklets in System Settings.

---

## 7. After it is live

- Watch the GitHub issue tracker; titles must be `spice name: description`
- Translation `.po` files from other contributors can be merged without waiting
- Bump `metadata.json` `version` on every functional change
- Do not edit `last-edited` yourself; the website pipeline owns that
- Keep the standalone GitHub repo as the working tree; copy into the spices
  fork for each release PR

---

## 8. What must not ship

| Path | Why |
| --- | --- |
| `DEVELOPMENT.md` inside `files/<uuid>/` | Internal; not for end users |
| `dev-tools/` | Monorepo only |
| TimeAndDate `*.po` / `*.pot` | Wrong UUID and strings |
| `metadata.json` `icon`, `last-edited`, `dangerous` | `validate-spice` reject |
| `icon.png` at spice root | Forbidden; belongs in `files/<uuid>/` |
| `.mo` files | Compile on the user machine only |
| `multiversion: true` without versioned subdirs | Unused here; omit |

The workspace-name **applet** is a third project. It duplicates
`workspaceActions.js` / `renameDialog.js` because Cinnamon has no cross-xlet
import. Publishing the desklet does not publish the applet. Keep the copies in
sync or drop the applet from the monorepo later.
