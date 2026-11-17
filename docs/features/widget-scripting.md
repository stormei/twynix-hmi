# Widget scripting design and delivery

Approved direction: JavaScript executed by QuickJS in a Worker. Preserve existing
behavior, click/double-click scripts and document compatibility. LogicScript is not
introduced. Scripts calculate presentation; gateway authorization remains authoritative.

## Contract

A behavior reads named, declared telemetry inputs and returns validated appearance
changes for its own widget. Inputs carry primitive value/null, quality, source timestamp
and configured unit. Capture latest-known inputs together; cross-device sampling is
not necessarily simultaneous. Never substitute demo values or zero for missing data.
Future receipt timestamps and optional maximum source-time skew need explicit support.

All widgets share scheduling, input configuration, testing and diagnostics. A widget
registry declares supported outputs: text/color where semantically defined, position
and rotation for supported placeable widgets, later visibility/enabled and specialized
properties. No arbitrary DOM/SVG/CSS or cross-widget mutation. Enabled state is UX,
not authorization. Components and faceplates expose named input parameters.

Each property has one owner: static, binding, expression or behavior. Reject competing
owners for new behavior configuration when ownership enforcement is implemented.
Position is a pixel offset from saved geometry; rotation is a degree offset around
the established center. Apply existing geometry transforms to ports/connections.
Overrides do not accumulate, alter the document or enter undo history. Each successful
result atomically replaces prior overrides; omitted properties revert to baseline.

Use fresh stateless contexts, synchronous execution, no network/modules/credentials,
no timers or asynchronous jobs. Remove nondeterministic clock/random facilities for
the new behavior API. Bound source/input/output sizes, interpreter work and total screen
workload; test exact bundled engine limits. Existing 8 MB/256 KB/50 ms interpreter
settings and Worker watchdog are a starting point, not a proven capacity guarantee.

Subscribe only to declared inputs, share subscriptions, trigger on value/quality and
stale transitions, coalesce bursts, retain latest pending snapshot, discard obsolete
results and suspend inactive screens. Choose rates from measurements. Baseline fallback
clears overrides and presents separate diagnostics. Optional hold-last requires a visible
quality indication. Repeated failures need quarantine/retry rules.

Appearance scripts cannot issue device commands. Operator scripts retain their
controlled action path. Design edits drafts, Preview tests drafts with simulated
commands, Runtime evaluates immutable published configuration.

## Authoring and reuse

Inspector Behavior section: inputs, outputs, source/template, fallback. Editor supplies
API/input autocomplete and diagnostics. Test panel controls sample values, quality and
timestamps and previews outputs. Runtime diagnostics identify widget, version, location,
duration and fallback. Save API version, source, dependencies and template identity.

Start with versioned copy-in templates: threshold color, equipment state, formatted
text, multi-input label, clamped linear motion, valve rotation and quality fallback.
Each includes typed input slots, parameters, supported outputs and test fixtures.
Updates never silently alter published behavior. Later add project-local pure functions
and explicitly pinned shared definitions bundled at publication; no remote runtime imports.

## Phases and acceptance

1. **Contract and inputs:** optional versioned configuration, named subscriptions and
   read-only input snapshots. Legacy documents/scripts remain valid. Only declared
   sources enter snapshots; missing/stale/disconnected/invalid data stay explicit.
2. **Runtime foundation:** capability registry, ownership enforcement, validated replacement
   text/color results, fallback application, bounded scheduler and diagnostics. Same
   snapshot yields same output; obsolete results cannot apply; failures recover visibly.
3. **Geometry:** position/rotation overrides. Verify no accumulation or document mutation,
   including port/connection alignment and browser rendering.
4. **Authoring/templates:** integrated configuration, editor, simulation panel and reviewed
   templates; designers can configure all four properties without typing entity IDs.
5. **Hardening:** malformed outputs, loops, memory pressure, bursts, Worker recovery,
   navigation/mode races, import/export and published runtime checks. Run aggregate
   verification and independent plus human security review before release.

## Phase 1 implementation boundary

