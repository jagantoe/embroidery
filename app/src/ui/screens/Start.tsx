import { useRef, useState } from 'react';
import { IconPlus, IconTrash, IconUpload } from '../components/Icons';
import { useStore } from '../store';

function ThreadArt() {
  return (
    <svg viewBox="0 0 1120 170" width="100%" style={{ display: 'block', maxWidth: 1120, margin: '8px 0 -6px' }} aria-hidden="true">
      <g className="np-wobble">
        <rect x="40" y="22" width="96" height="16" rx="8" fill="#D4A86F" />
        <rect x="52" y="38" width="72" height="92" fill="#C2255C" />
        <path d="M52 48h72M52 58h72M52 68h72M52 78h72M52 88h72M52 98h72M52 108h72M52 118h72" stroke="#8F1A44" strokeWidth="2" opacity=".55" />
        <rect x="40" y="130" width="96" height="16" rx="8" fill="#D4A86F" />
      </g>
      <path className="np-thread" d="M124 76C260 10 360 160 520 104S800 10 900 70 1010 120 1052 56" fill="none" stroke="#C2255C" strokeWidth="3" strokeLinecap="round" />
      <path className="np-ants" d="M160 150H420" fill="none" stroke="#0B7A75" strokeWidth="3" strokeLinecap="round" strokeDasharray="12 6" opacity=".7" />
      <g className="np-needle">
        <path d="M1060 20v104" stroke="#8C84AE" strokeWidth="5" strokeLinecap="round" />
        <ellipse cx="1060" cy="34" rx="2.5" ry="7" fill="#F7F5FF" />
        <path d="M1060 124l-3-8h6z" fill="#8C84AE" />
      </g>
      <g className="np-twinkle" style={{ animationDelay: '.2s' }}><path d="M640 30l10 10M650 30l-10 10" stroke="#FFB020" strokeWidth="3" strokeLinecap="round" /></g>
      <g className="np-twinkle" style={{ animationDelay: '.9s' }}><path d="M760 132l10 10M770 132l-10 10" stroke="#0B7A75" strokeWidth="3" strokeLinecap="round" /></g>
      <g className="np-twinkle" style={{ animationDelay: '1.6s' }}><path d="M300 26l8 8M308 26l-8 8" stroke="#5B47C9" strokeWidth="3" strokeLinecap="round" /></g>
      <g className="np-roll">
        <circle cx="960" cy="146" r="16" fill="#5B47C9" />
        <path d="M948 138c8 4 16 4 24 0M946 148c9 5 19 5 28 0M952 157c6 2 12 2 18 0" fill="none" stroke="#E9E4FF" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

const fmtDate = (t: number) => {
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'edited today';
  return `edited ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
};

export function Start() {
  const { openFile, openExample, recent, openProject, deleteProject } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onFiles = (files: FileList | null) => { if (files && files[0]) void openFile(files[0]); };

  return (
    <>
      <div className="page start" style={{ maxWidth: 1120, display: 'flex', flexDirection: 'column', gap: 40, paddingTop: 48 }}>
        <section aria-labelledby="start-title" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <h1 id="start-title" style={{ fontWeight: 700, fontSize: 'clamp(40px, 5.5vw, 64px)', lineHeight: 1.05, marginBottom: 12 }}>
            Picture in, <span style={{ color: 'var(--berry)' }}>stitches</span> out.
          </h1>
          <p className="muted" style={{ maxWidth: 620, fontSize: 19, textWrap: 'balance' }}>
            A free, open-source tool that turns PNG and SVG images into .pes files for Brother embroidery machines. It runs entirely in your browser.
          </p>
          <ThreadArt />
          <label
            htmlFor="file"
            className="np-drop"
            data-over={over}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
            style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '56px 24px', borderRadius: 32, background: over ? 'var(--berry-tint)' : 'var(--surface)', cursor: 'pointer', transition: 'background .2s' }}
          >
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }} aria-hidden="true">
              <rect className="np-ants" x="0" y="0" width="100%" height="100%" rx="32" fill="none" stroke={over ? '#C2255C' : '#B9AEEA'} strokeWidth="6" strokeDasharray="14 10" />
            </svg>
            <span style={{ width: 72, height: 72, borderRadius: 22, background: 'var(--berry-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--berry)' }}><IconUpload size={34} /></span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 28 }}>{over ? 'Let go to start' : 'Drop an image to start'}</span>
            <span className="muted">PNG, JPG or SVG · or <span style={{ color: 'var(--berry)', fontWeight: 700, textDecoration: 'underline' }}>browse your files</span></span>
            <input id="file" ref={input} type="file" accept=".png,.jpg,.jpeg,.svg,.webp,.json,image/png,image/jpeg,image/svg+xml" className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <p style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 20px', fontSize: 15, fontWeight: 600 }} className="muted">
            <button type="button" className="linkish" onClick={() => void openExample()}>Try the example shield</button>
            <span>Free and open source (GPL-3.0)</span>
            <span>Nothing is uploaded</span>
            <span>Exports .pes, .dst, .exp</span>
          </p>
        </section>

        <section aria-labelledby="recent-title">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <h2 id="recent-title" style={{ fontSize: 24 }}>Pick up where you left off</h2>
            <span className="muted" style={{ fontSize: 14 }}>Saved in this browser only</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {recent.map((m) => (
              <div key={m.id} className="np-card recent-card">
                <button type="button" className="recent-open" onClick={() => void openProject(m.id)}>
                  <span className="recent-thumb">{m.thumb ? <img src={m.thumb} alt="" /> : null}</span>
                  <span><strong style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18 }}>{m.name}</strong><br /><span className="muted" style={{ fontSize: 14 }}>{m.summary} · {fmtDate(m.updated)}</span></span>
                </button>
                <button type="button" className="icon-btn recent-del" aria-label={`Delete ${m.name}`} onClick={() => { if (confirm(`Delete "${m.name}" from this browser?`)) void deleteProject(m.id); }}><IconTrash size={18} /></button>
              </div>
            ))}
            <button type="button" className="np-card new-card" onClick={() => input.current?.click()}>
              <IconPlus size={28} />New design
            </button>
          </div>
        </section>

        <section aria-labelledby="how-title" style={{ borderRadius: 28, background: 'var(--surface)', padding: '24px 28px' }}>
          <h2 id="how-title" style={{ fontSize: 24, marginBottom: 16 }}>How it works</h2>
          <ol className="how">
            <li><span style={{ background: 'var(--berry)' }}>1</span><span><strong>Drop a picture.</strong> Flat colours work best: logos, crests, clip art.</span></li>
            <li><span style={{ background: 'var(--teal)' }}>2</span><span><strong>Check the stitches.</strong> Auto-digitize, then tweak anything in the editor.</span></li>
            <li><span style={{ background: 'var(--ink)' }}>3</span><span><strong>Save to USB.</strong> Plug it into your machine and sew.</span></li>
          </ol>
        </section>
      </div>
      <footer style={{ background: 'var(--surface)' }}>
        <div className="np-stitch-rule quiet" aria-hidden="true" />
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 24px', display: 'flex', flexWrap: 'wrap', gap: '8px 24px', justifyContent: 'space-between', fontSize: 14 }} className="muted">
          <p>Open source under GPL-3.0 · <a href="https://github.com/" target="_blank" rel="noreferrer">Contribute</a></p>
          <p>Not affiliated with Brother Industries.</p>
        </div>
      </footer>
    </>
  );
}
