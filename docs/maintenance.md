# Foundation maintenance

[foundation.json](../foundation.json) records the upstream foundation version,
reviewed base and exact source commit adopted by this consumer project. Here
`release_commit` is the adopted source commit, even if upstream has not tagged a
release; it is not a Twynix release commit. The foundation version is currently
unreleased. See [setup provenance](setup.md).

The following foundation-release procedure applies when maintaining the upstream
template itself; Twynix product releases follow its own changelog and
[release readiness](release-readiness.md).

For foundation releases, run the aggregate check, test a clean source export and
inspect workflow changes. Record verification, update [CHANGELOG.md](../CHANGELOG.md),
then commit and tag only when authorized. Record the actual released commit in the
release notes. Generated projects should set `release_commit` to the source commit
they adopted; a release need not try to embed its own commit hash in itself.

Template updates do not propagate automatically. Review upstream changes in a
focused PR, preserve application-specific decisions, run the application's checks
and update provenance. Never replace a customized `AGENTS.md` blindly.

Review the pinned tooling Python and action commits regularly. Dependabot covers
GitHub Actions; Python tooling pins and application runtimes still need an owner.
Add dependency update coverage for the selected application ecosystem.
