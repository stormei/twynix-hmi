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

Inspect both template events and TypeScript handlers. Confirm Design/Preview/Runtime,
locked selections, history checkpoints and saved configuration remain consistent.
For dashboard changes read docs/dashboard-components.md and follow its input and
registry contracts. Changes to host capabilities also need security-boundary review.

Run focused regressions and relevant gates from docs/engineering/quality-gates.md.
Report actionable findings with file/line, trigger, effect and evidence; separate
baseline lint debt, untested concerns and verified regressions. If no findings are
supported, say so and list residual testing gaps. Do not claim independent review
when reviewing your own implementation.
