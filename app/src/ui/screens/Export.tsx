import { useState } from 'react';
import { HOOPS } from '../../core/types';
import { writeFormat, type ExportFormat } from '../../core/writers';
import { DesignCanvas } from '../components/DesignCanvas';
import { IconCheck, IconDownload, IconPrint, IconUsb } from '../components/Icons';
import { useStore } from '../store';

const FORMATS: { id: ExportFormat; ext: string; label: string; note: string }[] = [
  { id: 'pes', ext: 'pes', label: '.pes for Brother', note: 'Works on every Brother embroidery machine' },
  { id: 'dst', ext: 'dst', label: '.dst (Tajima)', note: 'For most other brands. Has no colours, so you pick threads on the machine' },
  { id: 'exp', ext: 'exp', label: '.exp (Melco / Bernina)', note: 'No colours either' },
];

type SaveWindow = Window & { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> };

export function cleanName(name: string) {
  const s = name.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return (s || 'DESIGN').slice(0, 8);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ExportScreen() {
  const { project, result, setError } = useStore();
  const [fmt, setFmt] = useState<ExportFormat>('pes');
  const [name, setName] = useState(() => cleanName(project?.name ?? 'design'));
  const [saved, setSaved] = useState<string | null>(null);
  if (!project || !result) return null;
  const hoop = HOOPS.find((h) => h.id === project.settings.hoopId) ?? HOOPS[0];
  const f = FORMATS.find((x) => x.id === fmt)!;
  const filename = `${name || 'DESIGN'}.${f.ext}`;
  const hoopProblem = result.warnings.some((w) => w.id === 'hoop');
  const dense = result.warnings.some((w) => w.id === 'dense');

  const bytes = () => new Blob([writeFormat(fmt, result.plan, name || 'DESIGN') as BlobPart], { type: 'application/octet-stream' });

  const saveToStick = async () => {
    const w = window as SaveWindow;
    try {
      if (!w.showSaveFilePicker) { download(bytes(), filename); setSaved(`Downloaded ${filename}. Copy it to your USB stick.`); return; }
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Embroidery file', accept: { 'application/octet-stream': [`.${f.ext}`] } }],
      });
      const out = await handle.createWritable();
      await out.write(bytes());
      await out.close();
      setSaved(`Saved ${filename}. You can unplug the stick now.`);
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') setError(`Could not save the file: ${(e as Error).message}`);
    }
  };

  const saveProject = () => {
    const data = JSON.stringify({ format: 'needle-and-pixel', version: 1, project });
    download(new Blob([data], { type: 'application/json' }), `${project.name || 'design'}.stitchproject.json`);
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20, marginBottom: 32 }}>
        <span className="np-pop ready-badge"><IconCheck size={34} /></span>
        <div>
          <h1 style={{ fontWeight: 700, fontSize: 42, lineHeight: 1.1 }}>{hoopProblem ? 'Almost ready' : 'Ready to sew!'}</h1>
          <p className="muted" style={{ fontSize: 18, marginTop: 4 }}>{hoopProblem ? 'The design is too big for your hoop. Go back to setup to resize it.' : 'Pick a format and send it to your machine.'}</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <section aria-label="Summary" className="card" style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="export-preview">
            <DesignCanvas className="canvas-fill" result={result} view="realistic" hoop={null} controls={false} label="Preview of the finished design" />
          </div>
          <ul className="checklist">
            <li data-ok={!hoopProblem}><IconCheck size={22} /><span><strong>{hoopProblem ? 'Too big for' : 'Fits'} your {hoop.label} hoop</strong> · {result.stats.widthMm.toFixed(0)} × {result.stats.heightMm.toFixed(0)} mm</span></li>
            <li data-ok><IconCheck size={22} /><span><strong>{result.plan.threads.length} colours, {result.stats.colourChanges} thread change{result.stats.colourChanges === 1 ? '' : 's'}</strong></span></li>
            <li data-ok={!dense}><IconCheck size={22} /><span><strong>{dense ? 'Some crowded spots' : 'No crowded spots'}</strong> · {dense ? 'see tips in the editor' : 'density looks healthy'}</span></li>
            <li data-ok><IconCheck size={22} /><span><strong>{result.stats.stitches.toLocaleString()} stitches</strong> · {result.stats.minutes[0]}–{result.stats.minutes[1]} min · {result.stats.trims} trims</span></li>
          </ul>
          <button type="button" className="btn" onClick={() => window.print()}><IconPrint size={18} />Print thread list</button>
        </section>

        <section aria-label="Save" className="card" style={{ flex: '1.4 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <fieldset>
            <legend className="legend-lg">File format</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {FORMATS.map((x) => (
                <label key={x.id} className="choice">
                  <input type="radio" name="fmt" checked={fmt === x.id} onChange={() => setFmt(x.id)} />
                  <span style={{ flex: '1 1 auto' }}>
                    <strong style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600 }}>{x.label}</strong>
                    {x.id === 'pes' && <span className="badge" style={{ marginLeft: 8, background: 'var(--berry)', color: '#fff' }}>Recommended</span>}
                    <br /><span className="muted" style={{ fontSize: 15 }}>{x.note}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field">File name
            <span className="filename">
              <input value={name} maxLength={16} onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase())} />
              <span>.{f.ext}</span>
            </span>
            <span className="muted" style={{ fontWeight: 600, fontSize: 14 }}>Short names (8 letters) show best on older machine screens.</span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => void saveToStick()}><IconUsb size={22} />Save to USB stick</button>
            <button type="button" className="btn btn-lg" style={{ borderColor: 'var(--ink)' }} onClick={() => { download(bytes(), filename); setSaved(`Downloaded ${filename}.`); }}><IconDownload size={22} />Download</button>
          </div>
          {saved && <p className="saved" role="status">{saved}</p>}
          <p className="muted" style={{ fontSize: 14, marginTop: -8 }}>Saving straight to a USB stick works in Chrome and Edge. Other browsers download the file instead.</p>
          <button type="button" className="linkish" style={{ alignSelf: 'flex-start', minHeight: 44 }} onClick={saveProject}>Also save the project file, so you can edit it later on another computer</button>
        </section>

        <section aria-label="Getting it onto your machine" className="machine-card">
          <h2 style={{ fontSize: 22, marginBottom: 16 }}>Onto your machine</h2>
          <ol>
            <li><span>1</span><span><strong>Save to a USB stick.</strong> FAT32 sticks work best; keep the file in the top folder.</span></li>
            <li><span>2</span><span><strong>Plug it into your machine</strong> and open the USB designs on its screen.</span></li>
            <li><span>3</span><span><strong>Hoop with stabiliser</strong> and follow the thread list: {result.plan.threads.map((t) => t.name.replace(/ \(#\d+\)$/, '').toLowerCase()).join(', ')}.</span></li>
          </ol>
          <p className="machine-note">Machine with Wi-Fi? Download the file and send it with Brother's own app.</p>
        </section>
      </div>
    </div>
  );
}
