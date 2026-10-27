# Needle & Pixel

A free, open-source (GPL-3.0) browser tool that turns PNG, JPG and SVG images into `.pes` embroidery files for Brother machines. Convert automatically, or fine-tune the stitches in a built-in editor. Everything runs locally in your browser; nothing is uploaded.

> **Status:** v0.1. The writers are verified byte-for-byte against [pyembroidery](https://github.com/EmbroidePy/pyembroidery), but the output has not yet been sewn on a real machine. Treat results as experimental.

## Features

- Auto-digitizer: colour reduction, stitch type selection (running, satin, tatami fill), underlay, pull compensation and colour ordering that minimises thread changes.
- Editor with shapes, stitches, realistic and density views, plus a sew simulator.
- Export to `.pes` (with embedded PEC block and thumbnails), `.dst` and `.exp`.
- Hoop presets from 100×100 mm up to 272×408 mm and a built-in Brother thread palette.

See [`app/README.md`](app/README.md) for the full feature list, limitations and code map.

## Getting started

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
cd app
npm install
npm run dev      # development server on http://localhost:5173
npm test         # unit tests
npm run build    # static build in app/dist
```

The build is plain static files and is deployed to GitHub Pages by [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

## Repository layout

```
├── app/        web app (Vite + React + TypeScript)
│   └── src/core/   digitizer and file writers, plain TypeScript with no DOM dependency
├── docs/       design documentation, numbered and meant to be read in order
└── examples/   sample design used for testing
```

## Documentation

| # | Document | Covers |
|---|----------|--------|
| 00 | [Decisions](docs/00-decisions.md) | Target user, licence, platform |
| 01 | [Overview](docs/01-overview.md) | Goals, non-goals, key constraint |
| 02 | [Brother machines](docs/02-brother-machines.md) | Machine families, hoops, formats, file transfer |
| 03 | [PES / PEC format](docs/03-pes-format.md) | Byte layout, stitch encoding, palette, thumbnails |
| 04 | [Embroidery fundamentals](docs/04-embroidery-fundamentals.md) | Stitch types, density, underlay, compensation |
| 05 | [Example design](docs/05-example-flanders.md) | Analysis of the test file and its stitch plan |
| 06 | [Architecture](docs/06-architecture.md) | Components, data model, tech stack |
| 07 | [Auto-digitizing](docs/07-auto-digitizing.md) | Import, classify, stitch, optimise, validate |
| 08 | [Manual editor](docs/08-manual-editor.md) | Layout, tools, views, behaviour rules |
| 09 | [PES writer](docs/09-pes-writer.md) | Encoder and validation ladder |
| 10 | [Roadmap](docs/10-roadmap.md) | Phases and gates |
| 11 | [Libraries, prior art and risks](docs/11-libraries-and-risks.md) | What to reuse, what can go wrong |
| 12 | [Motion and transitions](docs/12-motion-and-transitions.md) | Thread motifs, animations, View Transitions |
| 13 | [Hand-digitized comparison](docs/13-hand-digitized-comparison.md) | Auto output vs. a hand-digitized file, what changed, remaining gaps |

## Key facts

- Brother machines sew from the PEC block inside a `.pes` file. Coordinates are in 0.1 mm units, as relative moves.
- Stitch type rule of thumb: width under 1 mm becomes running stitch, 1–7 mm satin, over 7 mm tatami fill.
- Defaults target hobbyist single-needle machines: 100×100 mm hoop, woven fabric, no automatic thread cutter, so colour changes and jumps are kept to a minimum.

## Disclaimer

Not affiliated with or endorsed by Brother Industries. "Brother", "PE-Design" and "Artspira" are trademarks of their respective owners and are used only to describe file compatibility.

## Licence

GPL-3.0-or-later. See [`app/LICENSE`](app/LICENSE).
