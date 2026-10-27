// App state: the open project, the latest digitizer result, navigation and persistence.
import { del, get, set } from 'idb-keyval';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { chooseResolution, emptyEdits, type Edits } from '../core/digitize';
import { HOOPS, type DesignSettings, type DigitizeResult } from '../core/types';
import { digitizeAll, replan } from './engine';
import { loadSource, rasterize, thumbnail, type SourceImage } from './image';

export type Screen = 'start' | 'setup' | 'editor' | 'simulator' | 'export';

export interface Project {
  id: string;
  name: string;
  created: number;
  updated: number;
  source: SourceImage;
  settings: DesignSettings;
  edits: Edits;
  thumb?: string;
  digitized: boolean;
}

export interface ProjectMeta { id: string; name: string; updated: number; thumb?: string; summary: string }

interface Store {
  screen: Screen;
  go: (s: Screen) => void;
  project: Project | null;
  updateProject: (fn: (p: Project) => Project) => void;
  updateSettings: (patch: Partial<DesignSettings>) => void;
  updateEdits: (fn: (e: Edits) => Edits) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  result: DigitizeResult | null;
  busy: string | null;
  error: string | null;
  setError: (e: string | null) => void;
  selected: string | null;
  select: (id: string | null) => void;
  openFile: (file: File) => Promise<void>;
  openExample: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  digitize: () => Promise<void>;
  recent: ProjectMeta[];
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
};

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Run a DOM update inside a View Transition when the browser supports it. */
export function withTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || reducedMotion()) { update(); return; }
  doc.startViewTransition(() => flushSync(update));
}

export function fitToHoop(source: SourceImage, hoopId: string) {
  const hoop = HOOPS.find((h) => h.id === hoopId) ?? HOOPS[0];
  const maxW = hoop.w - 6, maxH = hoop.h - 6;
  const aspect = source.pxW / source.pxH;
  let w = source.mmW ?? maxW, h = w / aspect;
  if (w > maxW) { w = maxW; h = w / aspect; }
  if (h > maxH) { h = maxH; w = h * aspect; }
  return { widthMm: Math.round(w * 10) / 10, heightMm: Math.round(h * 10) / 10 };
}

