# Engineering workflow retrofit — 14 November 2026

## Outcome and preserved scope

Installed a repository-local engineering workflow around the existing POC. No
application TypeScript, HTML, SVG, styles, ThingsBoard APIs or backend contracts
were edited. No existing tests were removed. No UI framework or application
package was upgraded. Comparison with the pre-retrofit lockfile found **zero
existing package version changes and zero previously locked package removals**.
Only pinned development tools and their supporting packages were added.

Initialized local Git on `main`. Nothing is staged or committed and no remote is
configured. All existing files appear untracked until the user authorizes an
initial commit. No push, deployment or real-equipment operation was performed.

## Baseline findings

See [the read-only audit](baseline-2026-11-14.md). The original 86 tests, typecheck
and production build passed. Seven files had formatting differences. There was no
Git/CI/ESLint/browser smoke configuration. Initial bundle warning was 39.24 KB
over the 1 MB warning budget, below the unchanged 2 MB error budget.

## Files created or modified

- Root guidance/runtime: `AGENTS.md`, `.nvmrc`, `.node-version`, `.gitattributes`;
  updated `.gitignore`, `README.md`, `package.json` and `package-lock.json`.
- Architecture: `docs/architecture/overview.md`, `editor-runtime.md`,
  `thingsboard-integration.md`, `security-boundaries.md`.
- Engineering: `docs/engineering/standards.md`, `quality-gates.md`,
  `technical-debt.md`, baseline and this report.
- Skills: `.agents/skills/angular-review/`, `svg-editor-review/`,
  `feature-delivery/`, each with `SKILL.md` and `agents/openai.yaml`.
- Quality setup: `eslint.config.mjs`, `tsconfig.tooling.json`,
  `playwright.config.ts`, `playwright.performance.config.ts`.
- Executable tooling: `scripts/engineering/verify.mjs`, `smoke-server.mjs`,
  `postgres-tests.mjs`, `benchmark.ts`.
- Regressions: `tests/session-regression.test.ts`,
  `tests/gateway-regression.test.ts`, `tests/support/isolated-gateway.ts`,
  `tests/smoke/editor.spec.ts`, `tests/postgres/repository.test.ts`,
  `tests/performance/telemetry.spec.ts`.
- CI: `.github/workflows/verify.yml`, with quality, PostgreSQL and benchmark jobs;
  official GitHub Actions are pinned to resolved immutable revisions.

ESLint 10.15.0, @eslint/js 10.0.1, typescript-eslint 8.72.2 and Playwright Test
1.65.0 are pinned development dependencies. Node is pinned to 22.22.3. The new
explicit editor typecheck uses a repository root directory so shared packages are
included; no type errors are suppressed and compiler strictness is unchanged.

## Rules and workflows

The concise AGENTS entry point routes to detailed guidance only when relevant.
Requirements/acceptance criteria, scoped patches, domain and browser regressions,
security/history boundaries, actual verification evidence and independent review
handoff are now documented. Baseline debt must remain visible; rules, budgets and
existing tests must not be weakened to obtain a successful exit.

Three focused skills were created using the installed skill initializer and passed
its validator. Their triggers distinguish Angular review, SVG/editor review and
feature delivery. No production access, commit or deployment permission is granted
by a skill. A separate independent human/agent review of this retrofit has **not**
run and remains pending; local review is not represented as independent review.

## Verification actually executed

| Check                      | Result                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`        | Passed gateway, full editor, tests and tooling                                                              |
| `npm test`                 | **94 passed**, 0 failed/cancelled/skipped; includes all original 86                                         |
| `npm run build`            | Passed; original 39.24 KB bundle warning remains                                                            |
| `npm run test:smoke`       | **3 passed** against isolated production build                                                              |
| `npm run test:postgres`    | **2 passed** against an owned temporary loopback PostgreSQL 17 runtime                                      |
| `npm run test:performance` | **1 passed**, 50 tags / 20 batches / 1000 synthetic values; node identity preserved and stale state checked |
| `npm run benchmark`        | Completed deterministic 500-widget workloads; timings captured as evidence, not an SLA                      |
| `npm run lint`             | **Fails with 16 existing errors**, 0 warnings; no new workflow lint errors                                  |
| `npm run format:check`     | **Fails in the same 7 baseline files**                                                                      |
| `npm run verify`           | **Exit 1 as intended**: all gates executed; lint/format failures preserved                                  |
| Lockfile dry-run           | `npm ci --dry-run --ignore-scripts` passed; not a complete fresh-install runtime test                       |
| Skill validation           | All three passed the installed creator validator                                                            |
| CI static validation       | YAML parsed; read-only permissions, three jobs and immutable action revisions checked                       |
| Remote CI                  | Not executed: no authorized push/remote exists                                                              |

The database suite exercised competing writes across repository instances,
revision conflict, transaction rollback, owner isolation and persisted release
recovery. Its temporary runtime was installed outside the repository, stopped
when tests completed and did not modify system services or existing databases.
Guard checks refused missing URLs, remote hosts, non-test database names and URL
options before opening a connection. This is not a backup/restore or process-crash
recovery certification.

The synthetic browser workload observed a 27.69 ms burst-to-visible result on this
machine in one measured run. That result is not a stable performance budget,
representative network soak, FPS measurement or live ThingsBoard validation. Domain
benchmark fixture has 500 widgets; recorded samples are under
`artifacts/benchmarks/`. The static browser server owns port 4300, refuses API/WS
proxying, and tests block non-test requests. The developer editor at port 4200
was neither reused nor stopped.

Per-gate logs and machine-readable results are generated under
`artifacts/verification/`; browser failure traces/screenshots and benchmark evidence
are generated under ignored artifact directories. CI uploads evidence even after
failure. No production credentials are required.

## Remaining debt and next priorities

1. Independently review this retrofit and authorize an initial commit/remote/CI run
   when ready. CI should currently fail on the documented lint and formatting debt.
2. Fix the 16 existing lint findings in small behavior-preserving changes. Handle
   the 7 formatting files separately. Do not suppress rules or rewrite the shell.
3. Add versioned ThingsBoard 4.4 payload fixtures and real-installation evaluation
   only in an explicitly approved non-production environment.
4. Extend browser protection to pipe/signal connection gestures, pinned bends,
   crossings, equal-spacing feedback, published/draft mode boundaries and accessibility.
5. Define multi-user grants, durable command/session semantics and operational
   TLS/audit/backup requirements before equipment-facing use.
6. Extend PostgreSQL testing to migrations, backup/restore, process interruption and
   supported concurrency topology; characterize sustained telemetry/rendering load
   on agreed hardware before setting performance budgets.

Implementation references used for tooling: the official
[typescript-eslint quickstart](https://typescript-eslint.io/getting-started/),
[Playwright web-server configuration](https://playwright.dev/docs/test-webserver),
and [WebSocket mocking API](https://playwright.dev/docs/api/class-websocketroute).
