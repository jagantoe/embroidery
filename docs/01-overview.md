# 01 — Overview

We are building a browser-based tool that turns a PNG or SVG into a Brother-compatible `.pes` embroidery file, either fully automatically or with the user editing every stitch object by hand. The output must open in Brother software (PE-Design, Artspira) and stitch correctly on Brother home machines.

## Goals

- Accept `.svg` (preferred — lossless shapes) and `.png`/`.jpg` (traced to vectors first).
- **Auto-digitize**: pick stitch types, density, underlay, pull compensation, colour order and travel paths without user input.
- **Manual mode**: select regions, change stitch type/angle/density, reorder colours, draw running-stitch paths.
- Live stitch preview with thread simulation, stitch count, size and estimated sewing time.
- Export `.pes` (v1 first, later v6) with an embedded PEC block so both PC software and the machine's LCD read it. Optional extras: `.dst`, `.jef`, `.exp`, `.png` preview.

## Non-goals for v1

Photo-realistic stitching, 3D puff foam, appliqué automation, a lettering engine with embroidery fonts, multi-hoop splitting.

## Target user

Hobbyists with a single-needle Brother home machine (see [00 — Decisions](00-decisions.md)). Defaults favour 100×100 mm and 130×180 mm hoops, woven fabric, few colour changes and few jumps.

## Key constraint

The hard part is not the file format (it is well reverse-engineered) but **digitizing quality**. A machine faithfully stitches whatever we give it, so bad density, missing underlay or a poor stitch order produce puckering, gaps and thread breaks. Most of this documentation is about getting that right.
