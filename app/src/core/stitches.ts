// Stitch generators: tatami fill, satin columns and running stitch.
// All coordinates in millimetres. A "run" is a list of needle points that are
// sewn one after the other without trims.

export type Pt = [number, number];
export type Run = Pt[];
export type InsideFn = (x: number, y: number) => boolean;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

interface Row { k: number; segs: [number, number][] }

/** Scan the shape with parallel lines at `angle`, returning inside runs per row. */
function scanRows(inside: InsideFn, bbox: [number, number, number, number], angle: number, spacing: number, step: number): { rows: Row[]; u: Pt; v: Pt; c: Pt } {
  const a = (angle * Math.PI) / 180;
  const u: Pt = [Math.cos(a), Math.sin(a)];
  const v: Pt = [-Math.sin(a), Math.cos(a)];
  const c: Pt = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  const corners: Pt[] = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]]];
  let tmin = Infinity, tmax = -Infinity, kmin = Infinity, kmax = -Infinity;
  for (const p of corners) {
    const dx = p[0] - c[0], dy = p[1] - c[1];
    const t = dx * u[0] + dy * u[1], k = dx * v[0] + dy * v[1];
    tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); kmin = Math.min(kmin, k); kmax = Math.max(kmax, k);
  }
  tmin -= step; tmax += step;
  const rows: Row[] = [];
  for (let k = kmin + spacing / 2; k <= kmax; k += spacing) {
    const segs: [number, number][] = [];
    let start = NaN;
    for (let t = tmin; t <= tmax; t += step) {
      const x = c[0] + t * u[0] + k * v[0], y = c[1] + t * u[1] + k * v[1];
      const ins = inside(x, y);
      if (ins && isNaN(start)) start = t;
      if (!ins && !isNaN(start)) { segs.push([start, t - step]); start = NaN; }
    }
    if (!isNaN(start)) segs.push([start, tmax]);
    rows.push({ k, segs });
  }
  return { rows, u, v, c };
}

/** Number of row breaks for a given angle — used to pick a fill angle. */
export function fillBreaks(inside: InsideFn, bbox: [number, number, number, number], angle: number, step: number): number {
  const { rows } = scanRows(inside, bbox, angle, 1.0, step * 2);
  let breaks = 0;
  for (const r of rows) if (r.segs.length > 1) breaks += r.segs.length - 1;
  return breaks;
}

export interface FillOptions {
  angle: number;
  spacing: number;
  length: number;
  inset: number;        // shrink each row by this much (underlay)
  extend: number;       // pull compensation per row end
  step: number;         // scan resolution (mm)
  canExtend: InsideFn;  // where extension is allowed
}

/**
 * Tatami fill: parallel rows linked into back-and-forth sections. Needle
 * points are staggered by 1/3 stitch length per row so no "rivers" show.
 */
