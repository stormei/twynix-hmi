# Twynix editor UX foundation

This is the shared engineering workbench for the next application features. Factory Intelligence supplies the visual language and navigation; Ignition informs properties, bindings and events; WinCC informs equipment types and instances; Figma informs direct manipulation. The aim is a consistent industrial editor, rather than a pixel-for-pixel copy of any one product.

## Application structure

- A 64 px navy application header holds Design, Preview and Runtime. Project commands remain in the contextual toolbar beneath it.
- The left panel holds screens, a searchable layer tree, symbols and faceplate types. Layers are ordered front to back. Each row exposes visibility and locking on hover, selection or keyboard focus.
- The canvas has separate selection/arrangement and view tools. Selection, Hand, grid, snapping, zoom, fit, panel toggles and shortcut help are always available. Narrow windows wrap the tool row rather than silently dropping commands.
- The inspector shows screen settings with nothing selected, a component's properties with one selected, and aggregate bounds and shared properties with multiple components selected.
- Alarms and script output share a resizable diagnostics panel. On shorter windows it starts collapsed, keeping visible entry points and counts while returning space to the canvas.
- Native modal dialogs provide focus containment, Escape dismissal and focus restoration for bindings, screen settings, faceplate types, confirmations, equipment details and help.

The `--tx-*` tokens remain aligned with Factory Intelligence. App chrome uses neutral surfaces and blue selection/action colours. Equipment colours belong to the project and are not silently restyled by the application theme.

## Canvas interaction contract

Click selects one component; Shift-click adds/removes selection. Dragging empty canvas creates a marquee. Clicking a group selects its members as one unit; Option/Alt-click selects an individual member. Groups currently have one level.

Dragging a selection preserves its relative positions and stops at the screen edge. Eight handles resize a selection as a unit. Shift constrains a move or preserves aspect ratio on corner resize. Snapping uses an 8 px delta grid and can be toggled; Ctrl/Command temporarily bypasses it. Precision fields accept Enter or blur to commit. Displayed dimensions are rounded without discarding stored precision.

Alignment acts within a multi-unit selection, or against the screen for a single component/group. Distribution creates equal horizontal or vertical gaps between at least three units. A group remains one arrangement unit. Locking blocks geometry/property edits while leaving explicit unlock controls available. Hidden objects stay available in Design and disappear in Preview/Runtime.

The viewport is independent of the document. Hand, Space-drag or middle-button drag pans; wheel scroll pans; Ctrl/Command-wheel zooms about the pointer. Fit screen and fit selection recover a useful viewport without modifying geometry. Project/inspector/diagnostic splitters support pointer and arrow-key resizing.

Copy, paste and duplicate operate inside the current project, including across its screens. Pasted groups receive fresh component/group identities. Replacing the project clears the internal clipboard so equipment/library references cannot leak into another project's schema. Cross-application clipboard interchange is not implemented.

## Properties, bindings and events

Value, text, colour, visibility and enabled state have binding controls beside their fields. A binding can be a constant, telemetry source, or expression. The Data tab summarizes all five properties. Tests show output and quality before applying, and sample input never becomes runtime data. Bound fields indicate their source; disabling a binding retains its configuration.

The Actions panel distinguishes activation (click or keyboard Enter/Space) from double-click. Each has a configured action and optional script; the script editor also retains display-refresh appearance scripts. Actions explicitly apply through Save action, with unapplied-change feedback. Geometry updates to the same component do not reset an in-progress action form. Changing the component/event loads that context's action settings, so apply them before changing context.

If double-click is configured, a short delay separates it from single-click. A double-click cancels the pending single-click action. Changing screen or mode also cancels pending clicks. Device commands remain simulated in Preview. Runtime commands resolve the configured event's immutable published action on the gateway and retain the existing confirmation/authorization flow.

Data quality remains visible. Invalid/stale visibility input keeps equipment visible; invalid/stale bound enabled input prevents activation. These are presentation conditions, not controller interlocks or authorization substitutes.

## Equipment type and instance contract

