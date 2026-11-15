# Current architecture

Twynix is a single npm project with an Angular 22.2.6 standalone editor and a
NestJS 11 gateway. TypeScript 6.0.3 is locked. This document describes the existing
POC; it does not mandate a restructuring or a new framework.

| Area                            | Responsibility                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `apps/editor/src/app`           | Workbench, canvas interactions, inspector, library, UI services                  |
| `apps/editor/src/app/dashboard` | Individually owned, lazy Angular dashboard renderers and registry                |
| `apps/gateway/src`              | Session/auth, ThingsBoard transport, project/release repository and RPC boundary |
| `packages/model`                | Zod document schemas, defaults, binding/action types and references              |
| `packages/editor`               | Framework-independent geometry, ports, routes, bridges, guides and faceplates    |
| `packages/bindings`             | Property resolution, freshness and conservative fallback behavior                |
| `packages/scripting`            | Bounded QuickJS expressions and declarative script effects                       |
| `tests`                         | Node domain/store and isolated gateway regression tests                          |

The browser calls same-origin `/api` and `/api/realtime`. The development proxy
forwards those requests to the loopback gateway. The gateway alone talks to
ThingsBoard. See [ThingsBoard integration](thingsboard-integration.md).

Documents are JSON, schema version 1, with screens containing widgets, group
references and port connections. Defaults normalize older imports. There is no
separate SVG DOM serialization format: SVG is generated from this model. Server
publication clones the draft into a stored release; the UI selects draft or release
according to mode. See [editor/runtime](editor-runtime.md).

Dashboard rendering uses its own component folders, shared input contract and
lazy registry. [Dashboard contributor guide](../dashboard-components.md) explains
how to redesign one widget without changing the canvas or other widgets.

Reusable component types capture grouped widgets and internal wiring, with named
property inputs, an equipment entity assignment and explicit version upgrades.
See [the contributor and usage guide](../features/reusable-components-and-bindings.md).

Current limits include single-level groups, free-angle object rotation,
single-series recent-sample charts, private user-owned projects,
and a single gateway process when using file storage. Nested
hierarchies, historical analytics and team/RBAC workflows are future capabilities,
not architectural guarantees of this POC.
