import { HOOPS } from '../core/types';
import { BusySpool, IconCode, IconX, Spool } from './components/Icons';
import { Editor } from './screens/Editor';
import { ExportScreen } from './screens/Export';
import { Setup } from './screens/Setup';
import { Simulator } from './screens/Simulator';
import { Start } from './screens/Start';
import { StoreProvider, useStore, type Screen } from './store';


const STEPS: { id: Screen; label: string }[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'editor', label: 'Edit' },
  { id: 'simulator', label: 'Preview' },
  { id: 'export', label: 'Export' },
];

function TopBar() {
  const { screen, go, project, result } = useStore();
  const idx = STEPS.findIndex((s) => s.id === screen);
  const dark = screen === 'simulator';
  return (
    <header className="topbar" data-dark={dark}>
      <div className="topbar-inner">
        <button type="button" className="brand" onClick={() => go('start')} aria-label="Needle & Pixel home">
          <Spool size={38} />
          <span>Needle &amp; Pixel</span>
        </button>
        {project && screen !== 'start' ? (
          <ol className="steps" aria-label="Progress" style={{ flex: '1 1 420px' }}>
            {STEPS.map((s, i) => {
              const reachable = s.id === 'setup' || (!!result && project.digitized);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={s.id === screen ? 'step' : undefined}
                    data-state={i < idx ? 'done' : undefined}
                    disabled={!reachable || s.id === screen}
                    onClick={() => go(s.id)}
                  >{i + 1} · {s.label}</button>
                </li>
              );
            })}
          </ol>
        ) : <span style={{ flex: '1 1 40px' }} />}
        <nav aria-label="Links" style={{ display: 'flex', gap: '4px 20px', fontWeight: 700, flexWrap: 'wrap' }}>
          <a className="toplink" href="https://github.com/" target="_blank" rel="noreferrer"><IconCode size={18} />Source code</a>
        </nav>
      </div>
      <div className="np-stitch-rule" aria-hidden="true" />
    </header>
  );
}

function Shell() {
  const { screen, busy, error, setError, project } = useStore();
  return (
    <div className="app" data-screen={screen}>
      <TopBar />
      <main id="main" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column' }}>
        {screen === 'start' && <Start />}
        {screen === 'setup' && project && <Setup />}
        {screen === 'editor' && project && <Editor />}
        {screen === 'simulator' && project && <Simulator />}
        {screen === 'export' && project && <ExportScreen />}
      </main>
      {busy && (
        <div className="busy" role="status" aria-live="polite">
          <div className="busy-card"><BusySpool /><p>{busy}</p></div>
        </div>
      )}
      {error && (
        <div className="toast" role="alert">
          <p>{error}</p>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setError(null)}><IconX /></button>
        </div>
      )}
      <PrintThreads />
    </div>
  );
}

/** Printable thread list (shown only when printing). */
function PrintThreads() {
  const { project, result } = useStore();
  if (!project || !result) return null;
  const hoop = HOOPS.find((h) => h.id === project.settings.hoopId);
  return (
    <section className="print-only" aria-hidden="true">
      <h1>{project.name}</h1>
      <p>{result.stats.widthMm.toFixed(0)} × {result.stats.heightMm.toFixed(0)} mm · {hoop?.label} hoop · {result.stats.stitches.toLocaleString()} stitches</p>
      <ol>
        {result.plan.threads.map((t) => <li key={t.id}>{t.name}</li>)}
      </ol>
    </section>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
