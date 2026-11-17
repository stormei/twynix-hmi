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
5. Build a separate operator viewer shell on the extracted shared runtime services,
   with authorized published releases, visible telemetry quality, session recovery
   and guarded command feedback. Define its operator acceptance criteria before
   implementation. Further authoring modularization, nested hierarchies and
   historical analytics remain separately scoped.

## Known debt and evidence

Use the [technical debt register](engineering/technical-debt.md) for tracked items:
large editor files, upstream validation gaps, process-local sessions/deduplication,
missing role grants, storage recovery UX and unproven operational readiness.
Historical lint/format issues are recorded as resolved; fresh check results take
precedence over old reports. Run `npm run verify` and read
`artifacts/verification/summary.json`; missing checks are not passing checks.

## Widget scripting

See the approved [widget scripting design](features/widget-scripting.md) for the
JavaScript/QuickJS direction, phases, acceptance criteria and implementation limits.
Phase 1 introduced a backward-compatible configuration and named telemetry inputs.
Phase 2 adds opt-in validated text/color appearance results, ownership checks,
baseline fallback, bounded scheduling and console diagnostics. Legacy scripts remain
on the effects API. Phase 3 adds runtime position/rotation with aligned ports and
connections. Phase 4 adds the behavior editor, live ThingsBoard input configuration,
isolated simulation and versioned copy-in templates. Phase 5 adds bounded Worker dispatch, hardened interpreter boundaries, failure
recovery and synthetic sustained-load evidence. Production human security review,
real ThingsBoard soak and hardware-specific capacity approval remain; see the design
for measured limits.

## Editor service extraction

The editor now delegates workspace/session workflows, canvas gestures, telemetry
bindings, behavior execution, actions, viewport and feedback to focused services.
Shared runtime services cannot import the editor store or authoring components;
regressions protect that boundary and draft/published separation. Connection
presentation is shared with the future viewer. See
[editor/runtime](architecture/editor-runtime.md) for the approved boundaries,
acceptance criteria, operator defaults and current single-host limitation.
