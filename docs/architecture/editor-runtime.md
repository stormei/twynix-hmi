# Editor, document and runtime

`EditorStore` owns the Angular signal document, selected screen/widget IDs,
clipboard and history. `AppComponent` coordinates the editor template, dialogs and
keyboard shortcuts. Screen execution is separate from authoring so a future
operator viewer can consume the same published screens and scripting contracts.
Pure modules in `packages/editor` implement transformations and shared connection
presentation.

## Service boundaries and operator viewer

| Responsibility                                                                    | Owner                    | Editor dependency                          |
| --------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------ |
| Draft attachment, published snapshot, screen navigation and transition generation | `HmiRuntimeContext`      | None; optional draft adapter               |
| Telemetry subscription, freshness, coalesced property bindings and chart samples  | `HmiBindingRuntime`      | None                                       |
| Legacy/new script scheduling, diagnostics and render-only appearance transforms   | `HmiBehaviorRuntime`     | None                                       |
| Widget activation, configured actions, command readback and Preview inputs        | `HmiActionsService`      | None                                       |
| Pan, zoom, fitting and pointer coordinate conversion                              | `HmiViewportService`     | None; explicit viewport element attachment |
| Notices, console and confirmation requests                                        | `HmiFeedbackService`     | None; rendered by the shell                |
| Login/session UI, draft save/import/export/publish and project switching          | `EditorWorkspaceService` | `EditorStore`                              |
| Selection, move/resize gestures, ghosts, connection authoring and editor panes    | `EditorCanvasService`    | `EditorStore`                              |

Services are provided at the editor component boundary. `CommandStateService` is
also scoped there, invalidates unfinished lazy preparation on destruction, and
resets the command engine. Runtime teardown stops sampling/scheduling, disconnects
telemetry and discards outstanding results; viewport and deferred focus references
are released. API session, transport/Worker and lazy command engine retain existing
application-level providers: the current app supports one mounted screen host.
Concurrent independent runtime hosts would additionally need isolated transport,
Worker and lazy command-engine provisioning; do not claim multi-viewer isolation.

The viewer must be a separate operator shell, without editor tools, selection,
undo/history or draft saving. It should provide the shared services, restore an
authorized gateway session, load an authorized release and call
`HmiRuntimeContext.openPublished(release)`. The default operator context uses live
data and disables simulation fallback. The editor explicitly retains its existing
simulation option when opening Runtime. Published projects are validated and copied
before use; navigating Runtime never calls the draft adapter. UI mode is not an
authorization boundary: gateway release/device permissions and command policy stay
authoritative. The viewer must visibly handle loading, unavailable/stale values,
session expiry, connection recovery and command uncertainty.

Both shells should render existing widget components and use `screenConnections`
with the behavior runtime's transformed widgets for routes/bridges, and shared port
geometry. Editor ghosts and bend previews are additional authoring inputs to the
same pure function. A future shared screen component can move the common template
once the operator shell is implemented; there is no standalone viewer UI yet.

This follows Twynix Studio's separation of viewport, interaction, persistence and
runtime responsibilities, while avoiding its broad component-host callback object.
The services here depend on explicit context/domain services rather than the
editor component. No Studio code or dependency changes were imported.

Acceptance criteria for this extraction:

- Existing Design/Preview/Runtime workflows, document format, undo transactions,
  legacy scripts and gateway contracts remain compatible.
- Shared runtime imports cannot reach the editor store, canvas controller or
  authoring components, verified by a transitive dependency regression.
- Published snapshots work without a draft adapter; draft edits cannot alter the
  runtime screen, and operator contexts cannot enter draft modes without one.
- Shared routes follow runtime geometry without modifying the document. Existing
  browser regressions exercise zoom, gestures, ports and scripted transforms.
- Mode/screen transitions and destruction invalidate late script/command work.

The standalone operator shell, deployment/session flow and operator acceptance
checks remain future work. This extraction supplies its runtime foundation.

Extraction verification (2026-11-16, Node 22.22.3): `npm ci`, then
`npm run verify` passed all gates (171 Node tests, 22 Chromium smoke tests,
production build/type/lint/format checks). `npm run test:performance` passed both
isolated browser tests. The 30-second scripting fixture delivered 7,080 values at
19.62 Hz, with one Worker request in flight, 0.5 ms p95 dispatch/reply time,
1.78 seconds final catch-up, no page errors and no recorded long tasks. These are
machine-local synthetic observations, not a production SLA or long-duration soak.
Independent Angular/runtime and SVG/gesture reviews found no remaining blocking
findings after command teardown was corrected. PostgreSQL and a standalone viewer
were not exercised by this extraction. Logs and measurements are under
`artifacts/verification` and `artifacts/benchmarks`.

