# Control and action editor

The existing Actions inspector now configures published ThingsBoard RPC commands,
typed control-value mapping, validation, authority restrictions, reply checks and
reported-value confirmation. The existing application styling and event/script
model remain in place. No new dependencies or budget increases are required.

## Configure a control

1. Select a slider, switch, dropdown, radio group, multi-state button or ordinary
   action widget. Open **Properties → Actions** and select the activation or
   double-click event. Choose **Device command**.
2. Browse or enter a device UUID, set the RPC method and static JSON object. Assets
   may supply readback data, but a device is required for the command target.
3. Enable **Map the control value into a parameter** to insert the requested value
   into one named top-level parameter. Choose Number, Boolean or Text. Configure
   optional numeric minimum, maximum, step and allowed values. Published slider
   limits/steps and option lists also constrain the value at the gateway.
4. Set a reply timeout (5–60 seconds), confirmation message and optional ThingsBoard
   authority restriction. Authority restrictions narrow existing access; they do
   not grant project or device access. Projects remain private to their owner.
5. Optionally enable **Device reply validation**. For example, require a top-level
   `success` field equal to JSON `true`. Without a rule, accepted means a reply
   arrived, not that an application-level operation succeeded.
6. Optionally enable **Reported-value confirmation**. Bind the widget's Value to
   a telemetry/attribute source under Data first. Mapped commands expect that value
   to match the requested input; static commands require an explicit expected
   value. Set a readback deadline and numeric tolerance.
7. Choose **Save action**. The inspector preserves its current unsaved draft when
   switching inspector tabs. Changes remain subject to project validation/history.
   Save/publish a release before Runtime can use a revised command configuration.

Example: a slider covers 10–80 rpm in steps of 5. Static parameters are
`{"channel":2}` and the input maps into `speed`. A request for 35 produces
`{"channel":2,"speed":35}`. Requests for 32, 85 or string `"35"` are rejected.
The browser cannot supply a different device, method or whole parameter object.

## Preview testing

**Test command mapping** uses the inspector's unsaved settings and an explicit
JSON test value. A simulated authority lets you test the allowlist. This test does
not run activation scripts. It opens the same confirmation flow and shows the
resolved payload. Choose reply plus matching reported value, reply only, device
failure, or timeout, then **Simulate command**. No gateway command endpoint or
physical device is contacted. Reported simulation values are explicitly labeled.

Preview controls also exercise their saved actions through the normal activation
and script path. Their local requested inputs are separate from saved project
values. Existing rules still apply: unavailable bound sources are not replaced
with fabricated live data. Use the explicit mapping test when working offline
with a configured but unavailable readback source.

## Runtime feedback

Confirmation shows the device, method and resolved parameters before sending.
The feedback card distinguishes requested and reported values and progresses
through confirming, sending, accepted and, when configured, confirmed. Invalid,
denied, failed, timeout and cancelled states remain visible. The card stays clear
of an open inspector. Activation scripts receive the requested value as
`context.value`; `hmi.runAction()` can request only the configured action.

An accepted reply is not reported-state confirmation. A matching value must have
usable quality and a source timestamp later than both dispatch and the last
pre-dispatch observation. Samples received while waiting for the reply can qualify
once the reply is accepted. Older/stale values and a pre-existing future-dated
sample do not qualify. Numeric matching accepts numeric telemetry strings within
tolerance; boolean matching supports native booleans and true/false/1/0 wire values.
Text matching follows declared control option values. Numeric process symbols
retain finite-number validation.

One command is active at a time. Controls are disabled while confirmation, sending
or configured readback monitoring is active. Mode, screen and project navigation
wait for completion/timeout; logout clears local command context and records an
in-flight warning when relevant. Cancel before sending issues nothing. Deadlines
are bounded, no command is automatically retried, and reset contexts discard late
HTTP results. A timeout leaves the physical outcome unknown: check actual equipment
state before issuing another request. A matching telemetry value is still not a
substitute for controller-enforced process interlocks.

