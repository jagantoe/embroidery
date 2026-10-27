// Benchmark run on any rasterised design, e.g. to compare with a hand-digitized reference:
//   BENCH_RGBA=tests/out/x.rgba BENCH_W=794 BENCH_H=1010 BENCH_PPM=10 npx vitest run tests/bench.test.ts
// writes tests/out/bench.pes (+ bench.plan.json); compare with: python3 -I tests/compare_pes.py tests/out/bench.pes reference.pes
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyze, emptyEdits, plan } from '../src/core/digitize';
import type { DesignSettings } from '../src/core/types';
import { writePes } from '../src/core/writers';

const env = process.env;
describe.runIf(!!env.BENCH_RGBA)('benchmark', () => {
  it('digitizes', () => {
    const w = Number(env.BENCH_W), h = Number(env.BENCH_H), ppm = Number(env.BENCH_PPM ?? 10);
    const settings: DesignSettings = { hoopId: env.BENCH_HOOP ?? '130x180', widthMm: w / ppm, heightMm: h / ppm, fabric: 'woven', mode: 'patch', maxColours: 8 };
    const raw = readFileSync(env.BENCH_RGBA!);
    const t0 = performance.now();
    const a = analyze({ rgba: new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.length), w, h, pxPerMm: ppm }, settings);
    const r = plan(a, settings, emptyEdits());
    console.log(JSON.stringify({ ms: Math.round(performance.now() - t0), objects: a.objects.length, order: r.order, stats: r.stats, warnings: r.warnings.map((x) => x.text) }));
    writeFileSync('tests/out/bench.pes', writePes(r.plan, 'BENCH'));
    writeFileSync('tests/out/bench.plan.json', JSON.stringify(r.plan));
    expect(r.stats.stitches).toBeGreaterThan(0);
  });
});
