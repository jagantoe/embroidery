import { useEffect, useRef, useState } from 'react';
import { matchQuality, nearestPec, toHex } from '../../core/color';
import { HOOPS, type FabricPreset, type RGB } from '../../core/types';
import { IconLink, IconStar } from '../components/Icons';
import { detectColours } from '../engine';
import { rasterize } from '../image';
import { fitToHoop, useStore } from '../store';

const MAIN_HOOPS = ['100x100', '130x180'];
const FABRICS: { id: FabricPreset; label: string }[] = [
  { id: 'woven', label: 'Cotton / woven' },
  { id: 'knit', label: 'T-shirt / knit' },
  { id: 'towel', label: 'Towel / fleece' },
  { id: 'cap', label: 'Cap' },
];

export function Setup() {
  const { project, updateSettings, updateProject, digitize, openFile } = useStore();
  const [colours, setColours] = useState<{ rgb: RGB; share: number }[] | null>(null);
  const [lock, setLock] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const p = project!;
  const s = p.settings;
  const hoop = HOOPS.find((h) => h.id === s.hoopId) ?? HOOPS[0];
  const aspect = p.source.pxW / p.source.pxH;
  const fits = s.widthMm <= hoop.w - 6 + 0.01 && s.heightMm <= hoop.h - 6 + 0.01;

  // detect colours on a small raster (cheap) whenever the picture or colour limit changes
  useEffect(() => {
    let alive = true;
    const ppm = Math.sqrt(250000 / Math.max(1, s.widthMm * s.heightMm));
    rasterize(p.source, s.widthMm, s.heightMm, ppm)
      .then((r) => detectColours(r, s.maxColours))
      .then((c) => { if (alive) setColours(c.filter((x) => x.share > 0.002).sort((a, b) => b.share - a.share)); })
      .catch(() => alive && setColours([]));
    return () => { alive = false; };
  }, [p.source, s.maxColours]); // eslint-disable-line react-hooks/exhaustive-deps

  const setW = (w: number) => updateSettings(lock ? { widthMm: w, heightMm: Math.round((w / aspect) * 10) / 10 } : { widthMm: w });
  const setH = (h: number) => updateSettings(lock ? { heightMm: h, widthMm: Math.round(h * aspect * 10) / 10 } : { heightMm: h });
  const fit = () => updateSettings(fitToHoop({ ...p.source, mmW: undefined }, s.hoopId));
  const chooseHoop = (id: string) => {
    const h = HOOPS.find((x) => x.id === id)!;
    const patch: Record<string, unknown> = { hoopId: id };
    if (s.widthMm > h.w - 6 || s.heightMm > h.h - 6) Object.assign(patch, fitToHoop({ ...p.source, mmW: undefined }, id));
    updateSettings(patch);
  };

  // preview box: hoop drawn to scale with the picture inside
  const box = 280;
  const k = box / Math.max(hoop.w, hoop.h);

  return (
    <div className="page">
      <h1 style={{ fontWeight: 700, fontSize: 40, marginBottom: 6 }}>Lovely picture! Let's set it up.</h1>
      <p className="muted" style={{ fontSize: 18, marginBottom: 32 }}>Tell us a little about your hoop and fabric, and we'll pick the right stitches.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
        <section aria-label="Your picture" style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <label className="sr-only" htmlFor="pname">Design name</label>
                <input id="pname" className="input title-input" value={p.name} onChange={(e) => updateProject((x) => ({ ...x, name: e.target.value }))} />
                <p className="muted" style={{ fontSize: 14, paddingLeft: 4 }}>
                  {p.source.kind === 'svg' ? 'Vector' : 'Picture'}
                  {p.source.mmW ? ` · ${p.source.mmW.toFixed(0)} × ${p.source.mmH!.toFixed(0)} mm` : ` · ${Math.round(p.source.pxW)} × ${Math.round(p.source.pxH)} px`}
                  {p.source.shapes ? ` · ${p.source.shapes} shapes` : ''}
                </p>
              </div>
              <button type="button" className="btn" onClick={() => fileInput.current?.click()}>Change picture</button>
              <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg,.svg,.webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void openFile(f); }} />
            </div>
            <div style={{ borderRadius: 20, background: 'var(--surface-3)', padding: 28, display: 'flex', justifyContent: 'center' }}>
              <div style={{ position: 'relative', width: hoop.w * k, height: hoop.h * k, border: '3px dashed var(--berry)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                <img src={p.source.dataUrl} alt="Your picture inside the hoop outline" style={{ width: s.widthMm * k, height: s.heightMm * k, objectFit: 'fill', viewTransitionName: 'design' }} />
                <span className="badge" style={{ position: 'absolute', top: -14, left: 12, background: fits ? 'var(--berry)' : '#8A1C1C', color: '#fff' }}>{hoop.label} hoop{fits ? '' : ' · too small!'}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 22, marginBottom: 4 }}>{colours ? `We found ${colours.length} colour${colours.length === 1 ? '' : 's'}` : 'Looking at your colours…'}</h2>
            <p className="muted" style={{ fontSize: 15, marginBottom: 16 }}>Each one is matched to the closest Brother thread. You can change threads in the editor.</p>
            <ul className="colour-list">
              {(colours ?? []).map((c, i) => {
                const near = nearestPec(c.rgb);
                const q = matchQuality(near.deltaE);
                return (
                  <li key={i} data-quality={q}>
                    <span className="swatch" style={{ background: toHex(c.rgb) }} />
                    <span style={{ flex: '1 1 auto', minWidth: 0 }}><strong>{toHex(c.rgb).toUpperCase()}</strong><span className="muted"> → {near.thread.name} (#{near.thread.index}) · {Math.round(c.share * 100)}%</span></span>
                    <span className="q">{q === 'great' ? 'Great match' : q === 'close' ? 'A bit different' : 'Quite different'}</span>
                  </li>
                );
              })}
            </ul>
            <label className="field" style={{ marginTop: 16 }}>
              <span>Colours to keep: {s.maxColours}</span>
              <input type="range" min={2} max={15} value={s.maxColours} onChange={(e) => updateSettings({ maxColours: Number(e.target.value) })} style={{ accentColor: 'var(--berry)' }} />
              <span className="muted" style={{ fontWeight: 600, fontSize: 14 }}>Fewer colours means fewer thread changes.</span>
            </label>
          </div>
        </section>

        <section aria-label="Setup" className="card" style={{ flex: '1 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <fieldset>
            <legend className="legend-lg">Which hoop are you using?</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {HOOPS.filter((h) => MAIN_HOOPS.includes(h.id)).map((h) => (
                <label key={h.id} className="choice" style={{ flexDirection: 'column', gap: 2 }}>
                  <input type="radio" name="hoop" checked={s.hoopId === h.id} onChange={() => chooseHoop(h.id)} />
                  <strong style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600 }}>{h.label}</strong>
                  <span className="muted" style={{ fontSize: 14 }}>{h.id === '100x100' ? 'Patches, chest logos' : 'Most common big hoop'}</span>
                </label>
              ))}
              <label className="choice" style={{ flexDirection: 'column', gap: 6 }}>
                <input type="radio" name="hoop" checked={!MAIN_HOOPS.includes(s.hoopId)} onChange={() => chooseHoop('160x260')} />
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600 }}>Other size</strong>
                <select aria-label="Other hoop size" className="input" style={{ minHeight: 40, fontSize: 15 }} value={MAIN_HOOPS.includes(s.hoopId) ? '' : s.hoopId} onChange={(e) => chooseHoop(e.target.value)}>
                  <option value="" disabled>Pick a size</option>
                  {HOOPS.filter((h) => !MAIN_HOOPS.includes(h.id)).map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="legend-lg">How big should it be?</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
              <label className="field" style={{ fontSize: 15 }}>Width (mm)
                <input className="input" type="number" min={5} step={0.5} value={s.widthMm} style={{ width: 120 }} onChange={(e) => setW(Number(e.target.value))} />
              </label>
              <button type="button" className="icon-btn" aria-pressed={lock} aria-label={`Keep proportions (${lock ? 'on' : 'off'})`} onClick={() => setLock(!lock)} style={{ width: 48, height: 48, background: lock ? 'var(--violet-tint)' : 'var(--surface-3)', color: 'var(--violet)' }}><IconLink size={22} /></button>
              <label className="field" style={{ fontSize: 15 }}>Height (mm)
                <input className="input" type="number" min={5} step={0.5} value={s.heightMm} style={{ width: 120 }} onChange={(e) => setH(Number(e.target.value))} />
              </label>
              <button type="button" className="btn" style={{ minHeight: 48, borderRadius: 14 }} onClick={fit}>Fit to hoop</button>
            </div>
            <p className="muted" style={{ marginTop: 10, fontSize: 15 }}>
              {fits ? 'Fits with a 3 mm safety margin.' : `Too big for the ${hoop.label} hoop. Use "Fit to hoop" or pick a bigger hoop.`}
              {' '}Lines thinner than 1 mm at this size are sewn as simple running stitch.
            </p>
          </fieldset>

          <fieldset>
            <legend className="legend-lg">What are you making?</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <label className="choice teal">
                <input type="radio" name="mode" checked={s.mode === 'patch'} onChange={() => updateSettings({ mode: 'patch' })} style={{ accentColor: 'var(--teal)' }} />
                <span><strong style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600 }}>A patch</strong><br /><span className="muted" style={{ fontSize: 14 }}>Every colour is stitched</span></span>
              </label>
              <label className="choice teal">
                <input type="radio" name="mode" checked={s.mode === 'onFabric'} onChange={() => updateSettings({ mode: 'onFabric' })} style={{ accentColor: 'var(--teal)' }} />
                <span><strong style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600 }}>Straight onto white fabric</strong><br /><span className="muted" style={{ fontSize: 14 }}>White parts are left unstitched</span></span>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="legend-lg">What fabric?</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {FABRICS.map((f) => (
                <label key={f.id} className="pill"><input type="radio" name="fabric" checked={s.fabric === f.id} onChange={() => updateSettings({ fabric: f.id })} />{f.label}</label>
              ))}
            </div>
          </fieldset>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: 20, borderTop: '2px dashed var(--line)' }}>
            <p className="muted" style={{ fontSize: 15 }}><strong style={{ color: 'var(--ink)' }}>{s.widthMm.toFixed(0)} × {s.heightMm.toFixed(0)} mm</strong> · {colours?.length ?? '…'} colours</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => void digitize()} disabled={!fits}><IconStar size={22} />Digitize my design</button>
          </div>
        </section>
      </div>
    </div>
  );
}
