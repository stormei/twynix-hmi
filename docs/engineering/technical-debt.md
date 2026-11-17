# Technical debt register

Keep baseline debt visible. Fix it in scoped changes with regression coverage;
this retrofit does not authorize application rewrites or rule suppression.

| ID    | Priority | Observed debt                                                                         | Protection / next action                                                               |
| ----- | -------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| TD-01 | P1       | Resolved: 16 baseline ESLint errors corrected without suppressions                    | Keep ESLint recommended rules and zero-warning gate; retain historical baseline report |
| TD-02 | P2       | Resolved: 7 baseline formatting files corrected                                       | Retain read-only formatting gate and historical baseline findings                      |
| TD-03 | P2       | Optional views deferred; current initial bundle ~1.03 MB exceeds 1 MB warning         | Retain unchanged budgets and first-open/cancel/reopen browser coverage                 |
| TD-04 | P1       | TS services extracted (2,421 → 982 component lines); large template/global CSS remain | Keep browser regressions; scope further template/style extraction separately           |
| TD-05 | P1       | Uneven validation of REST/WebSocket upstream payloads                                 | Versioned ThingsBoard fixtures, malformed/denied payload tests                         |
| TD-06 | P1       | Sessions, throttling and command deduplication are process-local                      | Define restart/multi-instance semantics; durable command outcome audit                 |
| TD-07 | P1       | No separate engineering/operator/publisher role grants                                | Define approved authorization model; UI state is not permission                        |
| TD-08 | P1       | PostgreSQL path originally untested; lazy schema creation                             | Isolated transaction/concurrency/recovery tests, then migration plan                   |
| TD-09 | P2       | Intervals/unload listeners lack explicit lifecycle teardown                           | Remount/soak tests before scoped lifecycle fixes                                       |
| TD-10 | P2       | Snapshot cloning/serialization and rendering load not characterized                   | Repeatable benchmarks plus representative browser telemetry soak                       |
| TD-11 | P1       | HTTP/dev-cookie defaults, no deployment package                                       | Explicit TLS/access/session/audit design before operational deployment                 |
| TD-12 | P2       | Historical architecture document has obsolete counts/UX descriptions                  | New architecture pages are current; retain old document as legacy context              |
| TD-13 | P2       | Browser recovery can fail silently when storage is full                               | Test quota failure and add a separately reviewed recovery/backup UX                    |

Foundation adoption (2026-11-17): clean-export locked installation reported **seven
moderate dependency vulnerabilities**. The lockfile and application dependency
versions were unchanged. Triage affected paths and compatible fixes in a separately
scoped dependency change; no automatic audit fix was run. See
[setup evidence](../setup.md).

Before retrofit, Git/CI/lint/browser-test setup were absent. New tooling closes the
workflow gap, not every underlying product risk. Current verification results are
recorded by `artifacts/verification/summary.json`; missing external infrastructure
or skipped optional tests must never be described as successful verification.
