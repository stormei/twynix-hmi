# Twynix HMI Studio

Design, preview, and publish industrial HMI screens connected to ThingsBoard.
Twynix HMI Studio combines an Angular editor with a NestJS gateway for authenticated
telemetry, alarms, and versioned project releases.

**Status:** Early development. Review the [roadmap](docs/ROADMAP.md) and
[security boundaries](docs/architecture/security-boundaries.md) before evaluation.
Development and automated testing use simulated equipment and isolated services.

- **Visual editing:** SVG components, reusable symbols and faceplates, layers,
  alignment tools, and undoable screen editing.
- **Live data:** ThingsBoard telemetry and alarms with explicit binding quality.
- **Configurable behavior:** Property expressions and resource-limited JavaScript.
- **Versioned publishing:** Editable drafts and immutable runtime releases.

[Get started](#run-locally) · [Architecture](docs/architecture/overview.md) ·
[Contributing](CONTRIBUTING.md) · [Quality checks](docs/engineering/quality-gates.md)

## Repository guidance and automation

| Item                                           | Purpose                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                         | Project rules for AI coding assistants: preserve contracts, use safe test data, and verify changes. |
| [CLAUDE.md](CLAUDE.md)                         | Directs Claude Code to the same shared project rules.                                               |
| [.agents/skills](.agents/skills)               | Focused instructions for feature delivery and Angular/SVG review.                                   |
| [GitHub Actions](.github/workflows/verify.yml) | Automated quality, PostgreSQL, and performance jobs on pushes, pull requests, or manual runs.       |

These files are normal engineering infrastructure. Assistant guidance does not run
application code. GitHub Actions executes the checked-in workflow and retains check
results; the current workflow has no deployment steps.

## Adopted engineering foundation

This project integrates [project-boilerplate](https://github.com/stormei/project-boilerplate)
foundation **1.1.0 (unreleased)** at source commit
`906da1b4e93a38c18b3ee1e5b936db76e94a55b0`, recorded in
[foundation.json](foundation.json). The application and design system are preserved.
[project.json](project.json) connects setup validation to the existing npm gates.

Use `python3 scripts/check.py` for foundation-only checks and
`python3 scripts/check.py --project` for foundation plus application verification,
with Node selected from `.nvmrc`. Install remains a separate `npm ci` action.
See [setup and evidence](docs/setup.md), [startup prompt](STARTUP_PROMPT.md),
[security](SECURITY.md), [operations](docs/operations.md) and
[changelog](CHANGELOG.md). Optional template UX previews are not installed.

## Run locally

Use Node.js **22.22.3**, pinned in `.nvmrc` (for example, `nvm use`).

```sh
npm ci
cp .env.example .env
npm run dev
```

Open **http://127.0.0.1:4200**. The gateway listens on **http://127.0.0.1:3000**. Use the `127.0.0.1` address rather than `localhost`, because request origins are checked against `APP_ORIGIN`.

The configured ThingsBoard test server is `http://192.168.1.148:8080`. Choose **Connect ThingsBoard** and enter your existing ThingsBoard username/password. Passwords are forwarded to ThingsBoard and are not persisted. Upstream tokens remain in gateway memory; the browser receives an HttpOnly session cookie and a CSRF token.

No ThingsBoard credentials are included in the repository. Signed-out mode uses clearly labelled simulated data for unbound components. Configured telemetry sources remain unknown until signed in. Signing in switches all components to live bindings; missing bindings display unknown values rather than simulated ones.

## Try the editor

1. Select components from the canvas or Layers. Shift-click or drag a marquee for multiple selection; group, align, distribute and resize with eight handles. Use Enter to commit precision values, Space-drag to pan, and Shift+1/Shift+2 to fit the screen/selection. Press **?** for shortcuts.
2. Open **Symbols** or **Faceplates** to add components by click or drag-and-drop. Faceplate types have explicit versions, per-instance equipment binding and override-preserving upgrades. Layers support search, groups, hiding and locking. Project screens support settings, duplication and undoable deletion.
3. In **Style**, use the link icon beside **Value**, **Display text**, **Accent colour**, **Visibility**, or **Enabled state**. Choose a constant, ThingsBoard telemetry, or a JavaScript expression. The **Data** tab lists all property bindings. Device search, device/asset UUID entry, telemetry-key suggestions, units, and freshness timeouts are supported.
4. Under **Actions**, configure activation or double-click events with a message, navigation or device RPC. Save event changes explicitly. A faceplate with no configured action opens equipment details.
5. Use **Test binding** to inspect output and quality before applying a definition. Expression tests can use sample input that is never saved or used in Runtime. Under **Script**, edit JavaScript for appearance or click handling. Insert an example, then use **Test script** to report effects without executing commands.
6. **Preview** runs the draft. Appearance scripts run on a two-second display refresh; click scripts run on activation. Device commands are simulated in Preview.
7. Sign in and **Save draft**, then **Publish**. **Runtime** uses an immutable published snapshot. Open projects to choose a release or copy one back into a draft for rollback.

Local drafts use browser storage. Gateway projects are private to their ThingsBoard user and tenant. This initial release does not implement team sharing or separate designer/operator grants. Protect engineering access accordingly when evaluating with multiple users.

## Device commands

`ENABLE_DEVICE_COMMANDS=false` is the default. To exercise RPC, explicitly enable it in `.env`, restart the gateway, configure the action, save, and publish. Runtime requires a connected ThingsBoard session and confirmation. The server resolves device ID, method, and parameters from the stored release, never from client-supplied RPC fields. ThingsBoard checks the user's device permissions.

Commands are not automatically retried. Request IDs suppress duplicate requests for 24 hours within one gateway process. This cache is not durable across restart; the gateway must not be treated as an exactly-once controller. An RPC reply is reported as accepted, not proof of physical operation. Confirm resulting state from telemetry.

## Storage

Development runs without Docker using an atomic JSON repository under `.data/`. Run only one gateway process with that repository.

For PostgreSQL:

```sh
docker compose up -d db
```

Set `DATABASE_URL=postgres://twynix:twynix@127.0.0.1:5432/twynix` in `.env`. Restart the gateway. The repository creates its initial table and uses a transaction and per-project advisory lock for changes. Existing development-file data is not automatically migrated. Draft saves use revision checks, and releases preserve prior snapshots.

## Validate

After `npm ci`, install the Chromium version used by the browser smoke tests:

```sh
npx playwright install chromium
npm run verify
```

Tests use a local mock ThingsBoard instance. They exercise authentication/session boundaries, CSRF/origin checks, project conflicts and isolation, immutable releases, published command resolution, duplicate suppression, WebSocket telemetry/alarms, logout cleanup, schema validation, script capabilities, and infinite-loop interruption. They never contact equipment.

`npm run build` writes the Angular application to `dist/editor/browser` and the gateway to `dist/gateway`. `npm run start:gateway` runs the compiled gateway. Serve the editor through the same public origin as `/api`; forward WebSocket upgrades for `/api/realtime` to the gateway. The Angular development proxy already does this locally.

For a deployed installation, use TLS at the reverse proxy, set `APP_ORIGIN` to the exact external origin, and set `COOKIE_SECURE=true`. The test server's HTTP address is intended for the local test network. Gateway sessions are currently in memory and expire after eight hours; gateway restart signs everyone out. Horizontal deployment needs a shared session store and socket revocation bus.

## Source layout

- `apps/editor/src/app`: editor shell, state/history, shared SVG symbols, API/realtime clients, and script worker.
- `apps/gateway/src/auth`: ThingsBoard-backed login, token refresh, and local sessions.
- `apps/gateway/src/thingsboard`: REST adapter, device discovery, alarm acknowledgement, WebSocket lifecycle and payload normalization.
- `apps/gateway/src/projects`: repository, draft/release endpoints, command execution and project audit records.
- `packages/model`: shared validated project schema and starter process screen.
- `packages/scripting`: resource-limited QuickJS evaluation returning declarative effects.
- `tests`: model, scripting and mock-server integration coverage.

See [current architecture](docs/architecture/overview.md) and [roadmap](docs/ROADMAP.md).

## Property bindings

All five bindable properties have independent definitions. A value expression reads its unbound value; other expressions read the resolved main value unless a separate telemetry input is selected. Examples:

```js
// Colour
Number(context.value) > 75 ? '#da8054' : '#329c8c';

// Text
'Pressure: ' + context.value + ' bar';

// Enabled state
context.quality === 'good' && Number(context.value) < 10;
```

Expressions run in the same resource-limited QuickJS interpreter as scripts, with no side-effect API. They must return a primitive value compatible with their property. A bound property takes precedence over appearance scripts. Disable a definition to retain its configuration while using the unbound property setting, or remove it entirely. Existing single-value telemetry bindings continue to work.

Visibility is applied in Preview and Runtime; hidden objects remain dimmed and selectable in Design. Invalid or stale visibility input keeps equipment visible. Invalid or stale enabled input prevents UI activation. These are presentation conditions, not authorization rules or controller interlocks. A configured source never uses the dialog's test sample as live data.

## UX foundation

See [the workbench interaction contract](docs/ux-foundation.md) for the implemented Factory Intelligence / Ignition / WinCC / Figma-inspired foundation, including keyboard controls, reusable equipment types and current limits. The optional URL `http://127.0.0.1:4200/?workspace=ux-foundation` opens a separate local review draft.

## Dashboard widgets and contributors

Charts, gauges, Markdown, embedded pages and HTML panels are separate, lazily
loaded Angular components. Find the usage guide, folder map and extension contract
in [Dashboard components](docs/dashboard-components.md).

## Engineering workflow

Use Node from `.nvmrc`, run `npm ci`, install Chromium with
`npx playwright install chromium`, then run `npm run verify`.
The aggregate gate reports every result and fails when any check fails. Lint and formatting findings remain blocking; the initial baseline debt has been
corrected without weakening the checks. It does not deploy or use production
credentials. See [quality gates](docs/engineering/quality-gates.md),
[current architecture](docs/architecture/overview.md), and the concise [agent
entry point](AGENTS.md). Isolated PostgreSQL and performance checks have separate
commands and CI jobs.

Codex reads [AGENTS.md](AGENTS.md); Claude Code reads [CLAUDE.md](CLAUDE.md),
which delegates to the same rules. For the next feature, provide the desired
behavior and acceptance criteria, then follow **DESIGN → BUILD → TEST → REVIEW →
COMMIT** in [delivery standards](docs/engineering/standards.md). Use a dedicated
branch/worktree for substantial changes, review the diff and actual check results,
and approve commits explicitly. No automatic push or deployment is authorized.
