# Engineering and delivery standards

Preserve the existing POC. A task is scoped by written requirements and observable
acceptance criteria, not by an opportunity to redesign nearby code. Keep application
frameworks, dependency versions, schemas and backend contracts stable unless the
user explicitly authorizes the corresponding change.

Before editing, identify the affected document fields, runtime/editor modes,
authorization boundary and history transaction. Choose the smallest useful change.
Keep browser presentation in Angular, domain invariants in shared TypeScript and
ThingsBoard credentials/authorization in the gateway. Prefer named types and
validation at transport boundaries to unchecked casts. Avoid broad formatting or
refactoring in a feature patch.

A new dashboard widget belongs in its own component folder and registry entry.
Read the dashboard guide for inputs/configuration. Geometry code should use target
pixels and shared transforms; avoid independent offsets or transforms in templates.
Do not mutate the document merely to show a hover or drag preview.

Add regression tests that exercise changed behavior or invariants. Use real store
operations where history/serialization matters. UI gestures require browser checks;
mathematical unit tests alone do not prove the pointer/rendering path. Keep failures
as evidence rather than deleting tests, adding unconditional skips, weakening rules
or increasing budgets. Run appropriate focused checks, then the aggregate gate.

Request an independent review of meaningful changes before merge. Supply requirements,
changed files and test evidence without coaching the reviewer to a preferred result.
If no separate reviewer has actually run, record review as pending, not complete.
Do not create another user chat or claim an independent review based on self-review.

Delivery notes state the behavior changed, checks actually executed, baseline versus
new failures, untested paths and material risks. Commit/push/deployment remain separate
explicitly authorized actions. No workflow or skill grants production access.
