#!/usr/bin/env python3
"""Generate the timezone lookup table used by the KDE clock plasmoids.

Qt's QML engine cannot call GLib and ships no full ECMA-402 timezone
support, so per-clock timezones need data. This walks the host zoneinfo
database and emits a plain JS lookup table:

    var TZ_START = <window start, unix seconds>;
    var TZ_END = <window end, unix seconds>;
    var TZ_TABLE = { "America/New_York": [[unix, offsetSeconds], ...], ... };
    var TZ_ALIASES = { "US/Eastern": "America/New_York", ... };

Each entry means: from its unix instant until the next entry (or the
window end) the zone's UTC offset is offsetSeconds. Zones whose
transition lists are identical inside the window collapse into one
table entry plus an alias, which keeps the file roughly half the naive
size. Lookups outside the window clamp to the nearest known offset, so
the table needs a rebuild once real time approaches TZ_END. The file is
never hand edited; rerun this generator instead.

The scanner samples every SAMPLE_DAYS days and binary-searches each
change to the second. Two transitions inside one sample window would
merge; no zone in the modern IANA database switches twice within ten
days, so that ceiling is documented here rather than worked around.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from zoneinfo import ZoneInfo, available_timezones

WINDOW_START_YEAR = 2020
WINDOW_END_YEAR = 2050
SAMPLE_DAYS = 10
ALIAS_PREFIXES = ("Etc/", "posix/", "right/", "SystemV/")

# Zones that share every transition inside the window collapse into one
# table entry, and the survivor is picked by preference: a short list of
# canonical names users actually type, then the longest final path
# segment (big-city names beat legacy abbreviations), then name order.
# Data is identical either way; this only decides which name is canonical.
PREFERRED_CANONICAL = (
    "UTC",
    "America/New_York", "America/Chicago", "America/Denver",
    "America/Los_Angeles", "America/Anchorage", "America/Toronto",
    "America/Mexico_City", "America/Sao_Paulo",
    "America/Argentina/Buenos_Aires",
    "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
    "Europe/Rome", "Europe/Amsterdam", "Europe/Moscow", "Europe/Kyiv",
    "Africa/Cairo", "Africa/Lagos", "Africa/Johannesburg",
    "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok", "Asia/Shanghai",
    "Asia/Singapore", "Asia/Hong_Kong", "Asia/Tokyo", "Asia/Seoul",
    "Australia/Perth", "Australia/Sydney", "Australia/Melbourne",
    "Pacific/Auckland",
)


def canonical_key(name: str) -> tuple:
    parts = name.split("/")
    if name in PREFERRED_CANONICAL:
        return (0, "", name)
    return (1, -len(parts[-1]), name)


def window_bounds(start_year: int, end_year: int) -> tuple[int, int]:
    start = int(datetime(start_year, 1, 1, tzinfo=timezone.utc).timestamp())
    end = int(datetime(end_year + 1, 1, 1, tzinfo=timezone.utc).timestamp())
    return start, end


def probe_offset(tz: ZoneInfo, epoch: int) -> int:
    # ZoneInfo.utcoffset() reads the datetime's wall-clock fields and ignores
    # its tzinfo, so the datetime must be constructed IN the target zone.
    moment = datetime.fromtimestamp(epoch, tz=tz)
    return int(moment.utcoffset().total_seconds())


def zone_transitions(tz: ZoneInfo, start: int, end: int) -> list[tuple[int, int]]:
    """UTC instants where the offset changes, within [start, end)."""
    transitions: list[tuple[int, int]] = []
    offset = probe_offset(tz, start)
    moment = start
    while moment < end:
        nxt = min(moment + SAMPLE_DAYS * 86400, end)
        found = probe_offset(tz, nxt)
        if found != offset:
            lo, hi = moment, nxt
            while hi - lo > 1:
                mid = (lo + hi) // 2
                if probe_offset(tz, mid) == offset:
                    lo = mid
                else:
                    hi = mid
            offset = found
            transitions.append((hi, offset))
        moment = nxt
    return transitions


def build_tables(start_year: int = WINDOW_START_YEAR,
                 end_year: int = WINDOW_END_YEAR) -> tuple[dict, dict, int, int]:
    """Return (table, aliases, start, end) covering the given years."""
    start, end = window_bounds(start_year, end_year)
    grouped: dict[tuple, list[str]] = {}
    for name in sorted(available_timezones()):
        if name.startswith(ALIAS_PREFIXES) or ("/" not in name and name != "UTC"):
            continue
        tz = ZoneInfo(name)
        initial = probe_offset(tz, start)
        key = (initial, tuple(zone_transitions(tz, start, end)))
        grouped.setdefault(key, []).append(name)

    table: dict[str, list[list[int]]] = {}
    aliases: dict[str, str] = {}
    for key, names in grouped.items():
        primary = min(names, key=canonical_key)
        table[primary] = [[start, key[0]]] + [[moment, offset] for moment, offset in key[1]]
        for name in names:
            if name != primary:
                aliases[name] = primary
    return dict(sorted(table.items())), dict(sorted(aliases.items())), start, end


def lookup_offset(table: dict, aliases: dict, zone: str, epoch: int) -> int | None:
    """Reference lookup. tz.js inside each plasmoid mirrors this exactly."""
    entries = table.get(aliases.get(zone, zone))
    if entries is None:
        return None
    lo, hi = 0, len(entries) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if entries[mid][0] <= epoch:
            lo = mid
        else:
            hi = mid - 1
    return entries[lo][1]


def render_js(table: dict, aliases: dict, start: int, end: int) -> str:
    lines = [
        "// AUTO-GENERATED by gen-tz-table.py. Do not edit; rerun the generator.",
        "// Window: %d to %d (unix seconds). Lookups outside clamp to the" % (start, end),
        "// nearest known offset, so rebuild once real time approaches the end.",
        "var TZ_START = %d;" % start,
        "var TZ_END = %d;" % end,
        "var TZ_TABLE = %s;" % json.dumps(table, separators=(",", ":")),
        "var TZ_ALIASES = %s;" % json.dumps(aliases, separators=(",", ":"), sort_keys=True),
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="write the JS table here")
    parser.add_argument("--start-year", type=int, default=WINDOW_START_YEAR)
    parser.add_argument("--end-year", type=int, default=WINDOW_END_YEAR)
    parser.add_argument("--check", type=Path,
                        help="compare against this file instead of writing; exit 1 on drift")
    args = parser.parse_args()

    table, aliases, start, end = build_tables(args.start_year, args.end_year)
    rendered = render_js(table, aliases, start, end)
    zones = len(table)
    transitions = sum(len(entries) - 1 for entries in table.values())
    print("%d canonical zones, %d aliases, %d transitions, %d bytes"
          % (zones, len(aliases), transitions, len(rendered.encode("utf-8"))))

    if args.check is not None:
        if not args.check.is_file():
            print("missing: " + str(args.check))
            return 1
        if args.check.read_text(encoding="utf-8") != rendered:
            print("stale: " + str(args.check) + " differs from a fresh generation")
            return 1
        print("fresh: " + str(args.check))
        return 0

    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(rendered, encoding="utf-8")
        print("wrote " + str(args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
