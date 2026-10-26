# Needle & Pixel — the app

Working name. A free, open-source (GPL-3.0) browser tool that turns PNG/JPG/SVG pictures into embroidery files for Brother machines (`.pes`), plus `.dst` and `.exp`. Everything runs on your own computer: nothing is uploaded.

Design docs: `../docs/` (start with `00-decisions.md`).

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev        # open the printed http://localhost:5173 link
npm run build      # production build in dist/ (static files, host anywhere)
npm test           # unit tests (writers, digitizer)
```

`dist/` is plain static files, so it can be hosted for free on GitHub Pages, Netlify, Cloudflare Pages, etc.

## What works (v0.1)

| Area | Status |
|---|---|
| Start page | Drop zone, example shield, recent designs (saved in the browser with IndexedDB), open `.json` project files |
| Setup | Hoop (10×10 to 27.2×40.8 cm), size with locked proportions and fit-to-hoop, patch / on-white-fabric, fabric presets, colour detection with nearest Brother thread (ΔE 2000), colour limit |
| Auto-digitizer (Web Worker) | Colour reduction (k-means in Lab, anti-aliasing removal), background removal, shapes, width analysis, auto stitch type (running < 1 mm, satin 1–7 mm for stroke-like shapes, tatami fill otherwise), fill angle choice, underlay, pull compensation, satin along centre-lines, running stitch along skeletons, tie-in/tie-off, colour ordering (fills first, outlines last), hidden travel routed under later colours, trims, stats, tips |
| Editor | Shapes / Stitches / Realistic / Density views, pan & zoom, click to select, sewing order with reorder, thread picker (64 Brother PEC colours), skip a colour, per-shape stitch type, angle, density, underlay, triple run, advanced spacing/length/pull, hide shape, back to auto, undo/redo (Ctrl+Z / Ctrl+Shift+Z), keyboard view switch (1–4) |
| Sew simulator | Play/pause (space), 1×–200× speed, scrubber, colour skip, thread change list, ghost of unsewn parts, jumps overlay, time left |
| Export | `.pes` (v1 with embedded PEC block + thumbnails), `.dst`, `.exp`; save straight to a USB stick (File System Access API in Chrome/Edge) or download; printable thread list; project file |
| Motion | Thread motifs, View Transitions between screens, `prefers-reduced-motion` respected |

### Verified

- `tests/golden.py`: our `.pes` header and stitch data are **byte-identical** to pyembroidery's PES v1 writer for the same stitches (only the 1-bit thumbnails differ by a few pixels); `.pes`, `.dst` and `.exp` read back with pyembroidery give the exact stitch list.
- `tests/e2e.cjs` (Playwright): example → setup → digitize → edit → simulator → export → download; no console errors.
- Example: the Flanders coat of arms (see `docs/05-example-flanders.md`).

**Not yet tested on a real Brother machine** — that is the Phase 1 gate in `docs/10-roadmap.md`.

## Known limitations / next steps

- **Lettering**: satin on thick letters can fan out on tight curves. Switch such shapes to *Fill* in the editor for now. Proper fix: rail-based satin (split strokes at corners, Ink/Stitch-style).
- **Trims**: small separate details (claws, fine outlines, letters) still need many trims. On machines without an automatic cutter that means snipping jump threads. Next: smarter object order (nearest entry point instead of nearest centre) and running travel along already-planned outlines.
- **Manual drawing tools** from `docs/08-manual-editor.md` (draw satin/running/fill, node edit, knife, stitch-level edits) are not built yet; editing is per detected shape.
- PES v6 (exact thread RGB), JEF export, lettering engine: later phases.
- Photos give poor results by nature; the app works best with logos and clip art.

## Code map

```
src/core/          pure TypeScript, no DOM — runs in the worker and in Node tests
  types.ts         shared types, hoop list
  color.ts         Lab, ΔE 2000, nearest Brother thread
  pecPalette.ts    the 64 Brother PEC thread colours
  raster.ts        quantise, components, distance transform, thinning, skeleton tracing
  stitches.ts      tatami fill, satin, running stitch, ordering, network walk
  digitize.ts      analyze() + plan(): the auto-digitizer
  writers.ts       PES/PEC, DST, EXP writers
src/worker/        Web Worker wrapper around core/digitize
src/ui/            React UI: store (state, persistence, view transitions), screens, canvas renderer
tests/             vitest unit tests, pyembroidery golden check, Playwright end-to-end
```
