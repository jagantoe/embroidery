# 08 — Manual editor

Manual mode edits the same design model the auto-digitizer produces, so the normal workflow is **auto first, then fix**. Every edit re-stitches only the touched object and updates the preview within ~100 ms.

## Layout

- **Canvas** (centre): zoom/pan, hoop outline, mm grid, rulers.
- **Sequence panel** (left): objects grouped by colour block in sewing order; drag to reorder, hide, lock, per-object stitch count.
- **Properties panel** (right): stitch type, angle, spacing, length, underlay toggles, pull compensation, thread, entry/exit points.
- **Toolbar** (top): tools, undo/redo, auto-digitize (all / selection), hoop, fabric and output-mode pickers, export.
- **Status bar**: size in mm, stitch count, colour changes, trims, estimated time.

For hobbyists, the properties panel shows plain-language controls first ("Denser / Lighter", "Smoother edges") with the numeric values under an *Advanced* toggle.

## Tools

| Tool | Key | What it does |
|---|---|---|
| Select | V | Select, move, scale, rotate; Shift to multi-select |
| Node edit | A | Move, add or delete outline points and Bézier handles |
| Running line | R | Click points to draw a running / triple-run path |
| Satin column | S | Draw a centre-line and drag to set width, or draw two rails |
| Fill region | F | Draw a polygon to fill; Alt for holes |
| Direction | D | Drag across an object to set fill angle / satin direction |
| Entry / exit | E | Place where the object starts and ends sewing |
| Knife | K | Split an object in two |
| Merge | M | Join same-colour objects |
| Stitch edit | Shift+S | Advanced: move/delete individual needle points (stored as overrides) |
| Measure | U | Distance and width in mm |

## Views

1. **Shapes** — flat colour regions for editing geometry.
2. **Stitches** — needle points and lines; jumps dashed, trims marked with a scissor icon.
3. **Realistic** — thread rendered with width (~0.4 mm), sheen and shadow on a chosen fabric colour.
4. **Sew simulator** — slider/playback drawing stitches in order with colour stops; the fastest way to spot bad order or long travel.
5. **Density map** — heat-map of stitches per mm².

## Behaviour rules

- Geometry and parameter edits live on the object; the stitch plan is always derived — except explicit stitch-level overrides, which are kept but flagged when the underlying geometry changes.
- Undo/redo is a command stack over the design model (no stitch-data snapshots).
- "Re-run auto" on a selection replaces only unlocked objects.
- Thread picker: the 64 PEC colours plus brand charts (Brother Embroidery Thread, Madeira, Isacord), nearest match by ΔE.
- On phones the app is view-and-export only; editing targets desktop and tablet.
