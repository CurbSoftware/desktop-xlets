# Cinnamon Desklet Clock (Fork)

A Cinnamon desklet clock fork that allows you to **customize the display with a title (e.g. a timezone name)** and **set a specific timezone** for the clock.  
This makes it useful for monitoring multiple locations, setting up world clocks, or simply personalizing your desktop time display.

![screenshot placeholder](icon.png)

---

## ✨ Features

- 🕒 Displays time directly on the desktop.
- 🌍 Customizable timezone support — monitor any timezone in the world.
- 🏷️ Add a custom title above the clock (e.g., "New York" or "Tokyo").
- 🎨 Desklet styling via `stylesheet.css`.
- 🔧 All settings configurable via **metadata.json schema** through Cinnamon Desklet settings.

---

## ⚙️ Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/TechCurb/cinnamon-desklet-clock.git
   ```
2. Copy the folder into your local Cinnamon desklets directory:
   ```bash
   cp -r cinnamon-desklet-clock/ ~/.local/share/cinnamon/desklets/TimeAndDate@desklet.user
   ```
3. Right-click your desktop → **Add Desklets** → Find **TimeAndDate (User)** and add it.  

**Or**

## ⚙️ Simpler Installation (load without modifications)
Clone the repo into your local Cinnamon desklets directory:
   ```bash
   git clone https://github.com/TechCurb/cinnamon-desklet-clock.git ~/.local/share/cinnamon/desklets/TimeAndDate@desklet.user
   ```

---

## 🛠️ Configuration

You can configure this desklet from the **Cinnamon Desklet settings panel**, which uses [`metadata.json`](metadata.json) for all definitions.  

### Available options:
- **Timezone**: Choose any valid [IANA timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) (e.g., `America/New_York`, `Europe/London`, `Asia/Tokyo`).
- **Custom Title**: Optional label for the clock (e.g., "New York", "London HQ").
- **Style & Layout**: Adjust font size, font color, and positioning via the settings panel.

---

## 📖 Example Configurations (`metadata.json`)

Below are some example `metadata.json` snippets showing different desklet setups:

### Example 1: Default New York Clock Without Seconds
```json
{
    "description": "A fork desklet that displays the time, date, and timezone",
    "prevent-decorations": false,
    "uuid": "TimeAndDate@desklet.user",
    "name": "New York Time",
    "timeFormat": "%H:%M",
    "timeSize": "40pt",
    "dateFormat": "%A,%e %B",
    "dateSize": "15pt",
    "timezone": "America/New_York",
    "timezoneSize": "12pt",
    "author": "none",
    "last-edited": 1758254790
}

```

### Example 2: Tokyo Office Clock Adjusted Font Sizes
```json
{
    "description": "A fork desklet that displays the time, date, and timezone",
    "prevent-decorations": false,
    "uuid": "TimeAndDate@desklet.user",
    "name": "Tokyo Office",
    "timeFormat": "%H:%M",
    "timeSize": "34pt",
    "dateFormat": "%A,%e %B",
    "dateSize": "12pt",
    "timezone": "Asia/Tokyo",
    "timezoneSize": "12pt",
    "author": "none",
    "last-edited": 1758254790
}
```

---

## 🔄 Restart Cinnamon After Edits

If manual edits are done to files (including metadata), Cinnamon may need to restart:  
- Press **Alt + F2**, type `r`, then **Enter**  
_or_  
- Run in terminal:  
  ```bash
  cinnamon --replace & disown
  ```

---

**Note:** Inherits desktop theme colors.

---

## 🕒 Running Multiple Desklets (World Clock Setup)

You can create multiple differently-configured clocks to monitor different time zones:

```bash
git clone https://github.com/TechCurb/cinnamon-desklet-clock.git  ~/.local/share/cinnamon/desklets/TimeAndDate@desklet.zimbabwe
```

Then open the cloned directory and **find/replace** all instances of:

```
TimeAndDate@desklet.user → TimeAndDate@desklet.zimbabwe
```

Restart Cinnamon, and now both desklets can run side by side (e.g., one showing New York, another showing Zimbabwe).

---

## 📂 Project Structure

- [`desklet.js`](desklet.js) — main desklet logic.
- [`metadata.json`](metadata.json) — defines metadata and settings schema.
- [`stylesheet.css`](stylesheet.css) — styling overrides.
- [`po/`](po/) — translation files.

---

## 🌐 Translations

This desklet supports multiple languages. Translation files are included in the `po/` directory.  
You can contribute translations by editing the `.po` files.

---

## 🙌 Credits


- Fork by: [TechCurb](https://github.com/TechCurb)
- Original work: nightflame | - Steve desklets [at] stargw [dot] eu
- Original desklet : TimeAndDate@nightflame

---

## 📜 License

This project is licensed under the GPLv2+ license. See the LICENSE file for details.
