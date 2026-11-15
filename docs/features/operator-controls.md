# Editor layers, rotation and operator controls

Scope: expose front/back ordering and quarter-turn rotation, plus independent
Dropdown, Slider, Radio group, Toggle switch, Multi-state button, Sparkline and
Linear gauge components. Preserve existing dependencies, ThingsBoard contracts,
canvas selection, undo and size budgets.

## Acceptance evidence

| Criterion                                                 | Evidence                                                                                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Front/back ordering is exposed and reversible             | `tests/editor-store.test.ts` verifies history; `tests/smoke/editor.spec.ts` verifies actual canvas order                                              |
| Rotation preserves geometry, stable ports and connections | `tests/rotation.test.ts` covers group transforms, four-turn identity, screen bounds, legacy schema defaults, process/signal ports and attached routes |
| Browser content follows the rotated outer rectangle       | Isolated smoke test checks CSS transform and swapped dimensions, then inverse rotation                                                                |
| Controls support local Preview interactions               | Smoke test exercises dropdown, native slider keyboard input, radio, switch and multi-state selection                                                  |
| Widget-specific settings persist                          | Model schema roundtrip checks plus smoke test inspects persisted dropdown options                                                                     |
| Sparkline and linear gauge render                         | Isolated smoke test and `controls-preview.png` in Playwright output                                                                                   |
| New component families remain independently maintainable  | Separate Angular folders and lazy imports in `dashboard/widget-registry.ts`; contributor contract in `docs/dashboard-components.md`                   |
| No command authorization changes                          | Controls forward activation through existing script/action paths; gateway integration regressions remain part of full verification                    |
| No budget or check weakening                              | Existing `npm run verify` and unchanged Angular size budgets                                                                                          |

Verification logs are generated in `artifacts/verification/`; browser artifacts are
in `test-results/`. These are local outputs, not committed fixture evidence.

## Review and limits

Self-review traced centered content transforms against process/signal port
coordinates, inherited control event propagation, lazy component lifecycle,
schema validation and Preview/Runtime activation paths. Independent review is
pending. Review checklist: check rotated fittings together with legacy fitting
rotation, resize after rotation at multiple zooms, grouped mixed symbols near
screen edges, unavailable-quality controls, and published Runtime readback under
continuous telemetry.

Actual published ThingsBoard interaction and historical
queries and additional load testing are not covered by this change. Sparkline
history remains session-only; controls do not automatically write requested
values to ThingsBoard. Live actions retain configured RPC parameters and all
existing authorization checks.

## Rotation handle follow-up

Free-angle rotation is now available through a circular selection handle. The
original quarter-turn toolbar buttons remain. `tests/rotation.test.ts` verifies
logical-size preservation, inverse free rotations, exact port coordinates/normals,
orthogonal attached routes, resize proportions and JSON roundtrips. The isolated
browser test drags to a free angle, checks that the stored draft stays unchanged
until release, cancels a second gesture, verifies one-step undo/redo, Shift 15°
snapping, keyboard adjustment and constant handle hit size after zoom. The browser
artifact `rotation-handle.png` captures a rotated valve with its attached pipe.
The context menu is deferred until requested to retain the unchanged bundle budget;
its first opening is also checked in that browser test. Self-review covered capture,
Escape/blur cancellation, stale-project cancellation and shared render/port geometry.
Independent review and sustained drag/load testing remain pending.

### Five-degree steps and oriented selection frames

Rotation now advances in 5° steps through drag handles, toolbar buttons and handle
keyboard arrows. The original arbitrary-angle document data remains compatible.
Selection frames, resize handles and rotation handles rotate with the content.
The oriented frame also defines the rotation pivot; resizing uses local axes and
keeps the opposite edge/corner fixed. Rotated groups scale uniformly. Old axis-aligned
selection/hover decoration has moved onto the rotated content element.

Domain regressions cover single/group frame orientation, frame size through
rotation, local-axis resizing, opposite-corner preservation and screen rejection.
Browser coverage checks 5° snapping with and without Shift, rotated corner positions
including the selection stroke inset, a real local-axis resize, anchored opposite
corner, undo, cancellation, keyboard adjustments, zoom and screen-edge reachability.
The sample screenshot `rotation-handle.png` captures the oriented selection frame.