The Zod model stores target-pixel rectangles and connections between stable port
identities. Industrial graphics are rendered by `SymbolComponent`; schematic
variants use `SchematicComponent`. Each symbol owns its SVG definitions. Ports
account for SVG viewbox letterboxing and fitting rotation. Connections are derived
from the current endpoint geometry; optional bend pins are serialized. Crossing
bridges distinguish overlapping pipes from actual tee junctions. Do not infer a
junction merely because two paths intersect visually.

The workarea uses the screen's actual width/height. Shared viewport math maps
pointer coordinates through zoom/pan; rulers express target pixels. Moving uses
render-only drag ghosts until drop, then commits document/history. Resize updates
are covered by a transaction checkpoint. Group moves preserve member offsets.
Grid, alignment/equal-gap and port snapping have distinct precedence; port attachment
wins. Shift constrains an axis and Ctrl/Command bypasses snapping.

Undo/redo uses up to 80 cloned project snapshots plus screen/selection state.
Applying history retains the current server revision. Clipboard references are
remapped; loading another project clears history and clipboard. Save-in-flight
handling preserves newer local edits. Browser recovery serializes the project,
dirty state and recovery timestamp, with deferred writes during transient changes.
Library search/expansion/tab preferences have a separate versioned local key.
Neither local history nor preferences constitute server authorization or a backup.

Design edits the draft. Preview runs the draft and simulates device commands.
Runtime uses the selected published document. Binding resolution and stale quality
are shared; configured unavailable telemetry is not replaced by demo values.
Expression results are coalesced and obsolete batches discarded. Behavior effects
are limited to appearance; click scripts may request the configured action.

QuickJS runs in a browser Worker: fresh contexts, 8 MB memory, 256 KB stack and
50 ms interpreter deadlines, plus a five-second host watchdog. No DOM, fetch,
Node modules or gateway credentials are exposed to that interpreter. HTML/iframe
widgets are a separate sandbox boundary; see [security](security-boundaries.md).

Regression requirements: zoom/pan/port alignment, ghost drop/cancel, grouping,
resize bounds, route pins/bridges, import/export, history transactions, freshness,
save conflicts and draft/published separation. Object rotation supports free angles through a selection handle or an exact degree
input. Quarter turns preserve legacy outer dimensions; free angles retain logical
content proportions in `rotationSize`. Process/signal ports share that centered
transform, while pipe stubs use the nearest cardinal direction. Handle feedback
is render-only and commits one undo operation on release. Nested groups remain
unsupported.

The symbol library, binding/screen/faceplate dialogs and inspector-specific dashboard,
operating-range and multi-selection controls use Angular deferrable views. Existing
visibility conditions still decide when each view exists; `on immediate` loads its
standalone dependencies as soon as that view is requested. No arbitrary idle delay
is introduced. Components retain their inputs, outputs and normal mount/unmount
lifecycle; Angular caches loaded code for reopening. Canvas symbols, interactions
and the document/store remain on the startup path. The service extraction initial bundle is about 1.03 MB and exceeds the unchanged 1 MB warning
budget by approximately 35 kB; the 2 MB error budget is also unchanged.

Opt-in appearance behaviors (`behaviorConfig.resultMode: "appearance"`) return
replacement text/color overrides. Legacy configurations retain hmi effects and
periodic reevaluation. A shared behavior scheduler coalesces latest snapshots,
starts at most ten jobs/second, discards obsolete completions and quarantines
repeated failures. New appearances restore baseline while pending or failed;
current status/duration appears in the script console. See the
[widget scripting design](../features/widget-scripting.md) for capabilities,
compatibility, ownership rules, limits and remaining delivery phases.

Phase 3 extends opt-in appearance results with bounded position/rotation offsets.
A runtime-only presentation list uses the shared rotation/content-size geometry and
drives widgets, ports, routes, obstacles and bridges together. Source widgets remain
authoritative for bindings, scripts, persistence and history. Out-of-screen results
fail atomically; no automatic clamping or accumulation occurs.

The phase 4 behavior editor is deferred until requested. It owns an isolated draft
subscription to ThingsBoard through the gateway and never substitutes demo/catalog
samples into its live input table. Simulation stays local to the dialog; Apply is
one validated widget/history change. Versioned built-in templates copy source into
the widget; published behavior has no mutable remote library reference.

Phase 5 serializes Worker dispatch (64 total pending requests maximum), keeps property
resolution in eight-widget windows and rejects obsolete input-dependent results.
Changed binding inputs use conservative pending fallbacks; unchanged freshness ticks
are coalesced. Legacy time-dependent expressions retain idle periodic refresh.
Interpreter result/error conversion stays bounded inside QuickJS, source compilation
is separate from trusted conversion code, and the console supports explicit retry.
See the scripting design for the measured 30-second synthetic load and release limits.
