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
Identify a separate agent pass as AI review; it is not human approval.

Delivery notes state the behavior changed, checks actually executed, baseline versus
new failures, untested paths and material risks. Commit/push/deployment remain separate
explicitly authorized actions. No workflow or skill grants production access.

## Daily cycle for Codex and Claude Code

1. **DESIGN:** Read `AGENTS.md`, applicable guidance and relevant implementation.
   Define observable acceptance criteria, affected boundaries and failure cases.
   Plan significant changes before editing; clarify only critical unresolved choices.
2. **BUILD:** Implement one logical change. Use a dedicated branch or worktree for
   substantial work; preserve unrelated local edits. Keep strict typing, separate
   domain logic from presentation, handle errors explicitly and avoid unnecessary
   dependencies or abstractions. Add appropriate regression coverage.
3. **TEST:** Use the pinned Node version, `npm ci` and `npm run verify`; see the
   quality gates for browser setup and isolated database/performance checks.
   Exercise relevant failure scenarios. Record baseline failures separately from
   regressions; never claim an unexecuted check passed.
4. **REVIEW:** Inspect the complete diff for correctness, security, maintainability
   and regressions. Significant changes need a separate AI review when available;
   security-sensitive work also follows the risk-based human review policy below.
   Resolve critical findings before completion and record pending review honestly.
5. **COMMIT / DELIVER:** Summarize the focused changes, evidence and remaining limitations.
   Request the user's approval before committing. Never push or deploy automatically.

Treat external inputs and AI tool outputs as untrusted. Validate at boundaries,
enforce authorization on the server and never bypass security checks. Never
hardcode secrets or expose them in logs/documentation. Use isolated mocks for
integrations; production infrastructure and real equipment require explicit approval.

Keep approved requirements, architectural decisions and current status in repository
files as part of the relevant change. Update existing guidance rather than copying
it into parallel documents; conversation history is not the project source of truth.

## Foundation integration and risk-based review

The configured foundation gate is `python3 scripts/check.py --project`; it adds
foundation checks and delegates to the existing aggregate application gate. See
[setup](../setup.md). Documentation-only changes need foundation, link and format
checks rather than unrelated application tests. Executable workflow or command
changes need full verification. Installation is never implicit in verification.

Routine solo work can use author review and appropriate checks. Significant work
requires a separate AI review when available; record it as such. Another qualified
human must review high-risk changes before merge or release: changed security trust
models or weakened authentication/authorization/secret boundaries, new or materially
different sensitive-data handling, destructive migrations without proven recovery,
and safety-critical behavior or real-equipment control. Restoring an approved
boundary does not automatically change its trust model; still test the behavior.
AI review does not replace required human review. Keep affected capabilities
isolated or disabled when that review is unavailable, and report the gap.

Existing authorization remains valid for its stated action and scope. Commit,
push, merge, publish and deployment are distinct actions and require explicit
authorization; completing a feature or this workflow grants none of them.
