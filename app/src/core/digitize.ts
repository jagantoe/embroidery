// The auto-digitizer. Two stages:
//   analyze(): colour reduction, shapes, widths, auto stitch types (slow, cached)
//   plan():    stitch generation, sewing order, ties, trims, stats (fast, re-run on every edit)
import { deltaE2000, nearestPec, pecByIndex, rgbToLab, toHex } from './color';
import {
  components, componentMask, distanceTransform, quantize, thin, traceSkeleton,
  type Component, type Mask,
} from './raster';
import { extendFreeEnds, fillBreaks, orderRuns, runningStitches, satinAlong, smooth, tatami, walkNetwork, type Pt, type Run } from './stitches';
import type {
  DesignObject, DesignSettings, DigitizeResult, ObjectParams, PlanStats, RGB, StitchPlan, StitchPoint,
  StitchType, Thread, Warning,
} from './types';
import { HOOPS } from './types';

export interface RasterInput { rgba: Uint8ClampedArray; w: number; h: number; pxPerMm: number }

export interface Edits {
  params: Record<string, Partial<ObjectParams>>;
  hidden: Record<string, boolean>;
  colourOrder: string[];                 // thread ids, sewing order
  threads: Record<string, { pec?: number; skip?: boolean }>;
}

export const emptyEdits = (): Edits => ({ params: {}, hidden: {}, colourOrder: [], threads: {} });

export interface Analysis {
  w: number; h: number; ppm: number;
  palette: RGB[];
  index: Int16Array;
  comps: Component[];
  masks: Mask[];
  dts: Float32Array[];
  objects: DesignObject[];
  autoAngle: number[];
  skeletons: Map<number, Pt[][]>;
  removedBackground: boolean;
}

const RUNNING_MAX_W = 1.0;
const SATIN_MAX_W = 7.0;

export function fabricDefaults(settings: DesignSettings) {
  const base = {
    woven: { fill: 0.4, satin: 0.4, pull: 0.2, len: 3.5 },
    knit: { fill: 0.45, satin: 0.45, pull: 0.3, len: 3.5 },
    towel: { fill: 0.38, satin: 0.38, pull: 0.3, len: 3.0 },
    cap: { fill: 0.4, satin: 0.4, pull: 0.25, len: 3.5 },
  }[settings.fabric];
  return { ...base, fill: base.fill + (settings.mode === 'onFabric' ? 0.05 : 0) };
}

export function defaultParams(type: StitchType, angle: number, settings: DesignSettings): ObjectParams {
  const d = fabricDefaults(settings);
  return {
    type,
    angle,
    spacing: type === 'satin' ? d.satin : d.fill,
    length: type === 'running' ? 2.5 : d.len,
    pullComp: type === 'running' ? 0 : d.pull,
    underlay: type !== 'running',
    triple: false,
  };
}

/** Pick a resolution that keeps the work raster around 2.5 megapixels at most. */
export function chooseResolution(widthMm: number, heightMm: number) {
  return Math.max(4, Math.min(10, Math.sqrt(2.5e6 / Math.max(1, widthMm * heightMm))));
}

