# Twynix project startup prompt

Use this prompt when starting work in this existing project. Setup is already
configured; do not replace the application with a new starter.

```text
Read AGENTS.md, project.json and task-relevant repository guidance, then inspect
actual code, tests and local changes before editing.

Preserve the Angular/NestJS application, HMI document and SVG contracts, legacy
scripts, ThingsBoard integration, pinned dependencies and unrelated local work.
Keep editor authoring separate from the shared runtime foundation for the future
operator viewer. Keep upstream credentials and authorization in the gateway.

Implement the requested scope. Define observable acceptance criteria for meaningful
changes. Resolve routine choices independently; ask only about critical missing
requirements. Run proportionate checks from docs/setup.md and the quality gates;
record actual failures, limitations and reviewer type. Use isolated synthetic
services, never production credentials or real equipment.

Do not commit, push, merge, publish or deploy without authorization for that action.
```

For foundation updates, compare the exact upstream commit recorded in
[foundation.json](foundation.json) and follow [maintenance](docs/maintenance.md).
