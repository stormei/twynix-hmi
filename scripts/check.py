"""Run foundation checks; optionally include configured application verification."""

import argparse
import ast
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

from common import ROOT, load_json, repository_files
from run_project import run
from validate_setup import validate

TEXT_SUFFIXES = {".md", ".py", ".json", ".yaml", ".yml", ".toml", ".txt", ".sh", ".css", ".html", ".js", ".example", ".sample"}
TEXT_NAMES = {".gitignore", ".gitattributes", ".editorconfig", ".tooling-python-version"}
FOUNDATION_PYTHON = {
    "scripts/common.py", "scripts/check.py", "scripts/validate_setup.py", "scripts/run_project.py",
}
FOUNDATION_JSON = {"project.json", "foundation.json"}
TOKEN_PATTERNS = [
    ("private key", re.compile(r"-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----")),
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
    ("GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b")),
    ("OpenAI-style key", re.compile(r"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b")),
]
CREDENTIAL = re.compile(
    r"^\s*[\"']?[\w.-]*(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)"
    r"[\w.-]*[\"']?\s*[:=]\s*(.+?)\s*$", re.I,
)


def safe_placeholder(value):
    return (value.lower() in {"null", "none", "true", "false"}
            or re.fullmatch(r"<[^>]+>", value) is not None
            or value.startswith(("${", "process.env.", "os.environ", "env(", "getenv(")))


def secret_findings(relative, text):
    findings = []
    # Report only location and detector name; never include the suspected value.
    for number, line in enumerate(text.splitlines(), 1):
        for label, pattern in TOKEN_PATTERNS:
            if pattern.search(line):
                findings.append(f"{relative}:{number}: possible {label} (value redacted)")
        match = CREDENTIAL.match(line)
        if match:
            rhs = match.group(1)
            literal = re.match(r'''["']([^"']*)["']\s*[,;]?(?:\s*#.*)?$''', rhs)
            environment = Path(relative).name.startswith(".env")
            value = literal.group(1) if literal else rhs.split("#", 1)[0].strip()
            if value and (literal or environment) and not safe_placeholder(value):
                findings.append(f"{relative}:{number}: literal credential assignment (value redacted)")
    return findings


def prose(text):
    """Remove fenced code and inline code before inspecting Markdown links."""
    lines = []
    fence = None
    for line in text.splitlines():
        match = re.match(r"^\s{0,3}(`{3,}|~{3,})", line)
        if match:
            marker = match.group(1)
            if fence is None:
                fence = marker
            elif marker[0] == fence[0] and len(marker) >= len(fence):
                fence = None
            lines.append("")
        else:
            lines.append(re.sub(r"(`+).*?\1", "", line) if fence is None else "")
    return "\n".join(lines), fence is not None


def markdown_findings(root, path, text):
    relative = path.relative_to(root)
    errors = []
    content, unclosed = prose(text)
    if unclosed:
        errors.append(f"{relative}: unclosed Markdown code fence")
    # Inline/image destinations and reference definitions. External URLs are offline.
    targets = re.findall(r"!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)", content)
    targets += re.findall(r"^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)", content, re.M)
    for target in targets:
        target = target.strip("<>")
        try:
            parsed = urlsplit(target)
        except ValueError:
            errors.append(f"{relative}: malformed link destination")
            continue
        if parsed.scheme or parsed.netloc or not parsed.path:
            continue
        destination = (root / unquote(parsed.path).lstrip("/")) if parsed.path.startswith("/") else (
            path.parent / unquote(parsed.path)
        )
        try:
            destination.resolve().relative_to(root.resolve())
        except ValueError:
            errors.append(f"{relative}: link escapes repository: {target}")
            continue
        if not destination.exists():
            errors.append(f"{relative}: missing link target: {target}")
    return errors


