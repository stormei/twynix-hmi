# Contributing to Twynix HMI Studio

Start with [AGENTS.md](AGENTS.md) and the
[delivery standards](docs/engineering/standards.md). These rules apply to human
contributors and coding assistants.

## Prepare your environment

Use Node.js from `.nvmrc`, then install the locked dependencies and test browser:

```sh
nvm use
npm ci
npx playwright install chromium
```

See the [README](README.md#run-locally) for local startup and configuration.
Use simulated equipment and isolated test services. Keep credentials out of source
control and upstream tokens in the gateway.

## Make a focused change

1. Describe the problem, expected behavior, and observable acceptance criteria.
2. Inspect the implementation and relevant architecture guidance before editing.
3. Preserve document formats, SVG rendering, and ThingsBoard contracts. Avoid
   unrelated refactoring and dependency changes.
4. Add regression coverage for changed behavior and update relevant documentation.
5. Run `npm run verify` and report actual results, including failures and untested
   paths. See [quality gates](docs/engineering/quality-gates.md) for the separate
   PostgreSQL and performance checks.
6. Review the complete diff and request independent review for significant changes.

Do not remove tests, weaken checks, or increase budgets to obtain a passing result.
Record existing debt separately from new findings. Commits, pushes, and deployments
by coding assistants require explicit authorization.

## Pull requests

Explain the problem and resulting behavior, list checks actually run, and identify
material limitations. Keep changes small enough to review. GitHub Actions runs the
repository's quality, PostgreSQL, and performance jobs; a local check does not prove
that remote CI passed.

## Foundation and setup checks

The adopted template is configured in [project.json](project.json), with source
provenance in [foundation.json](foundation.json). Follow [setup](docs/setup.md)
for strict validation and the Python wrapper around existing npm verification.
Documentation-only changes use foundation and formatting checks; workflow and
command changes also run the application gates. A clean export must be tested
before claiming clean-environment evidence.

## Review, delivery and release

Use short-lived branches and the [PR template](.github/pull_request_template.md)
for meaningful changes. Preserve unrelated local work. Record author review,
separate AI review and human review distinctly. Routine solo work does not require
another person's approval; high-risk changes follow the qualified-human policy in
[AGENTS.md](AGENTS.md) and the delivery standards.

Link requirements, acceptance results, verification, review and release identity
where applicable. Document recovery steps before a risky release. Check
[repository controls](docs/repository-controls.md) and
[release readiness](docs/release-readiness.md); local files do not configure remote
branch protections. See [SECURITY.md](SECURITY.md) for private reporting and scanner
limits. AI-performed commit, push, merge, publication and deployment each require
explicit authorization.
