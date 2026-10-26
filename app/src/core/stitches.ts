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
  const path = resample(center, Math.max(0.1, o.spacing / 2));
  if (path.length < 2) return [];
  const edgeDist = (p: Pt, n: Pt) => {
    let d = 0;
    // never reach further than the local width allows: stops rays shooting along a stroke at ends and junctions
    const limit = Math.min(o.maxHalfWidth, o.halfWidthAt(p) * 1.3 + 0.25);
    while (d < limit && inside(p[0] + n[0] * (d + o.step), p[1] + n[1] * (d + o.step))) d += o.step;
    return d;
  };
  const zig: Pt[] = [];
  for (let i = 0; i < path.length; i++) {
    // tangent over a window that scales with the column width, so pixel noise in the centre-line doesn't fan the stitches
    const win = Math.max(3, Math.ceil((Math.max(0.6, o.halfWidthAt(path[i])) * 1.6) / Math.max(0.1, o.spacing / 2)));
    const a = path[Math.max(0, i - win)], b = path[Math.min(path.length - 1, i + win)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const n: Pt = [-ty, tx];
    const p = path[i];
    const dl = edgeDist(p, n) + o.pullComp, dr = edgeDist(p, [-n[0], -n[1]]) + o.pullComp;
    if (dl + dr < 0.35) continue;
    const left: Pt = [p[0] + n[0] * dl, p[1] + n[1] * dl];
    const right: Pt = [p[0] - n[0] * dr, p[1] - n[1] * dr];
    const next = i % 2 === 0 ? left : right;
    // skip a stitch that would cross over empty fabric (e.g. across the gap inside a letter)
    const prev = zig[zig.length - 1];
    if (prev) {
      let outside = 0;
      for (let k = 1; k < 8; k++) {
        const t = k / 8;
        if (!inside(prev[0] + (next[0] - prev[0]) * t, prev[1] + (next[1] - prev[1]) * t)) outside++;
      }
      if (outside > 2) continue;
    }
    zig.push(next);
  }
  if (!o.underlay) return zig;
  const under = runningStitches(path, 2.0, false);
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
