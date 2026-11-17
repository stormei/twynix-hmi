"""Behavioral regressions for bootstrap, failure propagation, and safeguards."""

import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from check import foundation, markdown_findings, secret_findings
from common import ROOT, load_json, repository_files
from run_project import execute, run
from validate_setup import validate


class ProjectFixture(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.data = {
            "schema_version": 1, "state": "configured", "name": "Fixture application",
            "purpose": "Exercise an isolated application setup.", "runtimes": [],
            "dependencies": {"mode": "none", "manifests": [], "lockfiles": []},
            "commands": {"install": [], "dev": [], "verify": []},
            "documents": {"product": "docs/product.md", "architecture": "docs/architecture.md",
                          "operations": "docs/operations.md"},
            "smoke_test": {"instructions": "", "evidence": ""},
        }
        self.data["runtimes"] = [{"name": "python", "version": "3.13.18", "file": ".runtime-version"}]
        self.write(".runtime-version", "3.13.18\n")
        self.write("main.py", "print('fixture app')\n")
        self.write("verify.py", "from pathlib import Path\nassert Path('main.py').exists()\n")
        self.data["commands"]["dev"] = [sys.executable, "main.py"]
        self.data["commands"]["verify"] = [{
            "name": "Application smoke test", "argv": [sys.executable, "verify.py"], "timeout_seconds": 10,
        }]
        for value in self.data["documents"].values():
            self.write(value, "# Fixture\n\nA completed project document.\n")
        self.data["smoke_test"] = {
            "instructions": "Run main.py and observe the greeting.",
            "evidence": "Fixture interaction exercised in the isolated bootstrap test.",
        }
        self.save()

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def save(self):
        self.write("project.json", json.dumps(self.data, indent=2) + "\n")

    def quiet_run(self, action="verify"):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return run(self.root, action)


class SetupTests(ProjectFixture):
    def test_shipped_template_is_honestly_incomplete(self):
        self.data["state"] = "template"
        self.data["name"] = ""
        self.data["purpose"] = ""
        self.data["runtimes"] = []
        self.data["commands"] = {"install": [], "dev": [], "verify": []}
        self.data["smoke_test"] = {"instructions": "", "evidence": ""}
        self.write("docs/product.md", "<!-- SETUP_REQUIRED -->\n")
        self.save()
        data, errors = validate(self.root)
        self.assertEqual(errors, [])
        self.assertEqual(data["state"], "template")
        self.assertTrue(validate(self.root, strict=True)[1])

    def test_clean_project_installs_and_runs_without_dependencies(self):
        self.assertEqual(validate(self.root, strict=True)[1], [])
        self.assertEqual(self.quiet_run("install"), 0)
        self.assertEqual(self.quiet_run(), 0)
        self.assertEqual(foundation(self.root), {
            "text and syntax": [], "Markdown links": [], "security": [], "setup contract": [],
        })

    def test_missing_lockfile_blocks_execution(self):
        self.data["dependencies"] = {
            "mode": "locked", "manifests": ["requirements.txt"], "lockfiles": ["missing.lock"],
        }
        self.write("requirements.txt", "# fixture\n")
        self.data["commands"]["install"] = [sys.executable, "-c", "raise SystemExit(0)"]
        self.save()
        self.assertTrue(validate(self.root)[1])
        self.assertEqual(self.quiet_run(), 1)

    def test_locked_dependencies_install_from_repository_root(self):
        self.write("deps.json", "{}\n")
        self.write("deps.lock", "fixture-lock\n")
        self.data["dependencies"] = {
            "mode": "locked", "manifests": ["deps.json"], "lockfiles": ["deps.lock"],
        }
        self.data["commands"]["install"] = [
            sys.executable, "-c", "from pathlib import Path; Path('installed').write_text('ok')",
        ]
        self.save()
        self.assertEqual(self.quiet_run("install"), 0)
        self.assertTrue((self.root / "installed").exists())

    def test_unresolved_documents_and_smoke_evidence_block_setup(self):
        self.write("docs/product.md", "<!-- SETUP_REQUIRED -->\n")
        self.data["smoke_test"]["evidence"] = "TBD"
        self.save()
        errors = validate(self.root)[1]
        self.assertTrue(any("documents.product" in e for e in errors))
        self.assertTrue(any("smoke_test.evidence" in e for e in errors))

    def test_real_product_names_and_markdown_evidence_are_allowed(self):
        self.data["name"] = "Todo application"
        self.data["smoke_test"] = {
            "instructions": "Run [the smoke test](docs/smoke.md).",
            "evidence": "Passed [CI run](https://example.com/run/1).",
        }
        self.save()
        self.assertEqual(validate(self.root, strict=True)[1], [])

    def test_runtime_range_and_mismatched_pin_are_rejected(self):
        for version in ("3.13", "latest", "3.13.1"):
            with self.subTest(version=version):
                self.data["runtimes"][0]["version"] = version
                self.save()
                self.assertTrue(validate(self.root)[1])

    def test_malformed_configuration_returns_errors_not_tracebacks(self):
        for key, value in (("state", []), ("commands", None), ("runtimes", [None]),
                           ("documents", []), ("smoke_test", 1), ("schema_version", True)):
            with self.subTest(key=key):
                original = self.data[key]
                self.data[key] = value
                self.save()
                self.assertTrue(validate(self.root)[1])
                self.data[key] = original

    def test_unknown_field_duplicate_keys_and_nonfinite_json_are_rejected(self):
        self.data["commmands"] = {}
        self.save()
        self.assertTrue(validate(self.root)[1])
        for text in ('{"state": "template", "state": "configured"}', '{"schema_version": NaN}'):
            self.write("project.json", text)
            self.assertTrue(validate(self.root)[1])

    def test_paths_cannot_escape_project(self):
        self.data["documents"]["product"] = "../outside.md"
        self.save()
        self.assertTrue(validate(self.root)[1])

    def test_malformed_paths_are_reported_without_tracebacks(self):
        self.data["documents"]["product"] = "invalid\x00path.md"
        self.save()
        self.assertTrue(validate(self.root)[1])

    @unittest.skipUnless(os.name == "posix", "symlink setup requires POSIX")
    def test_symlink_loop_is_reported_without_traceback(self):
        (self.root / "loop.md").symlink_to("loop.md")
        self.data["documents"]["product"] = "loop.md"
        self.save()
        self.assertTrue(validate(self.root)[1])

    @unittest.skipUnless(os.name == "posix", "symlink setup requires POSIX")
    def test_symlink_cannot_bypass_path_boundary(self):
        with tempfile.TemporaryDirectory() as external:
            destination = Path(external) / "external.md"
            destination.write_text("outside\n")
            (self.root / "escape.md").symlink_to(destination)
            self.data["documents"]["product"] = "escape.md"
            self.save()
            self.assertTrue(validate(self.root)[1])
            self.assertTrue(foundation(self.root)["security"])


class RunnerTests(ProjectFixture):
    def test_failure_is_preserved_and_later_checks_still_run(self):
        self.data["commands"]["verify"] = [
            {"name": "Fail first", "argv": [sys.executable, "-c", "raise SystemExit(7)"], "timeout_seconds": 5},
            {"name": "Run later", "argv": [sys.executable, "-c", "from pathlib import Path; Path('later').touch()"],
             "timeout_seconds": 5},
        ]
        self.save()
        self.assertEqual(self.quiet_run(), 1)
        self.assertTrue((self.root / "later").exists())

    def test_missing_executable_is_a_failure(self):
        self.data["commands"]["verify"][0]["argv"] = ["no-such-foundation-executable"]
        self.save()
        self.assertEqual(self.quiet_run(), 1)

    def test_shell_metacharacters_are_literal_arguments(self):
        payload = "$(touch injected); & | >"
        self.assertEqual(execute([
            sys.executable, "-c", "import sys; from pathlib import Path; Path('literal').write_text(sys.argv[1])", payload,
        ], self.root, 5), 0)
        self.assertEqual((self.root / "literal").read_text(), payload)
        self.assertFalse((self.root / "injected").exists())

    def test_timeout_is_a_failure(self):
        start = time.monotonic()
        with contextlib.redirect_stdout(io.StringIO()):
            result = execute([sys.executable, "-c", "import time; time.sleep(20)"], self.root, 0.1)
        self.assertEqual(result, 1)
        self.assertLess(time.monotonic() - start, 5)

    def test_invalid_project_never_executes_commands(self):
        self.data["state"] = "template"
        self.data["commands"]["verify"][0]["argv"] = [
            sys.executable, "-c", "from pathlib import Path; Path('should-not-exist').touch()",
        ]
        self.save()
        self.assertEqual(self.quiet_run(), 1)
        self.assertFalse((self.root / "should-not-exist").exists())


class SafeguardTests(ProjectFixture):
    def test_known_tokens_and_private_keys_are_redacted(self):
        values = ["ghp_" + "a" * 40, "AKIA" + "A" * 16,
                  "sk-proj-" + "a" * 48, "-----BEGIN " + "PRIVATE KEY-----"]
        for value in values:
            with self.subTest(kind=value[:4]):
                findings = secret_findings(Path("fixture.txt"), value)
                self.assertTrue(findings)
                self.assertNotIn(value, "\n".join(findings))

    def test_literal_credentials_rejected_but_safe_examples_allowed(self):
        self.assertTrue(secret_findings(Path(".env.example"), 'API_KEY=example-value'))
        for value in ('PASSWORD="example-value"', '"api_key": "example-value"'):
            self.assertTrue(secret_findings(Path("fixture.py"), value))
        for value in ('API_KEY=', 'API_KEY=""', "PASSWORD=''", 'API_KEY=<SET_LOCALLY>',
                      'API_KEY=${LOCAL_VALUE}', '"api_key": null'):
            self.assertEqual(secret_findings(Path(".env.example"), value), [])

    def test_credential_accessors_are_not_literal_credentials(self):
        for value in ('api_key = os.getenv("API_KEY")', 'password = models.CharField(max_length=100)',
                      'password = request.form["password"]', '"api_key": process.env.API_KEY,'):
            self.assertEqual(secret_findings(Path("application.py"), value), [])

    def test_markdown_local_reference_and_encoded_links(self):
        path = self.write("guide.md", "# Guide\n")
        self.write("file with spaces.md", "# File\n")
        self.assertEqual(markdown_findings(self.root, path, '[ok](file%20with%20spaces.md)\n'), [])
        self.assertTrue(markdown_findings(self.root, path, '[bad](missing.md)\n'))
        self.assertTrue(markdown_findings(self.root, path, '[ref]: missing.md\n'))
        self.assertTrue(markdown_findings(self.root, path, '[bad](../outside.md)\n'))
        self.assertEqual(markdown_findings(self.root, path, '```md\n[example](missing.md)\n```\n'), [])
        self.assertTrue(markdown_findings(self.root, path, '```text\nunclosed\n'))

    def test_text_json_and_python_errors_fail_checks(self):
        self.write("foundation.json", '{"a": 1, "a": 2}\n')
        self.write("scripts/common.py", "def broken(\n")
        self.write("bad.md", "trailing space \n")
        findings = foundation(self.root)["text and syntax"]
        self.assertEqual(len(findings), 3)

    def test_application_syntax_is_owned_by_application_gates(self):
        self.write("tsconfig.json", '{\n  // JSONC is valid for this application tool\n  "compilerOptions": {},\n}\n')
        self.write("main.py", "type Alias = int\n")
        self.assertEqual(foundation(self.root)["text and syntax"], [])

    def test_mutable_action_reference_is_rejected(self):
        self.write(".github/workflows/bad.yml", "steps:\n  - uses: actions/checkout@main\n")
        self.assertTrue(any("immutable" in e for e in foundation(self.root)["security"]))

    def test_zip_export_flags_credential_files(self):
        self.write(".env", "# local configuration\n")
        self.assertTrue(any("credential file" in e for e in foundation(self.root)["security"]))

    def test_git_scan_includes_ignored_but_tracked_credentials(self):
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.write(".gitignore", ".env\nignored.txt\n")
        self.write(".env", "# synthetic fixture\n")
        self.write("ignored.txt", "ignored\n")
        subprocess.run(["git", "add", "-f", ".env"], cwd=self.root, check=True)
        names = {p.name for p in repository_files(self.root)}
        self.assertIn(".env", names)
        self.assertNotIn("ignored.txt", names)
        self.assertTrue(any("credential file" in e for e in foundation(self.root)["security"]))


if __name__ == "__main__":
    unittest.main()