`behaviorConfig` is optional: apiVersion 1, up to 32 named binding inputs, unique
output declarations and baseline fallback. Existing `behavior` source and APIs remain.
Configuration survives model serialization and contributes authorized realtime requests.
Declared primitive snapshots are exposed as frozen `inputs` and in `context.inputs`;
legacy context.value/quality/name and hmi methods continue to work. No UI is added yet.
The existing two-second behavior schedule remains. Output declarations/fallback are
persisted contracts only in phase 1; phase 2 will enforce ownership and apply new results.
Geometry, determinism restrictions, scheduler, receipt timestamps and template UI are pending.

Subscription requests still pass through the existing authenticated gateway and upstream
permissions. Snapshot filtering is not authorization. Tests use fake data only.

The existing gateway ceiling of 100 bindings per subscription remains unchanged.
Large screens can exceed this limit, including through existing property bindings;
screen-wide capacity diagnostics remain required before the authoring UI rollout.
Requests exceeding the ceiling fail closed rather than widening access or limits.

## Verification (2026-11-15)

Node 22.22.3, `npm ci`, and final `npm run verify` executed: typecheck, lint,
format, 132 Node tests, production build and browser smoke gates passed.
Initial bundle warns at 1.00 MB (1.40 kB above the unchanged warning budget).
The first restricted run could not open test ports/build successfully; the final
run used permitted local test servers. No real equipment or credentials were used.
Independent source review confirmed subscription deduplication and immutable input
maps after corrections; eight focused scripting/input tests passed in review.
Human security review and new configuration UI/browser coverage remain pending.
Existing unrelated working-tree edits were preserved. No commit or deployment.

## Phase 2 runtime foundation

Implemented opt-in `behaviorConfig.resultMode: "appearance"` (API version 1).
Omitting resultMode or using `"effects"` preserves the phase 1/legacy hmi effects API,
including named inputs. No migration is performed. New appearance behavior returns
`{ text?: string, color?: string }`; source remains in `behavior`. For example:

```javascript
if (inputs.temperature.quality !== 'good') return { text: 'Unavailable', color: '#808080' };
return { text: String(inputs.temperature.value), color: '#329c8c' };
```

Declare every returned property in `outputs`. Unknown, unsupported, unowned or invalid
outputs fail the entire result. Text is plain text (300 characters); color is six-digit
hex. Omitted output properties restore their configured baseline. The supported-output
registry lives in `packages/model/src/behavior.ts`: controls expose their display text;
chart/gauge widgets expose text and accent; HTML/iframe/Markdown expose neither;
pipe fittings expose color only. Value-widget text retains its existing unit-suffix
meaning. Renderer quality/style rules may override an accent to communicate bad data.
Phase 3 adds position/rotation declarations in the same opt-in mode, as described below.
Legacy-mode metadata remains permissive for compatibility.

New-mode ownership/capability conflicts are rejected by project validation for screen
widgets, component versions and faceplate templates, and checked again by the runtime.
An enabled text/color binding cannot compete with a new behavior owning that property.
Click scripts cannot overwrite new-mode behavior-owned properties. Device action paths
are unchanged. The existing script test/example controls understand the opt-in mode;
full configuration UI remains phase 4.

New behavior contexts accept only bounded primitive values and at most 32 named inputs;
input objects are frozen. Date and Math.random are unavailable. No hmi side-effect API,
DOM, network, modules, timers or host credentials are exposed. Fresh QuickJS contexts
retain the existing memory/stack limits and 50 ms evaluation deadline, with the Worker
watchdog. Only synchronous plain appearance results are accepted; serialized output is
bounded inside the VM before host conversion. Configured inputs still require authorized
subscriptions; this does not add a new gateway permission or telemetry-fetch API.

### Scheduling and failure policy

The scheduler maintains at most one active behavior evaluation plus one latest pending
snapshot per widget (maximum 500 widgets). Starts are spaced at least 100 ms apart:
**at most ten behavior evaluations per second across the active screen**, round-robin.
This is a conservative initial ceiling, not a screen refresh guarantee. A screen with
many scripts may have long waits; benchmark-based tuning remains phase 5. Existing
property-expression evaluation has its separate pre-existing queue and shares the Worker;
this phase does not claim an aggregate budget for every type of script in the app.

Named-input changes trigger through Angular signals; stale transitions are sampled on
the existing two-second freshness tick. Updates coalesce while work is pending. New
appearance scripts rerun on snapshot/configuration changes; legacy effects scripts also
retain periodic reevaluation. Inputs represent latest-known samples, not simultaneous
cross-device measurements. No synthetic live values are substituted.