The project library starts with reusable pump, valve and tank types. Add buttons or drag-and-drop create linked instances. A type has a stable identity, description, suggested telemetry key and numbered immutable template versions.

Create a type from a selected pump/valve/tank, or edit an existing type to publish a new version. Defaults include appearance, dimensions, non-value bindings and scripts. Equipment telemetry sources and device command/navigation targets are not shared through type capture. Configure those on each instance.

Publishing a type version never silently changes existing instances. The inspector displays the linked version, override count and an explicit upgrade operation. Upgrade adopts inherited defaults while preserving differing instance settings, equipment value bindings, name, geometry and identity. Reset overrides applies the newest inherited defaults while retaining the equipment binding and geometry. Detach converts an instance into an independent component. All are undoable draft operations.

A faceplate with no configured activation action opens a native equipment-details dialog in Preview/Runtime. It shows the instance/type version, current value/state, data quality and binding information. It is a supervisory view and does not add implicit start/stop commands.

This foundation supports versioned single-equipment templates. Composite faceplate graphics, nested groups, arbitrary custom parameter interfaces and dependency migration tools remain future work.

## Recovery and history

Document mutations have labelled undo/redo entries. A pointer drag is one transaction. Undo restores its screen and selection; server revision tracking remains current. Save-in-flight handling retains newer edits. Normalized server documents are compared independently of object-key order so a successful save clears the dirty indicator correctly.

Local recovery retains the draft, unsaved status and recovery timestamp. Continuous transforms defer browser storage writes until the gesture ends or a short idle period. Project replacement has explicit confirmation when changes would be lost. Smaller screen sizes are rejected if they would clip existing components; deletion refuses screens referenced by navigation actions and remains undoable.

An optional `?workspace=<name>` URL gives a separate local draft namespace. This is used for isolated UX review without modifying the user's main local draft. It does not change ThingsBoard identity or server project permissions.

## Verified workflows

Automated coverage includes geometry limits/aspect ratios, relative group movement, equal-gap distribution, grouping/clipboard identities, locking, screen/navigation integrity, undo/redo, save/recovery semantics, versioned faceplate upgrades and override preservation, event-specific published command resolution, property binding quality, script isolation and the original gateway integration flows.

Browser review covers screen creation, faceplate insertion, precision entry, multi-selection/grouping, marquee selection, group dragging, resize/undo, layer locking, context-menu copy/paste, publishing/upgrading a type, operator details and double-click action separation. The editor is desktop-first; smaller workspaces can collapse panels and use fit-to-selection.

Before later app features are added, use this contract for component selection, property controls, confirmations, status/error feedback and engineering navigation. Production connectivity, representative project sizes and operator role policies still require installation-specific validation.

### Expanded industrial symbol palette

The process library includes motors, axial fans, straight flanged pipes, roller
conveyors and generic sensors. Each uses the same SVG renderer for palette,
canvas and drag preview. Tags, accent colour, telemetry values, visibility,
enabled state, events and scripts use the existing component properties.

Motors, fans and conveyors show RUN for positive values and STOP for zero or
negative values. Pipes show FLOW / NO FLOW; sensors show ACTIVE / INACTIVE
and a numeric reading. These are generic indicators: use a value expression to
map equipment-specific codes or thresholds to 1/0. Missing, invalid or stale data
shows N/A and neutral colouring; it does not imply stopped or healthy equipment.
The symbols do not infer alarms, interlocks, flow direction or fault codes.
The library also includes elbows, tees and connectors with persisted port connections; see the process diagram contract below. Faceplate type creation remains
available for pumps, valves and tanks.

### Process diagrams and pipe ports

Elbows, tees and connectors share the industrial SVG style. Elbows and tees can
be turned in 90° increments in Style; their port positions turn with the graphics.
Straight pipes, fittings, pumps, valves and tanks expose named connection ports.
Coordinates match the SVG connection faces, including proportional scaling and
letterboxing in resized components.

