---
name: angular-review
description: Review Twynix Angular changes for component boundaries, signals, TypeScript safety, lifecycle, error handling and maintainability. Use for an Angular review request or a consequential editor/service change; not for unrelated domain-only edits.
---

# Angular review

Read repository AGENTS.md and only the architecture pages relevant to the changed
boundary. Review the diff and its callers before proposing fixes. Do not turn a
review into a shell rewrite or dependency migration.

Trace signal inputs/computed/effects through the editor, store and widget host.
Check accidental tracked dependencies, stale async results, repeated component
loading, timer/subscription/worker teardown and change-detection cost. In RxJS code,
check ownership, error paths and subscription disposal. Check transport validation,
nullable/unknown values and conservative data-quality fallbacks rather than relying
on compile-time casts. Distinguish current code defects from future-scale risks.

For shared runtime changes, read the
[editor/runtime boundaries](../../../docs/architecture/editor-runtime.md). Check
transitive dependencies exclude the editor store and authoring shell, provider
scope matches ownership, and published snapshots stay detached from drafts.
Check mode/screen transitions and destruction invalidate late script, command and
subscription work. Do not assume application-level transport/Worker providers
support concurrent independent runtime hosts.

For scripting changes, read the
[scripting design](../../../docs/features/widget-scripting.md) and
[security boundaries](../../../docs/architecture/security-boundaries.md). Check
bounded Worker dispatch/queues, watchdog reset and recovery, obsolete-result
rejection, and interpreter capability/output restrictions. Preserve legacy effects
versus opt-in appearance behavior. Use the relevant scripting-security,
Worker-client and browser recovery regressions; teardown alone is insufficient.

Inspect both template events and TypeScript handlers. Confirm Design/Preview/Runtime,
locked selections, history checkpoints and saved configuration remain consistent.
For dashboard changes read docs/dashboard-components.md and follow its input and
registry contracts. Changes to host capabilities also need security-boundary review.

For changed controls and dialogs, check keyboard operation, accessible labels,
focus entry/restoration and visible loading/error states. Passing smoke tests does
not establish accessibility coverage.

Run focused regressions and relevant gates from docs/engineering/quality-gates.md.
Report actionable findings with file/line, trigger, effect and evidence; separate
baseline lint debt, untested concerns and verified regressions. If no findings are
supported, say so and list residual testing gaps. Do not claim independent review
when reviewing your own implementation.