A new appearance job immediately restores baseline while waiting, including after input
changes. Each successful result replaces the whole override atomically. Obsolete input,
screen, mode, user or document results cannot apply. Screen/document instance replacement
resets scheduling even when IDs and values match. Design mode and destruction stop queued
behavior work; in-flight Worker work is bounded and its eventual result is discarded.

Failures restore baseline, retry within the rate cap, then quarantine after three failures.
Changing input alone does not revive quarantine; editing source/configuration does.
Legacy effects retain prior appearance while awaiting refreshed execution for compatibility;
failures still restore baseline. The existing script console shows current pending/ok/
error/quarantined state, duration and fallback message per widget; bounded logs record
failures and recovery. New-mode results never rewrite saved geometry, source or history.

### Phase 2 acceptance evidence

Focused tests cover multi-input results, legacy hmi evaluation, unavailable clock/random/
network APIs, immutable inputs, malformed/async/oversized results, infinite loops and
recovery, ownership/capability rejection, scheduler coalescing, fairness, rate limits,
obsolete-result rejection, baseline while pending and quarantine/retry rules.
A browser regression exercises real Worker/WASM execution, opted-in text/color, atomic
fallback on an invalid color, phase 1 configured hmi scripts with named inputs and
Design-mode baseline restoration. Full verification and final review results are recorded
below after execution. Human security review remains required before production release.

### Phase 2 final verification (2026-11-15)

Used Node 22.22.3 and `npm ci`. Final `npm run verify` passed typecheck, lint,
format, all 140 Node tests, production build and browser smoke. The real Worker/WASM
browser regression also checks periodic configured-legacy execution with unchanged
named inputs. Sixteen focused scripting/input tests passed in independent review.
`git diff --check` passed. The final build warns at 1.01 MB (7.70 kB above the unchanged
1 MB initial warning budget); no dependencies, budgets or lint rules changed.

Independent review found and confirmed fixes for explicit legacy compatibility,
same-ID document replacement, pending baseline/status and configured-legacy periodic
reevaluation. No remaining scoped blockers were reported. Human security review is
pending before production release.

Earlier runs exposed restricted-port/build failures, corrected type/lint defects and
a wall-clock interruption under parallel test load (also observed in an existing
binding-expression test). The final full run passed without increasing deadlines or
suppressing failures. This is not a sustained performance or hostile-script soak.
New authoring/configuration UI and hardware-specific capacity measurements remain
pending. PostgreSQL/performance gates were not run for this browser/runtime-only change.
Unrelated concurrent working-tree edits were preserved; no commit, push or deployment.

## Phase 3 runtime geometry

Opt-in appearance scripts may now return geometry alongside text/color:

```javascript
return {
  position: { offsetX: 80, offsetY: -50 },
  rotation: { offsetDegrees: 30 },
};
```

Declare `position` and `rotation` in the existing `outputs` list. Both capabilities
are supported for every placeable widget, including dashboard and embedded-content
containers. Existing semantic text/color capabilities are unchanged. Legacy effects
scripts and configurations without `resultMode: "appearance"` remain unchanged.

Offsets use screen pixels and degrees relative to the saved widget, independently of
zoom/pan. Position requires both offsetX and offsetY; each must be finite and within
-4000..4000. Rotation requires a finite offsetDegrees within -360..360 and normalizes
the resulting angle. Nested objects reject extra keys, getters and nonnumeric values
before serialization inside QuickJS. Host validation repeats schema/ownership checks.

Rotation is centered on the saved widget center, then translated by the position
offset. Shared `widgetContentSize`, `rotationTrig` and angle normalization preserve
logical content dimensions, quarter turns, free angles and SVG letterboxing. Zero
and full-turn offsets preserve the exact original bounds/rotationSize, including
fractional saved angles. The outer bounding box changes to enclose rotated content;
there is no implicit resizing, clamping or movement to make an invalid result fit.
The whole result fails atomically if any geometry extends beyond the screen. Text
and color from that failed result are discarded too, under the existing baseline/
retry/quarantine rules. Omitted geometry restores saved geometry.

A single runtime presentation feeds widget rendering, port placement, connection
routing, signal decorations, obstacles and crossing bridges. Ports retain IDs and
occupancy; connection bend pins retain their saved absolute coordinates. Pipe fitting
internal `pipeRotation` continues through the existing shared port logic. Runtime
transforms affect only the owning widget, including when it belongs to an editor group.

