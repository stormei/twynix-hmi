# Architecture and implementation status

For the current package map, data flow and limits, start with
[current architecture](architecture/overview.md),
[editor/runtime](architecture/editor-runtime.md),
[ThingsBoard integration](architecture/thingsboard-integration.md) and
[security boundaries](architecture/security-boundaries.md). The first-slice counts
and future milestones below are historical context; see the [roadmap](ROADMAP.md)
for current priorities.

Twynix owns engineering projects and operator presentation. ThingsBoard 4.4 owns user identity, entity access, telemetry, alarms and device RPC. The gateway is the only component holding ThingsBoard tokens. The designer and published runtime render the same schema through the same SVG symbol component.

## Data and session flow

The browser posts credentials to the same-origin gateway. The gateway logs in through ThingsBoard REST and fetches the authenticated user. The browser receives an opaque session cookie with HttpOnly and SameSite=Strict plus a separate CSRF token for writes. Login attempts are limited per client address. POST/PUT requests require an exact allowed Origin; authenticated writes also require a CSRF token.

The WebSocket upgrade requires the session cookie and exact Origin. Browser subscription messages are validated, limited to 100 bindings and converted to fixed ThingsBoard queries. Arbitrary ThingsBoard command forwarding is not supported. Each browser connection owns an upstream connection using that user's token. Duplicate bindings on a screen share an upstream entity subscription. Closing, logging out, or expiring a session releases the corresponding connection.

The gateway refreshes upstream access tokens before expiry and sends periodic authentication/heartbeat messages. Upstream failures trigger bounded exponential backoff with jitter, followed by full resubscription and snapshots. The browser separately reconnects if its gateway connection drops. Values are marked stale during disconnection or after the binding freshness timeout. Recent trend samples are collected in browser memory; historical queries are a later milestone.

Alarm subscriptions request the latest 50 device alarms visible to the user. Snapshots replace the current list; updates merge by alarm ID. Acknowledgement goes through ThingsBoard REST, and the UI waits for the realtime status change. This is a bounded alarm list, not a durable event journal or comprehensive alarm historian.

## Projects and publication

The shared Zod schema validates project version, screen identities, widget geometry, bindings, scripts and actions. Both client and server validate at important boundaries. Import creates a new project identity to avoid overwriting an existing saved project.

The editor keeps undo/redo history and a recoverable local draft. A save includes the last known revision; the gateway rejects stale revisions. Edits made while a save is in flight are retained. Published releases are independent immutable snapshots. Restoring a release copies it into the current draft; publishing that draft makes a new release.

Ownership is the ThingsBoard tenant/user pair. Every project endpoint checks that ownership. PostgreSQL and a development file adapter implement the same repository operations. Saves, releases and project audit entries are stored together. PostgreSQL mutations are transactional. The development adapter serializes mutations and replaces its file atomically.

## Scripting boundaries

The embedded language is JavaScript running in QuickJS WebAssembly, inside a browser Worker. User code runs in a separate interpreter, not through browser `eval` or `Function`. No browser DOM, network, Node.js modules, credentials or host module loader are exposed.

Every execution has an 8 MB heap allocation limit, a 256 KB stack limit, a 50 ms execution deadline, a 20,000-character source limit and at most 50 declarative effects. The host also terminates a nonresponsive worker after five seconds, including module initialization. A fresh interpreter context is created for every evaluation; script variables do not persist between runs.

`context` exposes the component value, quality and name. `hmi` exposes text/colour changes, notifications and a request to run the component's configured action. Behaviour scripts apply appearance effects only. Click scripts can notify and request a configured action once per activation. The API offers no arbitrary RPC method or parameter injection. Scripts should be synchronous; asynchronous scripts and persistent script state are not supported in this slice.

Script testing displays returned effects without applying actions. Preview simulates device commands. Live RPC requires a published configuration, explicit gateway enablement, user confirmation and ThingsBoard authorization. Neither UI scripts nor the gateway provide deterministic control logic or equipment interlocks; those belong at the device/controller layer.

## Deliberate first-slice limits

