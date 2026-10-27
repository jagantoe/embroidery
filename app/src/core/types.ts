// Shared types for the digitizer, writers and UI.
// All design geometry is in millimetres, Y axis pointing down.

export type Cmd = 'stitch' | 'jump' | 'trim' | 'colour' | 'end';

export interface StitchPoint {
  x: number;
  y: number;
  cmd: Cmd;
}

export type RGB = [number, number, number];

export interface Thread {
  id: string;
  rgb: RGB;          // colour from the source image
  pec: number;       // Brother PEC palette index 1-64
  name: string;      // display name, e.g. "Brother 29 White"
  skip?: boolean;    // not sewn (e.g. matches fabric)
}

/**
 * A stitch plan: a flat list of needle moves. A 'colour' command switches to the
 * next thread in `threadOrder`; the first block uses threadOrder[0].
 */
export interface StitchPlan {
  stitches: StitchPoint[];
  threads: Thread[];      // in sewing order, one per colour block
}

export type StitchType = 'running' | 'satin' | 'fill';

export interface ObjectParams {
  type: StitchType;
  angle: number;          // degrees, fill only
  spacing: number;        // mm between rows / satin zigzags
  length: number;         // mm max stitch length (fill/running)
  pullComp: number;       // mm added per side
  underlay: boolean;
  triple: boolean;        // running: bean stitch
}

export interface DesignObject {
  id: string;
  name: string;
  threadId: string;
  /** Pixel indices (in the work raster) belonging to this object. */
  pixelCount: number;
  areaMm2: number;
  maxWidthMm: number;
  bbox: [number, number, number, number]; // mm
  auto: StitchType;       // what auto-classification picked
  params: ObjectParams;
  hidden?: boolean;
}

export type FabricPreset = 'woven' | 'knit' | 'towel' | 'cap';
export type OutputMode = 'patch' | 'onFabric';

export interface Hoop {
  id: string;
  label: string;
  w: number; // mm
  h: number;
}

export const HOOPS: Hoop[] = [
  { id: '100x100', label: '10 × 10 cm', w: 100, h: 100 },
  { id: '130x180', label: '13 × 18 cm', w: 130, h: 180 },
  { id: '160x260', label: '16 × 26 cm', w: 160, h: 260 },
  { id: '200x300', label: '20 × 30 cm', w: 200, h: 300 },
  { id: '240x360', label: '24 × 36 cm', w: 240, h: 360 },
  { id: '272x408', label: '27.2 × 40.8 cm', w: 272, h: 408 },
];

export interface DesignSettings {
  hoopId: string;
  widthMm: number;
  heightMm: number;
  fabric: FabricPreset;
  mode: OutputMode;
  maxColours: number;
  /** patch mode: satin border around the outside edge (default on) */
  border?: boolean;
  /** border width in mm (default 3.5) */
  borderMm?: number;
}

export interface DigitizeResult {
  objects: DesignObject[];
  threads: Thread[];
  /** objects in sewing order (ids) */
  order: string[];
  plan: StitchPlan;
  /** per-object stitch ranges into plan.stitches (for highlighting) */
  ranges: Record<string, [number, number]>;
  warnings: Warning[];
  stats: PlanStats;
  /** label raster: object index+1 per pixel, 0 = empty */
  labels: Int32Array;
  rasterW: number;
  rasterH: number;
  pxPerMm: number;
}

export interface Warning {
  id: string;
  level: 'info' | 'warn';
  text: string;
  objectId?: string;
}

export interface PlanStats {
  stitches: number;
  colourChanges: number;
  trims: number;
  jumpsMm: number;
  widthMm: number;
  heightMm: number;
  minutes: [number, number];
}
