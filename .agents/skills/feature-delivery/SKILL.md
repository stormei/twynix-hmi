---
name: feature-delivery
description: Deliver a scoped Twynix HMI feature from written requirements through acceptance criteria, regression tests, verification and review handoff. Use when implementing or fixing product behavior, not for read-only audits or documentation-only tasks.
---

# Feature delivery

Read AGENTS.md and task-relevant architecture guidance. Translate the request into
observable acceptance criteria, including affected modes, persistence/history,
data quality and authorization boundaries. Resolve routine implementation choices
within the authorized task; ask only for materially missing requirements.

Identify the smallest affected component/domain boundary and protect existing
behavior with meaningful regressions. Keep unrelated refactoring, formatting,
dependency changes and contract migration outside the patch. For geometry changes,
include pointer/rendering evidence as well as mathematical invariants. For gateway
changes, use the isolated upstream strategy, never a real device.

For command/action changes, read the
[control/action guide](../../../docs/features/control-and-action-editor.md) and
[ThingsBoard contract](../../../docs/architecture/thingsboard-integration.md).
Include evidence that Preview issues no RPC, Runtime resolves configuration from
the stored release, and Preview-only policies remain enforced. Preserve timeout
uncertainty and no automatic command retries; distinguish an RPC reply from
matching reported-state confirmation.

For reusable component changes, read the
[component and binding guide](../../../docs/features/reusable-components-and-bindings.md).
Cover explicit version upgrades, stable instance/widget/connection identities,
partial-copy detachment, external wiring protection and preservation of local
actions, inputs and equipment assignment according to the operation's contract.

Implement the scoped change, run focused checks, then relevant quality gates.
Record each acceptance criterion as verified, failed or untested, linked to its
evidence. Baseline failures remain visible; do not reinterpret them as passing.

Hand the requirements, diff and evidence to a separate reviewer when available.
Address supported findings within scope. If independent review cannot run, record
it as pending and supply a concrete review checklist rather than claiming completion.
Conclude with changed behavior, checks and limitations. Follow the repository's
existing authorization boundaries for any subsequent commit, push or deployment.
