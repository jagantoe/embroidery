// Main-thread facade for the digitizer worker.
import type { Edits, RasterInput } from '../core/digitize';
import type { DesignSettings, DigitizeResult, RGB } from '../core/types';

type Pending = { resolve: (v: never) => void; reject: (e: Error) => void };
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../worker/digitizer.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result as never); else p.reject(new Error(e.data.error));
    };
  }
  return worker;
}

function call<T>(msg: Record<string, unknown>): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: never) => void, reject });
    getWorker().postMessage({ ...msg, id });
  });
}

export const detectColours = (raster: RasterInput, maxColours: number) =>
  call<{ rgb: RGB; share: number }[]>({ type: 'colours', raster, maxColours });
export const digitizeAll = (raster: RasterInput, settings: DesignSettings, edits: Edits) =>
  call<DigitizeResult>({ type: 'analyze', raster, settings, edits });
export const replan = (settings: DesignSettings, edits: Edits) =>
  call<DigitizeResult>({ type: 'plan', settings, edits });
