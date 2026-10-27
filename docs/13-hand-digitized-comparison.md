# 13 — Comparison with a hand-digitized file

We compared the auto-digitizer with a shield that was digitized by hand for a Brother machine (version 8 of a real, sewn design; the files are not part of this repository). Both were measured at the same size, 79.4 × 101 mm, with `tests/compare_pes.py`.

## What the hand-digitized file does differently

| Topic | Hand-digitized | Auto v0.1 | What we changed |
|---|---|---|---|
| **Layering** | Fills continue underneath the black outlines, lettering and lines (≈25–30% of every fill colour's needle points land on black in the artwork). Black is sewn last on top. | Every colour was cut out exactly ("knock-out"). Fills were split into many pieces by the black lines (the white alone was dozens of separate shapes). | Fill colours now run under thin later colours (gaps up to 4 mm are bridged) and tuck 0.35 mm under their neighbours. The white became one shape. |
| **Patch border** | A thick satin ring (≈3.5–4 mm) around the whole shield; the artwork's thin outline is widened. | Followed the artwork's thin outline (≈1 mm). | Patch mode adds a satin border (default 3.5 mm, adjustable in Setup), sewn last. |
| **Fill density** | Dense, solid-looking fills: about 4 lines/mm (PE-Design style), 4 mm stitches. | 0.40 mm rows, 3.5 mm stitches: looked hatched. | Default fill spacing 0.25 mm, stitch length 4 mm (woven). |
| **Fill angle** | 135° on every fill, so the colours have the same sheen. | Fewest-break angle, usually 0° or 90°. | 135° everywhere; 45°/0°/90° only when 135° would split a shape far more. |
| **Thin drawing lines** (castle details) | Fine black lines sewn as narrow, clean lines on top of the white. | Satin along a skeleton with many junctions: spiky and heavy. | Webs of thin lines with many junctions are sewn as a triple run; running threshold raised to 1.2 mm. |
| **Lettering** | Clean satin, one column per stroke, stitches perpendicular to each stroke. | Satin along the skeleton: fanned out on curves and at junctions. | Stitch directions use the shortest chord across the stroke; the outer edge of curves keeps the density (short stitches on the inside); letters with junctions are split into one column per stroke direction. Still the biggest visible gap. |
| **Trims** | 29 | 80 (a bug: travel routing failed when a needle point sat just outside a shape edge) | 25. Routing snaps to the nearest allowed pixel and may take longer hidden paths. |
| **Colour order** | Red → white → green → black | White → red → green → black | Unchanged: with layering, either order works here. A smarter order (enclosed colours later) is a possible next step. |

## Numbers

| | Hand-digitized | Auto v0.1 | Auto now |
|---|---|---|---|
| Stitches | 25,789 | 16,762 | ≈20,100 |
| Trims | 29 | 80 | 25 |
| Colour changes | 3 | 3 | 3 |
| Fill stitch length (median) | 3.9–4.0 mm | 2.1–2.6 mm | 2.2–4.0 mm |
| Fill angle | 135° | 0° / 90° | 135° |
| Black: share of points on the artwork's black | 48% | 37% | 66% |

The hand file still has more stitches, mostly in the white (11,653 vs ≈7,200): it looks like a full second layer under the top fill. We kept a lighter 2 mm underlay for now; this is a candidate to test on fabric.

## Remaining gaps

1. **Lettering quality** — rail-based satin from the vector outline (one column per stroke, direction lines at corners) would close most of the gap. The current raster approach cannot see the font's exact corners.
2. **Vector input** — SVG paths are rasterised at 0.1 mm before digitizing. Using the paths directly would give crisper castle details and letter edges.
3. **Underlay** — the hand file appears to use a heavier underlay under large fills. Worth a fabric test: 2 mm (current) vs. 0.5–1 mm crosshatch.
4. **Size** — the hand file is 101 mm tall, which doesn't fit a 10 × 10 cm hoop field. The app's default fit (94 mm in a 10 × 10 hoop) keeps a 3 mm margin; pick the 13 × 18 cm hoop for this size.

## Repeating the comparison

```bash
cd app
node tests/rasterize.cjs design.svg 79.4 101 10 tests/out/design.rgba
BENCH_RGBA=tests/out/design.rgba BENCH_W=794 BENCH_H=1010 npx vitest run tests/bench.test.ts
python3 -I tests/compare_pes.py tests/out/bench.pes reference.pes tests/out/design.rgba 794 1010 --png tests/out/compare.png
```

`compare_pes.py` prints size, stitches, trims, stitch lengths, dominant angles and where each colour's needle points land on the artwork, and draws both files side by side.
