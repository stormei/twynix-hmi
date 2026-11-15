# Dashboard components and contributor guide

Twynix uses Angular 22 standalone components, Angular signals and scoped component
styles. The NestJS gateway handles ThingsBoard 4.4 authentication, subscriptions
and publication. Dashboard widgets reuse those existing services; widget code
never receives ThingsBoard credentials or manages its own WebSocket connection.

## Try the widgets

Open **Symbols → Dashboard widgets**. Add Chart, Gauge, Sparkline, Linear gauge, Markdown, Embedded page or
HTML panel independently, or choose **Add dashboard example screen** to insert a
1280 × 800 gallery into your current project. This does not replace existing
screens. Move, resize, duplicate, group, bind and publish widgets like any symbol.
Use **Style** for widget-specific settings and **Data** for telemetry bindings.
Preview permits content interaction; Design preserves drag and selection gestures.

Charts support line, area and bar presentation, automatic/fixed scales and grid
visibility. They currently show one telemetry series, sampled every two seconds,
with the latest 80 usable samples collected during this editor session. This is
not a ThingsBoard historical-data query or a multi-series analytics engine.
Gauges have minimum/maximum, warning/critical thresholds and a unit. Invalid or
stale values display unavailable state instead of a fabricated current value.

Markdown supports headings, paragraphs, bullet lists, fenced code and standalone
HTTP/HTTPS links. This first renderer deliberately implements that documented
subset; it does not implement full CommonMark or inline rich formatting. Raw
HTML is text. HTML panels render HTML/CSS in an opaque-origin sandbox with scripts,
forms and nested frames disabled, plus a restrictive document content policy.
Embedded pages accept absolute HTTP/HTTPS URLs without embedded credentials.
They run in an isolated iframe with scripts allowed, but no same-origin access,
shared Twynix tokens, top-level navigation or popups. Remote servers can refuse
embedding, and applications that require cookies/same-origin access may not work.

## Find the code

