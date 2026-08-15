#!/usr/bin/env python3
"""
Evaluate JavaScript inside the running Cinnamon process.

Cinnamon exposes an `Eval` method on org.Cinnamon over the session bus (see
/usr/share/cinnamon/js/ui/cinnamonDBus.js). That makes the live desktop
scriptable, which is how the live xlet tests in this directory drive the
desklet and applet without a human clicking through Looking Glass.

Usage as a module:   from cinnamon_eval import ev
Usage from a shell:  ./cinnamon_eval.py 'global.workspace_manager.n_workspaces'
"""
import ast
import os
import subprocess
import sys

os.environ.setdefault(
    "DBUS_SESSION_BUS_ADDRESS", f"unix:path=/run/user/{os.getuid()}/bus")


def ev(code):
    """Run @code in Cinnamon. Returns (success, json_text)."""
    out = subprocess.run(
        ["gdbus", "call", "--session", "--dest", "org.Cinnamon",
         "--object-path", "/org/Cinnamon", "--method", "org.Cinnamon.Eval", code],
        capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError("gdbus failed: " + out.stderr.strip())

    raw = out.stdout.strip()
    # gdbus prints:  (true, '<json>')  /  (false, '<json>')
    if raw.startswith("(true,"):
        ok, rest = True, raw[len("(true,"):]
    elif raw.startswith("(false,"):
        ok, rest = False, raw[len("(false,"):]
    else:
        raise RuntimeError("unexpected gdbus output: " + raw)

    rest = rest.strip()
    if rest.endswith(")"):
        rest = rest[:-1].rstrip().rstrip(",")
    return ok, ast.literal_eval(rest)


if __name__ == "__main__":
    source = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    success, value = ev(source)
    if not success:
        print("EVAL_ERROR: " + value, file=sys.stderr)
        sys.exit(1)
    print(value)
