# 02 — Brother embroidery machines

Every current Brother home and semi-pro machine reads `.pes`, so one correct PES writer covers the whole range. What varies per model is the maximum embroidery field (hoop), needle count, whether there is an automatic thread cutter, and how files get to the machine.

> **Accuracy note:** web lookup was unavailable while writing this; model specs below are approximate from general knowledge. Verify against the specific machine's manual before hard-coding limits.

## Machine families

| Family | Example models | Needles | Max field (approx.) | Notes |
|---|---|---|---|---|
| Entry embroidery-only | PE535, PE800 | 1 | 100×100 / 130×180 mm | USB stick, colour LCD |
| Sewing + embroidery combo | SE600/SE700, SE1900, SE2000, Innov-is F440E/F540E (EU) | 1 | 100×100 to 260×160 mm | Wi-Fi on newer models (Artspira) |
| High-end Innov-is | Stellaire XE/XJ, Luminaire XP, Innov-is V-series | 1 | up to ~272×408 mm | Projector, camera, My Design Center |
| Multi-needle | PR680W, PR1050X, Persona/Entrepreneur | 6–10 | ~200×300 to 200×360 mm | Automatic colour changes |

Hobbyist focus means the first two rows are the design target. Many entry models have no automatic thread cutter, so every trim is a jump thread the user snips by hand.

## Hoop sizes to support

| Hoop | Field (mm) | Typical use |
|---|---|---|
| Small | 20×60 | Monograms, cuffs |
| 4×4 in | 100×100 | Patches, chest logos — **default** |
| 5×7 in | 130×180 | Most common larger home hoop |
| 6×10 in | 160×260 | Larger logos |
| 8×12 in | 200×300 | Multi-needle, jacket backs |
| 9.5×14 in | 240×360 | High-end single needle |
| 10.6×16 in | 272×408 | Luminaire class |

The app exposes a **hoop picker** that sets the canvas, warns when the design exceeds the field, and offers auto-scale-to-fit with a ~3 mm safety margin.

## File formats Brother machines read

- **PES** — Brother's native format; PC-side design data *plus* an embedded **PEC** block the machine sews from.
- **PEC** — the machine-level stitch block on its own (older machines/cards).
- **PHC / PHX** — internal formats for built-in/projector designs; not needed.
- **DST** (Tajima) — read by many Brother models, no colour info; fallback export.

## Getting files to the machine

1. **USB stick** — universal. FAT32, files in the root or one folder level, short names (8.3-style is safest on older models).
2. **USB cable** to a PC — machine mounts as a removable drive on many models.
3. **Wi-Fi** — newer models pair with Brother's Artspira app or PC transfer utility. A website can't push there directly; v1 delivers a download (and, in Chrome/Edge, can save straight to a USB stick via the File System Access API).

## Brother software we must interoperate with

- **PE-Design** (Windows) — professional digitizing; reads/writes all PES versions. Our files must open there without warnings.
- **Artspira** (iOS/Android) — Brother's mobile app; second validator.
- **Machine LCD** — shows the PEC thumbnail, colour list (64-colour PEC palette), stitch count and size. Wrong values here are the first symptom of a bad writer.
