// Canvas rendering of designs: flat shapes, stitch lines, realistic thread, density.
import { toHex } from '../core/color';
import { pecByIndex } from '../core/color';
import type { DigitizeResult, RGB, Thread } from '../core/types';

export type View = 'shapes' | 'stitches' | 'realistic' | 'density';

export interface Viewport { scale: number; ox: number; oy: number } // screen = mm * scale + o

export interface DrawOptions {
  view: View;
  vp: Viewport;
  selected: string | null;
  hoop: { w: number; h: number } | null;
  /** draw stitches only up to this index (simulator) */
  upTo?: number;
  showJumps?: boolean;
  ghost?: boolean;
  showNeedle?: boolean;
  fabric?: string;
}

const shapeCache = new WeakMap<DigitizeResult, { key: string; canvas: HTMLCanvasElement }>();

/** Thread colour as sewn: the chosen Brother thread, not the source colour. */
export function threadRGB(t: Thread): RGB {
  return pecByIndex(t.pec).rgb;
}

function shapesImage(r: DigitizeResult, selected: string | null): HTMLCanvasElement {
  const key = selected ?? '';
  const c = shapeCache.get(r);
  if (c && c.key === key) return c.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = r.rasterW; canvas.height = r.rasterH;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(r.rasterW, r.rasterH);
  const colours = r.objects.map((o) => {
    const t = r.threads.find((x) => x.id === o.threadId)!;
    const rgb = threadRGB(t);
    const alpha = o.hidden || t.skip ? 50 : 255;
    return [...rgb, alpha];
  });
  const selIdx = selected ? r.objects.findIndex((o) => o.id === selected) : -1;
  const d = img.data;
  for (let i = 0; i < r.labels.length; i++) {
    const l = r.labels[i];
    if (!l) continue;
    const col = colours[l - 1];
    let [cr, cg, cb] = col;
    if (selIdx >= 0 && l - 1 !== selIdx) { cr = cr * 0.55 + 255 * 0.45; cg = cg * 0.55 + 255 * 0.45; cb = cb * 0.55 + 255 * 0.45; }
    d[i * 4] = cr; d[i * 4 + 1] = cg; d[i * 4 + 2] = cb; d[i * 4 + 3] = col[3];
  }
  g.putImageData(img, 0, 0);
  shapeCache.set(r, { key, canvas });
  return canvas;
}