export function analyze(input: RasterInput, settings: DesignSettings): Analysis {
  const { rgba, w, h, pxPerMm: ppm } = input;
  const q = quantize(rgba, w, h, settings.maxColours, Math.round(0.15 * ppm * ppm));

  // A solid border colour (e.g. the white page behind a PNG logo) is background, not design.
  let removedBackground = false;
  const borderCount = new Map<number, number>();
  let borderTotal = 0, borderOpaque = 0;
  const visitBorder = (i: number) => { borderTotal++; const c = q.index[i]; if (c >= 0) { borderOpaque++; borderCount.set(c, (borderCount.get(c) ?? 0) + 1); } };
  for (let x = 0; x < w; x++) { visitBorder(x); visitBorder((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { visitBorder(y * w); visitBorder(y * w + w - 1); }
  let bgColour = -1;
  borderCount.forEach((n, c) => { if (borderOpaque > borderTotal * 0.6 && n > borderOpaque * 0.85) bgColour = c; });

  let comps = components(q.index, w, h, Math.max(4, Math.round(0.3 * ppm * ppm)));
  if (bgColour >= 0) {
    const before = comps.length;
    comps = comps.filter((c) => {
      if (c.colour !== bgColour) return true;
      return !(c.bbox[0] === 0 || c.bbox[1] === 0 || c.bbox[2] === w - 1 || c.bbox[3] === h - 1);
    });
    removedBackground = comps.length < before;
  }

  // drop slivers: very thin bits smaller than 1.5 mm² (usually edge noise between two colours)
  comps = comps.filter((c) => {
    const area = c.pixels.length / (ppm * ppm);
    if (area >= 1.5) return true;
    const m = componentMask(c, w);
    const dt = distanceTransform(m);
    let maxDt = 0;
    for (let k = 0; k < dt.length; k++) if (dt[k] > maxDt) maxDt = dt[k];
    return (2 * maxDt) / ppm >= RUNNING_MAX_W;
  });

  const masks: Mask[] = [];
  const dts: Float32Array[] = [];
  const objects: DesignObject[] = [];
  const autoAngle: number[] = [];
  const kindCount = new Map<string, number>();
  comps.forEach((c, i) => {
    const m = componentMask(c, w);
    masks.push(m);
    const dt = distanceTransform(m);
    dts.push(dt);
    let maxDt = 0;
    for (let k = 0; k < dt.length; k++) if (dt[k] > maxDt) maxDt = dt[k];
    const maxWidthMm = (2 * maxDt) / ppm;
    let auto: StitchType = maxWidthMm < RUNNING_MAX_W ? 'running' : maxWidthMm <= SATIN_MAX_W ? 'satin' : 'fill';
    if (auto === 'satin') {
      // satin only suits stroke-like shapes of fairly even width: compare the mean
      // width (area / centre-line length) with the widest point
      const sk = thin(m);
      let skPx = 0;
      for (let k = 0; k < sk.length; k++) skPx += sk[k];
      const meanW = c.pixels.length / Math.max(1, skPx) / ppm;
      if (meanW < 0.5 * maxWidthMm && maxWidthMm >= 2.5) auto = 'fill';
    }
    const bbox: [number, number, number, number] = [c.bbox[0] / ppm, c.bbox[1] / ppm, (c.bbox[2] + 1) / ppm, (c.bbox[3] + 1) / ppm];
    const inside = insideFn(m, ppm);
    let angle = 45;
    if (auto === 'fill') {
      let best = Infinity;
      for (const a of [45, 135, 0, 90, 30, 60, 120, 150]) {
        const b = fillBreaks(inside, bbox, a, 1 / ppm);
        if (b < best) { best = b; angle = a; }
      }
    }
    autoAngle.push(angle);
    const colourName = nearestPec(q.palette[c.colour]).thread.name;
    const kind = auto === 'fill' ? 'area' : auto === 'satin' ? 'column' : 'line';
    const kk = `${colourName} ${kind}`;
    kindCount.set(kk, (kindCount.get(kk) ?? 0) + 1);
    objects.push({
      id: `o${i}`,
      name: `${kk} ${kindCount.get(kk)}`,
      threadId: `t${c.colour}`,
      pixelCount: c.pixels.length,
      areaMm2: c.pixels.length / (ppm * ppm),
      maxWidthMm,
      bbox,
      auto,
      params: defaultParams(auto, angle, settings),
    });
  });
  return { w, h, ppm, palette: q.palette, index: q.index, comps, masks, dts, objects, autoAngle, skeletons: new Map(), removedBackground };
}

function insideFn(m: Mask, ppm: number) {
  return (x: number, y: number) => {
    const px = Math.floor(x * ppm) - m.ox, py = Math.floor(y * ppm) - m.oy;
    if (px < 0 || py < 0 || px >= m.w || py >= m.h) return false;
    return m.data[py * m.w + px] === 1;
  };
}

function halfWidthFn(a: Analysis, i: number) {
  const m = a.masks[i], dt = a.dts[i];
  return (p: Pt) => {
    const px = Math.floor(p[0] * a.ppm) - m.ox, py = Math.floor(p[1] * a.ppm) - m.oy;
    if (px < 0 || py < 0 || px >= m.w || py >= m.h) return 0;
    // look in a 3x3 neighbourhood: the smoothed centre-line may sit next to the ridge
    let best = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = px + dx, y = py + dy;
      if (x >= 0 && y >= 0 && x < m.w && y < m.h) best = Math.max(best, dt[y * m.w + x]);
    }
    return best / a.ppm;
  };
}

function skeletonOf(a: Analysis, i: number): Pt[][] {
  const cached = a.skeletons.get(i);
  if (cached) return cached;
  const m = a.masks[i];
  const sk = thin(m);
  const prune = Math.max(3, a.objects[i].maxWidthMm * a.ppm * 0.9);
  const raw = traceSkeleton(sk, m.w, m.h, prune).map((l) =>
    smooth(l.map(([x, y]) => [(m.ox + x + 0.5) / a.ppm, (m.oy + y + 0.5) / a.ppm] as Pt), Math.max(2, Math.round(a.ppm * 0.4))));
  const lines = extendFreeEnds(raw, insideFn(m, a.ppm), 0.15);
  a.skeletons.set(i, lines);
  return lines;
}

export function buildThreads(a: Analysis, settings: DesignSettings, edits: Edits): Thread[] {
  const fabricLab = rgbToLab([255, 255, 255]);
  return a.palette.map((rgb, i) => {
    const id = `t${i}`;
    const e = edits.threads[id] ?? {};
    const near = nearestPec(rgb);
    const pec = e.pec ?? near.thread.index;
    const autoSkip = settings.mode === 'onFabric' && deltaE2000(rgbToLab(rgb), fabricLab) < 10;
    return {
      id, rgb, pec,
      name: `${pecByIndex(pec).name} (#${pec})`,
      skip: e.skip ?? autoSkip,
    };
  });
}

/** Default sewing order: colours that are mostly fills first (largest first), outlines and details last. */
export function defaultColourOrder(a: Analysis): string[] {
  const stats = a.palette.map((_, i) => ({ id: `t${i}`, fill: 0, total: 0 }));
  a.objects.forEach((o) => {
    const s = stats[Number(o.threadId.slice(1))];
    s.total += o.areaMm2;
    if (o.auto === 'fill') s.fill += o.areaMm2;
  });
  return stats
    .filter((s) => s.total > 0)
    .sort((x, y) => {
      const fx = x.fill / x.total >= 0.5 ? 1 : 0, fy = y.fill / y.total >= 0.5 ? 1 : 0;
      if (fx !== fy) return fy - fx;
      return y.total - x.total;
    })
    .map((s) => s.id);
}

const d2 = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function plan(a: Analysis, settings: DesignSettings, edits: Edits): DigitizeResult {
  const ppm = a.ppm;
  const step = 0.5 / ppm;
  const threads = buildThreads(a, settings, edits);
  const order0 = defaultColourOrder(a);
  const order = [...edits.colourOrder.filter((id) => order0.includes(id)), ...order0.filter((id) => !edits.colourOrder.includes(id))];
  const anyOpaque = (x: number, y: number) => {
    const px = Math.floor(x * ppm), py = Math.floor(y * ppm);
    return px >= 0 && py >= 0 && px < a.w && py < a.h && a.index[py * a.w + px] >= 0;
  };

  const objects = a.objects.map((o, i) => ({ ...o, params: { ...defaultParams(o.auto, a.autoAngle[i], settings), ...(edits.params[o.id] ?? {}) }, hidden: !!edits.hidden[o.id] }));

  const out: StitchPoint[] = [];
  const ranges: Record<string, [number, number]> = {};
  const sewnThreads: Thread[] = [];
  let pos: Pt | null = null;
  let trims = 0, jumpsMm = 0;
  const maxTravel = 15;

  const stitchTo = (p: Pt) => { out.push({ x: p[0], y: p[1], cmd: 'stitch' }); pos = p; };
  const tieAt = (p: Pt, toward: Pt | null) => {
    if (!toward) return;
    const d = d2(p, toward);
    if (d < 0.05) return;
    const ux = (toward[0] - p[0]) / d, uy = (toward[1] - p[1]) / d;
    const q: Pt = [p[0] + ux * 0.5, p[1] + uy * 0.5];
    stitchTo(q); stitchTo(p); stitchTo(q); stitchTo(p);
  };
  const lastDir = (): Pt | null => {
    for (let i = out.length - 2; i >= 0; i--) {
      if (out[i].cmd !== 'stitch') return null;
      const p: Pt = [out[i].x, out[i].y];
      if (pos && d2(p, pos) > 0.3) return p;
    }
    return null;
  };
  const trimAndJump = (to: Pt, next: Pt | null) => {
    if (pos) {
      tieAt(pos, lastDir());
      out.push({ x: pos[0], y: pos[1], cmd: 'trim' });
      trims++;
      jumpsMm += d2(pos, to);
    }
    out.push({ x: to[0], y: to[1], cmd: 'jump' });
    pos = to;
    stitchTo(to);
    tieAt(to, next);
  };
  // Travel stitches may cross pixels of the current colour or of colours sewn later
  // (they end up hidden underneath), but never bare fabric or colours already sewn.
  const labelRank = new Int16Array(a.objects.length + 1).fill(-1);
  objects.forEach((o, i) => {
    const t = threads.find((x) => x.id === o.threadId);
    labelRank[i + 1] = o.hidden || !t || t.skip ? -1 : order.indexOf(o.threadId);
  });
  const labelsRaster = new Int32Array(a.w * a.h);
  a.comps.forEach((c, i) => { for (const px of c.pixels) labelsRaster[px] = i + 1; });
  let currentRank = 0;
  const travelOk = (from: Pt, to: Pt) => {
    const d = d2(from, to);
    if (d > maxTravel) return false;
    for (let t = 0.1; t < d; t += 0.2) {
      const x = from[0] + ((to[0] - from[0]) * t) / d, y = from[1] + ((to[1] - from[1]) * t) / d;
      const px = Math.floor(x * ppm), py = Math.floor(y * ppm);
      if (px < 0 || py < 0 || px >= a.w || py >= a.h) return false;
      if (labelRank[labelsRaster[py * a.w + px]] < currentRank) return false;
    }
    return true;
  };
  const allowedPx = (px: number, py: number) =>
    px >= 0 && py >= 0 && px < a.w && py < a.h && labelRank[labelsRaster[py * a.w + px]] >= currentRank;
  /** Shortest path over allowed pixels (BFS in a window around both points). */
  const route = (from: Pt, to: Pt): Pt[] | null => {
    const margin = 4 * ppm;
    const x0 = Math.max(0, Math.floor(Math.min(from[0], to[0]) * ppm - margin)), y0 = Math.max(0, Math.floor(Math.min(from[1], to[1]) * ppm - margin));
    const x1 = Math.min(a.w - 1, Math.ceil(Math.max(from[0], to[0]) * ppm + margin)), y1 = Math.min(a.h - 1, Math.ceil(Math.max(from[1], to[1]) * ppm + margin));
    const W = x1 - x0 + 1, H = y1 - y0 + 1;
    if (W * H > 400000) return null;
    const sx = Math.floor(from[0] * ppm) - x0, sy = Math.floor(from[1] * ppm) - y0;
    const tx = Math.floor(to[0] * ppm) - x0, ty = Math.floor(to[1] * ppm) - y0;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H || tx < 0 || ty < 0 || tx >= W || ty >= H) return null;
    const prev = new Int32Array(W * H).fill(-1);
    const q = new Int32Array(W * H);
    let qh = 0, qt = 0;
    const start = sy * W + sx, goal = ty * W + tx;
    prev[start] = start; q[qt++] = start;
    while (qh < qt) {
      const c = q[qh++];
      if (c === goal) break;
      const cx = c % W, cy = (c / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (prev[n] !== -1 || !allowedPx(nx + x0, ny + y0)) continue;
        prev[n] = c; q[qt++] = n;
      }
    }
    if (prev[goal] === -1) return null;
    const pts: Pt[] = [];
    for (let c = goal; ; c = prev[c]) {
      pts.push([((c % W) + x0 + 0.5) / ppm, (((c / W) | 0) + y0 + 0.5) / ppm]);
      if (c === start) break;
    }
    pts.reverse();
    const simple = simplify(pts, 0.25);
    simple[0] = from; simple[simple.length - 1] = to;
    let len = 0;
    for (let i = 1; i < simple.length; i++) len += d2(simple[i - 1], simple[i]);
    return len <= maxTravel * 1.5 ? simple : null;
  };
  const connect = (to: Pt, next: Pt | null, _inside: ((x: number, y: number) => boolean) | null) => {
    if (!pos) { trimAndJump(to, next); return; }
    const d = d2(pos, to);
    if (d < 0.05) return;
    let path: Pt[] | null = null;
    if (d <= 1.0 || travelOk(pos, to)) path = [pos, to];
    else if (d <= maxTravel) path = route(pos, to);
    if (path) {
      for (let k = 1; k < path.length; k++) {
        const from: Pt = path[k - 1], dest = path[k];
        const n = Math.max(1, Math.ceil(d2(from, dest) / 2.5));
        for (let i = 1; i <= n; i++) stitchTo([from[0] + ((dest[0] - from[0]) * i) / n, from[1] + ((dest[1] - from[1]) * i) / n]);
      }
      return;
    }
    trimAndJump(to, next);
  };
  const sewRuns = (runs: Run[], inside: ((x: number, y: number) => boolean) | null) => {
    for (const r of runs) {
      if (!r.length) continue;
      connect(r[0], r[1] ?? null, inside);
      for (let i = 1; i < r.length; i++) {
        const p = r[i];
        if (pos && d2(pos, p) < 0.25 && i < r.length - 1) continue; // drop tiny stitches
        stitchTo(p);
      }
    }
  };

  let first = true;
  for (const tid of order) {
    const thread = threads.find((t) => t.id === tid)!;
    if (thread.skip) continue;
    currentRank = order.indexOf(tid);
    const objs = objects.map((o, i) => ({ o, i })).filter(({ o }) => o.threadId === tid && !o.hidden);
    if (!objs.length) continue;
    if (!first) {
      if (pos) { tieAt(pos, lastDir()); out.push({ x: pos[0], y: pos[1], cmd: 'trim' }); trims++; }
      out.push({ x: pos ? pos[0] : 0, y: pos ? pos[1] : 0, cmd: 'colour' });
      pos = null;
    }
    first = false;
    sewnThreads.push(thread);
    // objects nearest-neighbour from the current position
    const remaining = objs.slice();
    let cursor: Pt | null = null;
    while (remaining.length) {
      let bi = 0, bd = Infinity;
      remaining.forEach(({ o }, k) => {
        const c: Pt = [(o.bbox[0] + o.bbox[2]) / 2, (o.bbox[1] + o.bbox[3]) / 2];
        const d = cursor ? d2(cursor, c) : -c[1] * 1e-6; // first: top-most
        if (d < bd) { bd = d; bi = k; }
      });
      const { o, i } = remaining.splice(bi, 1)[0];
      const start = out.length;
      const runs = generate(a, i, o.params, pos ?? cursor, anyOpaque, step);
      const inside = o.params.type === 'running' ? null : insideFn(a.masks[i], ppm);
      sewRuns(runs, inside);
      ranges[o.id] = [start, out.length];
      cursor = pos;
    }
  }
  if (pos) { tieAt(pos, lastDir()); out.push({ x: pos[0], y: pos[1], cmd: 'trim' }); }
  out.push({ x: pos ? pos[0] : 0, y: pos ? pos[1] : 0, cmd: 'end' });

  const planOut: StitchPlan = { stitches: out, threads: sewnThreads };
  const stats = computeStats(planOut, trims, jumpsMm);
  const labels = labelsRaster;
  const warnings = buildWarnings(a, settings, objects, threads, planOut, stats);
  return {
    objects,
    threads,
    order: order.filter((id) => threads.find((t) => t.id === id)),
    plan: planOut,
    ranges,
    warnings,
    stats,
    labels,
    rasterW: a.w,
    rasterH: a.h,
    pxPerMm: ppm,
  };
}

/** Douglas–Peucker polyline simplification. */
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const [ax, ay] = pts[i], [bx, by] = pts[j];
    const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let best = -1, bd = tol;
    for (let k = i + 1; k < j; k++) {
      const dd = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / L;
      if (dd > bd) { bd = dd; best = k; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

function generate(a: Analysis, i: number, p: ObjectParams, from: Pt | null, anyOpaque: (x: number, y: number) => boolean, step: number): Run[] {
  const o = a.objects[i];
  const inside = insideFn(a.masks[i], a.ppm);
  if (p.type === 'fill') {
    const runs: Run[] = [];
    if (p.underlay) {
      runs.push(...orderRuns(tatami(inside, o.bbox, {
        angle: p.angle + 90, spacing: 2.0, length: 4, inset: 0.6, extend: 0, step, canExtend: inside,
      }), from));
    }
    const top = tatami(inside, o.bbox, { angle: p.angle, spacing: p.spacing, length: p.length, inset: 0, extend: p.pullComp, step, canExtend: anyOpaque });
    runs.push(...orderRuns(top, runs.length ? runs[runs.length - 1].slice(-1)[0] : from));
    return runs;
  }
  const lines = skeletonOf(a, i);
  if (p.type === 'satin') {
    const runs = lines.filter((l) => l.length >= 2).map((l) => satinAlong(l, inside, {
      halfWidthAt: halfWidthFn(a, i),
      spacing: p.spacing, pullComp: p.pullComp, maxHalfWidth: 8, step: 0.5 / a.ppm, underlay: p.underlay,
    }));
    return orderRuns(runs, from);
  }
  // running: walk the skeleton network continuously
  return walkNetwork(lines, from).map((path) => runningStitches(path, p.length, p.triple));
}

export function computeStats(plan: StitchPlan, trims: number, jumpsMm: number): PlanStats {
  let stitches = 0, colourChanges = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of plan.stitches) {
    if (s.cmd === 'stitch') {
      stitches++;
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    if (s.cmd === 'colour') colourChanges++;
  }
  const base = stitches / 650 + colourChanges * 1.0 + trims * 0.1;
  return {
    stitches, colourChanges, trims, jumpsMm,
    widthMm: isFinite(minX) ? maxX - minX : 0,
    heightMm: isFinite(minY) ? maxY - minY : 0,
    minutes: [Math.max(1, Math.round(base * 0.9)), Math.max(1, Math.round(base * 1.25))],
  };
}

function buildWarnings(a: Analysis, settings: DesignSettings, objects: (DesignObject & { hidden: boolean })[], threads: Thread[], plan: StitchPlan, stats: PlanStats): Warning[] {
  const w: Warning[] = [];
  const thin = objects.filter((o) => o.auto === 'running' && o.params.type === 'running' && !o.hidden);
  if (thin.length) {
    w.push({ id: 'thin', level: 'info', text: `${thin.length} detail${thin.length > 1 ? 's are' : ' is'} thinner than 1 mm, so ${thin.length > 1 ? 'they are' : 'it is'} sewn as running stitch. Make the design bigger to get satin.`, objectId: thin[0].id });
  }
  for (const t of threads) {
    if (t.skip) continue;
    const de = deltaE2000(rgbToLab(t.rgb), rgbToLab(pecByIndex(t.pec).rgb));
    if (de >= 14) w.push({ id: `thread-${t.id}`, level: 'warn', text: `${t.name} is quite different from your colour ${toHex(t.rgb)}. Pick another thread if you have a closer one.` });
    else if (de >= 6) w.push({ id: `thread-${t.id}`, level: 'info', text: `${t.name} is a little different from your colour ${toHex(t.rgb)}.` });
  }
  const hoop = HOOPS.find((h) => h.id === settings.hoopId) ?? HOOPS[0];
  if (stats.widthMm > hoop.w - 4 || stats.heightMm > hoop.h - 4) {
    w.push({ id: 'hoop', level: 'warn', text: `The design (${stats.widthMm.toFixed(0)} × ${stats.heightMm.toFixed(0)} mm) is too big for the ${hoop.label} hoop; keep at least 2 mm clear of the edge.` });
  }
  for (const o of objects) {
    if (o.params.type === 'satin' && o.maxWidthMm > SATIN_MAX_W && !o.hidden) {
      w.push({ id: `wide-${o.id}`, level: 'warn', text: `${o.name} is ${o.maxWidthMm.toFixed(1)} mm wide; satin stitches that long can snag. Fill is safer.`, objectId: o.id });
    }
  }
  // density: needle points per mm² on a 1 mm grid
  const cells = new Map<number, number>();
  for (const s of plan.stitches) if (s.cmd === 'stitch') {
    const k = Math.floor(s.x) * 100000 + Math.floor(s.y);
    cells.set(k, (cells.get(k) ?? 0) + 1);
  }
  let dense = 0;
  cells.forEach((n) => { if (n > 30) dense++; });
  if (dense > 3) w.push({ id: 'dense', level: 'warn', text: `${dense} spots have more than 30 stitches per mm². That can make the fabric stiff or break needles. Try a lighter density.` });
  if (a.removedBackground) w.push({ id: 'bg', level: 'info', text: 'The plain background around your picture is not stitched.' });
  return w;
}