export function tatami(inside: InsideFn, bbox: [number, number, number, number], o: FillOptions): Run[] {
  const { rows, u, v, c } = scanRows(inside, bbox, o.angle, o.spacing, o.step);
  const toXY = (t: number, k: number): Pt => [c[0] + t * u[0] + k * v[0], c[1] + t * u[1] + k * v[1]];
  // clean segments
  const segRows = rows.map((r) => r.segs
    .map(([a, b]) => {
      a += o.inset; b -= o.inset;
      if (o.extend > 0) {
        if (o.canExtend(...toXY(a - o.extend, r.k))) a -= o.extend;
        if (o.canExtend(...toXY(b + o.extend, r.k))) b += o.extend;
      }
      return [a, b] as [number, number];
    })
    .filter(([a, b]) => b - a >= 0.4));
  const used = segRows.map((s) => s.map(() => false));
  const sections: { row: number; seg: [number, number] }[][] = [];
  for (let r0 = 0; r0 < segRows.length; r0++) {
    for (let s0 = 0; s0 < segRows[r0].length; s0++) {
      if (used[r0][s0]) continue;
      const sec = [{ row: r0, seg: segRows[r0][s0] }];
      used[r0][s0] = true;
      let cur = segRows[r0][s0];
      for (let r = r0 + 1; r < segRows.length; r++) {
        let best = -1, bestOv = 0;
        segRows[r].forEach((sg, i) => {
          if (used[r][i]) return;
          const ov = Math.min(cur[1], sg[1]) - Math.max(cur[0], sg[0]);
          if (ov > bestOv) { bestOv = ov; best = i; }
        });
        if (best < 0) break;
        used[r][best] = true;
        cur = segRows[r][best];
        sec.push({ row: r, seg: cur });
      }
      sections.push(sec);
    }
  }
  const L = o.length;
  return sections.map((sec) => {
    const run: Run = [];
    sec.forEach(({ row, seg }, i) => {
      const k = rows[row].k;
      const off = ((row % 3) / 3) * L;
      const ts: number[] = [seg[0]];
      let g = Math.ceil((seg[0] - off) / L) * L + off;
      for (; g < seg[1]; g += L) if (g - seg[0] > 0.6 && seg[1] - g > 0.6) ts.push(g);
      ts.push(seg[1]);
      if (i % 2 === 1) ts.reverse();
      for (const t of ts) run.push(toXY(t, k));
    });
    return run;
  });
}

/** Smooth a polyline with a moving average, keeping the ends. */
export function smooth(line: Pt[], radius: number): Pt[] {
  if (line.length < 3 || radius < 1) return line;
  return line.map((p, i) => {
    if (i === 0 || i === line.length - 1) return p;
    let sx = 0, sy = 0, n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(line.length - 1, i + radius); j++) { sx += line[j][0]; sy += line[j][1]; n++; }
    return [sx / n, sy / n] as Pt;
  });
}

/** Resample a polyline at a fixed arc-length step. */
export function resample(line: Pt[], step: number): Pt[] {
  if (line.length < 2) return line.slice();
  const out: Pt[] = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const len = dist(a, b);
    let t = step - carry;
    while (t <= len) {
      out.push([a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len]);
      t += step;
    }
    carry = len - (t - step);
  }
  const last = line[line.length - 1];
  if (dist(out[out.length - 1], last) > step * 0.3) out.push(last);
  else out[out.length - 1] = last;
  return out;
}

/** Running stitch along a path: ~`length` mm stitches, shorter around sharp corners. */
export function runningStitches(path: Pt[], length: number, triple: boolean): Run {
  if (path.length < 2) return path.slice();
  const out: Pt[] = [path[0]];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const seg = dist(a, b);
    let t = 0;
    while (acc + (seg - t) >= length) {
      t += length - acc;
      out.push([a[0] + ((b[0] - a[0]) * t) / seg, a[1] + ((b[1] - a[1]) * t) / seg]);
      acc = 0;
    }
    acc += seg - t;
    // keep sharp corners
    if (i < path.length - 1 && acc > 0.6) {
      const c = path[i + 1];
      const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]), a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
      let turn = Math.abs(a2 - a1);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      if (turn > 0.6) { out.push(b); acc = 0; }
    }
  }
  const last = path[path.length - 1];
  if (dist(out[out.length - 1], last) > 0.3) out.push(last);
  if (!triple) return out;
  const tri: Pt[] = [out[0]];
  for (let i = 1; i < out.length; i++) tri.push(out[i], out[i - 1], out[i]);
  return tri;
}

export interface SatinOptions {
  /** local half-width estimate (mm) at a point, from the distance transform */
  halfWidthAt: (p: Pt) => number;
  spacing: number;
  pullComp: number;
  /** narrowest column (mm) — thinner outlines are widened to this */
  minWidth: number;
  maxHalfWidth: number;
  step: number;
  underlay: boolean;
}

