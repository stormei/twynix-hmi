# Repeatable quality gates

Use Node **22.22.3** from `.nvmrc` / `.node-version`, then `npm ci` using the existing
lockfile. Existing application dependency versions remain unchanged; pinned ESLint
and Playwright tools were added as development dependencies. Install the pinned
browser with `npx playwright install chromium` (CI uses `--with-deps`).

`npm run verify` executes every gate sequentially and exits nonzero if any failed:

| Gate           | Scope                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `typecheck`    | Gateway, full editor, existing tests and new tooling/tests; explicit repository root includes shared packages |
| `lint`         | ESLint and typescript-eslint recommended rules; no baseline suppression or warning allowance                  |
| `format:check` | Read-only Prettier check; baseline differences remain failures                                                |
| `test`         | Existing Node tests plus isolated regression additions; no test removed                                       |
| `build`        | Existing Angular production build and gateway compilation; budgets unchanged                                  |
| `test:smoke`   | Chromium against a separate static production build at loopback port 4300                                     |

The runner writes logs and `summary.json` under `artifacts/verification`. It runs
later gates even after failure, but does not return a false successful result.
The original lint/format debt has been corrected without rule suppression. Any new
lint or formatting failure still fails verification and CI. Build size
warnings remain warnings under the original budget, not silently promoted or hidden.

## Isolation

Node gateway integration tests start an ephemeral loopback ThingsBoard fake and a
separate gateway process. Test storage is temporary and PostgreSQL is explicitly
disabled. Fake RPC is safe only inside this harness. Never point tests to the
ThingsBoard LAN URL or production device IDs. No `.env` credentials are required.

Browser smoke tests own port 4300 (`reuseExistingServer: false`), serve only the
production files and stub API responses as signed out. No API/WS proxy runs there.
Browser routing blocks non-test HTTP requests; each context has isolated storage.
Tests cover library state, ghost movement, zoom/resize/undo and independent dashboard
settings/HTML isolation. They do not substitute for all visual or accessibility tests.

## PostgreSQL gate

`npm run test:postgres` fails closed when infrastructure is missing; it never
reports a skip as a pass. Supply `TWYNIX_TEST_DATABASE_URL` only for a disposable
loopback database whose name starts `twynix_test_`, without URL options. Example:

```sh
TWYNIX_TEST_DATABASE_URL=postgres://test:test@127.0.0.1:5432/twynix_test_local npm run test:postgres
```

The tests create and remove a uniquely named schema in that disposable database.
They exercise competing saves across repository instances, conflicts, rollback,
owner isolation and persisted release recovery. They do not prove crash durability,
backup recovery, migrations or multi-process operational readiness. CI provisions a
fresh PostgreSQL service; do not use an existing project database. This separate
required CI job avoids making local `verify` depend on Docker or a real database.

## Performance evidence

`npm run benchmark` records synthetic 500-widget schema, snapshot, movement and
guide timings. `npm run test:performance` runs a synthetic browser telemetry burst
on the isolated static server after `npm run build`. Results are in
`artifacts/benchmarks`. Timing is evidence, not a machine-independent SLA. The
short synthetic burst is not a sustained ThingsBoard/network soak or hard-real-time
control guarantee. Establish hardware-specific baselines before imposing budgets.

## CI and review

`.github/workflows/verify.yml` uses pinned Node and `npm ci`, runs quality,
PostgreSQL and benchmark jobs, preserves artifacts on failure, requests read-only
repository permissions and has no deployment steps or production secrets. Creating
the workflow does not execute remote CI. No commit/push is part of this retrofit.
Independent review remains a separate handoff; local self-review is not independent.
