#!/usr/bin/python3
"""Small subprocess worker for Panel Profiles lock contention tests."""

import importlib.util
import os
import sys
import time


def load_widget(path):
    spec = importlib.util.spec_from_file_location("pp_widget_for_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def touch(path):
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("ready\n")


def wait_for(path):
    deadline = time.monotonic() + 5.0
    while not os.path.exists(path):
        if time.monotonic() >= deadline:
            raise RuntimeError("release signal timed out")
        time.sleep(0.01)


def main():
    if len(sys.argv) == 9 and sys.argv[1] == "wait-repair":
        widget = load_widget(sys.argv[2])
        profile_id, ready, trigger, attempting, acquired, release = sys.argv[3:]
        touch(ready)
        wait_for(trigger)
        touch(attempting)
        with widget._store_lock():
            widget._fix_state_for_deleted(profile_id)
            touch(acquired)
            wait_for(release)
        return 0
    if len(sys.argv) != 7 or sys.argv[1] != "hold":
        return 2
    widget = load_widget(sys.argv[2])
    action, profile_id, ready, release = sys.argv[3:]
    with widget._store_lock():
        if action == "delete":
            widget._delete_profile(profile_id)
        elif action == "repair":
            widget._fix_state_for_deleted(profile_id)
        else:
            return 2
        touch(ready)
        wait_for(release)
    return 0


if __name__ == "__main__":
    sys.exit(main())