| Location                                                          | Responsibility                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/model/src/dashboard.ts`                                 | Framework-independent schemas, defaults, supported kinds and URL validation    |
| `apps/editor/src/app/dashboard/widget-registry.ts`                | Labels, configuration fields and a lazy component loader for each widget       |
| `apps/editor/src/app/dashboard/dashboard-widget.component.ts`     | Stable host and lazy loading; passes resolved inputs to the selected component |
| `apps/editor/src/app/dashboard/shared/widget-inputs.ts`           | Shared presentation input contract                                             |
| `apps/editor/src/app/dashboard/shared/card.css`                   | Common chart/gauge card styling                                                |
| `apps/editor/src/app/dashboard/chart/`                            | Chart geometry and rendering                                                   |
| `apps/editor/src/app/dashboard/gauge/`                            | Gauge geometry and operating states                                            |
| `apps/editor/src/app/dashboard/markdown/`                         | Text-only Markdown parser and presentation                                     |
| `apps/editor/src/app/dashboard/iframe/`                           | Validated remote embedding                                                     |
| `apps/editor/src/app/dashboard/html/`                             | Isolated HTML/CSS document rendering                                           |
| `apps/editor/src/app/dashboard/dashboard-properties.component.ts` | Registry-driven property editor and schema validation                          |
| `tests/dashboard.test.ts`                                         | Config validation, legacy imports and project roundtrips                       |

Each widget can be redesigned in its own folder without changing the canvas,
selection system, gateway or other widgets. Widgets load in separate chunks. A
redesign should preserve the shared input contract and serialized configuration.
The existing industrial SVG library remains independent of these HTML components.

## Input contract

Extend `DashboardWidgetInputs`. The host supplies `widget` (geometry/config),
resolved `value`, `quality`, `color`, `text`, `unit`, numeric `samples` and an
`interactive` flag. The editor owns binding evaluation, telemetry freshness,
selection, drag ghosts and actions. Respect unknown/stale quality, and never
replace missing live data with simulation. Set the host to fill its allocated
width/height; avoid fixed page-level layout assumptions or global CSS selectors.

Do not insert user HTML into the editor DOM or bypass the existing iframe
isolation. Remote embeds must not receive session credentials or upstream tokens.
Keep framework dependencies inside the editor; domain schemas belong in model.

## Add or change a widget

1. Add a folder under `dashboard/` with a standalone Angular component and any
   component-specific template, styles, helpers and tests. Extend the shared input
   contract and keep the component independent of the editor store/API services.
2. For a new kind, add its identifier and discriminated configuration schema in
   `packages/model/src/dashboard.ts`. Supply defaults and validation; preserve
   backward compatibility for imported projects.
3. Register its label, lazy import and editable fields in `widget-registry.ts`.
   The generic renderer uses this registration. Add the kind to its category in
   `symbol-catalog.ts`, then add a navigation icon
   and a friendly description in the editor's label map. No renderer switch is
   needed in `app.component.html`.
4. Add a default size in `newWidget` if the standard dashboard size is unsuitable.
   Extend the example layout when useful. Do not change unrelated widget code.
5. Test configuration roundtrips and invalid inputs, then visually verify Design,
   Preview, resizing, dragging, duplicate/undo and unavailable/live data states.

Run `npm run typecheck`, `npm test` and `npm run build:editor`. The focused domain
checks can be run with `node --import tsx --test tests/dashboard.test.ts`.

Potential next additions include historical time ranges, multiple telemetry
series, chart tooltips, tables and more gauge styles. Those should extend their
own component modules and typed configuration instead of growing the editor shell.

The Symbols panel is a standalone `SymbolLibraryComponent`. Its expandable
category hierarchy is defined in `symbol-catalog.ts`; search matches category
names, widget names/descriptions and ISA codes/descriptions. Updating navigation
does not require editing widget renderers or the editor canvas.

## Operator controls and compact instruments

**Symbols → Input controls** contains Dropdown, Slider, Radio group, Toggle switch
and Multi-state button. Each has its own standalone component folder, typed model
configuration and lazy registry entry. Sparkline and Linear gauge live in the
Dashboard widgets category and also have independent folders.

The [Ignition Perspective input palette](https://www.docs.inductiveautomation.com/docs/8.3/appendix/components/perspective-components/perspective-input-palette)
informs the control families: labeled option values, range inputs, boolean switches
and mutually exclusive state buttons. Twynix keeps its existing visual styling.
Options use one `value = Label` per line in Properties. Numeric and boolean values
retain their types; values must be unique. Sliders configure minimum, maximum,
step and unit. Linear gauges configure scale and warning/critical markers.

Design mode selects, moves and resizes controls. Preview supports local input
without changing the saved demo value. Leaving Preview or switching screens clears
these local overrides. Runtime presents the bound reported value. User changes
emit the requested value into the existing activation script's `value` context;
the script can request the widget's configured action. Mapped RPC actions can insert the requested scalar into one approved parameter
after client and gateway validation. Unmapped RPC parameters remain static. These
controls do not automatically write telemetry or request arbitrary device commands. Existing gateway
session, authorization and command enablement checks still apply. Unavailable
quality and disabled widgets prevent interaction. Native controls retain keyboard
and focus support; child click/key events do not activate the canvas a second time.

Control components extend `ControlWidgetInputs`. The host additionally forwards
`enabled` and an `onInput` callback; use `commit(value)` to enforce interactive mode,
enabled state and usable quality. Keep API access in the existing editor/gateway.
Sparklines show the latest 80 usable session samples, collected every two seconds;
they do not request historical data. Missing/stale values show unavailable state.

## Layer ordering and rotation

The drawing toolbar exposes Bring to front, Bring to back and 5° rotation steps.
Selected objects and groups also have a circular rotation handle above their frame.
At the top screen edge, the handle moves below the frame to stay reachable.
Drag to rotate in 5° increments. The live angle
readout is preview-only until release. Escape, pointer cancellation and losing
window focus cancel without an undo entry. A committed drag creates one undo step.
Focus the handle and use Left/Right for 5° adjustments.
Properties provides an exact degree input. Locked selections and Preview/Runtime
modes do not expose the handle.

The stored outer frame is axis-aligned. Quarter turns retain their legacy dimension
convention; free angles retain a logical content aspect in `rotationSize` and derive
an enclosing outer frame. Resizing a free-rotated object fits that aspect inside its
new frame. Rendering and process/signal ports use the same centered transform.
Pipes remain orthogonal and leave rotated ports along the nearest cardinal direction.
Rotations that cannot fit within the screen or size limits are rejected; the handle
keeps its last valid preview. Legacy documents without rotation load as 0°. Nested
groups remain outside this implementation.

The selection outline and its resize/rotation handles share the object's local
orientation instead of using the enclosing axis-aligned frame. Group frames use
the first member's axes and enclose all member corners, so their orientation
survives consecutive rotations and project recovery. Resizing a rotated selection
uses those local axes and anchors the opposite edge/corner. Rotated groups scale
uniformly to avoid introducing shear. Hover/selection highlights also follow the
rotated content. Serialized outer rectangles remain axis-aligned for routing and
screen bounds. Ruler rendering uses an immediate deferred view to keep optional
editor code inside the unchanged startup budget.

See [the control/action editor guide](features/control-and-action-editor.md) for
command mapping, authority and input validation, reply versus reported-value
feedback, offline testing and the contributor boundaries. Boolean and text-choice
controls resolve their declared source value types; numeric symbols keep numeric
validation. A command request never serves as a reported telemetry sample.
