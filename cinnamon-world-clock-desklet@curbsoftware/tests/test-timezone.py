#!/usr/bin/env python3
"""Headless tests for world-clock timezone search helpers."""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "..", "timezoneWidget.py")
spec = importlib.util.spec_from_file_location("world_timezoneWidget", PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def assert_true(cond, msg):
    if not cond:
        raise SystemExit("FAIL: " + msg)


zones = mod.list_iana_timezones()
assert_true(len(zones) > 5, "timezone list populated")
assert_true("UTC" in zones, "UTC present")

hits = mod.filter_timezones(zones, "berlin")
assert_true(any("Berlin" in z for z in hits), "filter berlin")

hits = mod.filter_timezones(zones, "los angeles")
assert_true(any("Los_Angeles" in z for z in hits), "filter los angeles")

assert_true("Local" in mod.timezone_label("local"), "local label")
assert_true("Manila" in mod.timezone_label("Asia/Manila"), "pretty name")
assert_true("\u2014" not in mod.timezone_label("Asia/Manila"), "no em dash")
assert_true(mod._normalize_tz("") == "local", "empty normalizes to local")
assert_true(hasattr(mod, "TimezoneChooser"), "TimezoneChooser exists")
assert_true(hasattr(mod, "ClockListEditor"), "ClockListEditor exists")

print("world clock timezone widget tests passed")