The connector button beside the grid controls shows ports and enables snapping.
Drag a component or group within 14 screen pixels of a free, opposing port;
the ghost aligns exactly, the target port highlights, and release saves the
placement and connection as one undo step. Ctrl/Command temporarily bypasses
snapping. Dragging a symbol from the palette also snaps on drop. A port accepts
one connection; use a tee for a branch.

Click two free ports (or focus them and press Enter/Space) to create a routed
connection between separated objects. Escape cancels the first port. Filled ports
are occupied. Style → Disconnect ports removes the selected component's links;
undo restores them. Locked components cannot receive new links. Existing links
remain attached during moves, resizing and fitting rotation, including the drag
preview. Connected components need not move as a group: routes follow endpoints.

Links are stored per screen with widget and port identities. Export/import,
saved drafts and releases retain them. Copying both connected components copies
their internal link with fresh identities; a link to an unselected component is
not copied. Duplicating a screen remaps all links. Deleting an endpoint removes
its links in the same undo step. Imports reject dangling or multiply occupied
ports. Older projects default to no stored connections; previously inferred
visual links are no longer generated. New demo projects contain explicit links.

Routes use orthogonal segments with outward port stubs and automatic obstacle
avoidance. Connections describe drawing topology only; they do not infer flow or
propagate telemetry between components.

### Automatic routing and bend editing

The router avoids the bounds of visible objects with a 12 px centreline routing
margin. It uses rectilinear visibility-grid A* with a bend penalty, restricted to
the screen bounds. Endpoint stubs leave equipment in their port direction;
sections between stubs and optional pinned points reroute when objects move or
resize. Objects with `visible: false` are not obstacles. Dynamic visibility
bindings do not change the design-time routing geometry.

Click a pipe to edit its route. Hollow handles identify automatic corners and
segment midpoints. Dragging one creates a pinned point; filled handles move
existing pins. Up to 32 pins are stored in route order in screen coordinates.
The pipe still attaches to its original ports. Pins stay at their chosen screen
positions when equipment moves; copying connected components offsets their pins
with the copied group. Fit selection includes the route and its endpoint objects.

A drag previews immediately and commits as one undo step on release. Escape or
pointer cancellation restores the previous route. Arrow keys move a focused
handle by 1 px, or 8 px with Shift. Grid snapping applies during pointer drags;
Ctrl/Command bypasses it. Delete removes a focused pin. The inspector lists pins,
removes individual pins, deletes a connection, or resets it to automatic routing.
Route edits, resets and deletion support undo/redo and survive export, saved
project recovery and publication.

If no clear path exists, a pin is inside an obstacle, or the bounded routing
search is exhausted, the route is shown with amber dashes and a blocked warning.
The fallback remains attached but must be adjusted; it is not presented as a
clear route. Pinned points outside the screen are rejected. Shrinking a screen
must leave pinned points inside it.

Routing avoids objects, while independent perpendicular pipe crossings receive
automatic bridge notation (see below). Shared pipe bundles and flow simulation
are not included. Dense diagrams may require manual pins or moving objects when
the bounded automatic search cannot find a route.

### Pipe-crossing bridges and real junctions

Independent perpendicular route intersections are rendered with a gap in the
lower pipe and a curved bridge in the upper pipe. Later connections in the
screen's saved connection order cross over earlier ones, so the result is stable
across selection, reload and publication. The same derived geometry is used in
Design, Preview and Runtime. No endpoint, pin or connection record is changed.

Bridge marks recalculate with automatic routing, manual bends and equipment
movement. Nearby crossings share a wider bridge to reduce clutter. The arch
chooses a side that avoids equipment and the screen edge. In a tight space where
an arch cannot fit, the lower-line gap still marks separate pipes.

Crossings strictly inside perpendicular segments are eligible. Port endpoints,
bends and touches are not converted to junctions or bridges. A tee remains a
real three-port component with explicit saved connections. Its internal junction
is drawn by the tee symbol and never replaced with a crossing mark. Crossing a
pipe does not connect it; connect through tee ports to make a branch.

The selected pipe inspector reports its independent crossings. Bridge curves
and lower gaps are selectable through the route hit path; bend handles remain
attached to the underlying orthogonal route. Parallel coincident spans are not
crossings and do not receive bridge notation; separate them with pinned points
when drawing independent parallel pipes.