This is an engineering foundation, not the complete SCADA product. Implemented: seven SVG components, multi-selection and marquee selection, group drag/resize, alignment/distribution, snapping, keyboard shortcuts, locking, layer ordering, multi-screen management, undo/redo, import/export, local recovery, device/key discovery, telemetry, bounded alarm list and acknowledgement, appearance/click scripts, private projects, publishing, runtime, restore-to-draft and guarded RPC.

Next milestones:

1. Composite faceplate graphics, nested groups, rotation, explicit editable connectors and asset management. Versioned pump/valve/tank types, instances, multi-selection, alignment, distribution and single-level grouping are implemented.
2. Monaco-based source editing with completion and diagnostics; the initial editor is a plain source field with execution diagnostics.
3. Device/asset aliases, attribute bindings, historical trends and unit conversions. Per-property time-series bindings and configurable freshness are implemented.
4. Designer/operator/publisher permissions and team project grants mapped to actual ThingsBoard 4.4 roles; shared session storage and revocation; durable command request/outcome audit.
5. PostgreSQL migration tooling and a tested deployment package; load tests against representative tag counts and network conditions.
6. Server-side script scopes for scheduled/background behaviour, only after isolation and lifecycle requirements are defined.

No real account credentials or equipment commands were used during development. Mock-server coverage is not a substitute for verifying the actual installation's payloads, login policies, roles and device RPC methods.

## Integration references

- [ThingsBoard WebSocket API](https://thingsboard.io/docs/reference/websocket-api/)
- [ThingsBoard REST API](https://thingsboard.io/docs/reference/rest-api/)
- [ThingsBoard entity queries](https://thingsboard.io/docs/reference/data-query-api/)
- [Angular compatibility](https://angular.dev/reference/versions)
- [QuickJS sandbox integration](https://github.com/justjake/quickjs-emscripten)

## Shared UX with Factory Intelligence

The editor adopts the Factory Intelligence light-theme contract from the sibling `factory-inteligence` project. The local token snapshot lives in `apps/editor/src/styles/tokens.css`, preserving the `--tx-*` names for navigation, colours, typography, spacing, focus rings, controls and dialogs. These are build-time assets: Twynix does not depend on the sibling checkout at runtime.

The shell uses its navy 64 px header, blue primary actions, compact outlined secondary actions, neutral surfaces and borders, and Inter/Segoe UI typography stack. Design, Preview and Runtime occupy the main navigation; project/file commands remain in a contextual toolbar. A shared SVG icon component serves navigation, layers and the symbol library. The canvas retains separately configured equipment colours, so restyling the application does not rewrite project files or alter process-state semantics.

## Per-property binding model

Widgets support independent `value`, `text`, `color`, `visible` and `enabled` bindings. Definitions are constants, read-only telemetry sources, or JavaScript expressions with an optional separate telemetry source. The schema adds defaults to older projects; the original widget `binding` field is read as a legacy value binding until explicitly replaced or removed. Published older releases are normalized before rendering.

`packages/bindings` resolves values and quality independently of Angular. Telemetry subscriptions include every enabled property source and share duplicate entity/key subscriptions. Each property retains its own freshness timeout. Constants preserve numeric zero, empty strings and false booleans; telemetry boolean strings are parsed explicitly. Expressions receive the resolved main value (or their selected source), quality and component name. The expression interpreter exposes no `hmi` effects.

The binding editor is a separate component using a native modal dialog for keyboard containment and Escape dismissal. Tests show output and quality without applying the draft. Sample inputs remain dialog-local. Changes invalidate old test results; cancelling leaves the widget untouched. Applying uses normal editor history, local recovery, import/export, revisioned saves and immutable releases.

The runtime coalesces pending binding evaluation batches and discards obsolete results. A binding definition takes precedence over script-based appearance for the same property. Unusable visibility input defaults to visible, unusable enablement defaults to disabled, and invalid text/colour falls back to its static setting. Configured telemetry sources remain unknown while offline. These UI conditions do not replace ThingsBoard authorization or equipment-side interlocks.

## Workbench UX contract

See [UX foundation](ux-foundation.md) for the implemented interaction model, type/instance lifecycle, keyboard controls, verification scope and current limits. Canvas geometry and faceplate update rules live in `packages/editor`; the Angular shell coordinates dedicated layer, selection, modal and type-editor components. Native dialogs now replace the earlier browser confirmations and backdrop-only modals.
