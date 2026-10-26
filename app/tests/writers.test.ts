import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { writePes, writeDst, writeExp, normalize } from '../src/core/writers';
import type { StitchPlan, StitchPoint, Thread } from '../src/core/types';

const threads: Thread[] = [
  { id: 'a', rgb: [0, 0, 0], pec: 20, name: 'Black' },
  { id: 'b', rgb: [237, 23, 31], pec: 5, name: 'Red' },
];

function samplePlan(): StitchPlan {
  const s: StitchPoint[] = [];
  // a 20 x 10 mm zig-zag in black
  for (let i = 0; i <= 40; i++) s.push({ x: i * 0.5, y: i % 2 ? 10 : 0, cmd: 'stitch' });
  s.push({ x: 20, y: 10, cmd: 'trim' });
  s.push({ x: 40, y: 30, cmd: 'jump' });
  for (let i = 0; i <= 10; i++) s.push({ x: 40 + i * 2.2, y: 30 - i * 1.1, cmd: 'stitch' });
  s.push({ x: 62, y: 19, cmd: 'colour' });
  s.push({ x: 0, y: 40, cmd: 'jump' });
  // long stitch must be split, negative coords
  s.push({ x: 0, y: 40, cmd: 'stitch' });
  s.push({ x: 30, y: 40, cmd: 'stitch' });
  s.push({ x: -10, y: -5, cmd: 'stitch' });
  s.push({ x: -10, y: -5, cmd: 'end' });
  return { stitches: s, threads };
}

describe('writers', () => {
  it('normalizes with cumulative rounding and splitting', () => {
    const n = normalize(samplePlan(), 120, 2047);
    for (let i = 1; i < n.pts.length; i++) {
      const a = n.pts[i - 1], b = n.pts[i];
      if (b.cmd === 'stitch') expect(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))).toBeLessThanOrEqual(120);
    }
  });
  it('writes files', () => {
    const plan = samplePlan();
    const pes = writePes(plan, 'TEST');
    expect(String.fromCharCode(...pes.slice(0, 8))).toBe('#PES0001');
    writeFileSync('tests/out/sample.pes', pes);
    writeFileSync('tests/out/sample.dst', writeDst(plan, 'TEST'));
    writeFileSync('tests/out/sample.exp', writeExp(plan));
    writeFileSync('tests/out/sample.norm.json', JSON.stringify(normalize(plan, 120, 2047)));
  });
});
