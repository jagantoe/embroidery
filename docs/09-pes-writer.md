# 09 — PES writer: implementation and validation

We write our own small TypeScript writer (~400 lines) rather than shipping Python to the browser, and prove it byte-for-byte against pyembroidery on a golden test set before any machine test. (Pyodide + pyembroidery is an acceptable stop-gap for early prototypes.)

## Writer steps

1. Take the stitch plan in mm; convert to 0.1 mm integers, rounding **cumulatively** (track the rounded position, not each delta) so error never accumulates.
2. Split any move > 204.7 mm into several jumps, and any stitch longer than the max stitch length into several stitches.
3. Map threads to PEC indices (nearest by ΔE 2000) and build the colour table.
4. Write the PES header and, for v1, the `CEmbOne` + `CSewSeg` blocks; leave a placeholder for the PEC offset.
5. Write the PEC header, stitch block (patch its uint24 length afterwards) and the 48×38 thumbnails.
6. Patch the PEC offset at byte 8.

## PEC stitch encoder

```ts
const JUMP = 0x10, TRIM = 0x20;

function value(out: number[], v: number, long = false, flag = 0) {
  if (!long && v > -64 && v < 63) { out.push(v & 0x7f); return; }   // short form
  const x = (v & 0x0fff) | 0x8000 | (flag << 8);                      // long form
  out.push((x >> 8) & 0xff, x & 0xff);
}

export function encodePec(plan: Cmd[]): number[] {
  const out: number[] = [];
  let px = 0, py = 0, jumping = true, first = true, colourTwo = true;
  for (const c of plan) {
    const dx = Math.round(c.x - px), dy = Math.round(c.y - py);
    px += dx; py += dy;
    switch (c.cmd) {
      case 'stitch':
        if (jumping) { if (dx && dy) { value(out, 0); value(out, 0); } jumping = false; }
        value(out, dx); value(out, dy); break;
      case 'jump':
      case 'trim': {
        jumping = true;
        const f = first ? JUMP : TRIM;
        value(out, dx, true, f); value(out, dy, true, f); break;
      }
      case 'colour':
        if (jumping) { value(out, 0); value(out, 0); jumping = false; }
        out.push(0xfe, 0xb0, colourTwo ? 2 : 1); colourTwo = !colourTwo; break;
      case 'end':
        out.push(0xff); return out;
    }
    first = false;
  }
  out.push(0xff);
  return out;
}
```

This mirrors pyembroidery's `PecWriter.pec_encode`, which writes short values conservatively in −63…62 and treats every jump after the first as trim + jump.

## Validation ladder

- [ ] **Unit tests**: encoder edge values (−64, 63, −2048, 2047), long-move splitting, cumulative rounding.
- [ ] **Golden tests**: the same stitch plan through our writer and pyembroidery (`write_pes(pattern, f, {"version": 1})`) → identical bytes.
- [ ] **Round-trip**: read our file back with pyembroidery and libembroidery; positions within 0.1 mm, colour count and order equal.
- [ ] **Visual**: render with an independent viewer and compare to our preview.
- [ ] **Brother software**: opens in PE-Design and Artspira without warnings; size, stitch count and colours match.
- [ ] **Machine**: loads from USB, thumbnail and colour list correct, sews a 4×4 test on woven cotton with stabiliser; then the shield on 4×4 and 5×7.
- [ ] **v6**: thread RGB/brand shown correctly in PE-Design; older machines still read the PEC part.

## Machine test kit

Keep a fixed set of physical test sews, photographed and logged with their settings:

- density swatch (fills at 0.35 / 0.40 / 0.45 mm);
- satin widths 1–8 mm;
- lettering at 6 / 10 / 15 mm cap height;
- the shield, in both output modes.

Parameter changes are judged on fabric, not just on screen.
