# Security policy

Use private GitHub vulnerability reporting if enabled. Otherwise contact the
repository owner through an established private channel and agree a secure method
before sharing details. Do not put credentials, personal data or exploitable
vulnerability details in a public issue. Configure a monitored reporting channel
for each generated project before accepting external users.

Keep privileged credentials on trusted servers or approved secret stores. Use
synthetic data and disposable infrastructure for development and verification.
Never run tests against production services or real equipment.

## Included safeguards

- `.gitignore` excludes local environment files and common credential files.
- `.env.example` is the only canonical environment example; leave secret values
  empty or use angle-bracket placeholders such as `<SET_LOCALLY>`.
- `python3 scripts/check.py` checks tracked and non-ignored working files for
  known token patterns, private-key headers and literal credential assignments.
  Suspected values are never printed by these detectors.
- CI uses read-only repository access, does not persist checkout credentials,
  pins external actions to commits and has no deployment steps or secrets.
- Dependabot proposes weekly GitHub Actions updates. Review before merging.
  Add application ecosystem entries when dependency manifests are selected.

The lightweight scanner is defense in depth, not a comprehensive secret audit.
It does not scan Git history, binary/non-UTF-8 content, or ignored local files in a
Git checkout, and does not detect every credential format. ZIP scans have no Git
ignore engine and use the directory exclusions in `scripts/common.py`.
Enable the hosting provider's secret scanning and push protection where available.
Use a dedicated scanner when the project's risk requires it. Avoid broad bypasses
for findings; use synthetic fixtures assembled from fragments in tests.

## Trust and CI boundaries

Project command arrays are executable code, not sandboxed data. Review changes to
`project.json`, workflows and scripts like changes to application code. Do not run
an untrusted checkout with production credentials available in its environment.
The runner inherits the caller's environment; it is not a credential-isolation tool.
Keep credentials out of command arguments. Application commands may print their
own output; they remain responsible for redaction.

Use `pull_request` for untrusted PR checks. Do not execute untrusted PR code in
`pull_request_target`, privileged `workflow_run` jobs or a production-connected
self-hosted runner. Keep deployment in a separate, explicitly authorized workflow
with protected environments and least-privilege, short-lived credentials.

## Application requirements

Validate data at trust boundaries. Enforce authentication and resource-level
authorization on trusted execution paths. For accounts or tenants, test both
allowed access and denied access to another user's resources. Never rely on UI
visibility or client-supplied ownership as authorization.

For Twynix, maintain sensitive data, retention, external integrations and trust
boundaries in [architecture](docs/architecture/security-boundaries.md). Record operational access,
secrets and recovery procedures in [operations](docs/operations.md).

## Credential exposure

1. Revoke or rotate the credential immediately; deleting a file is insufficient.
2. Assess access and inspect relevant audit logs through an authorized operator.
3. Remove exposed values from active files and logs. Coordinate any history rewrite
   with collaborators; never rewrite shared history without authorization.
4. Document the incident without reproducing the credential and add a regression
   check appropriate to the exposure.
