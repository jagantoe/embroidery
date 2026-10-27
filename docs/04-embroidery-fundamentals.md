# 04 — Embroidery fundamentals the digitizer must encode

Good output depends on four choices per shape — **stitch type, density, underlay, compensation** — plus a sewing order that minimises colour changes and trims. These are the defaults the auto-digitizer starts from; every one is editable in manual mode.

## Stitch types

| Type | What it is | Use when | Width limits |
|---|---|---|---|
| Running | Single line of stitches, 2–3 mm long | Outlines, fine detail, travel, lines < 1.2 mm wide, webs of thin drawing lines | — |
| Bean / triple run | Running stitch sewn 3× back and forth | Bold thin outlines | — |
| Satin (column) | Zig-zag across a column, edge to edge | Lettering, borders, narrow shapes | ~1.0 to ~7 mm |
| Fill (tatami) | Parallel rows of running stitches, offset needle points | Large areas | > ~7 mm |
| Contour fill | Rows following the outline | Organic/decorative shapes | Any |
| E-stitch / blanket | Comb-like edge stitch | Appliqué edges | 2–4 mm |

**Core auto-classification:** measure each shape's local width (medial axis): < 1.2 mm → running, 1.2–7 mm → satin (stroke-like shapes only; webs of thin lines with many junctions → triple run), wider → fill. Satin columns are at least 1.2 mm wide. Mixed shapes (a letter with a wide bowl) are split into satin and fill regions.

## Default parameters

| Parameter | Default | Range | Notes |
|---|---|---|---|
| Running stitch length | 2.5 mm | 1.5–4 | Shorter on tight curves |
| Satin spacing (peak to peak) | 0.40 mm | 0.30–0.60 | Smaller = denser |
| Fill row spacing | 0.25 mm | 0.18–0.60 | Matches Brother PE-Design's dense default (~4 lines/mm); 0.30 on knits |
| Fill stitch length | 4.0 mm | 2.5–4.5 | |
| Fill angle | 135° | | One angle for every fill (45° only when 135° splits a shape much more) |
| Patch border | 3.5 mm satin | 1.5–6 | Patch mode: a satin ring around the outside edge, sewn last |
| Layering | fills run 2 mm under later outlines, 0.35 mm tuck | | See [13](13-hand-digitized-comparison.md) |
| Fill row offset | 1/3 or 1/4 | | Staggers needle points; no visible "rivers" |
| Pull compensation | 0.2 mm per side | 0–0.6 | More on knits, towels |
| Minimum stitch | 0.3 mm | | Shorter stitches are dropped |
| Max stitch before split | 7 mm satin / 12 mm any | | Long satins → split-satin or fill |
| Jump threshold for trim | 3 mm | 1–5 | Below: hidden running travel; above: trim |

## Underlay

A light stitch layer sewn first to stabilise fabric and lift the top stitches.

- **Center-walk** — one run down the column centre; satins 1–2 mm wide.
- **Edge-walk** — run just inside the outline; satins > 2 mm, all fills.
- **Zig-zag** — low-density zig-zag; satins > 4 mm.
- **Tatami underlay** — sparse fill (~2 mm spacing) at 90° to the top fill.

## Pull and push

Stitches pull fabric inward along the stitch direction and push it outward at the ends. Compensate by widening satins and fills across the stitch direction (pull compensation) and slightly shortening along it. Without this, a 3 mm satin border sews as ~2.6 mm and gaps open between colours. Adjacent colour regions also need **overlap** (~0.3–0.5 mm).

## Layering and order

- Background first, foreground last; outlines and details after the fills they sit on.
- Within a colour: nearest-next ordering; enter/exit each shape at the points closest to its neighbours.
- **Cost model for hobbyist single-needle machines:** colour change (manual rethread) ≫ trim (manual snip on machines without a cutter) > travel length. Optimise in that order.
- **Tie-in / tie-off**: 2–3 tiny stitches (~0.5 mm) at the start and end of every run followed by a trim.

## Fabric presets

| Preset | Changes vs default |
|---|---|
| Woven (default) | — |
| Knit / T-shirt | Lower density (0.45 mm), more underlay, +0.1 mm compensation |
| Towel / fleece | Water-soluble topping, extra underlay, higher density |
| Cap | Centre-out sewing order |
| Patch | Dense fill, satin border, twill base |
