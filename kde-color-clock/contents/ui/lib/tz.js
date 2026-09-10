.pragma library
/**
 * tz.js
 *
 * Timezone lookup for the KDE clock plasmoids. Qt's QML engine has no
 * GLib and no full ECMA-402 timezone support, so offsets come from the
 * generated table in tzdata.js (see dev-tools/gen-tz-table.py). The
 * lookup mirrors gen-tz-table.py's lookup_offset exactly; the node test
 * in tests/ loads both files with the QML pragmas stripped and checks
 * the pair against known transitions.
 *
 * Wall-clock helpers return UTC-field dates: feed them to format.js,
 * never to local-time getters.
 */

.import "tzdata.js" as TZData

function canonical(zone) {
    return TZData.TZ_ALIASES[zone] || zone;
}

function isValid(zone) {
    return TZData.TZ_TABLE.hasOwnProperty(canonical(zone));
}

/**
 * offsetFor:
 *
 * Returns the UTC offset in seconds for @zone at @epoch (unix seconds),
 * or null for an unknown zone. "local" resolves through the engine's
 * own local clock (getTimezoneOffset is DST-aware and follows
 * /etc/localtime), because the generated table cannot know the host
 * zone. Lookups outside the generated window clamp to the nearest
 * known offset.
 */
function offsetFor(zone, epoch) {
    if (!zone || zone === "local")
        return -new Date(epoch * 1000).getTimezoneOffset() * 60;
    const entries = TZData.TZ_TABLE[canonical(zone)];
    if (!entries)
        return null;
    let lo = 0;
    let hi = entries.length - 1;
    while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        if (entries[mid][0] <= epoch)
            lo = mid;
        else
            hi = mid - 1;
    }
    return entries[lo][1];
}

/**
 * wallDate:
 *
 * Returns a Date whose UTC fields are the wall clock of @zone at
 * @ms (unix milliseconds). Use the getUTC* getters, or format.js.
 */
function wallDate(zone, ms) {
    const offset = offsetFor(zone, Math.floor(ms / 1000));
    if (offset === null)
        return null;
    return new Date(ms + offset * 1000);
}

/**
 * nextTransition:
 *
 * Returns the unix seconds of the first transition after @epoch for
 * @zone, or null when none is tabulated. Used for the "next color"
 * style countdowns; clocks use it to know when to recheck a zone.
 */
function nextTransition(zone, epoch) {
    const entries = TZData.TZ_TABLE[canonical(zone)];
    if (!entries)
        return null;
    for (let i = 0; i < entries.length; i++) {
        if (entries[i][0] > epoch)
            return entries[i][0];
    }
    return null;
}

/**
 * displayName:
 *
 * Returns a short label for a zone id, mirroring the Cinnamon
 * timezoneDisplayName: "local" to "Local", otherwise the final path
 * segment with underscores turned into spaces.
 */
function displayName(zone) {
    if (!zone || zone === "local")
        return "Local";
    const parts = String(zone).split("/");
    return parts[parts.length - 1].replace(/_/g, " ");
}
