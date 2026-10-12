# CurbXlets TDD plan

The suite lives in `cinnamon/dev-tools/test-curbxlets.py`. It uses the same Python unittest stack as `cinnamon/dev-tools/test-bundle-installer.py`. GTK 3 is the toolkit the manager already imports. There is no second test framework.

Run it from the repository root:

```bash
python3 cinnamon/dev-tools/test-curbxlets.py
```

The older helper file still covers desktop detection, gsettings-free maths, and the manifest builder. Run it when you touch those helpers:

```bash
python3 cinnamon/dev-tools/test-bundle-installer.py
```

Widget maths (workspace grid layout, clock colour ramps, timezone tables) stay in the existing `gjs` and `node` files under `cinnamon/dev-tools/` and each port's `tests/` directory. Those files load outside Cinnamon, GNOME Shell, and Plasma. This plan does not replace them. A change to clock layout starts in those files. A change to the manager window, an install action, or the AppImage name starts here.

The suite is headless in the practical sense. It never enters `Gtk.main`. It hides the window as soon as the manager builds it. Install tests point `Path.home` at a temp directory, keep gsettings in memory, and fail if anything tries to spawn `gsettings`, `gnome-extensions`, `kpackagetool6`, or `qdbus`. Live drivers (`dev-tools/live-test-*.py`) need a real session, `xdotool`, and `wmctrl`. They stay out of this run.

## The window that lists the widgets

`launch_gui` builds a `Gtk.Window` titled "CurbSoftware Desktop Widgets". The child of that window is a vertical box. Inside the box, a `Gtk.ListBox` has one row per widget for the detected desktop. Each row shows the name, version, and install state, plus Install, Uninstall, Add to desktop, Add to panel, and Remove instance.

That list used to be missing. The placement handler was named `do_add`. PyGObject treats any `do_*` method as the GTK virtual of the same name, so `do_add` replaced `Gtk.Container.add`. `self.add(layout)` called the placement handler (`do_add() missing 1 required positional argument: 'surface'`) and returned without attaching the box. `get_child()` stayed `None`. The window opened blank. `do_remove` had the same kind of clash with `Gtk.Container.remove`. The handler is `place_entry`. Removal is `remove_entry`.

Write a failing check before renaming a handler or restructuring the window:

1. `test_do_add_override_leaves_the_window_with_no_child` builds a tiny window whose `do_add(self, entry, surface)` matches the old signature. After `add(box)`, the child is `None`. If a future PyGObject stops treating `do_*` as virtuals, this test tells you the hazard moved.
2. `test_window_child_is_the_widget_list_not_an_empty_window` opens the real manager on the Cinnamon catalog. The window has a child. That child contains `window.list_box`. The row count equals the catalog. World Clock, Color Timer Clock, and Workspace Grid are on the list, along with the panel widgets. The class defines `place_entry` and does not define `do_add` or `do_remove`.
3. `test_handler_names_are_not_gtk_virtuals` reads `bundle-installer.py` and rejects `def do_add(`, `def do_remove(`, `def do_size_allocate(`, and `def do_draw(`.
4. `test_each_desktop_lists_its_own_widgets` opens the manager once per desktop. Cinnamon rows are the Cinnamon names (In Panel Workspace Name, Panel Profiles). GNOME rows use Workspace Names and Desktop Profiles. KDE rows use Workspace Names and Plasma Layouts. The header label is `environment_label(desktop)`.
5. `test_empty_catalog_still_attaches_a_child` uses a manifest with zero widgets. The list has no rows, and the window child is still the layout box. A blank window is a missing child, which is a different failure from an empty catalog.

Button checks use a two-row fake catalog and stub the installer tables. They cannot write into the real home directory.

