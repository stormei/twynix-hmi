# Local operation and recovery

Twynix is an early-development Angular editor and NestJS gateway, not a proven
production control system. The separate operator viewer is planned; editor Runtime
currently consumes published screens. See the [architecture](architecture/overview.md)
and [roadmap](ROADMAP.md).

## Environment and services

Use the Node pin and locked dependency installation declared in
[project.json](../project.json). Python 3.9+ runs the dependency-free foundation
tools; use a maintained release, with the CI tooling pin in
[.tooling-python-version](../.tooling-python-version). Application runtime pins
remain in the existing Node version files and package lock.

Follow [local startup](../README.md#run-locally). Local editor/gateway defaults are
loopback ports 4200/3000. The gateway alone holds upstream ThingsBoard tokens;
never supply real-equipment access or production credentials to development or CI.
Create local configuration from [.env.example](../.env.example); keep local values
out of source control. Device commands are disabled by default. Preview uses
simulated commands. UI visibility and mode are not authorization.

## Verification and evidence

Use [quality gates](engineering/quality-gates.md) for the real commands, browser
installation and disposable database constraints. Foundation checks and the setup
contract are described in [setup](setup.md). Browser tests use their own loopback
static server at port 4300 and synthetic API/telemetry data, without an upstream
connection. PostgreSQL and performance gates are additional isolated checks.

`artifacts/verification/summary.json` and per-gate logs record local application
results; `artifacts/benchmarks` records measurements. These ignored artifacts are
not durable operational audit logs. Preserve relevant evidence with a PR or CI run.
Do not log credentials or infer equipment operation from an accepted RPC reply.

## Persistence and recovery

Browser recovery is a convenience for local drafts, not a backup. Export important
drafts. The JSON gateway repository under `.data/` supports one gateway process;
stop it before operator-managed file backup or restore. A deployed PostgreSQL path
needs an approved migration and a tested backup/restore procedure before production
use. The isolated PostgreSQL suite does not prove operational recovery.

Published releases remain separate from drafts. Copying a previous release to a
draft is an editor operation; validate, save and publish deliberately to create a
new release. Do not rewrite published history. Restore and command uncertainty
must be assessed by an authorized operator before further actions.

## Deployment status

No production deployment target, monitored security contact, on-call owner, durable
command audit, backup restoration SLA or release rollback runbook is established
by this template adoption. [Release readiness](release-readiness.md) and
[repository controls](repository-controls.md) track the evidence needed before
release. No remote settings, commit, push, merge or deployment is performed by
local setup. Report incidents privately as described in [SECURITY.md](../SECURITY.md).
