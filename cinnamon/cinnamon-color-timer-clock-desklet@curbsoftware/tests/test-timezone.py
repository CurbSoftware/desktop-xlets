#!/usr/bin/env python3
"""Headless tests for timezone search helpers."""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "..", "timezoneWidget.py")
spec = importlib.util.spec_from_file_location("timezoneWidget", PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def assert_true(cond, msg):
    if not cond:
        raise SystemExit("FAIL: " + msg)


zones = mod.list_iana_timezones()
assert_true("UTC" in zones, "UTC present")
assert_true(any("Europe/Berlin" == z or z.endswith("/Berlin") for z in zones), "Berlin present")

hits = mod.filter_timezones(zones, "berlin")
assert_true(any("Berlin" in z for z in hits), "filter berlin")

hits = mod.filter_timezones(zones, "los angeles")
assert_true(any("Los_Angeles" in z for z in hits), "filter los angeles")

assert_true("Local" in mod.timezone_label(""), "empty is local")
assert_true("Manila" in mod.timezone_label("Asia/Manila"), "pretty name")
assert_true("\u2014" not in mod.timezone_label("Asia/Manila"), "no em dash")

print("timezone widget tests passed")
