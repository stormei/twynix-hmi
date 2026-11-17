# Development workflow

Read [AGENTS.md](AGENTS.md) first. It is the source of engineering and authorization
rules. This guide explains how to apply them as a solo developer.

## One focused change

1. **Define:** Write the problem, expected outcome and observable acceptance criteria
   in an issue or short task note. Tiny corrections need only a clear description.
2. **Branch:** Use a short-lived branch for meaningful changes. Keep unrelated work
   separate and preserve local edits.
3. **Build:** Implement the smallest coherent change, with meaningful regression
   coverage and relevant documentation.
4. **Verify:** Run focused checks and the documented aggregate verification command.
   Use isolated additional gates when needed. Record actual commands, outcomes,
   baseline failures and untested paths.
5. **Review:** Inspect the full diff and exercise changed behavior. Use the review
   policy in `AGENTS.md`; record the reviewer type and any missing evidence.
6. **Merge:** For meaningful changes, open a PR using the included template. Resolve
   critical findings and required checks before merging. Tiny documentation changes
   may use a lighter process with author review and appropriate validation.
7. **Release:** Treat deployment as a separate action. Record a version or commit,
   relevant release notes, verification and rollback or recovery steps where needed.

AI agents need explicit authorization for committing, pushing, merging, publishing
and deploying. A developer following this guide remains responsible for deciding
when those actions are appropriate.

## Verification setup

Configure the real commands in `AGENTS.md` and document prerequisites and isolated
services. Pin the toolchain and use reproducible dependency installation where
applicable. The aggregate runner should execute all standard gates, retain results
and fail if any required gate fails. Never create placeholder checks that report
success without verifying anything.

Once the stack is selected, add CI for the same checks and configure required status
checks where supported. Do not label the repository verified until the relevant
checks have actually executed. Documentation-only changes need formatting, link and
content checks rather than unrelated application tests.

## Review and records

Routine solo work can proceed with author review and passing required checks.
Substantial work should receive a separate AI review pass when available; identify
it as AI review. High-risk changes require another qualified human before merge
or release, as specified in `AGENTS.md`.

Keep a short traceable record: requirement or issue → PR → verification → merge
commit → release when applicable. Record limitations honestly. No independent
review claim is made when only the author reviewed the change.