def foundation(root):
    groups = {"text and syntax": [], "Markdown links": [], "security": []}
    for path in repository_files(root):
        relative = path.relative_to(root)
        if not path.is_file():
            continue
        try:
            path.resolve().relative_to(root.resolve())
        except ValueError:
            groups["security"].append(f"{relative}: file symlink escapes repository")
            continue
        name = path.name
        if ((name == ".env" or name.startswith(".env.")) and name not in {".env.example", ".env.sample"}
                or path.suffix in {".pem", ".key"} or name == "credentials.json"):
            groups["security"].append(f"{relative}: credential file must not be committed")
        try:
            raw = path.read_bytes()
        except OSError:
            groups["text and syntax"].append(f"{relative}: cannot read file")
            continue
        managed = path.suffix in TEXT_SUFFIXES or name in TEXT_NAMES
        try:
            text = raw.decode("utf-8")
        except UnicodeError:
            if managed:
                groups["text and syntax"].append(f"{relative}: expected UTF-8")
            continue
        if "\0" in text:
            if managed:
                groups["text and syntax"].append(f"{relative}: unexpected binary content")
            continue
        groups["security"].extend(secret_findings(relative, text))
        if managed:
            if raw and not raw.endswith(b"\n"):
                groups["text and syntax"].append(f"{relative}: missing final newline")
            if b"\r" in raw:
                groups["text and syntax"].append(f"{relative}: use LF line endings")
            for number, line in enumerate(text.splitlines(), 1):
                if line != line.rstrip():
                    groups["text and syntax"].append(f"{relative}:{number}: trailing whitespace")
            try:
                if relative.as_posix() in FOUNDATION_JSON:
                    load_json(path)
                elif (relative.as_posix() in FOUNDATION_PYTHON
                      or relative.as_posix().startswith("tests/foundation/") and path.suffix == ".py"):
                    ast.parse(text, filename=str(relative))
            except (ValueError, SyntaxError) as exc:
                # Parser diagnostics can quote source values: keep them redacted.
                groups["text and syntax"].append(f"{relative}: invalid {path.suffix} syntax ({type(exc).__name__})")
        if path.suffix == ".md":
            groups["Markdown links"].extend(markdown_findings(root, path, text))
        if path.parent == root / ".github" / "workflows" and path.suffix in {".yml", ".yaml"}:
            for match in re.finditer(r"^\s*-?\s*uses:\s*['\"]?([^\s'\"#]+)", text, re.M):
                action = match.group(1)
                pinned = re.fullmatch(r"[^@]+@[a-f0-9]{40}", action)
                local = action.startswith("./")
                docker = re.fullmatch(r"docker://.+@sha256:[a-f0-9]{64}", action)
                if not (pinned or local or docker):
                    groups["security"].append(f"{relative}: action must be pinned to an immutable digest")
    _, setup_errors = validate(root)
    groups["setup contract"] = setup_errors
    return groups


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--project", action="store_true", help="also require setup and run application checks")
    args = parser.parse_args()
    root = args.root.resolve()
    failed = []
    for name, errors in foundation(root).items():
        print(("FAIL: " if errors else "PASS: ") + name, flush=True)
        for error in errors:
            print("  " + error, flush=True)
        if errors:
            failed.append(name)
    print("RUN: foundation regression tests", flush=True)
    try:
        tests = subprocess.run(
            [sys.executable, "-B", "-m", "unittest", "discover", "-s", "tests/foundation", "-v"],
            cwd=ROOT, timeout=120,
        )
        if tests.returncode:
            failed.append("foundation regression tests")
    except (OSError, subprocess.TimeoutExpired):
        failed.append("foundation regression tests")
    if args.project:
        if run(root, "verify"):
            failed.append("application verification")
    else:
        print("Application verification: NOT RUN. Use --project after setup.", flush=True)
    print("Foundation checks: " + ("FAILED" if failed else "PASSED"), flush=True)
    if failed:
        print("Failed gates: " + ", ".join(failed), file=sys.stderr)
    return int(bool(failed))


if __name__ == "__main__":
    sys.exit(main())