### ISA-inspired symbols and high-performance HMI graphics

View → Graphics style selects Industrial, ISA-inspired P&ID, or
High-performance HMI for the whole project. The choice is undoable, saved with
the project, exported and retained in a published release. Older projects use
Industrial. Palette previews, the canvas and drag ghosts use the same style.
All styles share equipment port coordinates, routing and crossing topology.

ISA-inspired P&ID uses original flat process drawings plus configurable instrument
bubbles. The instrument preset palette includes PT/TT/FT/LT transmitters,
PI/TI/FI/LI indicators and PIC/TIC/FIC/LIC indicating controllers. Style exposes
the instrument function and field, panel or shared-display location. Display text
sets the loop tag, such as PT-101; the bubble shows the function and loop suffix.
The numeric reading uses the existing value binding and engineering unit. These
are a limited set of ISA-inspired identification conventions, not a complete
ISA-5.1 symbol library or a declaration of standards compliance. Instrument
bubbles have dedicated signal terminals; see the signal-connection contract below.

High-performance HMI uses a neutral canvas, flat equipment, textual operating
states and muted normal colours. User-selected or explicitly bound condition
colours remain available. Unknown/stale states remain neutral and display N/A.
Measurement cards and instruments can include a configured operating-range bar:
set scale minimum/maximum and normal low/high under Style → Operating range.
The bar shows position, the normal band, and LOW/NORMAL/HIGH context. Values
outside the configured normal range use amber and explicit text. These are
visual operating limits, not ThingsBoard alarm definitions or new controller
logic. ThingsBoard continues to own alarm state and acknowledgement.

This graphics mode is a foundation for high-performance HMI, not an entire
operating philosophy or ISA-101 compliance package. Alarm philosophy, operating
procedures and site-specific colour meanings still belong in the application
and project design. Crossing arches adapt their clearance background to the
active graphics style; tees remain explicit connected junctions in every mode.

