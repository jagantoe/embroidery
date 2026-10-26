import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyze, emptyEdits, plan } from '../src/core/digitize';
import type { DesignSettings } from '../src/core/types';
import { writePes } from '../src/core/writers';

const settings: DesignSettings = { hoopId: '100x100', widthMm: 85.64, heightMm: 100, fabric: 'woven', mode: 'patch', maxColours: 8 };

describe.runIf(existsSync('tests/out/flanders.rgba'))('digitize shield', () => {
  it('produces a sensible plan', () => {
    const raw = readFileSync('tests/out/flanders.rgba');
    const t0 = performance.now();
    const a = analyze({ rgba: new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.length), w: 856, h: 1000, pxPerMm: 10 }, settings);
    const t1 = performance.now();
    const r = plan(a, settings, emptyEdits());
    const t2 = performance.now();
    const summary = {
      analyzeMs: Math.round(t1 - t0), planMs: Math.round(t2 - t1),
      palette: a.palette, objects: a.objects.length,
      byType: a.objects.reduce((m, o) => ({ ...m, [o.auto]: (m[o.auto as keyof typeof m] ?? 0) + 1 }), {} as Record<string, number>),
      threads: r.threads.map((t) => [t.name, t.skip]), order: r.order, stats: r.stats, warnings: r.warnings.map((w) => w.text),
    };
    console.log(JSON.stringify(summary, null, 1));
    writeFileSync('tests/out/flanders.pes', writePes(r.plan, 'FLANDERS'));
    writeFileSync('tests/out/flanders.plan.json', JSON.stringify(r.plan));
    expect(r.stats.stitches).toBeGreaterThan(3000);
    expect(r.stats.colourChanges).toBe(r.plan.threads.length - 1);
  });
});
