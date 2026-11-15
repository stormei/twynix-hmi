# Workflow verification — 2026-11-15

Scope: complete the existing engineering setup for both Codex and Claude Code.
Added a Claude entry point, shared daily cycle and roadmap; linked existing
architecture guidance and included Claude instructions in the formatting gate.
No application code, dependencies, schemas or CI jobs were changed by this task.
Existing command-history, feature-documentation and smoke-test working changes
were left intact; checks ran against the full working tree, not an isolated commit.
Git was already initialized on `main` with a GitHub origin; no commit or push ran.

## Checks actually executed

- Node v22.22.3; `npm ci` succeeded using the existing lockfile.
- `npm run verify`: typecheck, lint, format check, 125 Node tests, production
  editor/gateway build and 13 Chromium smoke tests all passed on the final run.
- `git diff --check` passed; workflow diff self-reviewed.
- The first restricted run passed static checks but cancelled 14 Node tests because
  loopback listening was denied, aborted the Angular build and failed browser server
  startup. Rerunning with local-server access passed all gates without changing code.
- PostgreSQL, synthetic benchmark, browser performance and remote CI were not run.
  These remain separate gates; no production credentials or equipment were used.
- The initial implementation received self-review only. The independent follow-up
  review and its verification scope are recorded below; no human review was performed.

## Existing debt

See [the debt register](technical-debt.md). Remaining items include large editor
files, incomplete upstream validation, process-local sessions and command deduplication,
missing role grants, storage recovery UX and production/deployment readiness.
Historical lint/format debt remains resolved; no new failure was suppressed.

For the next feature, define behavior and acceptance criteria, follow the
[shared daily cycle](standards.md), run the relevant checks and inspect the diff.
Obtain independent/human review when required and explicit approval before commit.

## Independent follow-up review

A separate review agent inspected the workflow diff, shared entry points, focused
review instructions, quality gates and CI without editing files or reviewing its
own implementation. It found three inconsistencies, all corrected:

- P2: SVG review instructions incorrectly limited rotation to quarter-turn pipe
  fittings. They now preserve implemented free-angle rotation, `rotationSize`,
  legacy quarter-turn dimensions and the existing nested-group limitation.
- P3: README and roadmap links labelled current architecture led to the historical
  document. They now point directly to `architecture/overview.md`.
- P3: The README verification section omitted the nearby Chromium installation
  prerequisite. The browser installation command now precedes `npm run verify`.

The reviewer independently ran a scoped formatting check and `git diff --check`;
these passed. After the fixes, the same independent reviewer confirmed all three
findings resolved, reported no new actionable findings and reran both checks
successfully. The primary agent also ran the full `npm run format:check`, checked
local Markdown link targets and confirmed existing unrelated edits were unchanged.
The follow-up is documentation/instruction-only; application tests,
production builds, database/performance checks and remote CI were not rerun. The
125 Node and 13 browser test results above belong to the initial implementation run.
Application code and unrelated working changes remain untouched. No commit or push
was performed.