const shade = ([r, g, b]: RGB, f: number) => `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
const tint = ([r, g, b]: RGB, f: number) => `rgb(${Math.round(r + (255 - r) * f)},${Math.round(g + (255 - g) * f)},${Math.round(b + (255 - b) * f)})`;

export function drawDesign(ctx: CanvasRenderingContext2D, w: number, h: number, r: DigitizeResult | null, o: DrawOptions) {
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  const { scale, ox, oy } = o.vp;
  const X = (x: number) => x * scale + ox, Y = (y: number) => y * scale + oy;
  if (!r) { ctx.restore(); return; }
  const dw = r.rasterW / r.pxPerMm, dh = r.rasterH / r.pxPerMm;

  // hoop field
  if (o.hoop) {
    const hx = dw / 2 - o.hoop.w / 2, hy = dh / 2 - o.hoop.h / 2;
    ctx.fillStyle = o.fabric ?? '#FFFFFF';
    roundRect(ctx, X(hx), Y(hy), o.hoop.w * scale, o.hoop.h * scale, 10 * scale);
    ctx.fill();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = '#B9AEEA';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (o.view === 'shapes') {
    ctx.imageSmoothingEnabled = scale < r.pxPerMm;
    ctx.drawImage(shapesImage(r, o.selected), X(0), Y(0), dw * scale, dh * scale);
    ctx.restore();
    return;
  }

  const st = r.plan.stitches;
  const end = Math.min(o.upTo ?? st.length, st.length);
  const selRange = o.selected ? r.ranges[o.selected] : undefined;

  if (o.view === 'density') {
    const cells = new Map<number, number>();
    let max = 1;
    for (let i = 0; i < end; i++) {
      const s = st[i];
      if (s.cmd !== 'stitch') continue;
      const k = Math.floor(s.x) * 10000 + Math.floor(s.y);
      const n = (cells.get(k) ?? 0) + 1;
      cells.set(k, n);
      if (n > max) max = n;
    }
    cells.forEach((n, k) => {
      const cx = Math.floor(k / 10000), cy = k % 10000;
      const t = Math.min(1, n / 30);
      // teal (light) → sun → berry (crowded)
      ctx.fillStyle = t < 0.5 ? `rgba(11,122,117,${0.15 + t})` : t < 0.85 ? `rgba(255,176,32,${0.5 + t * 0.4})` : 'rgba(194,37,92,0.95)';
      ctx.fillRect(X(cx), Y(cy), scale + 0.5, scale + 0.5);
    });
    ctx.restore();
    return;
  }

  const realistic = o.view === 'realistic';
  const threads = r.plan.threads;
  const colours = threads.map(threadRGB);

  // ghost of the unsewn part (simulator)
  if (o.ghost && end < st.length) {
    ctx.globalAlpha = 0.13;
    strokeRange(ctx, st, end, st.length, colours, X, Y, Math.max(1, 0.35 * scale), false, countColours(st, end), threads.length);
    ctx.globalAlpha = 1;
  }

  const width = realistic ? Math.max(1, 0.38 * scale) : 1;
  strokeRange(ctx, st, 0, end, colours, X, Y, width, realistic, 0, threads.length, selRange);

  if (o.view === 'stitches') {
    // needle points
    ctx.fillStyle = 'rgba(36,32,58,0.55)';
    if (scale > 6) for (let i = 0; i < end; i++) {
      const s = st[i];
      if (s.cmd === 'stitch') ctx.fillRect(X(s.x) - 1, Y(s.y) - 1, 2, 2);
    }
  }
  if (o.showJumps !== false && o.view !== 'realistic') {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(194,37,92,0.7)';
    ctx.lineWidth = 1;
    let prev: { x: number; y: number } | null = null;
    for (let i = 0; i < end; i++) {
      const s = st[i];
      if (s.cmd === 'trim') {
        ctx.save(); ctx.setLineDash([]); ctx.fillStyle = '#C2255C';
        ctx.beginPath(); ctx.arc(X(s.x), Y(s.y), 2.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      if (s.cmd === 'jump' && prev) {
        ctx.beginPath(); ctx.moveTo(X(prev.x), Y(prev.y)); ctx.lineTo(X(s.x), Y(s.y)); ctx.stroke();
      }
      if (s.cmd !== 'colour') prev = s;
    }
    ctx.setLineDash([]);
  }

  if (selRange) {
    // outline the selected object's stitches
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#C2255C';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = selRange[0]; i < selRange[1]; i++) {
      const s = st[i];
      if (s.cmd !== 'stitch') continue;
      x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
    }
    if (isFinite(x0)) ctx.strokeRect(X(x0) - 4, Y(y0) - 4, (x1 - x0) * scale + 8, (y1 - y0) * scale + 8);
    ctx.restore();
  }

  if (o.showNeedle && end > 0 && end < st.length) {
    const s = st[end - 1];
    ctx.strokeStyle = '#C2255C'; ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(194,37,92,0.25)';
    ctx.beginPath(); ctx.arc(X(s.x), Y(s.y), 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function countColours(st: DigitizeResult['plan']['stitches'], end: number) {
  let c = 0;
  for (let i = 0; i < end; i++) if (st[i].cmd === 'colour') c++;
  return c;
}

function strokeRange(
  ctx: CanvasRenderingContext2D, st: DigitizeResult['plan']['stitches'], from: number, to: number, colours: RGB[],
  X: (x: number) => number, Y: (y: number) => number, width: number, realistic: boolean, colourStart: number, _n: number,
  selRange?: [number, number],
) {
  let ci = colourStart;
  let prev: { x: number; y: number } | null = null;
  // collect polylines per colour block so each block is stroked in sewing order
  const flush = (pts: number[], rgb: RGB, dim: boolean) => {
    if (pts.length < 4) return;
    const path = new Path2D();
    for (let i = 0; i < pts.length; i += 4) { path.moveTo(pts[i], pts[i + 1]); path.lineTo(pts[i + 2], pts[i + 3]); }
    ctx.lineCap = 'round';
    ctx.globalAlpha = dim ? 0.35 : ctx.globalAlpha;
    if (realistic) {
      ctx.strokeStyle = shade(rgb, 0.62); ctx.lineWidth = width + 1.2; ctx.stroke(path);
      ctx.strokeStyle = toHex(rgb); ctx.lineWidth = width; ctx.stroke(path);
      ctx.strokeStyle = tint(rgb, 0.45); ctx.lineWidth = Math.max(0.6, width * 0.3); ctx.stroke(path);
    } else {
      ctx.strokeStyle = toHex(rgb).toLowerCase() === '#ffffff' || toHex(rgb) === '#f0f0f0' ? '#C9C3DD' : toHex(rgb);
      ctx.lineWidth = width; ctx.stroke(path);
    }
    if (dim) ctx.globalAlpha = 1;
  };
  let seg: number[] = [];
  let segDim = false;
  const baseAlpha = ctx.globalAlpha;
  for (let i = from; i < to; i++) {
    const s = st[i];
    if (s.cmd === 'colour') { flush(seg, colours[ci] ?? [0, 0, 0], segDim); seg = []; ci++; prev = null; continue; }
    if (s.cmd !== 'stitch') { if (s.cmd === 'jump') prev = null; continue; }
    const dim = !!selRange && (i < selRange[0] || i >= selRange[1]) && baseAlpha === 1;
    if (dim !== segDim) { flush(seg, colours[ci] ?? [0, 0, 0], segDim); seg = []; segDim = dim; }
    if (prev) seg.push(X(prev.x), Y(prev.y), X(s.x), Y(s.y));
    prev = s;
  }
  flush(seg, colours[ci] ?? [0, 0, 0], segDim);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, 24));
}

/** Fit the design (and hoop) into a box. */
export function fitViewport(r: DigitizeResult, boxW: number, boxH: number, hoop: { w: number; h: number } | null, pad = 32): Viewport {
  const dw = r.rasterW / r.pxPerMm, dh = r.rasterH / r.pxPerMm;
  const fw = Math.max(dw, hoop?.w ?? 0), fh = Math.max(dh, hoop?.h ?? 0);
  const scale = Math.min((boxW - pad * 2) / fw, (boxH - pad * 2) / fh);
  return { scale, ox: boxW / 2 - (dw / 2) * scale, oy: boxH / 2 - (dh / 2) * scale };
}
