// Embroidery file writers: PES (v1, with embedded PEC), DST and EXP.
// Byte layouts follow pyembroidery (MIT) — see docs/03-pes-format.md.
import type { StitchPlan, Thread } from './types';

export interface NormPoint { x: number; y: number; cmd: 'stitch' | 'jump' | 'trim' | 'colour' | 'end' }
export interface Normalized { pts: NormPoint[]; threads: Thread[]; }

class ByteWriter {
  private buf = new Uint8Array(1 << 16);
  len = 0;
  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const nb = new Uint8Array(size);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  }
  u8(v: number) { this.ensure(1); this.buf[this.len++] = v & 0xff; }
  bytes(arr: ArrayLike<number>) { for (let i = 0; i < arr.length; i++) this.u8(arr[i]); }
  ascii(s: string) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i) & 0x7f); }
  i16(v: number) { v = Math.trunc(v); this.u8(v & 0xff); this.u8((v >> 8) & 0xff); }
  i24(v: number) { this.u8(v & 0xff); this.u8((v >> 8) & 0xff); this.u8((v >> 16) & 0xff); }
  i32(v: number) { this.u8(v & 0xff); this.u8((v >> 8) & 0xff); this.u8((v >> 16) & 0xff); this.u8((v >>> 24) & 0xff); }
  f32(v: number) { const b = new Uint8Array(new Float32Array([v]).buffer); this.bytes(b); }
  patchI24(at: number, v: number) { this.buf[at] = v & 0xff; this.buf[at + 1] = (v >> 8) & 0xff; this.buf[at + 2] = (v >> 16) & 0xff; }
  patchI32(at: number, v: number) { for (let i = 0; i < 4; i++) this.buf[at + i] = (v >>> (8 * i)) & 0xff; }
  patchI16(at: number, v: number) { this.buf[at] = v & 0xff; this.buf[at + 1] = (v >> 8) & 0xff; }
  result() { return this.buf.slice(0, this.len); }
}

/**
 * Converts a plan in mm into integer machine units (0.1 mm), centred on (0,0),
 * splitting moves longer than the format allows. Rounding is cumulative.
 */
export function normalize(plan: StitchPlan, maxStitch: number, maxJump: number): Normalized {
  const src = plan.stitches.filter((s) => s.cmd !== 'end');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of src) {
    if (s.cmd !== 'stitch') continue;
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
  }
  if (!isFinite(minX)) { minX = maxX = minY = maxY = 0; }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const pts: NormPoint[] = [];
  let px = 0, py = 0;
  const firstMove = src.find((s) => s.cmd === 'stitch' || s.cmd === 'jump');
  if (firstMove && firstMove.cmd === 'stitch') src.unshift({ x: firstMove.x, y: firstMove.y, cmd: 'jump' });
  for (const s of src) {
    const tx = Math.round((s.x - cx) * 10), ty = Math.round((s.y - cy) * 10);
    if (s.cmd === 'trim' || s.cmd === 'colour') { pts.push({ x: px, y: py, cmd: s.cmd }); continue; }
    const limit = s.cmd === 'stitch' ? maxStitch : maxJump;
    const dx = tx - px, dy = ty - py;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / limit));
    let lx = px, ly = py;
    for (let i = 1; i <= steps; i++) {
      const nx = px + Math.round((dx * i) / steps), ny = py + Math.round((dy * i) / steps);
      if (nx === lx && ny === ly && s.cmd === 'stitch' && i < steps) continue;
      pts.push({ x: nx, y: ny, cmd: s.cmd });
      lx = nx; ly = ny;
    }
    px = tx; py = ty;
  }
  pts.push({ x: px, y: py, cmd: 'end' });
  return { pts, threads: plan.threads };
}

