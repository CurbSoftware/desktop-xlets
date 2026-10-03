#!/usr/bin/env python3
"""Ground-truth tests for the generated KDE timezone table.

Validates gen-tz-table.py against the host zoneinfo database: table
contents, the reference lookup (which tz.js mirrors), alias collapse,
and window clamping. Uses a short window (2024-2027) to stay quick;
the algorithm is identical for any window.

Usage:  python3 dev-tools/test-tz-table.py
Exits non-zero if any assertion fails.
"""

from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
from pathlib import Path
from zoneinfo import ZoneInfo

GENERATOR = Path(__file__).resolve().parent / "gen-tz-table.py"
spec = importlib.util.spec_from_file_location("gen_tz_table", GENERATOR)
G = importlib.util.module_from_spec(spec)
spec.loader.exec_module(G)

START_YEAR, END_YEAR = 2024, 2027
TABLE, ALIASES, START, END = G.build_tables(START_YEAR, END_YEAR)

passed = 0
failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    global passed
    if condition:
        passed += 1
        print("  ✓ " + label)
    else:
        failures.append(label + (": " + detail if detail else ""))
        print("  ✗ " + label + (": " + detail if detail else ""))


def eq(label: str, actual, expected) -> None:
    check(label, actual == expected, "got %r, want %r" % (actual, expected))


def epoch(year: int, month: int, day: int, hour: int = 0, minute: int = 0, second: int = 0) -> int:
    return int(datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc).timestamp())


def zone_offset(zone: str, when: int) -> int:
    # Construct the datetime in the target zone; utcoffset() reads
    # wall-clock fields, not the absolute instant.
    return int(datetime.fromtimestamp(when, tz=ZoneInfo(zone)).utcoffset().total_seconds())


print("• table contents")

check("window start matches the first second of %d" % START_YEAR,
      START == epoch(START_YEAR, 1, 1))
check("window end matches the first second of %d" % (END_YEAR + 1),
      END == epoch(END_YEAR + 1, 1, 1))

kiritimati = TABLE.get("Pacific/Kiritimati")
eq("Pacific/Kiritimati holds one constant +14:00 entry", kiritimati, [[START, 50400]])

check("America/New_York is canonical (not an alias)", "America/New_York" not in ALIASES)
check("US/Eastern collapses to an alias", ALIASES.get("US/Eastern") == "America/New_York")
if ALIASES:
    sample = sorted(ALIASES)[0]
    check("every alias target exists in the table: " + sample,
          ALIASES[sample] in TABLE)
for zone in sorted(TABLE):
    entries = TABLE[zone]
    check_first = entries[0][0] == START
    if not check_first:
        failures.append("first entry of %s is not the window start" % zone)
        print("  ✗ first entry of %s is not the window start" % zone)
        break
else:
    passed += 1
    print("  ✓ every table entry starts at the window start")

print("\n• known transition instants")

# US 2026: spring forward the second Sunday of March (March 8) at 02:00 EST,
# which is 07:00 UTC; winter is -05:00, summer is -04:00.
eq("New York the second before US spring 2026",
   G.lookup_offset(TABLE, ALIASES, "America/New_York", epoch(2026, 3, 8, 6, 59, 59)), -18000)
eq("New York at US spring 2026",
   G.lookup_offset(TABLE, ALIASES, "America/New_York", epoch(2026, 3, 8, 7)), -14400)

# EU 2026: Berlin springs forward the last Sunday of March (March 29) at
# 01:00 UTC; winter is +01:00, summer is +02:00.
eq("Berlin the second before EU spring 2026",
   G.lookup_offset(TABLE, ALIASES, "Europe/Berlin", epoch(2026, 3, 29, 0, 59, 59)), 3600)
eq("Berlin at EU spring 2026",
   G.lookup_offset(TABLE, ALIASES, "Europe/Berlin", epoch(2026, 3, 29, 1)), 7200)

# Half-hour DST shift: Lord Howe is +10:30 in winter, +11:00 in summer.
eq("Lord Howe in January (southern summer)",
   G.lookup_offset(TABLE, ALIASES, "Australia/Lord_Howe", epoch(2026, 1, 15)), 39600)
eq("Lord Howe in July (southern winter)",
   G.lookup_offset(TABLE, ALIASES, "Australia/Lord_Howe", epoch(2026, 7, 15)), 37800)

print("\n• ground truth sweep")

PROBE_ZONES = (
    "America/New_York", "Europe/Berlin", "Pacific/Kiritimati",
    "Australia/Lord_Howe", "Asia/Kathmandu", "Asia/Kolkata",
    "Africa/Casablanca", "Pacific/Apia", "UTC",
)
probes = []
for year in range(START_YEAR, END_YEAR + 1):
    for month, day in ((1, 15), (3, 20), (7, 15), (10, 15), (12, 15)):
        probes.append(epoch(year, month, day))

sweep_failed = False
for zone in PROBE_ZONES:
    for when in probes:
        got = G.lookup_offset(TABLE, ALIASES, zone, when)
        want = zone_offset(zone, when)
        if got != want:
            sweep_failed = True
            failures.append("%s at %s: got %r, want %r" % (zone, when, got, want))
if sweep_failed:
    print("  ✗ sweep found mismatches (see failures)")
else:
    passed += 1
    print("  ✓ %d zones match zoneinfo at %d probes each" % (len(PROBE_ZONES), len(probes)))

print("\n• boundary sweep")

# Every recorded transition must flip zoneinfo truth exactly between
# t-1 and t. This is what catches instant-level drift that day-granularity
# probes miss.
boundaries = 0
boundary_failed = False
for zone in sorted(TABLE):
    entries = TABLE[zone]
    for index in range(1, len(entries)):
        moment = entries[index][0]
        before = zone_offset(zone, moment - 1)
        after = zone_offset(zone, moment)
        if after != entries[index][1] or before != entries[index - 1][1]:
            boundary_failed = True
            failures.append("%s at %d: truth %d/%d, table %d/%d"
                            % (zone, moment, before, after,
                               entries[index - 1][1], entries[index][1]))
        boundaries += 1
if boundary_failed:
    print("  ✗ boundary mismatches (see failures)")
else:
    passed += 1
    print("  ✓ %d recorded transitions flip zoneinfo exactly" % boundaries)

print("\n• window clamping")

before = epoch(START_YEAR, 1, 1) - 86400
for zone in ("America/New_York", "Europe/Berlin"):
    eq("%s before the window clamps to the window-start offset" % zone,
       G.lookup_offset(TABLE, ALIASES, zone, before),
       zone_offset(zone, START + 3600))
after = END + 86400
eq("New York past the window clamps to the last known offset",
   G.lookup_offset(TABLE, ALIASES, "America/New_York", after),
   zone_offset("America/New_York", END - 3600))
eq("unknown zone returns null",
   G.lookup_offset(TABLE, ALIASES, "Mars/Olympus_Mons", after), None)

print()
if failures:
    for failure in failures:
        print("FAIL " + failure)
    print("%d passed, %d FAILED" % (passed, len(failures)))
    raise SystemExit(1)
print("%d passed, 0 failed" % passed)
