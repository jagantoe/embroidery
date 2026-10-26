/// <reference lib="webworker" />
// Runs the digitizer off the main thread. Keeps the latest analysis so edits
// only re-run the (fast) planning stage.
import { analyze, plan, type Analysis, type Edits, type RasterInput } from '../core/digitize';
import { quantize } from '../core/raster';
import { rgbToLab } from '../core/color';
import type { DesignSettings } from '../core/types';

let current: Analysis | null = null;

export type WorkerRequest =
  | { id: number; type: 'colours'; raster: RasterInput; maxColours: number }
  | { id: number; type: 'analyze'; raster: RasterInput; settings: DesignSettings; edits: Edits }
  | { id: number; type: 'plan'; settings: DesignSettings; edits: Edits };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'colours') {
      const { rgba, w, h } = msg.raster;
      const q = quantize(rgba, w, h, msg.maxColours, 4);
      const total = q.counts.reduce((s, c) => s + c, 0) || 1;
      const items = q.palette.map((rgb, i) => ({ rgb, share: q.counts[i] / total, lab: rgbToLab(rgb) }));
      // hide small anti-aliasing blends that sit between two bigger colours (they merge away when digitizing)
      const isBlend = (c: typeof items[number]) => c.share < 0.03 && items.some((a) => a !== c && a.share > c.share && items.some((b) => {
        if (b === c || b === a || b.share <= c.share) return false;
        const ab = [b.lab[0] - a.lab[0], b.lab[1] - a.lab[1], b.lab[2] - a.lab[2]];
        const ac = [c.lab[0] - a.lab[0], c.lab[1] - a.lab[1], c.lab[2] - a.lab[2]];
        const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
        const t = Math.max(0, Math.min(1, (ab[0] * ac[0] + ab[1] * ac[1] + ab[2] * ac[2]) / L2));
        const d = Math.hypot(ac[0] - t * ab[0], ac[1] - t * ab[1], ac[2] - t * ab[2]);
        return d < 8 && t > 0.05 && t < 0.95;
      }));
      const result = items.filter((c) => !isBlend(c)).map(({ rgb, share }) => ({ rgb, share }));
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, result });
      return;
    }
    if (msg.type === 'analyze') current = analyze(msg.raster, msg.settings);
    if (!current) throw new Error('Nothing analysed yet');
    const result = plan(current, msg.settings, msg.edits);
    (self as unknown as Worker).postMessage({ id: msg.id, ok: true, result }, [result.labels.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: msg.id, ok: false, error: String((err as Error)?.stack ?? err) });
  }
};