function bounds(pts: NormPoint[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (!isFinite(minX)) return [0, 0, 0, 0];
  return [minX, minY, maxX, maxY];
}

// ---------------------------------------------------------------- PEC

const PEC_ICON_W = 48, PEC_ICON_H = 38, PEC_STRIDE = 6;
const ICON_BLANK: number[] = (() => {
  const b = new Array(PEC_STRIDE * PEC_ICON_H).fill(0);
  b.splice(6, 6, 0xf0, 0xff, 0xff, 0xff, 0xff, 0x0f);
  b.splice(12, 6, 0x08, 0, 0, 0, 0, 0x10);
  b.splice(18, 6, 0x04, 0, 0, 0, 0, 0x20);
  for (let r = 4; r <= 33; r++) b.splice(r * 6, 6, 0x02, 0, 0, 0, 0, 0x40);
  b.splice(34 * 6, 6, 0x04, 0, 0, 0, 0, 0x20);
  b.splice(35 * 6, 6, 0x08, 0, 0, 0, 0, 0x10);
  b.splice(36 * 6, 6, 0xf0, 0xff, 0xff, 0xff, 0xff, 0x0f);
  return b;
})();

function drawIcon(ext: number[], pts: { x: number; y: number }[], g: number[]) {
  const buffer = 5;
  const [left, top, right, bottom] = ext;
  const dw = right - left || 1, dh = bottom - top || 1;
  const gw = PEC_STRIDE * 8, gh = g.length / PEC_STRIDE;
  const scale = Math.min((gw - buffer) / dw, (gh - buffer) / dh);
  const tx = -((right + left) / 2) * scale + gw / 2;
  const ty = -((bottom + top) / 2) * scale + gh / 2;
  for (const p of pts) {
    const x = Math.floor(p.x * scale + tx), y = Math.floor(p.y * scale + ty);
    const idx = y * PEC_STRIDE + Math.trunc(x / 8);
    if (idx >= 0 && idx < g.length && x >= 0) g[idx] |= 1 << (x % 8);
  }
}

function pecValue(w: ByteWriter, v: number, long = false, flag = 0) {
  if (!long && v > -64 && v < 63) { w.u8(v & 0x7f); return; }
  let x = v & 0x0fff;
  x |= 0x8000;
  x |= flag << 8;
  w.u8((x >> 8) & 0xff);
  w.u8(x & 0xff);
}

function pecEncode(w: ByteWriter, pts: NormPoint[]) {
  let colourTwo = true, jumping = true, first = true;
  let xx = 0, yy = 0;
  for (const p of pts) {
    const dx = p.x - xx, dy = p.y - yy;
    xx += dx; yy += dy;
    switch (p.cmd) {
      case 'stitch':
        if (jumping) {
          if (dx !== 0 && dy !== 0) { pecValue(w, 0); pecValue(w, 0); }
          jumping = false;
        }
        pecValue(w, dx); pecValue(w, dy);
        break;
      case 'jump': {
        jumping = true;
        // Like pyembroidery/PE-Design: every jump after the first is a trim + jump.
        const flag = first ? 0x10 : 0x20;
        pecValue(w, dx, true, flag); pecValue(w, dy, true, flag);
        break;
      }
      case 'trim':
        break;
      case 'colour':
        if (jumping) { pecValue(w, 0); pecValue(w, 0); jumping = false; }
        w.bytes([0xfe, 0xb0, colourTwo ? 2 : 1]);
        colourTwo = !colourTwo;
        break;
      case 'end':
        w.u8(0xff);
        return;
    }
    first = false;
  }
  w.u8(0xff);
}

function writePec(w: ByteWriter, n: Normalized, name: string) {
  const ext = bounds(n.pts);
  const label = ('LA:' + name.slice(0, 8).padEnd(16, ' ') + '\r');
  w.ascii(label);
  w.bytes([0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0xff, 0x00]);
  w.u8(PEC_ICON_W / 8);
  w.u8(PEC_ICON_H);
  const blocks = n.threads.map((t) => t.pec);
  if (blocks.length) {
    w.bytes(new Array(12).fill(0x20));
    w.u8(blocks.length - 1);
    w.bytes(blocks);
  } else {
    w.bytes([0x20, 0x20, 0x20, 0x20, 0x64, 0x20, 0x00, 0x20, 0x00, 0x20, 0x20, 0x20, 0xff]);
  }
  for (let i = blocks.length; i < 463; i++) w.u8(0x20);

  // stitch block
  const start = w.len;
  w.bytes([0x00, 0x00]);
  w.i24(0);
  w.bytes([0x31, 0xff, 0xf0]);
  w.i16(Math.round(ext[2] - ext[0]));
  w.i16(Math.round(ext[3] - ext[1]));
  w.i16(0x1e0);
  w.i16(0x1b0);
  pecEncode(w, n.pts);
  w.patchI24(start + 2, w.len - start);

  // thumbnails: whole design, then one per colour block
  const all = ICON_BLANK.slice();
  const perColour: { x: number; y: number }[][] = [[]];
  for (const p of n.pts) {
    if (p.cmd === 'stitch') { perColour[perColour.length - 1].push(p); }
    if (p.cmd === 'colour') perColour.push([]);
  }
  drawIcon(ext, perColour.flat(), all);
  w.bytes(all);
  for (const block of perColour) {
    const g = ICON_BLANK.slice();
    drawIcon(ext, block, g);
    w.bytes(g);
  }
}

// ---------------------------------------------------------------- PES v1

export function writePes(plan: StitchPlan, name = 'Design'): Uint8Array {
  const n = normalize(plan, 120, 2047);
  const w = new ByteWriter();
  w.ascii('#PES0001');
  const ext = bounds(n.pts);
  const cx = (ext[2] + ext[0]) / 2, cy = (ext[3] + ext[1]) / 2;
  const left = ext[0] - cx, top = ext[1] - cy, right = ext[2] - cx, bottom = ext[3] - cy;
  const pecOffsetAt = w.len;
  w.i32(0);
  const hasStitches = n.pts.some((p) => p.cmd === 'stitch');
  w.i16(0x01); // scale to fit
  w.i16(0x01); // hoop 130x180
  w.i16(hasStitches ? 1 : 0);
  if (!hasStitches) {
    w.i16(0); w.i16(0);
  } else {
    w.i16(0xffff); w.i16(0x0000);
    writePesBlocks(w, n, left, top, right, bottom, cx, cy);
  }
  w.patchI32(pecOffsetAt, w.len);
  writePec(w, n, name);
  return w.result();
}

function str16(w: ByteWriter, s: string) { w.i16(s.length); w.ascii(s); }

function writePesBlocks(w: ByteWriter, n: Normalized, left: number, top: number, right: number, bottom: number, cx: number, cy: number) {
  str16(w, 'CEmbOne');
  const width = right - left, height = bottom - top;
  for (let i = 0; i < 8; i++) w.i16(0);
  const transX = 350 + 1300 / 2 - width / 2;
  const transY = 100 + height + 1800 / 2 - height / 2;
  [1, 0, 0, 1, transX, transY].forEach((v) => w.f32(v));
  w.i16(1); w.i16(0); w.i16(0);
  w.i16(Math.trunc(width)); w.i16(Math.trunc(height));
  w.bytes([0, 0, 0, 0, 0, 0, 0, 0]);
  const sectionsAt = w.len;
  w.i16(0);
  w.i16(0xffff); w.i16(0x0000);
  str16(w, 'CSewSeg');

  // group consecutive commands into blocks (stitch / jump / colour / trim)
  const adjX = left + cx, adjY = bottom + cy;
  const blocks: NormPoint[][] = [];
  for (const p of n.pts) {
    if (p.cmd === 'end') continue;
    const last = blocks[blocks.length - 1];
    if (last && last[0].cmd === p.cmd) last.push(p); else blocks.push([p]);
  }
  let colourIdx = 0;
  let colourCode = n.threads[0]?.pec ?? 20;
  let stitchedX = 0, stitchedY = 0;
  let section = 0, prevCode = -1, flag = -1;
  const log: [number, number][] = [];
  for (const block of blocks) {
    const cmd = block[0].cmd;
    let pts: [number, number][] = [];
    let f: number;
    if (cmd === 'jump') {
      pts.push([stitchedX - adjX, stitchedY - adjY]);
      const lp = block[block.length - 1];
      pts.push([lp.x - adjX, lp.y - adjY]);
      f = 1;
    } else if (cmd === 'colour') {
      colourIdx += block.length;
      colourCode = n.threads[colourIdx]?.pec ?? colourCode;
      continue;
    } else if (cmd === 'stitch') {
      pts = block.map((p) => { stitchedX = p.x; stitchedY = p.y; return [p.x - adjX, p.y - adjY]; });
      f = 0;
    } else continue;
    if (flag !== -1) w.i16(0x8003);
    flag = f;
    if (prevCode !== colourCode) { log.push([section, colourCode]); prevCode = colourCode; }
    w.i16(f); w.i16(colourCode); w.i16(pts.length);
    for (const [x, y] of pts) { w.i16(Math.trunc(x)); w.i16(Math.trunc(y)); }
    section++;
  }
  w.i16(log.length);
  for (const [s, c] of log) { w.i16(s); w.i16(c); }
  w.patchI16(sectionsAt, section);
  w.i16(0); w.i16(0);
}

// ---------------------------------------------------------------- DST

function dstRecord(x: number, y: number, kind: 'stitch' | 'jump' | 'colour' | 'end'): number[] {
  y = -y;
  let b0 = 0, b1 = 0, b2 = 0;
  const bit = (b: number) => 1 << b;
  if (kind === 'jump') b2 += bit(7);
  if (kind === 'stitch' || kind === 'jump') {
    b2 += bit(0) + bit(1);
    if (x > 40) { b2 += bit(2); x -= 81; }
    if (x < -40) { b2 += bit(3); x += 81; }
    if (x > 13) { b1 += bit(2); x -= 27; }
    if (x < -13) { b1 += bit(3); x += 27; }
    if (x > 4) { b0 += bit(2); x -= 9; }
    if (x < -4) { b0 += bit(3); x += 9; }
    if (x > 1) { b1 += bit(0); x -= 3; }
    if (x < -1) { b1 += bit(1); x += 3; }
    if (x > 0) { b0 += bit(0); x -= 1; }
    if (x < 0) { b0 += bit(1); x += 1; }
    if (y > 40) { b2 += bit(5); y -= 81; }
    if (y < -40) { b2 += bit(4); y += 81; }
    if (y > 13) { b1 += bit(5); y -= 27; }
    if (y < -13) { b1 += bit(4); y += 27; }
    if (y > 4) { b0 += bit(5); y -= 9; }
    if (y < -4) { b0 += bit(4); y += 9; }
    if (y > 1) { b1 += bit(7); y -= 3; }
    if (y < -1) { b1 += bit(6); y += 3; }
    if (y > 0) { b0 += bit(7); y -= 1; }
    if (y < 0) { b0 += bit(6); y += 1; }
    if (x !== 0 || y !== 0) throw new Error('DST move out of range');
  } else if (kind === 'colour') b2 = 0b11000011;
  else if (kind === 'end') b2 = 0b11110011;
  return [b0, b1, b2];
}

export function writeDst(plan: StitchPlan, name = 'Design'): Uint8Array {
  const n = normalize(plan, 121, 121);
  const w = new ByteWriter();
  const ext = bounds(n.pts);
  const pad = (v: number, len: number) => String(v).padStart(len, ' ');
  const stitchCount = n.pts.length;
  const colours = n.pts.filter((p) => p.cmd === 'colour').length;
  w.ascii('LA:' + name.slice(0, 16).padEnd(16, ' ') + '\r');
  w.ascii('ST:' + pad(stitchCount, 7) + '\r');
  w.ascii('CO:' + pad(colours, 3) + '\r');
  w.ascii('+X:' + pad(Math.abs(ext[2]), 5) + '\r');
  w.ascii('-X:' + pad(Math.abs(ext[0]), 5) + '\r');
  w.ascii('+Y:' + pad(Math.abs(ext[3]), 5) + '\r');
  w.ascii('-Y:' + pad(Math.abs(ext[1]), 5) + '\r');
  const last = n.pts[n.pts.length - 1];
  const ax = last ? last.x : 0, ay = last ? -last.y : 0;
  w.ascii('AX:' + (ax >= 0 ? '+' : '-') + pad(Math.abs(ax), 5) + '\r');
  w.ascii('AY:' + (ay >= 0 ? '+' : '-') + pad(Math.abs(ay), 5) + '\r');
  w.ascii('MX:+' + pad(0, 5) + '\r');
  w.ascii('MY:+' + pad(0, 5) + '\r');
  w.ascii('PD:******\r');
  w.u8(0x1a);
  while (w.len < 512) w.u8(0x20);
  let xx = 0, yy = 0;
  for (const p of n.pts) {
    const dx = p.x - xx, dy = p.y - yy;
    xx += dx; yy += dy;
    if (p.cmd === 'trim') {
      w.bytes(dstRecord(2, 2, 'jump'));
      w.bytes(dstRecord(-4, -4, 'jump'));
      w.bytes(dstRecord(2, 2, 'jump'));
    } else if (p.cmd === 'colour') w.bytes(dstRecord(0, 0, 'colour'));
    else if (p.cmd === 'end') w.bytes(dstRecord(0, 0, 'end'));
    else w.bytes(dstRecord(dx, dy, p.cmd));
  }
  return w.result();
}

// ---------------------------------------------------------------- EXP (Melco)

export function writeExp(plan: StitchPlan): Uint8Array {
  const n = normalize(plan, 127, 127);
  const w = new ByteWriter();
  let xx = 0, yy = 0;
  for (const p of n.pts) {
    const dx = p.x - xx, dy = p.y - yy;
    xx += dx; yy += dy;
    if (p.cmd === 'stitch') w.bytes([dx & 0xff, -dy & 0xff]);
    else if (p.cmd === 'jump') w.bytes([0x80, 0x04, dx & 0xff, -dy & 0xff]);
    else if (p.cmd === 'trim') w.bytes([0x80, 0x80, 0x07, 0x00]);
    else if (p.cmd === 'colour') w.bytes([0x80, 0x01, 0x00, 0x00]);
  }
  return w.result();
}

export type ExportFormat = 'pes' | 'dst' | 'exp';

export function writeFormat(fmt: ExportFormat, plan: StitchPlan, name: string): Uint8Array {
  if (fmt === 'pes') return writePes(plan, name);
  if (fmt === 'dst') return writeDst(plan, name);
  return writeExp(plan);
}
