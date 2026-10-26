# 03 — The PES / PEC file format

A PES file is a small PC-side header (`#PESxxxx`) followed by a PEC block. The machine sews only from the PEC block, so the PEC stitch stream is what must be perfect. The layout below is cross-checked against the pyembroidery 1.5.1 source (`PesWriter.py`, `PecWriter.py`, `PesReader.py`, `EmbThreadPec.py`).

- All integers are **little-endian**.
- All coordinates are in **0.1 mm units**, Y axis pointing **down**.

## Versions

Known signatures: `#PES0001` (v1), `0020`, `0022`, `0030`, `0040`, `0050`, `0055`, `0056`, `0060` (v6), `0070`, `0080`, `0090`, `0100`.

Plan: ship **v1** first (simplest; every machine and PE-Design reads it, threads limited to the 64-colour PEC palette), then **v6**, which adds a custom thread table with real RGB values, brand and catalogue numbers, and design metadata (name, author, keywords).

## File layout (v1)

| Offset | Size | Field | Value / notes |
|---|---|---|---|
| 0 | 8 | Signature | `#PES0001` |
| 8 | 4 | PEC offset | uint32, absolute offset of the PEC block (patched after writing) |
| 12 | 2 | Scale to fit | 1 |
| 14 | 2 | Hoop | 1 = 130×180, 0 = 100×100 |
| 16 | 2 | Block count | 0 if empty, else 1 |
| 18 | 4 | Marker | `FF FF 00 00` = more blocks follow |
| 22 | var | `CEmbOne` block | string16 + bounds + affine transform (6×float32) + size |
| … | var | `CSewSeg` block | segments: `flag` (0 = stitch, 1 = jump), `colour index`, `point count`, int16 x,y pairs; `0x8003` between segments; then a colour-change log |
| … | 4 | End marker | `00 00 00 00` |
| PEC offset | var | PEC block | see below |

The PES-side `CSewSeg` data is what PE-Design shows as objects. A *truncated* PES (signature + header + PEC only) is also accepted by machines — a good first milestone.

## PEC block

| Part | Size (bytes) | Content |
|---|---|---|
| Label | 20 | `LA:` + name padded to 16 chars + `\r` (machines show ~8 chars) |
| Filler | 14 | 12× `0x20`, then `FF 00` |
| Icon geometry | 2 | `06` (bytes per row = 48 px / 8), `26` (38 rows) |
| Filler | 12 | 12× `0x20` |
| Colour count | 1 | number of colour blocks − 1 |
| Colour table | n | one byte per block: index 1–64 into the PEC palette |
| Padding | up to 463 total | `0x20` |
| Stitch header | 15 | `00 00`, uint24 stitch-block length, `31 FF F0`, int16 width, int16 height, int16 `0x01E0`, int16 `0x01B0` |
| Stitch stream | var | encoded moves, ends with `FF` |
| Thumbnails | 228 × (1 + colours) | 48×38 1-bit bitmaps: whole design, then one per colour block |

## Stitch encoding

Each move is a relative `(dx, dy)` pair, X first, in one of two forms:

| Form | Bytes | Range | Bit layout |
|---|---|---|---|
| Short | 1 | −64 … 63 (±6.3 mm); writers use −63 … 62 | 7-bit two's complement, bit 7 = 0 |
| Long | 2 | −2048 … 2047 (±204.7 mm) | bit 15 = 1, bit 13 = trim, bit 12 = jump, bits 0–11 = 12-bit two's complement |

Control codes:

- **Colour change**: `FE B0 xx`, where `xx` alternates `02`, `01`, `02`, …
- **Jump**: long form with the jump flag on both dx and dy.
- **Trim + jump**: long form with the trim flag — the machine cuts (if it can), then moves.
- **End**: `FF`.

Rules from working writers:

- Emit a `(0,0)` stitch after a jump before sewing resumes (tie-in point).
- Split jumps longer than the 12-bit range.
- After a colour change, the first move is usually a jump to the next block's start.

## PEC thread palette

The machine identifies threads by index into a fixed 64-entry palette (1 = Prussian Blue, 5 = Red, 13 = Yellow, 20 = Black, 29 = White, 56 = Moss Green, …). The writer maps each design colour to the nearest entry using CIE ΔE (not RGB distance). In v6 the true RGB and thread brand/catalogue number are also stored in the PES header so PE-Design and newer machines show the right colour; the PEC index remains the fallback.

## Thumbnail

The 48×38 monochrome icon is what the machine shows in its file browser. Draw stitches scaled to fit inside a 1-px border: one icon for the whole design, then one per colour block (shown while each colour sews).
