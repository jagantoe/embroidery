import { useCallback, useEffect, useRef, useState } from 'react';
import type { DigitizeResult } from '../../core/types';
import { drawDesign, fitViewport, type DrawOptions, type View, type Viewport } from '../render';

interface Props {
  result: DigitizeResult | null;
  view: View;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  hoop: { w: number; h: number } | null;
  upTo?: number;
  showJumps?: boolean;
  ghost?: boolean;
  showNeedle?: boolean;
  fabric?: string;
  className?: string;
  label: string;
  /** shown as zoom controls */
  controls?: boolean;
}

/** Pan/zoom canvas that draws a digitized design. */
export function DesignCanvas(p: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 500 });
  const [vp, setVp] = useState<Viewport | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(100, e.contentRect.width), h: Math.max(100, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (p.result) setVp(fitViewport(p.result, size.w, size.h, p.hoop));
  }, [p.result, size.w, size.h, p.hoop]);

  // refit when the design's size or the box changes
  const sig = p.result ? `${p.result.rasterW}x${p.result.rasterH}@${p.result.pxPerMm}|${size.w}x${size.h}|${p.hoop?.w}` : '';
  useEffect(() => { fit(); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = canvas.current;
    if (!c || !vp) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr);
    c.style.width = `${size.w}px`; c.style.height = `${size.h}px`;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const o: DrawOptions = { view: p.view, vp, selected: p.selected ?? null, hoop: p.hoop, upTo: p.upTo, showJumps: p.showJumps, ghost: p.ghost, showNeedle: p.showNeedle, fabric: p.fabric };
    drawDesign(ctx, size.w, size.h, p.result, o);
  }, [p.result, p.view, p.selected, p.hoop, p.upTo, p.showJumps, p.ghost, p.showNeedle, p.fabric, vp, size]);

  const zoomAt = (factor: number, cx: number, cy: number) => {
    setVp((v) => v && { scale: v.scale * factor, ox: cx - (cx - v.ox) * factor, oy: cy - (cy - v.oy) * factor });
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, []);

  const pick = (sx: number, sy: number) => {
    const r = p.result;
    if (!r || !vp || !p.onSelect) return;
    const x = (sx - vp.ox) / vp.scale, y = (sy - vp.oy) / vp.scale;
    const px = Math.floor(x * r.pxPerMm), py = Math.floor(y * r.pxPerMm);
    if (px < 0 || py < 0 || px >= r.rasterW || py >= r.rasterH) { p.onSelect(null); return; }
    const l = r.labels[py * r.rasterW + px];
    p.onSelect(l ? r.objects[l - 1].id : null);
  };

  const zoomPct = vp && p.result ? Math.round((vp.scale / fitViewport(p.result, size.w, size.h, p.hoop).scale) * 100) : 100;

  return (
    <div ref={wrap} className={p.className} style={{ position: p.className ? undefined : 'relative', overflow: 'hidden', touchAction: 'none' }}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={p.label}
        style={{ display: 'block', cursor: p.onSelect ? 'pointer' : 'grab' }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: vp?.ox ?? 0, oy: vp?.oy ?? 0, moved: false }; }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
          if (d.moved) setVp((v) => v && { ...v, ox: d.ox + dx, oy: d.oy + dy });
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            pick(e.clientX - rect.left, e.clientY - rect.top);
          }
        }}
      />
      {p.controls !== false && (
        <div className="zoom">
          <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.25, size.w / 2, size.h / 2)}>−</button>
          <button type="button" className="zoom-pct" onClick={fit} title="Fit to view">{zoomPct}%</button>
          <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)}>+</button>
        </div>
      )}
    </div>
  );
}