const uid = () => Math.random().toString(36).slice(2, 10);
const LIST_KEY = 'np:projects';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('start');
  const [project, setProject] = useState<Project | null>(null);
  const [result, setResult] = useState<DigitizeResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [recent, setRecent] = useState<ProjectMeta[]>([]);
  const analysedFor = useRef<string | null>(null);
  const planTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const past = useRef<Edits[]>([]);
  const future = useRef<Edits[]>([]);
  const [histTick, setHistTick] = useState(0);

  useEffect(() => { get<ProjectMeta[]>(LIST_KEY).then((l) => setRecent(l ?? [])).catch(() => setRecent([])); }, []);

  const go = useCallback((s: Screen) => {
    withTransition(() => setScreen(s));
    window.scrollTo({ top: 0 });
  }, []);

  // autosave (debounced)
  useEffect(() => {
    if (!project) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await set(`np:project:${project.id}`, project);
        const meta: ProjectMeta = {
          id: project.id, name: project.name, updated: project.updated, thumb: project.thumb,
          summary: `${(HOOPS.find((h) => h.id === project.settings.hoopId) ?? HOOPS[0]).label}${result ? ` · ${result.plan.threads.length} colours` : ''}`,
        };
        const list = [meta, ...((await get<ProjectMeta[]>(LIST_KEY)) ?? []).filter((m) => m.id !== project.id)].slice(0, 24);
        await set(LIST_KEY, list);
        setRecent(list);
      } catch { /* storage can be unavailable (private mode); the app still works */ }
    }, 600);
  }, [project, result]);

  const updateProject = useCallback((fn: (p: Project) => Project) => {
    setProject((p) => (p ? { ...fn(p), updated: Date.now() } : p));
  }, []);

  const runPlan = useCallback((p: Project) => {
    window.clearTimeout(planTimer.current);
    planTimer.current = window.setTimeout(async () => {
      try { setResult(await replan(p.settings, p.edits)); } catch (e) { setError(String((e as Error).message)); }
    }, 120);
  }, []);

  const applyEdits = useCallback((edits: Edits) => {
    setProject((p) => {
      if (!p) return p;
      const next = { ...p, edits, updated: Date.now() };
      if (analysedFor.current) runPlan(next);
      return next;
    });
  }, [runPlan]);

  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;

  const updateEdits = useCallback((fn: (e: Edits) => Edits) => {
    const p = projectRef.current;
    if (!p) return;
    past.current.push(p.edits);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    setHistTick((t) => t + 1);
    applyEdits(fn(p.edits));
  }, [applyEdits]);

  const undo = useCallback(() => {
    const p = projectRef.current;
    const prev = past.current.pop();
    if (!p || !prev) return;
    future.current.push(p.edits);
    setHistTick((t) => t + 1);
    applyEdits(prev);
  }, [applyEdits]);

  const redo = useCallback(() => {
    const p = projectRef.current;
    const next = future.current.pop();
    if (!p || !next) return;
    past.current.push(p.edits);
    setHistTick((t) => t + 1);
    applyEdits(next);
  }, [applyEdits]);

  const updateSettings = useCallback((patch: Partial<DesignSettings>) => {
    setProject((p) => {
      if (!p) return p;
      const next = { ...p, settings: { ...p.settings, ...patch }, updated: Date.now() };
      // size or colour count changes need a fresh analysis; other settings only re-plan
      const needsAnalysis = 'widthMm' in patch || 'heightMm' in patch || 'maxColours' in patch || 'border' in patch || 'borderMm' in patch || 'mode' in patch;
      if (needsAnalysis) { analysedFor.current = null; next.digitized = false; }
      else if (analysedFor.current) runPlan(next);
      return next;
    });
  }, [runPlan]);

  const startProject = useCallback(async (source: SourceImage) => {
    const hoopId = '100x100';
    const size = fitToHoop(source, hoopId);
    const thumb = await thumbnail(source).catch(() => undefined);
    const p: Project = {
      id: uid(), name: source.name.replace(/\.[a-z0-9]+$/i, ''), created: Date.now(), updated: Date.now(), source, thumb,
      settings: { hoopId, ...size, fabric: 'woven', mode: 'patch', maxColours: 8 },
      edits: emptyEdits(), digitized: false,
    };
    analysedFor.current = null;
    past.current = []; future.current = [];
    setResult(null);
    setSelected(null);
    setProject(p);
    go('setup');
  }, [go]);

  const openFile = useCallback(async (file: File) => {
    setError(null);
    if (/\.json$/i.test(file.name)) {
      try {
        const data = JSON.parse(await file.text());
        if (data?.format !== 'needle-and-pixel' || !data.project?.source) throw new Error('bad');
        const p: Project = { ...data.project, id: uid(), updated: Date.now() };
        await set(`np:project:${p.id}`, p);
        setProject(p);
        past.current = []; future.current = [];
        setBusy('Opening your design…');
        if (p.digitized) { await runAnalysisRef.current!(p); go('editor'); } else go('setup');
      } catch { setError('That project file could not be opened.'); } finally { setBusy(null); }
      return;
    }
    if (!/\.(png|jpe?g|svg|webp|gif)$/i.test(file.name) && !/^image\//.test(file.type)) {
      setError('Please choose a PNG, JPG or SVG picture.');
      return;
    }
    try {
      setBusy('Opening your picture…');
      await startProject(await loadSource(file, file.name));
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }, [startProject]);

  const openExample = useCallback(async () => {
    setError(null);
    try {
      setBusy('Opening the example…');
      const res = await fetch(`${import.meta.env.BASE_URL}examples/flanders.png`);
      await startProject(await loadSource(await res.blob(), 'flanders.png'));
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }, [startProject]);

  const runAnalysis = useCallback(async (p: Project) => {
    const ppm = chooseResolution(p.settings.widthMm, p.settings.heightMm);
    const raster = await rasterize(p.source, p.settings.widthMm, p.settings.heightMm, ppm);
    const r = await digitizeAll(raster, p.settings, p.edits);
    analysedFor.current = p.id;
    setResult(r);
    return r;
  }, []);

  const runAnalysisRef = useRef<((p: Project) => Promise<DigitizeResult>) | null>(null);
  runAnalysisRef.current = runAnalysis;

  const digitize = useCallback(async () => {
    if (!project) return;
    setError(null);
    try {
      setBusy('Digitizing your design…');
      await runAnalysis(project);
      setProject({ ...project, digitized: true, updated: Date.now() });
      go('editor');
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }, [project, runAnalysis, go]);

  const openProject = useCallback(async (id: string) => {
    setError(null);
    try {
      setBusy('Opening your design…');
      const p = await get<Project>(`np:project:${id}`);
      if (!p) throw new Error('That design could not be found in this browser.');
      setProject(p);
      setSelected(null);
      past.current = []; future.current = [];
      if (p.digitized) { await runAnalysis(p); go('editor'); } else go('setup');
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }, [runAnalysis, go]);

  const deleteProject = useCallback(async (id: string) => {
    try {
      await del(`np:project:${id}`);
      const list = ((await get<ProjectMeta[]>(LIST_KEY)) ?? []).filter((m) => m.id !== id);
      await set(LIST_KEY, list);
      setRecent(list);
    } catch { /* ignore */ }
  }, []);

  const value = useMemo<Store>(() => ({
    screen, go, project, updateProject, updateSettings, updateEdits, undo, redo,
    canUndo: histTick >= 0 && past.current.length > 0, canRedo: histTick >= 0 && future.current.length > 0, result, busy, error, setError,
    selected, select: setSelected, openFile, openExample, openProject, deleteProject, digitize, recent,
  }), [screen, go, project, updateProject, updateSettings, updateEdits, undo, redo, histTick, result, busy, error, selected, openFile, openExample, openProject, deleteProject, digitize, recent]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
