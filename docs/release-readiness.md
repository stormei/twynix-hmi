# Release readiness

Apply this checklist to the actual product and record evidence in the release PR.
For an inapplicable item, record the reason. Passing foundation checks is not a
production-readiness certification.

- [ ] Product acceptance criteria and real critical interactions pass.
- [ ] A clean install and all required application checks pass on the release commit.
- [ ] Relevant authorization-denial, validation and failure/recovery tests pass.
- [ ] UI work has been exercised for keyboard use, accessible names, focus,
      loading, empty and error states where applicable.
- [ ] Security review and any required qualified human review are complete.
- [ ] Environment configuration and secrets are isolated and documented safely.
- [ ] Health signals, logs, error reporting and operational ownership are defined.
- [ ] Version identification, deployment steps and rollback are documented.
- [ ] Persistence migration recovery and backup restoration are tested where needed.
- [ ] Relevant performance constraints have measured evidence.
- [ ] Known limitations, outstanding debt and release notes are recorded.
- [ ] Deployment is explicitly authorized for its named target.
