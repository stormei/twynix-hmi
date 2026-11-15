# Reusable components and the data browser

This delivery adds versioned multi-widget components and a read-only ThingsBoard
source browser within the existing Angular workbench. It extends the accepted
Factory Intelligence styling and keeps equipment faceplates available unchanged.

The interaction reference is Ignition's [parameterized views](https://www.docs.inductiveautomation.com/docs/8.3/ignition-modules/perspective/views-in-perspective)
and [tag bindings](https://www.docs.inductiveautomation.com/docs/8.3/ignition-modules/perspective/working-with-perspective-components/bindings-in-perspective/tag-bindings-in-perspective).
Twynix uses its own document model and bounded scripts, not Ignition resource files.

## Create and reuse

1. Select one widget or a group of up to 50 widgets. Open **Faceplates → Reusable
   components → Create component from selection**.
2. Name the type. Expand each widget to expose value, text, color, visibility or
   enabled state as a named input. Give each input a unique identifier and default.
3. Publish the type, then choose **Add** on its card. Set instance inputs and, when
   the type has source bindings, assign a ThingsBoard device or asset. The browser
   supports selection, and manual entity UUID entry remains available offline.
4. Select an instance and use **Configure selected instance** to change its inputs
   or equipment assignment. These changes do not replace local geometry, local
   actions, non-parameter bindings or pinned route adjustments.
5. To revise a type, edit an instance on the canvas, select it and choose **New
   version from selection** on its card. Existing instances remain pinned to their
   version. Their input dialog offers an explicit upgrade to the latest version.

Types capture widgets and only connections entirely inside the selection. Pinned
routes participate in the reusable frame. Positions are normalized. Device IDs
are removed from templates; telemetry and attribute sources are assigned per
instance. Command and screen-navigation targets are not captured into shared
resources. Existing instance command/navigation actions survive an upgrade.

Instances remain ordinary canvas widgets in one group, with stable references to
their type, version, original template widget and named inputs. They retain normal
selection, move, rotate, resize, copy/paste, undo and JSON recovery behavior. Whole
instance copies receive new instance/widget/connection identities. Partial copies
are detached; ungrouping, regrouping or deleting only part of an instance detaches
its reusable link. Upgrades retain surviving widget IDs and reject removal of a
widget with an external attached connection. Layout and shared behavior are replaced
on upgrade; named inputs and equipment assignment are retained.

## Browse and bind

Open the binding button beside a property, choose **Data source**, then search
**Devices** or **Assets**. Results are paged in groups of 50. Expand an entity,
filter its **Telemetry** and **Attributes**, then select a key. The sample panel
shows the fetched value, its timestamp and freshness indication. Choose **Use
selected source**, adjust units/freshness if necessary, and **Apply binding**.
Cancel discards draft changes. Expressions can use the same browser for their
separate source input. Empty, signed-out, permission and malformed-response states
remain visible. The browser never substitutes demo values for missing sources.

Samples are fetched snapshots; use Refresh to retrieve a newer sample. They are
not a second telemetry socket. Applied widget bindings continue through the existing
realtime gateway. Attribute subscriptions use ThingsBoard's `ATTRIBUTE` entity
key type; telemetry uses `TIME_SERIES`. Their local keys are distinct, including
when names match. Existing telemetry binding identities remain compatible.
ThingsBoard [documents both key types in entity queries and subscriptions](https://thingsboard.io/docs/reference/data-query-api/).
Units remain a display setting because the sample response does not supply a
standard unit field. Freshness uses the binding's configured timeout for both
telemetry and attributes; static attributes may need a longer timeout.

## Code ownership and acceptance evidence

| Boundary                                                         | Files / evidence                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Document schemas and compatibility defaults                      | `packages/model/src/index.ts`, `discovery.ts`                     |
| Capture, source retargeting, input application and geometry      | `packages/editor/src/components.ts`, `tests/components.test.ts`   |
| Store history, paste, detach and explicit version updates        | `apps/editor/src/app/editor.store.ts`, `tests/components.test.ts` |
| Type/input editing and library cards                             | `apps/editor/src/app/component-library.component.{ts,html,css}`   |
| Search, pagination, source branches and sample display           | `apps/editor/src/app/data-browser.component.{ts,html,css}`        |
| Binding draft and apply/cancel                                   | `binding-editor.component.{ts,html}`, isolated browser smoke test |
| Authenticated discovery and validated upstream responses         | `entities.controller.ts`, isolated gateway regression test        |
| Distinct attribute/telemetry subscriptions and updates           | `realtime.protocol.ts`, `tests/model.test.ts`                     |
| Actual create/add/configure/upgrade/reopen and source assignment | `tests/smoke/editor.spec.ts` with isolated API/WS fixtures        |

Run `npm run verify`; its generated evidence is in `artifacts/verification/`.
No checks, budgets or dependencies were relaxed. Automated tests use local fakes,
never the LAN ThingsBoard installation. Screenshots under `test-results/` capture
the component library and source browser. Self-review checked schema roundtrips,
source identity, action sanitization, stable connection endpoints, history and
async response generations. Independent review remains pending. Review checklist:
large mixed-symbol components, published Runtime behavior under real ThingsBoard
4.4 payloads, cross-screen clipboard operations and upgrades with external wiring.

## Current scope

One equipment entity supplies the source-backed properties in an instance.
Named inputs target one existing bindable property each. Multi-entity aliases,
component output events, arbitrary structured custom properties, nested component
instances, folders/asset-relation hierarchies and dragging browser keys directly
onto canvas properties are future extensions. New components are inserted through
Add; existing equipment faceplate drag/drop remains available. Publishing an HMI
release and gateway command authorization still follow the existing workflow.
Actual ThingsBoard 4.4 permissions/payloads and physical device commands were not
exercised by these isolated tests.

The control/action editor now supports validated scalar command mapping and
optional reply/readback checks; see [its usage and boundary guide](control-and-action-editor.md).
Command targets are still configured per instance and are not captured into shared
types. Upgrades preserve an instance's explicitly configured command action.