References: [ISA-5.1 committee and identification scope](https://www.isa.org/standards-and-publications/isa-standards/isa-standards-committees/isa5-1),
[ISA: How to Maximize Operator Effectiveness with a High-Performance HMI](https://www-prod.isa.org/web/acom/article/the-high-performance-hmi).

### ISA-style signal connections and drag-to-connect

Canvas tool rail → Connect selects Process piping, Electrical signal, Pneumatic
signal, or Digital/data signal. Signal tools show square terminals on instruments,
sensors and valve actuators. Electrical connections are dashed; pneumatic
connections have paired diagonal strokes; digital/data connections carry hollow
circles. An arrow identifies the signal direction. These are ISA-inspired drawing
conventions with an explicit project legend, not a full standards certification.

Drag from a free signal output. Compatible free instrument inputs and valve
actuators on other unlocked components highlight immediately; other outputs,
occupied terminals, the source component and locked targets dim. The live route
follows the pointer using the selected line style. Within 18 screen pixels of a
compatible terminal it snaps to that terminal and shows the final routed preview.
This tolerance stays constant across zoom levels. Release to save the connection
as one undo step. An invalid drop creates no link and no history entry. Escape,
pointer cancellation, focus loss, or changing screen/mode/tool cancels the draft.

Clicking the source without dragging retains click-to-connect. Enter/Space also
works for two-port keyboard connections. Either click order is allowed, but
saved links always run from a signal output to an instrument input or actuator.
Fluid and signal terminals cannot be mixed. A terminal accepts one link; signal
fan-out buses are not implemented. Valve fluid inlet/outlet ports remain separate
from its signal actuator terminal. Process tees are not signal junctions.

Signal routes use the existing automatic routing, pinned bend points and reset
controls. Select a signal to change its type in the inspector. Saved medium,
endpoint identities and bends survive project import/export, copying, screen
duplication, recovery and publication. Deleting a component removes its signal
links in the same undo step. Signals are excluded from the process pipe bridge
pass, so crossing a pipe does not create a fluid junction.

These connections document the diagram. They do not send device commands,
propagate telemetry, create controller logic, or change ThingsBoard alarm rules.
Telemetry bindings and device actions remain explicit, separate settings.

### Compact editor chrome

The editor has one 56 px application header and one 40 px screen header.
The previous file toolbar, permanent arrangement row, separate zoom row and
stacked status/footer rows are removed. The bottom strip combines alarm and
script-console access with connection and gesture feedback. Diagnostics starts
collapsed and can be expanded when needed.

- Project-name menu: new/open/import/export, publish release and published runtime.
- Application header: undo/redo, Design/Preview, Save draft and account/connection.
- View menu: project/library and inspector panels, diagnostics, grid, snapping,
  connection ports, Fit selection, graphics styles and keyboard shortcuts.
- Floating canvas rail: Select, Hand and Connect. Connect selects process,
  electrical, pneumatic or digital line tools without a separate palette row.
- Floating lower-right zoom dock: zoom out/reset/in and Fit screen.
- Arrangement controls appear only for a multiple selection, in Arrange and the
  multiple-selection inspector. Existing shortcuts and context menus remain.

Menus close after an action, on an outside click or Escape. Arrow keys, Home and
End navigate their enabled commands; Escape returns focus to the trigger. Common
modified shortcuts remain usable while a trigger has focus. The active signal
tool appears in the status strip and in the Connect tooltip/menu.

Below 1180 px, the inspector starts closed. Selecting an object exposes a
Properties button, which opens the inspector as a closable overlay rather than
compressing the canvas. Project/library remains available through View when
hidden. The narrow layout was checked at 860 px without horizontal overflow.
The preview simulation notice is retained in the status strip; publishing and
account connection remain explicit user actions in their menus.

### Target display size, artboard grid and rulers

New screen → Target display offers common HMI panel, HD, Full HD, QHD and 4K
presets, plus custom integer dimensions. New screens default to 1920 × 1080.
Existing screens retain their dimensions; Edit screen detects the matching
preset or shows Custom. The dialog previews the selected aspect ratio. Existing
screen-size limits and component-fit validation still apply.

Screen width and height define the complete work area. The old automatic brand
header and footer strips have been removed from the screen itself. Component,
connection and bend coordinates start at the target screen's top-left (0,0).
The artboard label shows its exact target dimensions; the surrounding workspace
is neutral and does not carry the screen grid. Dropping a new symbol outside the
artboard is rejected with a placement hint.

In Design, the artboard shows an 8 px grid with 40 px major divisions. View →
Show grid toggles it. Preview and Runtime render the target screen without editor
grid, rulers or artboard labels. The complete artboard is exactly the specified
size before the viewport zoom is applied.

Fixed 18 px rulers run along the top and left of the viewport. They show target
screen pixels rather than monitor pixels, with adaptive labeled intervals and
20 minor subdivisions per major interval. Their zero and end marks follow the
artboard through zoom, pan and panel resizing. Exact custom edges are labeled
even when they fall between normal major marks. Rulers and pointer placement use
the same screen-to-viewport transform, without any extra header/footer offset.

Drawing tools now sit in the existing screen header directly above the rulers:
Select, Hand, connection type, Duplicate, grid visibility and grid snapping.
The floating drawing rail is removed, leaving the artboard unobstructed.
Toggle buttons expose pressed states, and Duplicate is disabled without a selection.

The screen toolbar also exposes all six alignment actions, horizontal/vertical
spacing distribution, Group and Ungroup directly. Alignment requires an unlocked
selection (a single selection aligns to the screen); distribution requires three
separate selection units, Group requires two, and Ungroup requires a group.
All toolbar actions remain on one row without horizontal scrolling. Compact
spacing preserves 28 px click targets; the screen name yields space, while
Properties and View use labeled icon buttons. The former Arrange dropdown is
removed from the screen header.
Browser verification covered empty/single/multiple/grouped selections and direct
alignment, distribution, grouping and ungrouping actions.

Toolbar fit verified at 940 px and 1280 px viewport widths, including a multiple
selection: all 18 controls stay inside the header with no content overflow.

### Smart drag guides

Dragging a component or selection snaps its bounding box to nearby object edges,
centres and screen anchors within a 5 px viewport tolerance. Magenta guide lines
show exact matches. Nearest neighbours with overlapping projections get spacing
lines and target-pixel labels; labels keep their display size at any zoom.
Shift preserves axis-constrained movement. Ctrl/Command bypasses grid, guide and
port snapping and hides the drag hints. Port attachment takes priority over
alignment, and overlays always reflect the final ghost position. Releasing or
cancelling clears all hints. The original stays in place until the ghost drops.

Verified with geometry tests for tolerance, screen/axis constraints and nearest
spacing references, plus browser dragging with live guide/label capture.

The toolbar now keeps distribution and grouping only; the six manual alignment
buttons have been removed. Smart drag alignment and spacing guides remain active.

### Equal spacing while dragging

Dragging now snaps to equal horizontal or vertical gaps within the same 5 px
viewport tolerance. A symbol can be centred between two neighbours, or extend a
chain by repeating its existing gap at either end. Different symbol sizes are
supported. Both matching gaps get solid magenta measurements and stronger labels.
Equal-spacing candidates override grid/edge snapping on their matched axis;
port attachment still wins. Shift constraints and Ctrl/Command bypass apply.
Candidates outside the screen, in a different lane, overlapping another symbol,
or separated by an intervening symbol are rejected. Multi-selection moves as one
bounding box. Browser verification captured two matching 45 px gaps during a drag.

### Modular dashboard widgets

Symbols now includes a Dashboard widgets section with Chart (line/area/bar),
Gauge, Markdown, Embedded page and HTML panel, plus an example dashboard screen.
Each renderer lives in its own Angular component folder and is lazy loaded through
a registry. The inspector builds component-specific controls from registry fields;
configuration is validated and persisted as a discriminated model schema. Existing
industrial symbols and saved projects retain their behavior. Charts/gauges reuse
the existing resolved telemetry value/quality contract. See dashboard-components.md
for boundaries, embedding restrictions, current chart/Markdown scope and extension
instructions for external developers.

Browser checks cover example insertion, chart variant changes, gauge warning
states, Markdown persistence, HTML content updates, frame sandbox attributes and
Preview interaction. Schema tests cover defaults/roundtrips, legacy imports,
configuration-kind mismatches, invalid ranges and unsafe iframe URLs.

### Accepted symbol library navigation

The Symbols panel uses expandable Dashboard widgets, Process equipment,
Pipes & connections, Instruments & ISA, and Displays & controls categories.
A search field matches category names, widget labels/descriptions, ISA codes and
instrument descriptions; matching categories expand automatically. Results keep
click-to-add and native drag-to-add. The dashboard example remains available
inside its category. Empty results offer search guidance. Category buttons expose
expanded state and support normal keyboard activation.

Navigation metadata is in symbol-catalog.ts; the standalone SymbolLibraryComponent
owns search, expansion and previews. The editor receives typed add/drag events.
Browser checks covered expanding/collapsing categories, pressure-instrument
search, inserting PT from results and the no-results state. This category layout
and search were accepted by the user and should be retained as the foundation.

Symbols search and explicitly expanded categories are now held in workspace-shell
signals and bound to the library's model inputs. Switching Project/Symbols/
Faceplates or closing/reopening the panel retains them for the current editor
session. Search expansion is temporary: clearing the query restores the user's
explicit category choices. Browser verification covered both tab paths and
confirmed a retained pressure query plus restored equipment/piping expansion.

Symbol library preferences now persist locally across refreshes and reopening the
app, including search text, explicit expanded categories and the last active
library tab. A versioned, workspace-scoped preference key keeps reviews separate
from the main editor. Unknown category IDs, malformed data and obsolete versions
fall back safely; unavailable browser storage does not interrupt the editor.
Refresh and close/reopen browser checks confirmed search restoration and the
original equipment/piping expansion after clearing search. Preferences remain in
this browser rather than syncing through ThingsBoard.
