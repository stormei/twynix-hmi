# Project status and roadmap

## Current status

An established, working HMI proof of concept with technical debt. It has an Angular
editor, NestJS gateway, shared TypeScript domain packages and a configured GitHub
Actions workflow. This is not yet a production industrial control system.

Implemented capabilities include SVG screen editing, selection/history, geometry and
connections, reusable components, property bindings, dashboard widgets, bounded
scripts, mocked command preview, authenticated telemetry/alarms, private drafts,
immutable publication and guarded runtime RPC. See the [README](../README.md) and
[current architecture](architecture/overview.md) for actual behavior and limits.

## MVP acceptance boundary

Preserve screen design/import/export and undo/redo, validated document compatibility,
Preview command simulation, authenticated data access, owner-isolated revisioned
saves and immutable runtime releases. Keep secrets in the gateway and resolve live
commands from published configuration. These describe the existing working slice;
additional product scope requires explicit requirements and acceptance criteria.

## Next priorities requiring scoped requirements

1. Keep verification green and protect editor/runtime behavior with regression tests.
2. Define engineering/operator/publisher permissions, team grants and durable session
   and command audit semantics before multi-user operational use.
3. Strengthen malformed upstream payload coverage and test representative network
   recovery and sustained telemetry loads.
4. Plan PostgreSQL migrations, backup/recovery and deployment hardening using
   isolated environments before any approved production rollout.
5. Scope further editor modularization, nested hierarchies or historical analytics
   separately; this workflow task does not authorize their implementation.

## Known debt and evidence

Use the [technical debt register](engineering/technical-debt.md) for tracked items:
large editor files, upstream validation gaps, process-local sessions/deduplication,
missing role grants, storage recovery UX and unproven operational readiness.
Historical lint/format issues are recorded as resolved; fresh check results take
precedence over old reports. Run `npm run verify` and read
`artifacts/verification/summary.json`; missing checks are not passing checks.
