"""Run reviewed project commands as argument arrays, without a shell."""

import argparse
import os
import signal
import subprocess
import sys
from pathlib import Path

from common import ROOT
from validate_setup import validate


def execute(argv, root, timeout):
    # Kill the whole process group on POSIX so timed-out servers do not leak.
    try:
        process = subprocess.Popen(argv, cwd=root, start_new_session=os.name == "posix")
    except (OSError, ValueError):
        print("FAIL: could not start command (check executable and toolchain).", flush=True)
        return 1
    try:
        return process.wait(timeout=timeout)
    except (subprocess.TimeoutExpired, KeyboardInterrupt) as exc:
        if os.name == "posix":
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        else:
            process.kill()
        process.wait()
        print("FAIL: command timed out or was interrupted.", flush=True)
        if isinstance(exc, KeyboardInterrupt):
            raise
        return 1


def run(root, action):
    data, errors = validate(root, strict=True)
    if errors:
        for error in errors:
            print("FAIL: " + error, file=sys.stderr)
        return 1
    commands = data["commands"]
    if action == "install" and not commands["install"]:
        print("Install: no application dependencies declared.")
        return 0
    checks = commands["verify"] if action == "verify" else [
        {"name": action, "argv": commands[action], "timeout_seconds": 900}
    ]
    failed = []
    for check in checks:
        print("RUN: " + check["name"], flush=True)
        code = execute(check["argv"], root, check["timeout_seconds"])
        print(("PASS: " if code == 0 else "FAIL: ") + check["name"], flush=True)
        if code != 0:
            failed.append(check["name"])
    if failed:
        print("Failed checks: " + ", ".join(failed), file=sys.stderr)
        return 1
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("install", "verify"))
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    return run(args.root.resolve(), args.action)


if __name__ == "__main__":
    sys.exit(main())