| State | Desktop | Install | Uninstall | Add to desktop | Add to panel | Remove instance |
| --- | --- | --- | --- | --- | --- | --- |
| not installed | Cinnamon | on | off | off | off | off |
| installed desklet | Cinnamon | off | on | on | off | on |
| installed applet | Cinnamon | off | on | off | on | on |
| installed | KDE | off | on | on | on | on |

`test_install_then_placement_buttons` walks the Cinnamon desklet and applet rows: Install, Add to desktop or Add to panel, Remove instance, Uninstall. Each click hits `place_entry` or the install tables, then `refresh()` rebuilds the rows.

`test_kde_row_can_place_on_desktop_or_panel` checks that a KDE row keeps both placement buttons on. KDE can host the same plasmoid on either surface.

`test_install_all_and_uninstall_all` clicks the footer buttons and expects one call per catalog row, in catalog order.

`test_gnome_row_shows_enabled_after_install` checks the GNOME state text. Before install the row says "not installed". After the stubbed install it says "enabled".

GNOME has a single enabled uuid, so Add to desktop does not create a second instance. The backend test `test_gnome_second_add_does_not_enable_twice` locks that. Cinnamon does create another instance, offset by 40 pixels (`desklet@uuid:2:140:100` after `:1:100:100`).

## Install and placement

Backend cases share one fixture: a temp home, a temp payload, `MemorySettings` in place of gsettings, and `which()` returning false. `run()` records the command and raises. A green test has an empty command list.

Cinnamon files go to `~/.local/share/cinnamon/desklets/<uuid>/` or `applets/<uuid>/`. Enabling a desklet appends `org.cinnamon enabled-desklets`. Enabling an applet appends `enabled-applets`. The other key stays untouched.

| Test | What it locks |
| --- | --- |
| `test_cinnamon_install_copies_a_desklet_and_enables_it` | first instance is `uuid:1:100:100` |
| `test_cinnamon_applet_lands_in_applets_and_on_the_panel_key` | applet path and `uuid:1:1` |
| `test_cinnamon_reinstall_replaces_the_tree` | second install replaces files and does not add another enabled entry |
| `test_cinnamon_enable_is_idempotent_and_add_places_another_instance` | enable once, add-instance offsets |
| `test_cinnamon_panel_request_for_a_desklet_warns_and_still_places` | wrong surface warns, placement still happens |
| `test_cinnamon_remove_one_then_all` | one removal keeps the earlier instance; `--all` clears the uuid |
| `test_cinnamon_remove_missing_instance_returns_false` | nothing to remove is a failure |
| `test_cinnamon_missing_payload_fails_closed` | missing source returns false and creates no directory |
| `test_cinnamon_dry_run_writes_nothing` | `dry=True` skips the copy and the settings write |
| `test_cinnamon_uninstall_removes_files_and_instances` | directory gone, enabled list empty |
| `test_cinnamon_install_still_copies_when_gsettings_is_missing` | files land even when enable cannot |

GNOME install prefers `gnome-extensions`. The tests force the fallback: unzip into `~/.local/share/gnome-shell/extensions/<uuid>/` and append `org.gnome.shell enabled-extensions`. A missing zip returns false. Uninstall removes the directory and the enabled uuid. Asking for the wrong surface warns, then still enables.

KDE install prefers `kpackagetool6`. The tests force the copy into `~/.local/share/plasma/plasmoids/<package_id>/`, including `contents/ui/main.qml`. Placement is a Plasma script. Desktop uses `desktops()` and `addWidget`. Panel uses `panels()`. Remove-one calls `drop(desktops(), false)`. Remove-all also calls `drop(panels(), true)`. The package id is quoted. Uninstall deletes the copied plasmoid.

CLI coverage goes through `main()` with `CURB_BUNDLE_PAYLOAD` pointed at the temp payload:

