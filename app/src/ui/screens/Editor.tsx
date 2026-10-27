import { useEffect, useMemo, useRef, useState } from 'react';
import { deltaE2000, pecByIndex, rgbToLab, toHex } from '../../core/color';
import { defaultParams } from '../../core/digitize';
import { PEC_PALETTE } from '../../core/pecPalette';
import { HOOPS, type DesignObject, type ObjectParams, type StitchType, type Thread } from '../../core/types';
import { DesignCanvas } from '../components/DesignCanvas';
import {
  IconBulb, IconDown, IconEye, IconEyeOff, IconPlay, IconRedo, IconReset, IconUndo, IconUp,
} from '../components/Icons';
import { threadRGB, type View } from '../render';
import { useStore } from '../store';

const VIEWS: { id: View; label: string; hint: string }[] = [
  { id: 'shapes', label: 'Shapes', hint: 'Shapes · click one to change its stitches' },
  { id: 'stitches', label: 'Stitches', hint: 'Stitches · jumps dashed, trims as dots' },
  { id: 'realistic', label: 'Realistic', hint: 'Realistic · thread on white cotton' },
  { id: 'density', label: 'Density', hint: 'Density · berry spots are crowded' },
];

const TYPE_LABEL: Record<StitchType, string> = { running: 'running', satin: 'satin', fill: 'fill' };

export function Editor() {
  const { project, result, selected, select, updateEdits, undo, redo, canUndo, canRedo, go } = useStore();
  const [view, setView] = useState<View>('realistic');
  const p = project!;
  const hoop = HOOPS.find((h) => h.id === p.settings.hoopId) ?? HOOPS[0];
  const sel = result?.objects.find((o) => o.id === selected) ?? null;

  // keyboard shortcuts, scoped to the editor
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.matches('input, select, textarea')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key === 'Escape') select(null);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        updateEdits((ed) => ({ ...ed, hidden: { ...ed.hidden, [selected]: true } }));
      }
      else if (!mod && ['1', '2', '3', '4'].includes(e.key)) setView(VIEWS[Number(e.key) - 1].id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undo, redo, select, selected, updateEdits]);

  if (!result) return <div className="page"><p>Digitizing…</p></div>;

  return (
    <div ref={root} className="editor">
      <div className="editor-bar">
        <h1 className="sr-only">Editor</h1>
        <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19 }}>{p.name}</p>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="icon-btn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><IconUndo /></button>
          <button type="button" className="icon-btn" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><IconRedo /></button>
        </div>
        <span style={{ flex: '1 1 20px' }} />
        <button type="button" className="btn" onClick={() => { if (confirm('Throw away all your changes and auto-digitize again?')) updateEdits(() => ({ params: {}, hidden: {}, colourOrder: [], threads: {} })); }}>
          <IconReset size={18} />Start over
        </button>
        <button type="button" className="btn btn-sun" onClick={() => go('simulator')}><IconPlay size={18} />Sew preview</button>
        <button type="button" className="btn btn-primary" onClick={() => go('export')}>Export</button>
      </div>

      <div className="editor-body">
        <SequencePanel />

        <section aria-label="Design canvas" className="editor-canvas">
          <div role="tablist" aria-label="View" className="view-tabs">
            {VIEWS.map((v, i) => (
              <button key={v.id} type="button" role="tab" aria-selected={view === v.id} title={`${v.label} (${i + 1})`} onClick={() => setView(v.id)}>{v.label}</button>
            ))}
          </div>
          <div className="canvas-box">
            <DesignCanvas
              className="canvas-fill"
              result={result}
              view={view}
              selected={selected}
              onSelect={select}
              hoop={hoop}
              label={`Your design in the ${hoop.label} hoop, ${view} view`}
            />
            <p className="canvas-hint">{VIEWS.find((v) => v.id === view)!.hint}</p>
          </div>
          <div className="status-bar">
            <span><strong>{result.stats.widthMm.toFixed(0)} × {result.stats.heightMm.toFixed(0)} mm</strong></span>
            <span><strong>{result.stats.stitches.toLocaleString()}</strong> stitches</span>
            <span><strong>{result.plan.threads.length}</strong> colours · <strong>{result.stats.colourChanges}</strong> thread changes</span>
            <span><strong>{result.stats.trims}</strong> trims</span>
            <span>about <strong>{result.stats.minutes[0]}–{result.stats.minutes[1]} min</strong> to sew</span>
          </div>
        </section>

        <aside aria-label="Properties" className="editor-side">
          {sel ? <Properties obj={sel} /> : (
            <div className="card side-card">
              <h2 style={{ fontSize: 20, marginBottom: 6 }}>Nothing selected</h2>
              <p className="muted">Click a shape on the canvas or in the sewing order to change how it is stitched.</p>
            </div>
          )}
          <Tips />
        </aside>
      </div>
    </div>
  );
}

