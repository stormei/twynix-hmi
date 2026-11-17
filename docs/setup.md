# Engineering foundation adoption

## Source and scope

This existing project selectively adopts
[stormei/project-boilerplate](https://github.com/stormei/project-boilerplate) at
commit `906da1b4e93a38c18b3ee1e5b936db76e94a55b0` (foundation 1.1.0, unreleased),
on 2026-11-17. [foundation.json](../foundation.json) records the exact adopted
source commit in `release_commit`, following the template's provenance convention;
this is not a Twynix product release or a claim that the upstream commit was tagged.
The upstream reviewed base remains recorded separately.

The older local `project-template/` draft is preserved as pre-existing work, but
is not the active configuration. [AGENTS.md](../AGENTS.md), the existing delivery
standards and [project.json](../project.json) configure this project. Existing
application code, saved documents, dependencies, UI styling, tests and budgets are
preserved. The optional UX previews, CSS/Tailwind adapters and their preview-specific
tests are not imported: this application already supplies the HMI design system
used by that profile. No second application or duplicate workflow is introduced.

Acceptance criteria: strict setup uses actual project files and commands; foundation
checks are executable and fail honestly; existing application gates remain intact;
CI includes all existing jobs; source provenance and review limits are explicit;
application behavior and unrelated local edits are preserved.

## Setup contract and commands

[project.json](../project.json) maps the existing npm scripts, lockfile and Node pin
to the foundation's argument-array runner. It is the source of foundation command
selection; `package.json` continues to define the application's npm scripts.
`configured` means setup is complete, not production readiness.

```sh
python3 scripts/validate_setup.py --strict
python3 scripts/run_project.py install
python3 scripts/check.py --project
```

Select Node using `.nvmrc` before install or verification. Foundation tooling works
with Python 3.9+; use a maintained release. CI pins Python via
`.tooling-python-version`. Commands run from the repository root without shell
expansion. Installation is explicit and separate from checks. The application
verification entry points to `npm run verify`, never back to the Python runner.

For documentation-only work, `python3 scripts/check.py` and formatting checks are
proportionate; they explicitly do not run application verification. Implementation
or workflow/command changes need the full project gate. Additional isolated gates
remain as specified in [quality gates](engineering/quality-gates.md).

## Check boundaries

Foundation checks inspect supported text formatting, foundation Python/JSON syntax,
local Markdown file links, immutable action pins, common credential mistakes and
setup structure, then execute isolated foundation regressions. They are not a
comprehensive secret audit, YAML parser or remote-link/anchor validator. See
[security](../SECURITY.md) for the credential and execution boundary.

The full project gate also executes every existing application gate and returns
failure if any fails. Existing failures remain visible; do not weaken checks or
skip files merely to make template adoption pass. CI keeps PostgreSQL and browser
performance jobs and adds one `Required checks` status that depends on all jobs.
Remote branch protection and CI execution are not configured or proved by files.

## Verification record

Verified locally on 2026-11-17 using Node 22.22.3 and Python 3.9.6 (within the
foundation's supported range; CI pins a maintained interpreter separately):

- Strict setup validation passed without executing application commands.
- Foundation checks passed, including text/syntax, local links, security patterns,
  setup contract and all 27 isolated foundation regression tests.
- A clean source export to a new temporary folder excluded Git history, local
  environment files, dependencies, caches and generated output. It included the
  current source and preserved pre-existing uncommitted work.
- `python3 scripts/run_project.py install` performed a successful locked `npm ci`
  in that export. `python3 scripts/check.py --project` passed foundation checks and
  every application gate: typecheck, lint, formatting, 171 Node tests, production
  build and 22 Chromium smoke tests. The browser interactions use isolated
  synthetic services, not real ThingsBoard credentials or equipment.
- Workflow and Dependabot YAML parsed successfully; author review and a separate
  AI review covered execution and failure propagation. The review's provenance
  wording finding was corrected. No human approval is claimed.
- Documentation-only evidence updates received final foundation, format and diff
  checks after the application run; no application code changed in this adoption.

Generated evidence is retained locally under
`artifacts/verification/foundation-adoption/`. Historical smoke evidence in
`project.json` remains dated explicitly and is supplemented by this clean-export
run. No remote CI run is implied.

Existing debt: the unchanged lockfile installation reported seven moderate
vulnerabilities; no automatic dependency fixes or upgrades were run. The unchanged
build budget warns at about 1.03 MB (34.96 kB above its 1 MB warning threshold).
These warnings are not hidden or treated as production approval.

PostgreSQL and performance gates were retained in CI but were not rerun for this
foundation-only integration. Remote CI, branch protection, production operations
and human release approval remain unverified.
Review [repository controls](repository-controls.md) and
[release readiness](release-readiness.md) before any authorized release.
