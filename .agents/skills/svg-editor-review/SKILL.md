---
name: svg-editor-review
description: Review Twynix SVG/canvas geometry, pointer interactions, history, serialization and telemetry rendering. Use for changes to transformations, symbol rendering, selection, routes, snapping or runtime graphics.
---

# SVG editor review

Use docs/architecture/editor-runtime.md for the current model. Inspect the changed
geometry together with its SVG/template caller and port definitions. A passing
math test alone does not verify the browser gesture/rendering path.

Trace target-pixel coordinates through viewbox letterboxing, zoom/pan, rulers,
selection rectangles, ghost previews, resize handles and screen bounds. Check
multiple zooms, reversed drag directions, modifier keys, cancellation and grouped
offsets. Preserve free-angle rotation, logical content proportions in `rotationSize`
and legacy quarter-turn dimensions. Check shared symbol/port transforms and
render-only handle feedback. Nested groups remain unsupported.

For connections, preserve port identity and occupancy, endpoints after moves/resizes,
pinned bends, obstacle handling and bridge-versus-tee semantics. Verify electrical,
pneumatic and digital styles remain separate from process piping.

Check one intended undo transaction per committed gesture, no history mutation for
preview-only feedback, reference remapping on copy/paste and schema roundtrips.
Confirm Runtime reads a published snapshot and unusable telemetry does not display
fabricated active state. Inspect repeated routing/DOM work under telemetry updates;
measure performance before asserting a scale limit or optimization benefit.

Use the focused geometry/store tests and isolated browser smoke workflow. Report
findings with a reproducible gesture, zoom/modifiers, expected/observed outcome and
file/line. State which visual and load paths were not exercised.
