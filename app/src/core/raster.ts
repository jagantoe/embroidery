// Raster helpers: colour quantisation, connected components, distance
// transform, thinning and skeleton tracing. Everything works on plain typed
// arrays so it runs in a Web Worker and in Node tests.
import { rgbToLab } from './color';
import type { RGB } from './types';

export interface Quantized {
  palette: RGB[];
  /** palette index per pixel, -1 = transparent */
  index: Int16Array;
  counts: number[];
}

const dist2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * Reduce an RGBA image to at most `maxColours` flat colours (k-means in Lab on
 * a 15-bit colour histogram), then remove anti-aliasing specks.
 */
export function quantize(rgba: Uint8ClampedArray, w: number, h: number, maxColours: number, minSpeckPx: number): Quantized {
  const n = w * h;
  const bucketCount = new Uint32Array(32768);
  const bucketSum = new Float64Array(32768 * 3);
  const keyOf = new Int32Array(n);
  let opaque = 0;
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3];
    if (a < 128) { keyOf[i] = -1; continue; }
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    keyOf[i] = k;
    bucketCount[k]++;
    bucketSum[k * 3] += r; bucketSum[k * 3 + 1] += g; bucketSum[k * 3 + 2] += b;
    opaque++;
  }
  const buckets: { k: number; c: number; rgb: RGB; lab: number[] }[] = [];
  for (let k = 0; k < 32768; k++) {
    const c = bucketCount[k];
    if (!c) continue;
    const rgb: RGB = [bucketSum[k * 3] / c, bucketSum[k * 3 + 1] / c, bucketSum[k * 3 + 2] / c];
    buckets.push({ k, c, rgb, lab: rgbToLab(rgb) });
  }
  buckets.sort((a, b) => b.c - a.c);

  // seed: frequent colours that differ clearly from the ones already chosen
  const seeds: number[][] = [];
  const minCount = Math.max(1, opaque * 0.002);
  // a colour lying between two stronger colours is anti-aliasing (edge blending), not a real colour
  const isBlend = (lab: number[], count: number) => {
    if (count > opaque * 0.03 || seeds.length < 2) return false;
    for (let i = 0; i < seeds.length; i++) for (let j = i + 1; j < seeds.length; j++) {
      const a = seeds[i], b = seeds[j];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [lab[0] - a[0], lab[1] - a[1], lab[2] - a[2]];
      const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
      const t = (ab[0] * ac[0] + ab[1] * ac[1] + ab[2] * ac[2]) / L2;
      if (t <= 0.05 || t >= 0.95) continue;
      if (Math.hypot(ac[0] - t * ab[0], ac[1] - t * ab[1], ac[2] - t * ab[2]) < 8) return true;
    }
    return false;
  };
  for (const b of buckets) {
    if (seeds.length >= maxColours) break;
    if (b.c < minCount) break;
    if (seeds.every((s) => dist2(s, b.lab) > 14 * 14) && !isBlend(b.lab, b.c)) seeds.push(b.lab.slice());
  }
  if (!seeds.length && buckets.length) seeds.push(buckets[0].lab.slice());

  // k-means on buckets
  const assign = new Int16Array(32768).fill(-1);
  for (let iter = 0; iter < 8; iter++) {
    const sums = seeds.map(() => [0, 0, 0, 0]);
    for (const b of buckets) {
      let best = 0, bd = Infinity;
      for (let s = 0; s < seeds.length; s++) {
        const d = dist2(seeds[s], b.lab);
        if (d < bd) { bd = d; best = s; }
      }
      assign[b.k] = best;
      const sm = sums[best];
      sm[0] += b.lab[0] * b.c; sm[1] += b.lab[1] * b.c; sm[2] += b.lab[2] * b.c; sm[3] += b.c;
    }
    sums.forEach((sm, s) => { if (sm[3]) seeds[s] = [sm[0] / sm[3], sm[1] / sm[3], sm[2] / sm[3]]; });
  }
  // palette colour = most frequent bucket of each cluster (keeps pure source colours like #a70800)
  const palette: RGB[] = seeds.map(() => [0, 0, 0]);
  const bestCount = seeds.map(() => 0);
  for (const b of buckets) {
    const s = assign[b.k];
    if (b.c > bestCount[s]) { bestCount[s] = b.c; palette[s] = b.rgb.map(Math.round) as RGB; }
  }

  const index = new Int16Array(n);
  for (let i = 0; i < n; i++) index[i] = keyOf[i] < 0 ? -1 : assign[keyOf[i]];

  despeckle(index, w, h, minSpeckPx);

  // drop empty clusters and renumber
  const counts = new Array(palette.length).fill(0);
  for (let i = 0; i < n; i++) if (index[i] >= 0) counts[index[i]]++;
  const remap = new Int16Array(palette.length).fill(-1);
  const outPal: RGB[] = [], outCounts: number[] = [];
  counts.forEach((c, i) => { if (c > 0) { remap[i] = outPal.length; outPal.push(palette[i]); outCounts.push(c); } });
  for (let i = 0; i < n; i++) if (index[i] >= 0) index[i] = remap[index[i]];
  return { palette: outPal, index, counts: outCounts };
}