/**
 * Satin column along a centre-line: at every `spacing/2` mm the needle goes to
 * the left and right edge of the shape (found by casting rays in the mask).
 * The centre-line is first sewn as an underlay run, then the satin comes back.
 */
export function satinAlong(center: Pt[], inside: InsideFn, o: SatinOptions): Run {
  // sample the centre-line finely; the stitch positions are picked from these samples below
  const fine = resample(center, 0.05);
  if (fine.length < 2) return [];
  const ray = (p: Pt, n: Pt, limit: number) => {
    let d = 0;
    while (d < limit && inside(p[0] + n[0] * (d + o.step), p[1] + n[1] * (d + o.step))) d += o.step;
    return d;
  };
  const sampleEvery = Math.max(1, Math.round(0.15 / 0.05));
  // 1. a stitch direction per sample: the shortest chord through the point, searched within
  //    ±60° of the centre-line normal. Hand digitizers set such "direction lines" so stitches
  //    cross a stroke at right angles instead of fanning on curves and at corners.
  const raw: Pt[] = [];
  for (let i = 0; i < fine.length; i += sampleEvery) {
    const p = fine[i];
    const hw = o.halfWidthAt(p);
    const win = Math.max(6, Math.ceil((Math.max(0.6, hw) * 1.6) / 0.05));
    const a = fine[Math.max(0, i - win)], b = fine[Math.min(fine.length - 1, i + win)];
    const base = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
    const limit = Math.min(o.maxHalfWidth, hw * 2.5 + 0.5);
    let best = base, bestLen = Infinity;
    for (let k = -10; k <= 10; k++) {
      const t = base + (k * Math.PI) / 30;
      const n: Pt = [Math.cos(t), Math.sin(t)];
      const len = ray(p, n, limit) + ray(p, [-n[0], -n[1]], limit) + Math.abs(k) * 0.004; // slight bias to the normal
      if (len < bestLen) { bestLen = len; best = t; }
    }
    raw.push([Math.cos(best), Math.sin(best)]);
  }
  const dirAt = (i: number): Pt => {
    // smoothed direction, interpolated from the coarse samples
    const c = Math.min(raw.length - 1, Math.floor(i / sampleEvery));
    const ref = raw[c];
    let sx = 0, sy = 0;
    for (let j = Math.max(0, c - 3); j <= Math.min(raw.length - 1, c + 3); j++) {
      const e = raw[j];
      const sgn = e[0] * ref[0] + e[1] * ref[1] < 0 ? -1 : 1;
      sx += e[0] * sgn; sy += e[1] * sgn;
    }
    const l = Math.hypot(sx, sy) || 1;
    return [sx / l, sy / l];
  };
  // 2. chords (left, right edge points) at every fine sample, with a consistent "left" side
  const chords: [Pt, Pt][] = [];
  let prevN: Pt | null = null;
  for (let i = 0; i < fine.length; i++) {
    const p = fine[i];
    let n = dirAt(i);
    if (prevN && n[0] * prevN[0] + n[1] * prevN[1] < 0) n = [-n[0], -n[1]];
    prevN = n;
    const hw = o.halfWidthAt(p);
    const fromEnd = Math.min(i, fine.length - 1 - i) * 0.05;
    // near the ends of a column the shape narrows: be strict there so stitches don't fan out
    const limit = Math.min(o.maxHalfWidth, fromEnd < hw * 1.5 ? hw * 1.05 + 0.1 : hw * 1.3 + 0.25);
    let dl = ray(p, n, limit), dr = ray(p, [-n[0], -n[1]], limit);
    if (dl + dr < 0.35) continue;
    // thin outlines are widened to the minimum width a satin sews cleanly at
    if (dl + dr < o.minWidth) { const extra = (o.minWidth - dl - dr) / 2; dl += extra; dr += extra; }
    dl += o.pullComp; dr += o.pullComp;
    chords.push([[p[0] + n[0] * dl, p[1] + n[1] * dl], [p[0] - n[0] * dr, p[1] - n[1] * dr]]);
  }
  if (!chords.length) return [];
  // 3. pick chords so the *outer* edge of a curve keeps the requested density; the inner edge
  //    gets closer stitches, which are shortened alternately (the "short stitch" technique)
  const half = Math.max(0.08, o.spacing / 2);
  const picked: [Pt, Pt][] = [chords[0]];
  for (const c of chords) {
    const last = picked[picked.length - 1];
    const adv = Math.max(Math.hypot(c[0][0] - last[0][0], c[0][1] - last[0][1]), Math.hypot(c[1][0] - last[1][0], c[1][1] - last[1][1]));
    if (adv >= half) picked.push(c);
  }
  const zig: Pt[] = [];
  picked.forEach((c, k) => {
    let [l, r] = c;
    if (k > 0 && k % 2 === 0) {
      const pc = picked[k - 1];
      const advL = Math.hypot(l[0] - pc[0][0], l[1] - pc[0][1]), advR = Math.hypot(r[0] - pc[1][0], r[1] - pc[1][1]);
      const mx = (l[0] + r[0]) / 2, my = (l[1] + r[1]) / 2;
      if (advL < half * 0.4) l = [l[0] + (mx - l[0]) * 0.35, l[1] + (my - l[1]) * 0.35];
      if (advR < half * 0.4) r = [r[0] + (mx - r[0]) * 0.35, r[1] + (my - r[1]) * 0.35];
    }
    const next = k % 2 === 0 ? l : r;
    // skip a stitch that would cross over empty fabric (e.g. across the gap inside a letter)
    const prev = zig[zig.length - 1];
    if (prev) {
      let outside = 0;
      for (let q = 1; q < 8; q++) {
        const t = q / 8;
        if (!inside(prev[0] + (next[0] - prev[0]) * t, prev[1] + (next[1] - prev[1]) * t)) outside++;
      }
      if (outside > 3) return;
    }
    zig.push(next);
  });
  if (!o.underlay) return zig;
  const under = runningStitches(resample(center, 0.5), 2.0, false);
  return [...under, ...zig.reverse()];
}

