// Loading pictures and turning them into rasters for the digitizer.
import type { RasterInput } from '../core/digitize';

export interface SourceImage {
  name: string;
  kind: 'svg' | 'raster';
  dataUrl: string;
  /** natural pixel size used for the aspect ratio */
  pxW: number;
  pxH: number;
  /** physical size if the file declares one (SVG with mm/cm/in units) */
  mmW?: number;
  mmH?: number;
  shapes?: number;
}

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };

function parseLength(v: string | null): { value: number; unit: string } | null {
  if (!v) return null;
  const m = /^\s*([0-9.]+)\s*(mm|cm|in|pt|pc|px)?\s*$/.exec(v);
  if (!m) return null;
  return { value: parseFloat(m[1]), unit: m[2] ?? '' };
}

const readAs = (file: Blob, how: 'text' | 'dataUrl') => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error);
  if (how === 'text') r.readAsText(file); else r.readAsDataURL(file);
});

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('This picture could not be opened.'));
    img.src = src;
  });
}

export async function loadSource(file: Blob, name: string): Promise<SourceImage> {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(name);
  if (isSvg) {
    const text = await readAs(file, 'text');
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.nodeName.toLowerCase() !== 'svg') throw new Error('This SVG file could not be read.');
    const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
    const wl = parseLength(svg.getAttribute('width')), hl = parseLength(svg.getAttribute('height'));
    let pxW = vb.length === 4 ? vb[2] : wl?.value ?? 300;
    let pxH = vb.length === 4 ? vb[3] : hl?.value ?? 300;
    let mmW: number | undefined, mmH: number | undefined;
    if (wl && hl && wl.unit && wl.unit !== 'px') { mmW = wl.value * UNIT_MM[wl.unit]; mmH = hl.value * UNIT_MM[hl.unit]; }
    // make sure the SVG has an explicit pixel size so every browser can rasterise it
    const scale = 2000 / Math.max(pxW, pxH);
    pxW *= scale; pxH *= scale;
    if (vb.length !== 4 && wl && hl) svg.setAttribute('viewBox', `0 0 ${wl.value} ${hl.value}`);
    svg.setAttribute('width', String(pxW));
    svg.setAttribute('height', String(pxH));
    const shapes = svg.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line').length;
    const fixed = new XMLSerializer().serializeToString(svg);
    const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(fixed)));
    await loadImg(dataUrl); // validate
    return { name, kind: 'svg', dataUrl, pxW, pxH, mmW, mmH, shapes };
  }
  const dataUrl = await readAs(file, 'dataUrl');
  const img = await loadImg(dataUrl);
  return { name, kind: 'raster', dataUrl, pxW: img.naturalWidth, pxH: img.naturalHeight };
}

/** Draw the picture at the design size and return its pixels. */
export async function rasterize(src: SourceImage, widthMm: number, heightMm: number, pxPerMm: number): Promise<RasterInput> {
  const img = await loadImg(src.dataUrl);
  const w = Math.max(8, Math.round(widthMm * pxPerMm)), h = Math.max(8, Math.round(heightMm * pxPerMm));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h).data;
  return { rgba: data, w, h, pxPerMm };
}

/** Small preview for the "recent projects" list. */
export async function thumbnail(src: SourceImage, size = 240): Promise<string> {
  const img = await loadImg(src.dataUrl);
  const s = size / Math.max(src.pxW, src.pxH);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(src.pxW * s); canvas.height = Math.round(src.pxH * s);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