/** Reassign tiny connected specks to their most common neighbour colour. */
function despeckle(index: Int16Array, w: number, h: number, minPx: number) {
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || index[start] < 0) continue;
    const col = index[start];
    let qh = 0, qt = 0;
    queue[qt++] = start; seen[start] = 1;
    while (qh < qt) {
      const p = queue[qh++];
      const x = p % w, y = (p / w) | 0;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }
    function push(q: number) { if (!seen[q] && index[q] === col) { seen[q] = 1; queue[qt++] = q; } }
    if (qt >= minPx) continue;
    const votes = new Map<number, number>();
    for (let i = 0; i < qt; i++) {
      const p = queue[i], x = p % w, y = (p / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const c = index[ny * w + nx];
        if (c !== col) votes.set(c, (votes.get(c) ?? 0) + 1);
      }
    }
    let best = -1, bv = -1;
    votes.forEach((v, c) => { if (v > bv) { bv = v; best = c; } });
    if (best === -2) continue;
    for (let i = 0; i < qt; i++) index[queue[i]] = best;
  }
}

export interface Component {
  colour: number;
  pixels: Int32Array;
  /** layered fills: the pixels that really are this colour (the rest runs under later colours) */
  own?: Int32Array;
  bbox: [number, number, number, number]; // x0,y0,x1,y1 inclusive (px)
}

/** 4-connected components per colour. */
export function components(index: Int16Array, w: number, h: number, minPx: number): Component[] {
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const out: Component[] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || index[start] < 0) continue;
    const col = index[start];
    let qh = 0, qt = 0;
    queue[qt++] = start; seen[start] = 1;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (qh < qt) {
      const p = queue[qh++];
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && !seen[p - 1] && index[p - 1] === col) { seen[p - 1] = 1; queue[qt++] = p - 1; }
      if (x < w - 1 && !seen[p + 1] && index[p + 1] === col) { seen[p + 1] = 1; queue[qt++] = p + 1; }
      if (y > 0 && !seen[p - w] && index[p - w] === col) { seen[p - w] = 1; queue[qt++] = p - w; }
      if (y < h - 1 && !seen[p + w] && index[p + w] === col) { seen[p + w] = 1; queue[qt++] = p + w; }
    }
    if (qt < minPx) continue;
    out.push({ colour: col, pixels: queue.slice(0, qt), bbox: [x0, y0, x1, y1] });
  }
  return out;
}

/** A binary mask cropped to a component's bounding box with a 1px margin. */
export interface Mask { data: Uint8Array; w: number; h: number; ox: number; oy: number }

export function componentMask(c: Component, imgW: number): Mask {
  const ox = c.bbox[0] - 1, oy = c.bbox[1] - 1;
  const w = c.bbox[2] - c.bbox[0] + 3, h = c.bbox[3] - c.bbox[1] + 3;
  const data = new Uint8Array(w * h);
  for (const p of c.pixels) {
    const x = (p % imgW) - ox, y = ((p / imgW) | 0) - oy;
    data[y * w + x] = 1;
  }
  return { data, w, h, ox, oy };
}

/** Exact Euclidean distance transform (Felzenszwalb) — distance in px to the nearest 0 pixel. */
export function distanceTransform(m: Mask): Float32Array {
  const { w, h, data } = m;
  const INF = 1e20;
  const f = new Float64Array(Math.max(w, h));
  const d = new Float64Array(Math.max(w, h));
  const v = new Int32Array(Math.max(w, h));
  const z = new Float64Array(Math.max(w, h) + 1);
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = data[i] ? INF : 0;
  const edt1 = (n: number) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1(h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1(w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(grid[i]);
  return out;
}

/** Zhang–Suen thinning. Returns a new mask holding the 1px skeleton. */
export function thin(m: Mask): Uint8Array {
  const { w, h } = m;
  const img = m.data.slice();
  let changed = true;
  const del: number[] = [];
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const p = y * w + x;
          if (!img[p]) continue;
          const p2 = img[p - w], p3 = img[p - w + 1], p4 = img[p + 1], p5 = img[p + w + 1];
          const p6 = img[p + w], p7 = img[p + w - 1], p8 = img[p - 1], p9 = img[p - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let A = 0;
          for (let i = 0; i < 8; i++) if (!seq[i] && seq[i + 1]) A++;
          if (A !== 1) continue;
          if (step === 0) { if (p2 * p4 * p6 || p4 * p6 * p8) continue; }
          else { if (p2 * p4 * p8 || p2 * p6 * p8) continue; }
          del.push(p);
        }
      }
      for (const p of del) img[p] = 0;
      if (del.length) changed = true;
    }
  }
  return img;
}

