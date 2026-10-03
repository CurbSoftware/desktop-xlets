.pragma library
/**
 * format.js
 *
 * strftime-subset formatter for the KDE clock plasmoids, operating on
 * the UTC-field dates that tz.js produces. Supported specifiers:
 * %Y %m %d %e %H %I %M %S %p %P %a %A %b %B %y %%
 *
 * Ported from the Cinnamon desklets' reliance on GLib.DateTime.format,
 * which QML cannot call. Locale names are English; the Cinnamon
 * originals get translated month names from GLib, a documented gap.
 */

var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday",
            "Thursday", "Friday", "Saturday"];
var MONTHS = ["January", "February", "March", "April", "May", "June",
              "July", "August", "September", "October", "November", "December"];

function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
}

function strftime(date, fmt) {
    if (!date || !fmt)
        return "";
    const hours = date.getUTCHours();
    let out = "";
    for (let i = 0; i < fmt.length; i++) {
        const ch = fmt[i];
        if (ch !== "%" || i + 1 >= fmt.length) {
            out += ch;
            continue;
        }
        const spec = fmt[++i];
        switch (spec) {
        case "Y": out += date.getUTCFullYear(); break;
        case "y": out += pad2(date.getUTCFullYear() % 100); break;
        case "m": out += pad2(date.getUTCMonth() + 1); break;
        case "d": out += pad2(date.getUTCDate()); break;
        case "e": out += date.getUTCDate() < 10 ? " " + date.getUTCDate() : "" + date.getUTCDate(); break;
        case "H": out += pad2(hours); break;
        case "I": out += pad2(hours % 12 === 0 ? 12 : hours % 12); break;
        case "M": out += pad2(date.getUTCMinutes()); break;
        case "S": out += pad2(date.getUTCSeconds()); break;
        case "p": out += hours < 12 ? "AM" : "PM"; break;
        case "P": out += hours < 12 ? "am" : "pm"; break;
        case "a": out += DAYS[date.getUTCDay()].slice(0, 3); break;
        case "A": out += DAYS[date.getUTCDay()]; break;
        case "b": out += MONTHS[date.getUTCMonth()].slice(0, 3); break;
        case "B": out += MONTHS[date.getUTCMonth()]; break;
        case "%": out += "%"; break;
        default:
            out += "%" + spec;
        }
    }
    return out;
}

/**
 * parseClocks:
 *
 * Parses the clocksJson config string into a validated clock list,
 * falling back to one Local clock. Mirrors the Cinnamon
 * normalizeClockList contract as far as QML needs it.
 */
function parseClocks(json) {
    let list = [];
    try {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed))
            list = parsed;
    } catch (e) {
    }
    const out = [];
    for (let i = 0; i < list.length && out.length < 36; i++) {
        const clock = list[i];
        if (!clock || typeof clock !== "object")
            continue;
        const timezone = typeof clock.timezone === "string" && clock.timezone.trim()
            ? clock.timezone.trim() : "local";
        out.push({
            id: typeof clock.id === "string" && clock.id ? clock.id : "clock-" + i,
            name: typeof clock.name === "string" ? clock.name.trim() : "",
            timezone: timezone
        });
    }
    if (out.length === 0)
        out.push({ id: "default", name: "Local", timezone: "local" });
    return out;
}

/**
 * gridColumns:
 *
 * Near-square auto grid, mirroring computeGridDims auto mode.
 */
function gridColumns(count) {
    const n = Math.max(1, parseInt(count, 10) || 1);
    return Math.ceil(Math.sqrt(n));
}

/**
 * commonZones:
 *
 * Dropdown suggestions for the config page: "local" plus the common
 * zones, mirroring the Cinnamon FALLBACK_TIMEZONES list. Any IANA id
 * can still be typed.
 */
function commonZones() {
    return ["local",
        "UTC",
        "America/New_York", "America/Chicago", "America/Denver",
        "America/Los_Angeles", "America/Anchorage", "America/Honolulu",
        "America/Toronto", "America/Mexico_City", "America/Sao_Paulo",
        "America/Argentina/Buenos_Aires",
        "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
        "Europe/Rome", "Europe/Moscow",
        "Africa/Cairo", "Africa/Johannesburg",
        "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai", "Asia/Singapore",
        "Asia/Tokyo", "Asia/Seoul",
        "Australia/Sydney",
        "Pacific/Auckland"];
}