Bindings, simulation values and script contexts resolve against original document
widgets, since presentation clones must not invalidate identity-based binding caches.
On document changes, old results are revalidated for rendering and fall back atomically
until scheduling resets/replaces them. Runtime geometry never enters the document,
serialization, undo or redo. Design mode shows saved geometry; Preview and Runtime
use the same presentation pipeline over their respective draft/published documents.

Phase 3 verification includes mathematical tests for centered transforms, logical
content size, fractional angles, non-accumulation, bounds, nested/finite output and
ownership validation, process/signal port transforms, pinned routes, and store/history
invariance. A real Worker/WASM browser regression checks actual SVG port faces against
rendered route endpoints at multiple zooms, repeated refresh, and Design restoration.
Full authoring controls and templates remain phase 4; sustained load measurements
and production security review remain phase 5/release work.

### Phase 3 final verification (2026-11-15)

Node 22.22.3, `npm ci` and final `npm run verify` executed: typecheck, lint,
formatting, all 145 Node tests, production build and browser smoke gates passed.
Independent review found the fractional-angle zero/full-turn issue; it was fixed
and covered by a regression. Reviewer re-ran 21 focused tests and reported no
remaining scoped blockers. No dependencies, budgets or existing test gates changed.
The initial bundle warns at about 1.01 MB, 10.22 kB above the unchanged warning budget.

The browser test compares actual SVG faces and process/signal route endpoints at
multiple zoom levels, checks repeated refresh without accumulation and saved recovery
geometry after returning to Design. Screenshot evidence:
`artifacts/verification/runtime-geometry.png` (visually inspected). Editor drag/rotation
ghosts are used only in Design, so they cannot override runtime routing.

Geometry output is tested in Preview through the shared Preview/Runtime pipeline;
a separate published-release Runtime scenario was not added in this phase. Sustained
telemetry/routing load, PostgreSQL and additional performance gates were not run.
Human security review is pending before production release. Unrelated concurrent
working-tree changes were preserved. No commit, push or deployment was performed.

## Phase 4 authoring and live telemetry

Open a widget's **Script** inspector and choose **Open behavior editor** in Design.
The editor keeps a local draft of behavior source/configuration. Apply validates and
saves a single undoable widget edit; Cancel/Escape discard the draft. Existing
scripts keep the effects API, including phase 1 named-input scripts. Switching API
never silently rewrites source. Inserting a template explicitly replaces draft
source and selects the appearance API; Cancel still preserves the saved widget.

### ThingsBoard input configuration

Use the existing authenticated device/asset browser to discover telemetry keys or
attributes, enter a script alias and select **Use selected source**. No entity UUIDs
need to be typed. Set display unit and freshness per input; select Settings to update
an existing alias, or remove an unused alias. Source selection replaces an existing
alias only in the draft. Alias names follow the existing validated identifier rules;
at most 32 inputs are supported. Apply/Test also reject screens exceeding the
unchanged gateway ceiling of 100 distinct source bindings.

The live table displays subscription-backed raw value, quality and source timestamp
for each selected input. Quoted values are strings as received from ThingsBoard.
Catalog/browser samples are fetched snapshots and are labelled separately; they
are never substituted into the live table. Missing or disconnected signals never
borrow widget demo values. Normal script/runtime subscriptions remain unchanged
until Apply. The draft has its own gateway WebSocket subscription, requests no alarms
and closes on dialog destruction. Late events from replaced sockets are ignored;
freshness timers and reconnect timers are cleaned up on destruction. Existing gateway
session and upstream ThingsBoard permissions continue to authorize access. No tokens,
credentials, arbitrary URLs or database access are exposed to the editor.

### Source editing and diagnostics

The source editor has API/named-input completions when typing dotted references,
Ctrl+Space suggestions, keyboard navigation/selection, snippet insertion, Tab
indentation and the existing 20,000-character bound. The reference describes values,
qualities, timestamps, units, output ownership and geometry. Tests evaluate the
captured source in the existing bounded QuickJS Worker and report authored source
line numbers for script errors. Source is not evaluated on each keystroke. Appearance
scripts return owned output properties; enabled binding conflicts are reported.
Existing activation/double-click source editing stays on the existing action path.