ThingsBoard documents [two-way RPC reply and timeout behavior](https://thingsboard.io/docs/user-guide/command-and-control/).
The gateway preserves its existing two-way endpoint and the legacy 10-second
default. Its transport deadline includes 5 seconds beyond the configured RPC timeout;
the browser includes 7 seconds. Upstream HTTP 504 is represented as timeout rather
than a successful acknowledgement.

## Validation and ownership boundaries

Published device/method/static parameters/rules are authoritative. The command
request adds only a typed scalar `value` when a mapping exists. The gateway checks
that value, authority, published control constraints and static disabled/hidden
states before calling ThingsBoard. It retains session, Origin, CSRF, project owner,
release and command-enable checks. Upstream ThingsBoard device permissions still
apply. Arbitrary object paths and prototype-related mapping keys are disallowed.

Duplicate request IDs with identical resolved parameters reuse the result; reusing
an ID with a different value returns conflict. Deduplication remains process-local,
not durable exactly-once delivery. Dynamic visibility/enablement and data freshness
are client presentation checks; they are not server authorization or interlocks.
Separate engineering/operator/publisher grants and durable outcome auditing remain
outside this delivery. Feedback records are session-local and not an audit journal.

## Contributor map and evidence

| Boundary                                                                                           | Implementation / evidence                                                                   |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Command policy schema, type/range/step/choice validation and reply/readback predicates             | `packages/model/src/commands.ts`, `tests/commands.test.ts`                                  |
| Typed boolean/text-choice source resolution, numeric symbol compatibility                          | `packages/model/src/index.ts`, `packages/bindings/src/resolve.ts`, `tests/bindings.test.ts` |
| Inspector draft, device browser, fields, save and explicit Preview test                            | `apps/editor/src/app/action-editor.component.{ts,html,css}`                                 |
| Small on-demand execution entry point                                                              | `apps/editor/src/app/command-state.service.ts`                                              |
| Confirmation, simulation, RPC lifecycle, freshness/deadlines and context cleanup                   | `apps/editor/src/app/command-runtime.service.ts`, `tests/commands.test.ts`                  |
| Confirmation dialog and non-overlapping operator feedback                                          | `apps/editor/src/app/command-feedback.component.ts`                                         |
| Published policy enforcement, scalar input validation, deduplication conflicts                     | `apps/gateway/src/projects/projects.controller.ts`, `tests/gateway.test.ts`                 |
| Configured network deadline and upstream timeout classification                                    | `thingsboard.client.ts`, `session.service.ts`                                               |
| Actual Preview input flow, no-RPC assertion, mocked Runtime acceptance then telemetry confirmation | `tests/smoke/editor.spec.ts`                                                                |

Run `npm run verify`. Logs are generated in `artifacts/verification/`. Browser
artifacts include `action-editor.png` and `command-feedback.png` under
`test-results/`. Tests use isolated loopback ThingsBoard fakes and mocked browser
API/WebSocket responses; they never contact the LAN server or real equipment.
Self-review traced published request validation, input/script forwarding, old and
new source types, request identity, freshness, timers, reset generations and lazy
load failure. Independent review remains pending. Suggested review: live 4.4 reply
payload conventions, permissions changing during a session, logout/disconnection
with outstanding operations and representative long-running telemetry load.

Current scope is one scalar mapped into a top-level JSON object field, one active
command, optional exact top-level reply-field matching and the widget Value as
readback. Nested payload mappings, arbitrary transforms, queues, multiple readback
conditions and PLC-side permissives are future work. No real ThingsBoard 4.4
command or physical operation has been verified by this automated evidence.

A browser regression also delays an activation-script result across a workspace
mode change. The old result is discarded instead of opening a command confirmation
in the new context. This protects Preview intent from being promoted after an
asynchronous script completes. The rotation regression waits for rendered geometry
and paint after undo/redo, allowing only subpixel layout rounding before dragging.

## Offline example screen

In Design, open **Symbols → Input controls → Add command Preview example** (or
search the library for `command`). This adds **Command Preview lab** without
replacing existing screens, fits it to the workarea and opens Preview.

- **Speed setpoint:** 0–100 slider, initially 30. The command accepts only 10–80 in
  steps of 5. Move to 35 for a valid `speed` parameter; use 95 to see rejection.
- **Pump enable:** boolean toggle mapped into `enabled`.
- **Operating mode:** Manual and Automatic map to `manual`/`auto`. Maintenance is
  deliberately rejected by the command's extra allowlist.

Every control already has confirmation, a two-second readback deadline and saved
mapping rules. Simulate reply plus matching reported value for confirmation, reply
only for a readback timeout, or choose failure/timeout. In Design, select a control
and open Actions to inspect its rules or test custom values and simulated authority.

These generated commands have no live bindings, use an unassigned target UUID and
carry a saved `policy.previewOnly` flag. Their explicitly simulated display values
are available even when signed in, without substituting values for ordinary live
bindings. Both the client and gateway reject these commands in Runtime. Copies,
publication and Actions-panel edits preserve the flag; the inspector identifies
them as Preview-only. Create a separate control when configuring real equipment.

`tests/command-preview-example.test.ts` checks the gallery schema, lack of sources
and mapped values. Browser coverage inserts the screen while preserving every
existing screen, operates all three controls offline, exercises validation and
readback timeout, inspects saved settings and verifies zero command requests.
The gateway test publishes an example with a valid-looking device UUID and verifies
that its Preview-only policy still prevents any upstream RPC. The browser artifact
is `command-preview-lab.png`. No real equipment or LAN ThingsBoard was used.

The lab's Preview toolbar includes **Reset example**. It restores the controls to
30 rpm, Stopped and Manual, clears command feedback, cancels pending simulated
readback timers and returns the simulated outcome to matching reported value.
Reset changes only local Preview state; saved widgets and mappings are untouched.
The browser regression covers reset after failure and while awaiting readback,
including absence of delayed feedback and zero equipment requests.

### Preview command history

The lab has a collapsible Command history panel with one row per attempt, newest
first. Rows compare control/method, requested value, chosen simulation, simulated
reported value, current phase and validation/error details. Phase changes update
the same row. Dismissing feedback preserves the history; Reset example clears it
and cancels pending timers. Entries are session-only, bounded to the latest 100
Preview attempts and filtered to this lab's controls; Runtime commands are excluded.
No document schema or gateway contract changes are involved.

Acceptance evidence: the command Preview browser regression checks successful
mapping, preserved rows after dismissal, validation errors, reply-only timeout,
one row per attempt and empty history after reset, including delayed-timer checks.
Independent review is pending. Review checklist: Preview/Runtime separation,
reset generation/timer cancellation, bounded session state, stable row identity,
unchanged saved mappings and bundle budgets.

### History filters

The history panel has compact Control and Result selectors. Filters combine,
with result choices separated into current status and chosen simulation, so a
Reply only attempt can still be found after it reaches a readback timeout.
Validation errors toggles the invalid-status filter; the control selection stays
active. Clear filters restores all retained rows without deleting history. The
header shows matching / total counts and empty matches explain how to recover.
Reset example clears history even with active filters. Filters are local view
state and remain selected until cleared or the panel is remounted.

Acceptance evidence is in the command Preview browser regression: combined
filters, no-match state, quick validation filtering, simulation/status distinction,
restoring all rows, and resetting while filtered. Independent review remains
pending; review filter composition, signal updates as phases change, keyboard
labels/focus, reset behavior, saved-project immutability and unchanged budgets.

### CSV export

Export CSV downloads a snapshot of the currently filtered rows, newest first,
without changing the history, filters, command state or saved project. The button
is disabled when no rows match, including after Reset example. Files are named
`twynix-preview-history-<UTC timestamp>.csv` and contain UTC timestamps, control,
method, requested/reported JSON values, chosen simulation, status, quality,
validation/feedback message and attempt ID. Not simulated is explicit for validation
errors; blank requested values mean no value was supplied. UTF-8 BOM, CRLF records
and quoted/escaped cells support spreadsheet imports. Formula-like editable text
is prefixed with an apostrophe so it opens as text in spreadsheet applications.
Downloads are created locally; no backend or equipment request is involved. A
failed download start shows an error and retains the history for retry.

Acceptance evidence: CSV unit tests cover columns, timestamps, numeric/boolean/null
representations, Unicode, quotes, multiline text and formula-like names. The
command Preview browser regression downloads filtered validation and timeout rows,
checks their file content and filename, confirms export preserves rows, and checks
no-match/reset disablement. Independent review is pending; review CSV escaping,
filter snapshot semantics, download URL cleanup, empty/error states and unchanged
Preview-only command boundaries.

### Load sample history

Load sample history in the lab history header inserts seven marked local fixtures:
three confirmed commands (speed, enable and mode), two timeouts (unknown outcome
and reply-only/readback timeout), and two validation errors (95 rpm and Maintenance).
They refer to the actual lab widget IDs, so control/result filters and filtered CSV
export work immediately. Samples are labeled in each row and in exported messages.
Loading again refreshes this lab's sample rows, preserves interactive attempts and
other screens' history, keeps the 100-entry cap, and clears filters to reveal the
samples. It does not change controls, mappings or the current command/feedback.
Reset example clears samples and interactive attempts, including when samples
were loaded before the first command. Nothing is executed or sent to equipment.

Acceptance evidence: sample factory tests verify fixture counts, stable widget
references, types/outcomes, sample markers, CSV compatibility and untouched widgets.
The browser regression verifies reload without duplicates, filter/export samples,
reset before first command, and preserving four interactive rows when samples are
reloaded. Independent review is pending; review early engine registration/reset,
sample-versus-interactive identity, filter/CSV behavior and Preview-only boundaries.

### Clear history without resetting controls

Clear history in the panel header removes all sample and interactive rows for the
current lab, including rows hidden by filters. It leaves slider/toggle/dropdown
values, active filters, saved mappings, current feedback and pending simulation
unchanged. The button is disabled when the lab history is empty; CSV export is
also disabled after clearing. Other screens' history is retained.

An in-flight attempt may still finish and update its feedback, but its cleared
history row stays removed. Subsequent attempts record normally. Reset example
continues to clear history and feedback and restore control defaults.

Acceptance evidence: the command Preview browser regression clears eleven mixed
rows while filtering validation errors and checks unchanged 35 rpm / Enabled /
Automatic values, retained timeout feedback, empty/export-disabled states, sample
reload, and Reset. It also clears an in-flight reply-only attempt, waits for timeout
to verify the row does not reappear, and records a new cancelled attempt afterward.
Independent review is pending; review lab-scoped removal, current-attempt suppression,
new-attempt recording, keyboard controls, and Preview/Runtime separation.

### Undo Clear history

After Clear history, a compact notice shows the number removed and an Undo button.
Undo restores the latest clear for this lab, including samples and filtered-out
attempts, while preserving control values, active filters and current feedback.
Restored rows support filtering and CSV export immediately. New attempts recorded
after clearing are retained and merged by attempt ID, newest first, within the
100-entry history cap. An in-flight restored attempt uses its latest feedback
state and resumes ordinary history updates; Undo never replays a command.

Undo is session-only and single-use. A subsequent clear replaces the snapshot.
Reset example and Load sample history dismiss it. Feedback dismissal alone does
not discard it. Other screens' rows are neither removed nor restored by this lab.

Acceptance evidence: the command Preview browser regression checks restoration
of eleven mixed rows under active validation filtering, restored CSV content,
unchanged control values and feedback, merging a newer cancelled attempt, current
readback timeout restoration, and invalidation by sample load and Reset. Independent
review is pending; review snapshot scoping, deduplication/order/cap, pending attempt
suppression/restoration, and separation from project undo and command execution.
