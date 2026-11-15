# Editor, document and runtime

`EditorStore` owns the Angular signal document, selected screen/widget IDs,
clipboard and history. `AppComponent` orchestrates input, mode, bindings, effects
and presentation. Pure modules in `packages/editor` implement transformations.
Preserve those existing boundaries during scoped maintenance.

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
and the document/store remain on the startup path. The initial bundle is below the
unchanged 1 MB warning budget; the 2 MB error budget is also unchanged.