### Live testing and simulation

Live ThingsBoard snapshot is the default test input mode. Named inputs come solely
from the draft subscription. Main `context.value` uses an explicit configured constant
or an authenticated primary source; it is null/unknown when no source exists, when
signed out, or when the parent context is simulated. It never mislabels a demo value
as live telemetry. Main bindings are resolved by the existing screen runtime; the
editor does not widen their capabilities.

Local simulation allows JSON/text primitive values, quality and timestamp per input,
plus a simulated main value/quality. Copy live snapshot is an explicit one-time copy;
subsequent live updates never overwrite simulation samples. Simulation maps support
all permitted aliases, including prototype-named identifiers. Simulated samples stay
in the dialog and are absent from saved projects and ThingsBoard writes. Live input
rows remain separate while simulation is selected.

Test results identify input mode, capture time, exact evaluated input snapshot,
duration and calculated output, with an isolated
widget preview against saved bounds. Geometry uses the shared runtime transform and
screen bounds validator. Controls are noninteractive and embedded HTML/iframe content
uses a placeholder rather than loading a remote page in the test preview. Tests never
execute effects such as notifications, navigation or device commands. Results from
changed drafts/input snapshots or closed dialogs are discarded. The running screen,
document and history remain untouched until Apply. A stale editor refuses Apply if
the document, selected widget, screen or mode has changed.

### Versioned copy-in library

Seven templates ship: threshold color, equipment state, formatted telemetry, two-input
label, linear movement, position-to-rotation and quality-aware indication. Each has
declared input slots/outputs, parameter defaults and version 1. Map slots to configured
aliases; parameters are type/range checked and safely serialized into local source.
Numeric templates support both finite numbers and non-empty numeric strings from
ThingsBoard, without coercing empty text or booleans to zero. Equipment state accepts
explicit boolean or 0/1 representations rather than arbitrary truthiness. Templates
handle unavailable data explicitly. Unsupported widget outputs cannot be inserted.

Saved `behaviorConfig.template` records origin ID/version; the complete source remains
local and editable. Library updates cannot alter saved/published widgets. Template
parameters and slot mappings are compiled into source, not remote runtime dependencies.
This phase adds the built-in reusable library, not user-authored/shared project modules
or a new remote package mechanism. Those remain a separately scoped later capability.

### Phase 4 final verification (2026-11-16)

Used Node 22.22.3 and `npm ci`. Final `npm run verify` passed typecheck, lint,
formatting, all 154 Node tests, production build and all 17 browser checks. The
authoring tests cover all seven template defaults/fallbacks, parameter escaping,
noncascading alias remapping, numeric telemetry strings, source-line diagnostics,
live/demo separation, capacity/ownership validation, persistence and one-step undo.
A provider-lifecycle test verifies replaced-socket events are ignored, alarms remain
opt-in per connection and destruction closes the subscription/clears data.

Browser checks use a fake authenticated ThingsBoard contract and real gateway-facing
WebSocket messages: fetched catalog samples differ from changing live values; string
telemetry, disconnect/recovery, multiple aliases, numeric template parameters, keyboard
completion, local simulation, syntax errors, cancel/cleanup, Apply, runtime subscription
configuration and Undo are exercised. A signed-out regression excludes demo primary
values and verifies the valid `toString` alias in simulation. No device command
requests are emitted. Screenshot `artifacts/verification/behavior-live-editor.png`
was visually inspected.

Independent review found and confirmed fixes for live main-context provenance and
prototype-named simulation aliases, then ran eight authoring tests with no remaining
scoped blockers. Human security review remains pending before production release.
The initial bundle is about 1.02 MB (19.02 kB above the unchanged 1 MB warning
budget); dependency versions, lint rules and budgets were not changed.

Intermediate runs exposed corrected type issues, the previously observed wall-clock
interruption in an existing binding-expression test, and one existing browser
page-reopen navigation timeout. Final verification passed without raising deadlines,
adding retries or suppressing failures. Real equipment, production credentials and
an actual ThingsBoard server were not used; this verifies the existing integration
contract, not a live deployment. PostgreSQL, sustained load, additional performance
gates and a separate published-release authoring roundtrip remain untested here.
Unrelated working-tree changes were preserved. No commit, push or deployment.

## Phase 5 security, recovery and measured load

### Boundary hardening