function SequencePanel() {
  const { project, result, selected, select, updateEdits } = useStore();
  if (!result || !project) return null;
  const order = result.order;
  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id), j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    updateEdits((e) => ({ ...e, colourOrder: next }));
  };
  const setThread = (id: string, patch: { pec?: number; skip?: boolean }) =>
    updateEdits((e) => ({ ...e, threads: { ...e.threads, [id]: { ...e.threads[id], ...patch } } }));
  return (
    <aside aria-label="Sewing order" className="editor-seq">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ fontSize: 19 }}>Sewing order</h2>
        <span className="muted" style={{ fontSize: 13 }}>top sews first</span>
      </div>
      {order.map((tid, ti) => {
        const t = result.threads.find((x) => x.id === tid)!;
        const objs = result.objects.filter((o) => o.threadId === tid);
        const active = objs.some((o) => o.id === selected);
        return (
          <div key={tid} className="seq-block" data-active={active} data-skip={!!t.skip}>
            <div className="seq-head">
              <ThreadPicker thread={t} onPick={(pec) => setThread(tid, { pec })} />
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <strong>{ti + 1} · {pecByIndex(t.pec).name}</strong>
                <span className="muted" style={{ fontSize: 13, display: 'block' }}>#{t.pec} · {objs.length} shape{objs.length === 1 ? '' : 's'}{t.skip ? ' · not sewn' : ''}</span>
              </span>
              <button type="button" className="icon-btn sm" aria-label={t.skip ? `Sew ${pecByIndex(t.pec).name}` : `Don't sew ${pecByIndex(t.pec).name}`} title={t.skip ? 'Sew this colour' : "Don't sew this colour"} onClick={() => setThread(tid, { skip: !t.skip })}>{t.skip ? <IconEyeOff size={18} /> : <IconEye size={18} />}</button>
              <span className="seq-move">
                <button type="button" className="icon-btn sm" aria-label="Sew earlier" disabled={ti === 0} onClick={() => move(tid, -1)}><IconUp size={16} /></button>
                <button type="button" className="icon-btn sm" aria-label="Sew later" disabled={ti === order.length - 1} onClick={() => move(tid, 1)}><IconDown size={16} /></button>
              </span>
            </div>
            <details open={active || objs.length <= 6}>
              <summary className="muted">{objs.length} shape{objs.length === 1 ? '' : 's'}</summary>
              <ul className="seq-objs">
                {objs.map((o) => (
                  <li key={o.id}>
                    <button type="button" aria-pressed={o.id === selected} data-hidden={!!o.hidden} onClick={() => select(o.id === selected ? null : o.id)}>
                      <span>{o.name}</span><span className="muted">{o.hidden ? 'hidden' : TYPE_LABEL[o.params.type]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        );
      })}
      <p className="seq-note">{result.stats.colourChanges} thread change{result.stats.colourChanges === 1 ? '' : 's'} for {result.plan.threads.length} colour{result.plan.threads.length === 1 ? '' : 's'}{result.stats.colourChanges === Math.max(0, result.plan.threads.length - 1) ? ', the fewest possible.' : '.'}</p>
    </aside>
  );
}

function ThreadPicker({ thread, onPick }: { thread: Thread; onPick: (pec: number) => void }) {
  const id = `picker-${thread.id}`;
  const ref = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => {
    const lab = rgbToLab(thread.rgb);
    return PEC_PALETTE.map((p) => ({ p, d: deltaE2000(lab, rgbToLab(p.rgb)) })).sort((a, b) => a.d - b.d);
  }, [thread.rgb]);
  return (
    <>
      <button type="button" className="swatch-btn" popoverTarget={id} aria-label={`Change thread (now ${pecByIndex(thread.pec).name})`} style={{ background: toHex(threadRGB(thread)) }}>
        <span style={{ background: toHex(thread.rgb) }} title={`Your colour ${toHex(thread.rgb)}`} />
      </button>
      <div ref={ref} id={id} popover="auto" className="picker">
        <p style={{ fontWeight: 700, marginBottom: 4 }}>Pick a thread</p>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Your colour {toHex(thread.rgb).toUpperCase()} · closest first</p>
        <div className="picker-grid">
          {sorted.map(({ p, d }) => (
            <button key={p.index} type="button" title={`${p.name} (#${p.index}) · ΔE ${d.toFixed(0)}`} aria-label={`${p.name}, number ${p.index}`} aria-pressed={p.index === thread.pec}
              style={{ background: toHex(p.rgb) }} onClick={() => { onPick(p.index); ref.current?.hidePopover(); }} />
          ))}
        </div>
      </div>
    </>
  );
}

function Properties({ obj }: { obj: DesignObject }) {
  const { project, updateEdits, select } = useStore();
  const p = obj.params;
  const set = (patch: Partial<ObjectParams>) =>
    updateEdits((e) => ({ ...e, params: { ...e.params, [obj.id]: { ...e.params[obj.id], ...patch } } }));
  const setType = (type: StitchType) => {
    const d = defaultParams(type, p.angle, project!.settings);
    set({ type, spacing: d.spacing, length: d.length, pullComp: d.pullComp, underlay: d.underlay });
  };
  const reset = () => updateEdits((e) => { const params = { ...e.params }; delete params[obj.id]; return { ...e, params }; });
  const hide = () => { updateEdits((e) => ({ ...e, hidden: { ...e.hidden, [obj.id]: !obj.hidden } })); };
  const edited = !!project?.edits.params[obj.id];
  // density slider: 0 = lighter (wide spacing) … 100 = denser
  const range = p.type === 'satin' ? [0.25, 0.6] : [0.18, 0.6];
  const density = Math.round(((range[1] - p.spacing) / (range[1] - range[0])) * 100);

  return (
    <div className="card side-card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div>
          <p className="eyebrow">Selected</p>
          <h2 style={{ fontSize: 22 }}>{obj.name}</h2>
          <p className="muted" style={{ fontSize: 13 }}>{obj.areaMm2.toFixed(0)} mm² · up to {obj.maxWidthMm.toFixed(1)} mm wide · auto picked {obj.auto}</p>
        </div>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => select(null)}>×</button>
      </div>
      <fieldset>
        <legend style={{ fontWeight: 700, marginBottom: 8 }}>Stitch type</legend>
        <div className="segmented">
          {(['running', 'satin', 'fill'] as StitchType[]).map((t) => (
            <label key={t}><input type="radio" name={`st-${obj.id}`} checked={p.type === t} onChange={() => setType(t)} />{t[0].toUpperCase() + t.slice(1)}</label>
          ))}
        </div>
      </fieldset>
      {p.type === 'fill' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div aria-hidden="true" className="dial"><span style={{ transform: `rotate(${-p.angle}deg)` }} /></div>
          <label className="field" style={{ flex: '1 1 auto' }}>Stitch angle: {Math.round(p.angle)}°
            <input type="range" min={0} max={179} value={Math.round(p.angle)} onChange={(e) => set({ angle: Number(e.target.value) })} style={{ accentColor: 'var(--berry)' }} />
          </label>
        </div>
      )}
      {p.type !== 'running' && (
        <label className="field">Density
          <input type="range" min={0} max={100} value={density} onChange={(e) => set({ spacing: Math.round((range[1] - (Number(e.target.value) / 100) * (range[1] - range[0])) * 100) / 100 })} style={{ accentColor: 'var(--berry)' }} />
          <span className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}><span>Lighter</span><span>Denser</span></span>
        </label>
      )}
      <fieldset style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <legend style={{ fontWeight: 700, marginBottom: 8 }}>Options</legend>
        {p.type !== 'running' && (
          <label className="check"><input type="checkbox" checked={p.underlay} onChange={(e) => set({ underlay: e.target.checked })} />Underlay {p.type === 'fill' ? '(light fill underneath)' : '(centre walk)'}</label>
        )}
        {p.type === 'running' && (
          <label className="check"><input type="checkbox" checked={p.triple} onChange={(e) => set({ triple: e.target.checked })} />Triple run (bolder line)</label>
        )}
      </fieldset>
      <details className="advanced">
        <summary>Advanced</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
          {p.type !== 'running' && <label className="field small">Spacing (mm)<input className="input" type="number" step={0.01} min={0.2} max={2} value={p.spacing} onChange={(e) => set({ spacing: Number(e.target.value) })} /></label>}
          {p.type !== 'satin' && <label className="field small">Stitch length (mm)<input className="input" type="number" step={0.1} min={1} max={7} value={p.length} onChange={(e) => set({ length: Number(e.target.value) })} /></label>}
          {p.type !== 'running' && <label className="field small">Pull comp. (mm)<input className="input" type="number" step={0.05} min={0} max={1} value={p.pullComp} onChange={(e) => set({ pullComp: Number(e.target.value) })} /></label>}
        </div>
      </details>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn" onClick={reset} disabled={!edited}><IconReset size={16} />Back to auto</button>
        <button type="button" className="btn" onClick={hide}>{obj.hidden ? <><IconEye size={16} />Sew it</> : <><IconEyeOff size={16} />Don't sew</>}</button>
      </div>
    </div>
  );
}

function Tips() {
  const { result, select } = useStore();
  if (!result || !result.warnings.length) return (
    <div className="tips ok"><h2><IconBulb size={20} />All good</h2><p>No problems found. Have a look in the sew preview!</p></div>
  );
  return (
    <div className="tips">
      <h2><IconBulb size={20} />{result.warnings.length} friendly tip{result.warnings.length === 1 ? '' : 's'}</h2>
      <ul>
        {result.warnings.map((w) => (
          <li key={w.id} data-level={w.level}>
            {w.text}
            {w.objectId && <> <button type="button" className="linkish" onClick={() => select(w.objectId!)}>Show</button></>}
          </li>
        ))}
      </ul>
    </div>
  );
}
