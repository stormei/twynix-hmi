# Observed security boundaries

- ThingsBoard is the identity provider. Upstream access/refresh tokens remain in
  gateway memory. Browser sessions use random IDs in an HttpOnly, SameSite=Strict
  cookie; secure-cookie use is configurable and false in development.
- Gateway write middleware checks Origin and, except for login, CSRF. Realtime
  upgrades require the expected path, origin and valid session cookie. Project
  reads/writes are scoped to tenant/user ownership. Upstream ThingsBoard permissions
  are still authoritative for entity access, alarms and RPC.
- Private ownership is not a role system. Separate designer/operator/publisher
  grants, shared sessions and team project access are not implemented. Hidden,
  disabled or locked UI components are not security enforcement or interlocks.
- Sessions, throttling and RPC deduplication are process-local. TLS, deployment
  access policy, durable auditing and session infrastructure remain operational
  work; localhost development defaults must not be presented as production hardening.
- Model/action validation is server-side. Device commands are opt-in, use stored
  published configuration and are not automatically retried. A mapped scalar input
  is type/range/step/choice validated against that configuration. Device, method and
  mapping target remain server-owned; optional authority restrictions narrow access. Durable exactly-once
  command semantics are not claimed.
- QuickJS scripts have interpreter/worker limits and a narrow effects API. Review
  any new host capability as a boundary change. Never expose credentials, DOM or
  arbitrary RPC to script contexts.
- Markdown renders text through Angular templates. HTML/CSS panels use opaque-origin
  sandboxed iframes and a restrictive document CSP, with scripts/forms/frames disabled.
  Remote embeds allow scripts but not same-origin access or top-level navigation.
  URL validation permits absolute HTTP/HTTPS without embedded credentials; it is
  not a trusted-origin allowlist. The remote server can refuse framing.
- Browser storage contains drafts/preferences, not upstream tokens. Storage failure
  is caught; silent recovery failure and backup UX remain debt. Local browser data
  is not encrypted, synchronized or isolated by ThingsBoard account.

Verification must not require production secrets. Use fake accounts, ephemeral
loopback REST/WebSocket servers and disposable storage. Optional PostgreSQL tests
require a dedicated loopback database and an explicit opt-in. Do not point them at
an existing project database. See quality gates for the exact safeguards.