const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/** Crossing number: number of separate skeleton branches around a pixel. */
function crossing(sk: Uint8Array, w: number, x: number, y: number) {
  let c = 0;
  for (let i = 0; i < 8; i++) {
    const [ax, ay] = N8[i], [bx, by] = N8[(i + 1) % 8];
    const a = sk[(y + ay) * w + x + ax], b = sk[(y + by) * w + x + bx];
    if (!a && b) c++;
  }
  // a pixel with neighbours but no 0→1 transition is fully surrounded: treat as interior
  return c;
}

/**
 * Trace a skeleton into polylines (pixel coordinates within the mask).
 * Short spurs ending in a free end are pruned.
 */
export function traceSkeleton(sk: Uint8Array, w: number, h: number, pruneLen: number): [number, number][][] {
  const isNode = new Uint8Array(w * h);
  const pts: number[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    if (!sk[p]) continue;
    pts.push(p);
    const cn = crossing(sk, w, x, y);
    if (cn !== 2) isNode[p] = 1;
  }
  const visited = new Uint8Array(w * h);
  const pairSeen = new Set<number>();
  const lines: [number, number][][] = [];
  const neighbours = (p: number) => {
    const x = p % w, y = (p / w) | 0, out: number[] = [];
    // 4-neighbours first so staircases are walked pixel by pixel
    for (const i of [0, 2, 4, 6, 1, 3, 5, 7]) {
      const q = (y + N8[i][1]) * w + x + N8[i][0];
      if (sk[q]) out.push(q);
    }
    return out;
  };
  const walk = (from: number, first: number, stopAt?: number) => {
    const path = [from, first];
    if (!isNode[first]) visited[first] = 1;
    let prev = from, cur = first;
    while (!isNode[cur]) {
      const nb = neighbours(cur).filter((q) => q !== prev && !(path.length > 2 && q === path[path.length - 3]));
      let next = nb.find((q) => isNode[q] && q !== from) ?? nb.find((q) => !isNode[q] && !visited[q]);
      if (next === undefined && stopAt !== undefined && nb.includes(stopAt)) next = stopAt;
      if (next === undefined && nb.some((q) => q === from) && path.length > 3) next = from;
      if (next === undefined) break;
      path.push(next);
      if (next === stopAt || next === from) break;
      if (!isNode[next]) visited[next] = 1;
      prev = cur; cur = next;
    }
    return path;
  };
  for (const p of pts) {
    if (!isNode[p]) continue;
    for (const q of neighbours(p)) {
      if (isNode[q]) {
        const key = Math.min(p, q) * (w * h) + Math.max(p, q);
        if (pairSeen.has(key)) continue;
        pairSeen.add(key);
        lines.push([p, q].map((v) => [v % w, (v / w) | 0]) as [number, number][]);
      } else if (!visited[q]) {
        lines.push(walk(p, q).map((v) => [v % w, (v / w) | 0]) as [number, number][]);
      }
    }
    if (neighbours(p).length === 0) lines.push([[p % w, (p / w) | 0]]);
  }
  // loops without nodes
  for (const p of pts) {
    if (visited[p] || isNode[p]) continue;
    visited[p] = 1;
    const nb = neighbours(p);
    if (!nb.length) continue;
    const path = walk(p, nb[0], p);
    lines.push(path.map((v) => [v % w, (v / w) | 0]) as [number, number][]);
  }
  // prune spurs: lines with a free end (crossing 1) and length < pruneLen, if the component has longer lines
  const endFree = (pt: [number, number]) => crossing(sk, w, pt[0], pt[1]) <= 1;
  const total = lines.length;
  const kept = lines.filter((l) => {
    if (total <= 1) return true;
    const a = l[0], b = l[l.length - 1];
    const freeA = endFree(a), freeB = endFree(b);
    if (freeA && freeB) return true; // isolated stroke
    if ((freeA || freeB) && l.length < pruneLen) return false;
    return l.length >= 2;
  });
  return kept.length ? kept : lines;
}
