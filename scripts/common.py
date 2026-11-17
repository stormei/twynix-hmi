"""Small, dependency-free helpers shared by the foundation tools."""

import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
IGNORED_DIRECTORIES = {
    ".git", ".venv", "venv", "__pycache__", "node_modules", "dist", "build",
    ".cache", ".pytest_cache", ".mypy_cache", ".ruff_cache", "coverage", "htmlcov",
}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key: " + key)
        result[key] = value
    return result


def load_json(path):
    def reject_constant(value):
        raise ValueError("non-finite JSON value: " + value)

    return json.loads(
        path.read_text(encoding="utf-8"),
        object_pairs_hook=unique_object,
        parse_constant=reject_constant,
    )


def local_file(root, value):
    """Accept only an existing file inside the project, including symlink targets."""
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        return None
    try:
        path = (root / value).resolve()
        path.relative_to(root.resolve())
        return path if path.is_file() else None
    except (OSError, ValueError, RuntimeError):
        return None


def repository_files(root):
    """Include tracked files even if ignored, plus non-ignored new files."""
    try:
        top = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"], cwd=root,
            capture_output=True, text=True, timeout=10, check=True,
        )
        if Path(top.stdout.strip()).resolve() != root.resolve():
            raise ValueError("not the root of a Git working tree")
        result = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=root, capture_output=True, timeout=10, check=True,
        )
        names = {os.fsdecode(name) for name in result.stdout.split(b"\0") if name}
        return sorted(root / name for name in names if (root / name).exists())
    except (OSError, ValueError, subprocess.SubprocessError):
        # ZIP exports have no Git ignore engine. Never follow directory symlinks.
        paths = []
        for directory, dirs, files in os.walk(root, followlinks=False):
            dirs[:] = sorted(d for d in dirs if d not in IGNORED_DIRECTORIES)
            for name in sorted(files):
                if name in {".DS_Store", "Thumbs.db"} or name.endswith((".log", ".pyc")):
                    continue
                paths.append(Path(directory) / name)
        return sorted(paths)
