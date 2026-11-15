# Twynix engineering entry point

This is an existing Angular HMI editor, not a greenfield application. Preserve its
behavior, document format, SVG rendering and ThingsBoard contracts. Make small,
reviewable changes. Do not upgrade existing dependencies or add UI frameworks
without an explicit task requirement.

- Never use real equipment or production credentials for development or CI.
- Keep upstream tokens in the gateway; UI visibility is not authorization.
- Do not delete tests, raise budgets, disable lint rules or hide baseline failures
  to make verification pass. Record existing debt separately from new findings.
- Do not commit, push or deploy without explicit authorization.
- Use Node from `.nvmrc`, `npm ci`, then `npm run verify`. The aggregate runner
  executes all gates and returns failure if any gate fails. See known baseline debt.
- PostgreSQL and performance checks are additional isolated gates; see quality gates.

Codex and Claude Code share these rules; `CLAUDE.md` points here. Start each new
conversation from these files and the actual implementation, not chat history.
Inspect existing code before editing; do not invent requirements. Resolve routine
choices using project conventions and ask only about critical unresolved decisions.
For significant work, define acceptance criteria and a short plan first. Follow
**DESIGN → BUILD → TEST → REVIEW → COMMIT** in the shared delivery standards.

Read only the guidance relevant to the task:

- Architecture: [overview](docs/architecture/overview.md),
  [editor/runtime](docs/architecture/editor-runtime.md),
  [ThingsBoard](docs/architecture/thingsboard-integration.md),
  [security](docs/architecture/security-boundaries.md).
- Status and priorities: [roadmap](docs/ROADMAP.md).
- Delivery: [standards](docs/engineering/standards.md),
  [quality gates](docs/engineering/quality-gates.md),
  [technical debt](docs/engineering/technical-debt.md).
- Focused workflows live in `.agents/skills`: `angular-review`,
  `svg-editor-review`, and `feature-delivery`.

Report checks actually executed, failures, untested paths and material limitations.