User source is now encoded as data and compiled into a separate function **inside
QuickJS**. The trusted caller owns output validation and serialization; closing a
user function cannot escape into that caller. This does not use browser-native
Function/eval or expose host functions. Documented hmi/context/expression APIs and
legacy global-this behavior remain supported. Undocumented access to the old generated
wrapper's private variables is intentionally removed.

All three evaluation modes convert output to bounded JSON in the VM before crossing
the host boundary. Appearance output retains its 8,192-character serialized cap;
legacy effects and expression results have a 160,000-character serialized cap.
Existing effect count/string limits remain. Normal existing scripts/expressions are
covered by regressions; exceptionally large legacy expression outputs now fail rather
than allocating unbounded host results. Errors, including hostile getters/toString,
are inspected by a separately captured trusted formatter within the interpreter's
remaining deadline, capped at 2,000 characters per message/stack. No user error/result
objects are traversed by host `vm.dump`. Result/formatter/error handles dispose on
success and failure, including rejected JSON/output. Authored line diagnostics remain.

The unchanged 8 MB memory and 256 KB stack settings apply to fresh runtimes. The
unchanged 50 ms interpreter deadline now uses monotonic time and starts after trusted
VM/formatter initialization. Script-controlled clocks cannot change it. Contexts use
JSON parsing rather than object-literal interpolation, so prototype-named JSON fields
remain data. Appearance API clock/random/host/network restrictions remain; legacy API
capabilities are preserved. These are tested isolation controls, not formal sandbox
certification or a proof against engine vulnerabilities.

### Bounded dispatch and failure recovery

The shared Worker client permits **one in-flight request and at most 64 total pending
requests** across behavior, expressions, editor tests and activation scripts. Captured
context snapshots are cloned and capped at 160,000 serialized characters. The existing
five-second watchdog starts on dispatch, not during queue wait. Overflow rejects new
work clearly; crashes, malformed replies and message errors terminate the Worker and
reject outstanding work. Later requests create a new Worker; late old-worker messages
are ignored. Application destruction disposes it. Failed WASM initialization clears
its cached promise so a later attempt can reload the asset.

Property resolution now submits at most eight widgets at once, retaining its existing
ordered property evaluation and abandoning superseded batches between windows. This
keeps legitimate 500-widget documents from flooding the bounded transport. Actual
input/configuration/freshness changes invalidate old cached binding results immediately;
while a newer batch is pending, existing conservative defaults show bound values as
unknown and keep unavailable bound controls disabled. This is a screen-wide availability
tradeoff under overload, including otherwise healthy widgets. Identical freshness ticks
do not reset work. Time-capable legacy property expressions still refresh on idle periodic
ticks, without superseding identical in-flight batches or clearing valid same-input results.
Behavior
coalescing and the ten-starts-per-second screen ceiling remain unchanged. This ceiling
limits output throughput even when telemetry arrives much faster; these tests do not
claim to render every telemetry sample or guarantee freshness under continuous overload.

Failures count against their behavior definition even if newer telemetry supersedes
the failed invocation. Fast telemetry cannot defeat quarantine. Definition-scoped errors
restore baseline and publish diagnostics even when the old success-snapshot guard is
false. Three failures still quarantine; the console now offers **Retry behavior** to
retry the same source after a transient failure, without editing or republishing it.
Retry invalidates old in-flight work and respects the existing rate cap. Empty error
messages remain failures. No returned action is executed by behavior retries.

### Reproducible tests and measurements

- `npm run verify`: full compatibility, security, Worker-client, scheduler, model,
  gateway, production-build and browser smoke gates.
- `npm run benchmark`: existing 500-widget domain benchmark.
- `npm run benchmark:scripting`: 200 fresh-runtime evaluations per API mode after
  warmup; writes `artifacts/benchmarks/scripting-engine.json` with p50/p95/max and
  observational process-memory readings.
- `npm run test:performance`: existing 50-tag burst plus a **30-second** synthetic
  20 Hz stream, 12 tags/widgets (ten multi-input appearance, two legacy behaviors),
  12 property expressions and a routed connection. Writes
  `artifacts/benchmarks/scripting-load.json` with actual injection/drain duration,
  delivered sample count, observed rate, Worker latency/mode counts, frame gaps,
  long tasks, observational heap and one sampled node's identity.