- `install --desktop cinnamon --yes --only world-clock` copies that widget and leaves the other one alone. Status prints `installed, version 1.1.0` and `enabled, 1 instance(s)`.
- `add-instance --desktop cinnamon world-clock --surface desktop` places a second desklet. Flags may sit between the action and the alias.
- `uninstall --yes --only world-clock` removes files and enabled entries.
- `--only nope` exits 1 and writes nothing.
- `add-instance` with no alias exits 1.
- A refused confirm prints `Aborted.` and exits 0.
- `--list` prints the bundle version and a section for cinnamon, gnome, and kde.
- Root exits 1 unless `--allow-root` is passed. The test stubs `geteuid`.
- An undetected desktop exits 2.
- GNOME and KDE `install --yes` land files in the temp home.

`parse_args` used to drop the widget positional when a flag sat between `add-instance` and the alias, and argparse reported `world-clock` as unrecognized. `main` now calls `parse_intermixed_args`. `test_add_instance_accepts_the_widget_after_flags` locks the order `add-instance --desktop cinnamon world-clock --surface panel`.

Dispatch tables are pinned to the functions: `INSTALLERS`, `UNINSTALLERS`, `ADD_INSTANCE`, and `REMOVE_INSTANCE` for cinnamon, gnome, and kde. A rename that leaves the table pointing at a wrapper will fail `test_dispatch_tables_point_at_the_desktop_functions`.

## Cinnamon, GNOME, and KDE widgets

`ports-release.py build_manifest` is the catalog the window and the installer share. `test_cinnamon_gnome_and_kde_catalogs` locks six widgets on each desktop.

Cinnamon:

| Alias | Name on the row | Kind | Surface | UUID |
| --- | --- | --- | --- | --- |
| world-clock | World Clock | desklet | desktop | `cinnamon-world-clock-desklet@curbsoftware` |
| color-clock | Color Timer Clock | desklet | desktop | `cinnamon-color-timer-clock-desklet@curbsoftware` |
| workspace-grid | Workspace Grid | desklet | desktop | `cinnamon-workspace-grid-desklet@curbsoftware` |
| workspace-names | In Panel Workspace Name | applet | panel | `cinnamon-workspace-names-applet@curbsoftware` |
| panel-profiles | Panel Profiles | applet | panel | `cinnamon-panel-profiles-applet@curbsoftware` |
| command-launcher | Command Launcher | applet | panel | `cinnamon-command-launcher-applet@curbsoftware` |

GNOME uuids are `gnome-<alias>@curbsoftware`. Names match the table above except Workspace Names and Desktop Profiles. KDE package ids drop the hyphen: `com.curbsoftware.worldclock`, `colorclock`, `workspacegrid`, `workspacenames`, `commandlauncher`, `panelprofiles`. The KDE panel-profiles row is Plasma Layouts.

Panel aliases are `workspace-names`, `command-launcher`, and `panel-profiles`. Everything else is a desktop surface. `surface_for_alias` in the installer and `widget_surface` in the builder have to agree. A manifest `surface` field wins over the alias. A `kind` of `applet` or `desklet` wins when `surface` is absent.

Versions on the rows come from each widget's `metadata.json` (KDE: `KPlugin.Version`). The suite checks that the string is non-empty and matches the file. It does not freeze those widget versions. The bundle version is a separate lock: `1.1.0`.

Frontend file checks, still in unittest:

- Each Cinnamon widget has `desklet.js` or `applet.js`, and `metadata.json` `uuid` matches the catalog. Unblocked widgets also use that uuid as the directory name.
- Each GNOME source tree has `extension.js`. Shell and prefs files import `St` and GTK, so this suite does not execute them. Syntax checks stay in `ports-release.py test`.
- Each KDE tree has `contents/ui/main.qml`.
- `gnome/<alias>/` and `kde/<alias>/` at the repository root carry the same uuid or package id, name, and version as `cinnamon/gnome-*` and `cinnamon/kde-*`.

Command Launcher is blocked from a new Spices submission. `test_command_launcher_ships_even_though_spices_submission_is_blocked` keeps it in the Cinnamon catalog anyway. Blocked means "do not submit upstream", and the bundle still installs it.

