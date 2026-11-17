"""Validate the setup contract without executing application commands."""

import argparse
import re
import sys
from pathlib import Path

from common import ROOT, load_json, local_file


def meaningful(value):
    return (
        isinstance(value, str) and bool(value.strip())
        and not re.search(
            r"\b(?:TBD|CHANGEME)\b|(?:^|\s)TODO(?:\s*:|$)|<SETUP_REQUIRED>|"
            r"\[(?:name|project name|purpose|instructions|evidence)\]", value,
        )
    )


def validate(root, strict=False):
    errors = []
    try:
        data = load_json(root / "project.json")
    except (OSError, ValueError) as exc:
        return None, ["project.json: " + str(exc)]
    if not isinstance(data, dict):
        return None, ["project.json must be an object"]

    def keys(value, expected, label):
        if not isinstance(value, dict):
            errors.append(label + " must be an object")
            return False
        missing = expected - value.keys()
        extra = value.keys() - expected
        if missing:
            errors.append(label + ": missing keys " + ", ".join(sorted(missing)))
        if extra:
            errors.append(label + ": unknown keys " + ", ".join(sorted(extra)))
        return True

    def paths(value, label):
        if not isinstance(value, list):
            errors.append(label + " must be a list")
            return
        for entry in value:
            if local_file(root, entry) is None:
                errors.append(label + ": expected an existing repository file")

    def command(value, label, required):
        if not isinstance(value, list) or any(not isinstance(s, str) or not s.strip() for s in value):
            errors.append(label + " must be an argument array of nonempty strings")
        elif required and not value:
            errors.append(label + " must contain a real executable command")

    keys(data, {"schema_version", "state", "name", "purpose", "runtimes", "dependencies",
                "commands", "documents", "smoke_test"}, "project.json")
    if type(data.get("schema_version")) is not int or data["schema_version"] != 1:
        errors.append("schema_version must be 1")
    state = data.get("state")
    if state not in ("template", "configured"):
        errors.append("state must be template or configured")
    ready = strict or state == "configured"
    if strict and state != "configured":
        errors.append("project setup is incomplete: state must be configured")
    for field in ("name", "purpose"):
        if not isinstance(data.get(field), str) or (ready and not meaningful(data.get(field))):
            errors.append(field + " must be a completed string")

    runtimes = data.get("runtimes")
    if not isinstance(runtimes, list):
        errors.append("runtimes must be a list")
    else:
        if ready and not runtimes:
            errors.append("at least one application runtime/toolchain must be pinned")
        names = set()
        for runtime in runtimes:
            if not keys(runtime, {"name", "version", "file"}, "runtime"):
                continue
            name, version = runtime.get("name"), runtime.get("version")
            if not meaningful(name):
                errors.append("runtime.name must be completed")
            elif name in names:
                errors.append("runtime names must be unique")
            else:
                names.add(name)
            if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][\w.-]+)?", version):
                errors.append("runtime.version must be an exact major.minor.patch version")
            source = local_file(root, runtime.get("file"))
            if source is None:
                errors.append("runtime.file must be an existing repository file")
            elif isinstance(version, str) and version:
                try:
                    if not re.search(r"(?<![\w.])" + re.escape(version) + r"(?![\w.])", source.read_text(encoding="utf-8")):
                        errors.append("runtime pin does not match its source file")
                except (OSError, UnicodeError):
                    errors.append("runtime.file must be readable UTF-8 text")

    deps = data.get("dependencies")
    if keys(deps, {"mode", "manifests", "lockfiles"}, "dependencies"):
        mode = deps.get("mode")
        if mode not in ("none", "locked"):
            errors.append("dependencies.mode must be none or locked")
        for field in ("manifests", "lockfiles"):
            paths(deps.get(field), "dependencies." + field)
        if mode == "locked" and (not deps.get("manifests") or not deps.get("lockfiles")):
            errors.append("locked dependencies require manifests and lockfiles")
        if mode == "none" and (deps.get("manifests") or deps.get("lockfiles")):
            errors.append("dependencies.mode none cannot list manifests or lockfiles")

    commands = data.get("commands")
    if keys(commands, {"install", "dev", "verify"}, "commands"):
        locked = isinstance(deps, dict) and deps.get("mode") == "locked"
        command(commands.get("install"), "commands.install", ready and locked)
        command(commands.get("dev"), "commands.dev", ready)
        checks = commands.get("verify")
        if not isinstance(checks, list):
            errors.append("commands.verify must be a list")
        else:
            if ready and not checks:
                errors.append("commands.verify must include at least one real check")
            names = set()
            for check in checks:
                if not keys(check, {"name", "argv", "timeout_seconds"}, "verification check"):
                    continue
                name = check.get("name")
                if not meaningful(name):
                    errors.append("verification check name must be completed")
                elif name in names:
                    errors.append("verification check names must be unique")
                else:
                    names.add(name)
                command(check.get("argv"), "verification argv", True)
                timeout = check.get("timeout_seconds")
                if type(timeout) is not int or not 1 <= timeout <= 3600:
                    errors.append("timeout_seconds must be an integer between 1 and 3600")

    docs = data.get("documents")
    if keys(docs, {"product", "architecture", "operations"}, "documents"):
        for name, value in docs.items():
            path = local_file(root, value)
            if path is None:
                errors.append("documents." + name + " must reference an existing repository file")
            elif ready:
                try:
                    text = path.read_text(encoding="utf-8")
                    if not text.strip() or re.search(r"\b(TODO|TBD|CHANGEME)\b|<!--\s*SETUP_REQUIRED\s*-->", text):
                        errors.append("documents." + name + " has unresolved setup content")
                except (OSError, UnicodeError):
                    errors.append("documents." + name + " must be readable UTF-8 text")
    smoke = data.get("smoke_test")
    if keys(smoke, {"instructions", "evidence"}, "smoke_test"):
        for field in ("instructions", "evidence"):
            if not isinstance(smoke.get(field), str) or (ready and not meaningful(smoke.get(field))):
                errors.append("smoke_test." + field + " must record the real interaction and evidence")
    return data, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--strict", action="store_true", help="require completed application setup")
    parser.add_argument("--github-output", type=Path, help="append configured=true/false for CI")
    args = parser.parse_args()
    data, errors = validate(args.root.resolve(), args.strict)
    for error in errors:
        print("FAIL: " + error, file=sys.stderr)
    if errors:
        return 1
    configured = data["state"] == "configured"
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8") as output:
            output.write("configured=" + str(configured).lower() + "\n")
    print("Project setup: configured (commands not executed)." if configured else
          "Project setup: TEMPLATE / INCOMPLETE. Application verification is unavailable.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