/** Extend the free ends of skeleton lines to the shape's edge so strokes are fully covered. */
export function extendFreeEnds(lines: Pt[][], inside: InsideFn, margin: number): Pt[][] {
  const key = (p: Pt) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  const count = new Map<string, number>();
  for (const l of lines) for (const p of [l[0], l[l.length - 1]]) count.set(key(p), (count.get(key(p)) ?? 0) + 1);
  const extend = (end: Pt, before: Pt): Pt | null => {
    let dx = end[0] - before[0], dy = end[1] - before[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    dx /= len; dy /= len;
    let d = 0;
    while (d < 10 && inside(end[0] + dx * (d + 0.05), end[1] + dy * (d + 0.05))) d += 0.05;
    d -= margin;
    return d > 0.05 ? [end[0] + dx * d, end[1] + dy * d] : null;
  };
  return lines.map((l) => {
    if (l.length < 2) return l;
    const out = l.slice();
    if (count.get(key(l[0])) === 1) {
      const e = extend(l[0], l[Math.min(3, l.length - 1)]);
      if (e) out.unshift(e);
    }
    if (count.get(key(l[l.length - 1])) === 1) {
      const e = extend(l[l.length - 1], l[Math.max(0, l.length - 4)]);
      if (e) out.push(e);
    }
    return out;
  });
}

/** Order runs nearest-neighbour from `from`, reversing a run when its end is closer. */
export function orderRuns(runs: Run[], from: Pt | null, reversible = true): Run[] {
  const left = runs.filter((r) => r.length > 0).slice();
  const out: Run[] = [];
  let cur = from;
  while (left.length) {
    let bi = 0, rev = false, bd = Infinity;
    left.forEach((r, i) => {
      const d0 = cur ? dist(cur, r[0]) : 0;
      if (d0 < bd) { bd = d0; bi = i; rev = false; }
      if (reversible && cur) {
        const d1 = dist(cur, r[r.length - 1]);
        if (d1 < bd) { bd = d1; bi = i; rev = true; }
      }
    });
    const r = left.splice(bi, 1)[0];
    const rr = rev ? r.slice().reverse() : r;
    out.push(rr);
    cur = rr[rr.length - 1];
  }
  return out;
}

/**
 * Walk a network of polylines (a skeleton) as continuous paths by depth-first
 * traversal, doubling back along branches instead of trimming. Returns one path
 * per connected piece of the network.
 */
export function walkNetwork(lines: Pt[][], from: Pt | null): Pt[][] {
  lines = lines.filter((l) => l.length >= 2);
  if (!lines.length) return [];
  const key = (p: Pt) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  const adj = new Map<string, { line: number; rev: boolean }[]>();
  const add = (k: string, e: { line: number; rev: boolean }) => { if (!adj.has(k)) adj.set(k, []); adj.get(k)!.push(e); };
  lines.forEach((l, i) => { add(key(l[0]), { line: i, rev: false }); add(key(l[l.length - 1]), { line: i, rev: true }); });
  const used = new Uint8Array(lines.length);
  const paths: Pt[][] = [];
  let cur = from;
  for (;;) {
    // pick the unused line end nearest to the current position (free ends preferred)
    let best: Pt | null = null, bd = Infinity;
    lines.forEach((l, i) => {
      if (used[i]) return;
      for (const p of [l[0], l[l.length - 1]]) {
        const deg = adj.get(key(p))?.length ?? 0;
        const d = (cur ? dist(p, cur) : 0) + (deg > 1 ? 0.5 : 0);
        if (d < bd) { bd = d; best = p; }
      }
    });
    if (!best) break;
    const out: Pt[] = [best];
    let lastForward = 1;
    const stack: { node: string; back: Pt[] | null }[] = [{ node: key(best), back: null }];
    // iterative DFS
    while (stack.length) {
      const top = stack[stack.length - 1];
      const e = (adj.get(top.node) ?? []).find((x) => !used[x.line]);
      if (!e) {
        stack.pop();
        if (top.back) out.push(...top.back);
        continue;
      }
      used[e.line] = 1;
      const pts = e.rev ? lines[e.line].slice().reverse() : lines[e.line];
      out.push(...pts.slice(1));
      lastForward = out.length;
      stack.push({ node: key(pts[pts.length - 1]), back: pts.slice(0, -1).reverse() });
    }
    const path = out.slice(0, lastForward);
    paths.push(path);
    cur = path[path.length - 1];
  }
  return paths;
}

export interface ColumnOptions {
  spacing: number;
  pullComp: number;
  maxWidth: number;   // widest stroke (mm), bounds the chord search
  step: number;
  underlay: boolean;
}

/**
 * Satin for strokes that meet at junctions (letters like A, E, K…): split the shape into
 * regions of one stroke direction and sew each as a satin column whose stitches cross the
 * stroke at that angle. This is what a hand digitizer does by drawing one column per stroke.
 */
export function satinColumns(inside: InsideFn, bbox: [number, number, number, number], o: ColumnOptions): Run[] {
  const g = 0.2;
  const gw = Math.ceil((bbox[2] - bbox[0]) / g) + 1, gh = Math.ceil((bbox[3] - bbox[1]) / g) + 1;
  const BINS = 12;
  const bin = new Int8Array(gw * gh).fill(-1);
  const limit = o.maxWidth * 1.5 + 1;
  const ray = (x: number, y: number, dx: number, dy: number) => {
    let d = 0;
    while (d < limit && inside(x + dx * (d + o.step * 2), y + dy * (d + o.step * 2))) d += o.step * 2;
    return d;
  };
  // 1. stitch direction per grid cell = direction of the shortest chord through it
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = bbox[0] + i * g, y = bbox[1] + j * g;
    if (!inside(x, y)) continue;
    let best = 0, bl = Infinity;
    for (let b = 0; b < BINS; b++) {
      const t = (b * Math.PI) / BINS, dx = Math.cos(t), dy = Math.sin(t);
      const l = ray(x, y, dx, dy) + ray(x, y, -dx, -dy);
      if (l < bl) { bl = l; best = b; }
    }
    bin[j * gw + i] = best;
  }
  // 2. majority smoothing (circular bins)
  for (let pass = 0; pass < 2; pass++) {
    const copy = bin.slice();
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      if (copy[k] < 0) continue;
      const votes = new Array(BINS).fill(0);
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue;
        const v = copy[jj * gw + ii];
        if (v >= 0) { votes[v] += 2; votes[(v + 1) % BINS] += 1; votes[(v + BINS - 1) % BINS] += 1; }
      }
      let bb = copy[k], bv = -1;
      votes.forEach((v, b) => { if (v > bv) { bv = v; bb = b; } });
      bin[k] = bb;
    }
  }
  // 3. regions: connected cells of one direction; tiny regions join their biggest neighbour
  const region = new Int32Array(gw * gh).fill(-1);
  const regions: { bin: number; cells: number[] }[] = [];
  for (let k = 0; k < gw * gh; k++) {
    if (bin[k] < 0 || region[k] >= 0) continue;
    const id = regions.length, cells: number[] = [k];
    region[k] = id;
    for (let q = 0; q < cells.length; q++) {
      const c = cells[q], ci = c % gw, cj = (c / gw) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = ci + di, jj = cj + dj;
        if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue;
        const n = jj * gw + ii;
        if (region[n] < 0 && bin[n] === bin[k]) { region[n] = id; cells.push(n); }
      }
    }
    regions.push({ bin: bin[k], cells });
  }
  const minCells = Math.max(12, (1.2 / g) ** 2);
  for (let pass = 0; pass < 3; pass++) {
    regions.forEach((r, id) => {
      if (!r.cells.length || r.cells.length >= minCells) return;
      const contact = new Map<number, number>();
      for (const c of r.cells) {
        const ci = c % gw, cj = (c / gw) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = ci + di, jj = cj + dj;
          if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue;
          const n = region[jj * gw + ii];
          if (n >= 0 && n !== id) contact.set(n, (contact.get(n) ?? 0) + 1);
        }
      }
      let target = -1, tv = 0;
      contact.forEach((v, n) => { if (v > tv) { tv = v; target = n; } });
      if (target < 0) return;
      for (const c of r.cells) region[c] = target;
      regions[target].cells.push(...r.cells);
      r.cells = [];
    });
  }
  // 4. one satin column per region: rows across the stroke, one stitch per row
  const runs: Run[] = [];
  regions.forEach((r, id) => {
    if (!r.cells.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of r.cells) {
      const x = bbox[0] + (c % gw) * g, y = bbox[1] + ((c / gw) | 0) * g;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const rb: [number, number, number, number] = [x0 - g, y0 - g, x1 + g, y1 + g];
    const inRegion: InsideFn = (x, y) => {
      if (!inside(x, y)) return false;
      const i = Math.round((x - bbox[0]) / g), j = Math.round((y - bbox[1]) / g);
      if (i < 0 || j < 0 || i >= gw || j >= gh) return false;
      return region[j * gw + i] === id;
    };
    const angle = (r.bin * 180) / BINS;
    if (o.underlay) {
      runs.push(...tatami(inRegion, rb, { angle, spacing: 1.0, length: 7, inset: 0.3, extend: 0, step: o.step, canExtend: inRegion }));
    }
    runs.push(...tatami(inRegion, rb, { angle, spacing: o.spacing / 2, length: 7, inset: 0, extend: o.pullComp, step: o.step, canExtend: inside }));
  });
  return runs;
}