## The AppImage name

The shipped filename is `CurbXlets-1.1.0-x86_64.AppImage`.

Three producers have to print that same string:

- `dev-tools/appimage/VERSION` is `1.1.0`. `_shipped_asset_name()` reads it when the file sits next to the script (`dev-tools/appimage/VERSION`). That becomes `ASSET_NAME`.
- `ports-release.bundle_filename("x86_64")` is what `build_bundle` writes. The call site is `output_dir / bundle_filename(arch)`.
- `sync-port-project.APPIMAGE_NAME` is the name the port publish step expects.

`test_installer_builder_and_sync_share_the_asset_name` fails if any of the three drift. `test_builder_calls_bundle_filename` also rejects the old `curb-desktop-widgets-x86_64.AppImage` string in `ports-release.py`.

Inside a packed image the script is `usr/bin/bundle-installer.py`. There is no `appimage/VERSION` beside `usr/bin`. Looking there used to crash startup. The lookup walks parents for `payload/manifest.json` and reads `bundle.version`. `test_packed_manifest_names_the_image_without_a_version_file` builds that layout in a temp directory and expects `CurbXlets-1.1.0-x86_64.AppImage`. Pass `origin` into `_shipped_asset_name` so the test can do this without packing an image.

Other name cases:

- A VERSION file of `9.9.9` wins even if a manifest nearby says `1.0.0`.
- A manifest version of `4.5.6` is used when no VERSION file exists.
- A manifest with no bundle version, a broken JSON manifest, or no files at all still returns `CurbXlets-1.1.0-x86_64.AppImage` and does not raise.
- `latest_release_from_json` selects the asset named `CurbXlets-1.1.0-x86_64.AppImage`. An asset still named `curb-desktop-widgets-x86_64.AppImage` is ignored.
- When `/home/user/projects/published/curbxlets/` exists, `test_published_image_uses_the_versioned_name` checks that `CurbXlets-1.1.0-x86_64.AppImage` is a file there. The test skips when that directory is absent. It does not open the image. The image is not committed.

Update download is only tested on the paths that return before `urlopen`. Outside an AppImage, `apply_appimage_update` returns false and does not download. With `APPIMAGE` set and `dry=True`, it returns true and does not download. The branch that replaces the running image calls `os.execv`. Leave that for a manual run.

## When you change something

1. Add the assertion to `test-curbxlets.py` first, or change the assertion that already names the behaviour.
2. Run `python3 cinnamon/dev-tools/test-curbxlets.py` and read the failure.
3. Change `bundle-installer.py`, `ports-release.py`, or the widget metadata the catalog reads.
4. Run the suite again. Then run `python3 cinnamon/dev-tools/test-bundle-installer.py` if the edit touched a helper that file imports.

A new widget needs a row in the catalog tables in the test (alias, display name, surface, uuid or package id), a main file (`desklet.js`, `applet.js`, `extension.js`, or `main.qml`), and a manifest entry from `build_manifest`. The window test will fail until the row shows that name. The install test will fail until the file lands in the temp home.

A new GTK handler on `Manager` must not use a `do_*` name. Add the name to `test_handler_names_are_not_gtk_virtuals` if it would clash with a virtual, and keep `test_window_child_is_the_widget_list_not_an_empty_window` green. That test is the one that fails when the window child is missing.

Bumping the bundle version means editing `cinnamon/dev-tools/appimage/VERSION` and the expected filename `CurbXlets-<version>-x86_64.AppImage` in this plan and in the test constant `ASSET`. Widget `metadata.json` versions can move without that edit.

Do not commit an AppImage, a zip of a spice, or anything under `/home/user/projects/published`. Do not point a test at the real `~/.local/share/cinnamon` tree. The home patch in `Backend.setUp` raises if a target path escapes the temp home.