Adversarial tests run hostile error getters, output serializers, memory pressure and
infinite loops in a child process with an outer eight-second test guard. They verify
fresh-context recovery, unavailable capabilities, bounded errors, wrapper-closing source,
prototype JSON data, oversize outputs and result cleanup. Worker tests cover overflow,
immutable queued snapshots, crashes, malformed/late replies, timeout, dispatch-vs-queue
watchdog timing, clone/size rejection and disposal. Browser tests force repeated Worker
failures and unavailable WASM assets, verify visible quarantine/baseline, then recover
through explicit retry with real Worker/WASM execution. A published-release regression
also verifies Runtime source/geometry remains separate from later draft source changes.

Measurements are local synthetic evidence on this machine, not a production SLA,
certified memory-leak result, real ThingsBoard validation or multi-hour soak. Frame/heap
observations include browser startup, caches and garbage-collection noise. User/tenant
permissions, real-equipment safety, operational interlocks, production credentials and
command authority remain gateway/controller responsibilities. Human security review
is still required before production release; no commit or deployment is authorized here.

### Phase 5 final verification and measured limits (2026-11-16)

Node 22.22.3, `npm ci`, final `npm run verify`, `npm run benchmark`,
`npm run benchmark:scripting` and `npm run test:performance` executed. Final gates:

| Check                           | Result                                                           |
| ------------------------------- | ---------------------------------------------------------------- |
| Typecheck, lint, formatting     | Passed                                                           |
| Node regressions                | 166 passed                                                       |
| Production editor/gateway build | Passed; original warning budget unchanged                        |
| Browser smoke                   | 22 passed                                                        |
| Browser performance             | Both tests passed, existing 45-second per-test timeout unchanged |
| 500-widget domain benchmark     | Completed                                                        |
| QuickJS fresh-runtime benchmark | 600 measured evaluations plus warmup completed                   |

Final 30-second load on this macOS/arm64 machine: 589 batches at observed 19.60 Hz
(target 20), 7,080 tag values including the distinct final drain sample, 12 scripted
widgets, 12 property expressions and a routed connection. All caught up to final value
137.5 in **1,644.56 ms** after injection ended. All 7,476 dispatched Worker requests
completed; maximum in-flight count was **one**, page errors **zero**, one sampled DOM
node retained identity. Dispatch-to-reply p50/p95/max were **0.2/0.7/97.3 ms**; these
exclude host queue wait and include startup/VM initialization. End-to-end catch-up
includes coalescing and queue effects. Sampled frame-gap p95 was **16.7 ms**, with one
65 ms long task. These observations are evidence, not fixed pass thresholds or an SLA.

Fresh-runtime Node evaluation p95: appearance **0.748 ms**, legacy effects **0.447 ms**,
property expression **0.420 ms** (200 measurements each after 20 warmups). Process and
Chromium heap observations are retained in JSON artifacts but do not establish leak
freedom; Chromium values may be coarse/rounded. The screen's ten behavior starts/second
ceiling remains: fast telemetry is coalesced, not rendered sample-for-sample. No global
hard-real-time or CPU-utilization guarantee is claimed for native interpreter operations.
The independent Worker watchdog remains the recovery boundary for a stuck Worker.

Security review found a generated-wrapper escape and a stale-failure diagnostic gap;
both were fixed and covered by adversarial regressions. Independent scoped review then
reported no remaining blockers, including final periodic-expression compatibility. Load
testing also caught unchanged-tick churn after adding conservative pending binding
fallback; snapshot/freshness coalescing fixed it. The overload browser regression now
verifies initial good value 42 becomes unknown under continuously superseded slow
expressions and recovers to fresh 999 after drain. Published Runtime source/geometry
and legacy Date-based expressions have dedicated regressions. New fixture typing/lint
and a wrong mocked publication endpoint were corrected without suppressing failures.

The initial bundle warns at about **1.02 MB**, 21.91 kB above the unchanged 1 MB warning
budget. Dependency versions, lint rules and execution/test budgets were not raised.
Human security review, a third-party dependency/engine audit, real ThingsBoard and
real-equipment validation, multi-hour soak and hardware-specific production capacity
approval remain outside this automated evidence. PostgreSQL was not run for this
browser/interpreter-only change. No production credentials or equipment were used.
Unrelated working-tree changes were preserved. Nothing was committed, pushed or deployed.
