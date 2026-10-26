import { useEffect, useMemo, useRef, useState } from 'react';
import { pecByIndex, toHex } from '../../core/color';
import { DesignCanvas } from '../components/DesignCanvas';
import { IconBack, IconCheck, IconPause, IconPlay, IconSkipBack, IconSkipFwd } from '../components/Icons';
import { threadRGB } from '../render';
import { useStore } from '../store';

const SPEEDS = [
  { id: 1, label: '1×', perSec: 650 / 60 },   // real machine speed (~650 stitches/min)
  { id: 10, label: '10×', perSec: 110 },
  { id: 50, label: '50×', perSec: 540 },
  { id: 200, label: '200×', perSec: 2200 },
];

export function Simulator() {
  const { project, result, go } = useStore();
  const st = result?.plan.stitches ?? [];
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(50);
  const [jumps, setJumps] = useState(false);
  const [ghost, setGhost] = useState(true);
  const posRef = useRef(0);
  posRef.current = pos;

  // colour blocks: [start, end) index ranges
  const blocks = useMemo(() => {
    const out: { start: number; end: number; stitches: number }[] = [];
    let start = 0, n = 0;
    st.forEach((s, i) => {
      if (s.cmd === 'colour') { out.push({ start, end: i, stitches: n }); start = i + 1; n = 0; }
      if (s.cmd === 'stitch') n++;
    });
    out.push({ start, end: st.length, stitches: n });
    return out;
  }, [st]);
  const current = Math.max(0, blocks.findIndex((b) => pos < b.end + 1));

  useEffect(() => {
    if (!playing || !st.length) return;
    let raf = 0, last = performance.now();
    const perSec = SPEEDS.find((s) => s.id === speed)!.perSec;
    let acc = 0;
    const tick = (now: number) => {
      acc += ((now - last) / 1000) * perSec;
      last = now;
      const step = Math.floor(acc);
      if (step > 0) {
        acc -= step;
        const next = Math.min(st.length, posRef.current + step);
        setPos(next);
        if (next >= st.length) { setPlaying(false); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, st.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, select, textarea, button')) return;
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!result || !project) return null;
  const threads = result.plan.threads;
  const totalStitches = result.stats.stitches || 1;
  const sewn = st.slice(0, pos).filter((s) => s.cmd === 'stitch').length;
  const leftMin = Math.max(0, Math.round(((totalStitches - sewn) / 650) + (threads.length - 1 - current)));
  const done = pos >= st.length;

  return (
    <div className="sim">
      <div className="sim-bar">
        <button type="button" className="btn btn-night" onClick={() => go('editor')}><IconBack size={18} />Back to editor</button>
        <h1 style={{ fontSize: 24, flex: '1 1 240px' }}>Sew preview · {project.name}</h1>
        <button type="button" className="btn btn-sun" onClick={() => go('export')}>Looks good, export</button>
      </div>
      <div className="sim-body">
        <section aria-label="Preview" className="sim-main">
          <div className="sim-stage">
            <div className="sim-hoop">
              <DesignCanvas
                className="canvas-fill"
                result={result}
                view={jumps ? 'stitches' : 'realistic'}
                hoop={null}
                upTo={pos}
                ghost={ghost}
                showNeedle
                fabric="#FBF8F2"
                controls={false}
                label="Sew preview of your design"
              />
            </div>
            <p className="sim-now" aria-live="polite">
              {done ? <>All done!</> : <><span className="dot" style={{ background: toHex(threadRGB(threads[current] ?? threads[0])) }} />Now sewing: {pecByIndex((threads[current] ?? threads[0]).pec).name}</>}
            </p>
          </div>
          <div className="sim-controls">
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="round-btn" aria-label="Back to the previous colour" onClick={() => { const b = blocks[Math.max(0, pos > blocks[current].start + 5 ? current : current - 1)]; setPos(b.start); }}><IconSkipBack /></button>
              <button type="button" className="round-btn big" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (done) setPos(0); setPlaying(!playing || done); }}>{playing && !done ? <IconPause size={24} /> : <IconPlay size={24} />}</button>
              <button type="button" className="round-btn" aria-label="Skip to the next colour" onClick={() => setPos(current + 1 < blocks.length ? blocks[current + 1].start : st.length)}><IconSkipFwd /></button>
            </div>
            <div style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div aria-hidden="true" className="sim-track">
                {blocks.map((b, i) => (
                  <span key={i} style={{ flex: `${Math.max(1, b.stitches)} 1 0`, background: toHex(threadRGB(threads[i] ?? threads[0])), opacity: i < current || done ? 1 : i === current ? 0.85 : 0.35 }} />
                ))}
              </div>
              <label>
                <span className="sr-only">Position in the sewing order</span>
                <input type="range" min={0} max={st.length} value={pos} onChange={(e) => { setPos(Number(e.target.value)); }} style={{ width: '100%', accentColor: 'var(--sun)' }} />
              </label>
              <p style={{ fontSize: 14, color: 'var(--night-text)' }}>{sewn.toLocaleString()} of {totalStitches.toLocaleString()} stitches · about {leftMin} min left on the machine</p>
            </div>
            <fieldset className="speed">
              <legend className="sr-only">Speed</legend>
              {SPEEDS.map((s) => (
                <label key={s.id}><input type="radio" name="speed" checked={speed === s.id} onChange={() => setSpeed(s.id)} />{s.label}</label>
              ))}
            </fieldset>
          </div>
        </section>
        <aside aria-label="Thread changes" className="sim-side">
          <div className="night-card">
            <h2 style={{ fontSize: 22, marginBottom: 4 }}>Your thread changes</h2>
            <p style={{ color: 'var(--night-text)', fontSize: 15, marginBottom: 16 }}>The machine stops between colours so you can rethread.</p>
            <ol className="thread-steps">
              {threads.map((t, i) => {
                const state = done || i < current ? 'done' : i === current ? 'now' : 'next';
                const objs = result.objects.filter((o) => o.threadId === t.id && !o.hidden).length;
                return (
                  <li key={t.id} data-state={state}>
                    <button type="button" onClick={() => { setPos(blocks[i].start); }} aria-label={`Jump to ${pecByIndex(t.pec).name}`}>
                      <span className="dot big" style={{ background: toHex(threadRGB(t)) }} />
                      <span style={{ flex: '1 1 auto', textAlign: 'left' }}><strong>{pecByIndex(t.pec).name}</strong><br /><span className="sub">#{t.pec} · {objs} shape{objs === 1 ? '' : 's'} · {blocks[i]?.stitches.toLocaleString()} stitches</span></span>
                      {state === 'done' ? <IconCheck size={22} /> : <span className="sub" style={{ fontWeight: 700 }}>{state === 'now' ? 'sewing' : 'next'}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="night-card">
            <h2 style={{ fontSize: 20, marginBottom: 12 }}>Show on the preview</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="check"><input type="checkbox" checked={jumps} onChange={(e) => setJumps(e.target.checked)} style={{ accentColor: 'var(--sun)' }} />Jumps and trims</label>
              <label className="check"><input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} style={{ accentColor: 'var(--sun)' }} />Unsewn parts as a ghost</label>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
