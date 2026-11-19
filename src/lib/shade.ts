import { DEFAULT_TREE_HEIGHT } from './defaults';
import { shadowOffset } from './sun';
import type { Building, Poly, Pt, Site, Tree } from './types';

export const CELL = 2; // metres per analysis cell

export interface Grid { nx: number; nz: number; w: number; d: number }
export const gridFor = (s: { w: number; d: number }): Grid => ({ nx: Math.ceil(s.w / CELL), nz: Math.ceil(s.d / CELL), w: s.w, d: s.d });
const cellArea = (g: Grid) => (g.w / g.nx) * (g.d / g.nz);
const cx = (g: Grid, x: number) => ((x + g.w / 2) * g.nx) / g.w;
const cz = (g: Grid, z: number) => ((z + g.d / 2) * g.nz) / g.d;

function mkCanvas(g: Grid) {
  const c = document.createElement('canvas');
  c.width = g.nx; c.height = g.nz;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function path(ctx: CanvasRenderingContext2D, g: Grid, pts: Pt[]) {
  pts.forEach(([x, z], i) => (i ? ctx.lineTo(cx(g, x), cz(g, z)) : ctx.moveTo(cx(g, x), cz(g, z))));
}

function fillPolys(ctx: CanvasRenderingContext2D, g: Grid, polys: Poly[], dx = 0, dz = 0) {
  for (const poly of polys) {
    ctx.beginPath();
    for (const r of poly) { path(ctx, g, r.map(([x, z]): Pt => [x + dx, z + dz])); ctx.closePath(); }
    ctx.fill('evenodd');
  }
}

function alphaMask(ctx: CanvasRenderingContext2D, g: Grid): Uint8Array {
  const d = ctx.getImageData(0, 0, g.nx, g.nz).data;
  const m = new Uint8Array(g.nx * g.nz);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return m;
}

/** Roads, pavements and streets (the paved realm we measure shade on). */
export function pavedMask(site: Site, g: Grid): Uint8Array {
  const ctx = mkCanvas(g);
  ctx.fillStyle = '#000';
  fillPolys(ctx, g, site.paved);
  return alphaMask(ctx, g);
}

export function buildingMask(buildings: Building[], g: Grid): Uint8Array {
  const ctx = mkCanvas(g);
  ctx.fillStyle = '#000';
  for (const b of buildings) { ctx.beginPath(); path(ctx, g, b.ring); ctx.fill(); }
  return alphaMask(ctx, g);
}

/** Building shadows: each footprint edge swept along the shadow vector. `g` can be the analysis grid or a high-res picture frame. */
export function paintBuildingShadow(ctx: CanvasRenderingContext2D, g: Grid, buildings: Building[], alt: number, az: number) {
  if (alt <= 0.02) return;
  for (const b of buildings) {
    const [dx, dz] = shadowOffset(b.height, alt, az);
    for (let i = 0; i < b.ring.length - 1; i++) {
      const [ax, az0] = b.ring[i], [bx, bz] = b.ring[i + 1];
      ctx.beginPath();
      path(ctx, g, [[ax, az0], [bx, bz], [bx + dx, bz + dz], [ax + dx, az0 + dz]]);
      ctx.fill();
    }
  }
}

/** Crown depth as a share of tree height. Thin crowns (0.10) fit the stations better than SOLWEIG's default (0.75); see docs/PROJECT_LOG.md section 8. */
export const CROWN_DEPTH = 0.1;

/** Shadow offsets of a crown spanning (1 - CROWN_DEPTH) x height to height, at most 1 m apart. A horizontal disc casts the same disc, shifted
 *  by height / tan(sun height); the crown's depth smears it into a stadium. */
function crownOffsets(height: number, alt: number, az: number): [number, number][] {
  const [x0, z0] = shadowOffset(height * (1 - CROWN_DEPTH), alt, az), [x1, z1] = shadowOffset(height, alt, az);
  const n = Math.min(12, Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0))));
  return Array.from({ length: n + 1 }, (_, i): [number, number] => [x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
}

/** Canopy shade: crown discs swept through the crown depth, and dense canopy patches drawn the same way. */
export function paintCanopyShade(ctx: CanvasRenderingContext2D, g: Grid, trees: Tree[], alt: number, az: number, forest: Poly[] = []) {
  if (alt <= 0.02) return;
  for (const t of trees) {
    for (const [dx, dz] of crownOffsets(t.height, alt, az)) {
      ctx.beginPath();
      ctx.ellipse(cx(g, t.x + dx), cz(g, t.z + dz), (t.radius * g.nx) / g.w, (t.radius * g.nz) / g.d, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const [fx, fz] of crownOffsets(DEFAULT_TREE_HEIGHT, alt, az)) fillPolys(ctx, g, forest, fx, fz);
}

export function buildingShadow(buildings: Building[], g: Grid, alt: number, az: number): Uint8Array {
  const ctx = mkCanvas(g);
  ctx.fillStyle = '#000';
  paintBuildingShadow(ctx, g, buildings, alt, az);
  return alphaMask(ctx, g);
}

export function canopyShade(trees: Tree[], g: Grid, alt: number, az: number, forest: Poly[] = []): Uint8Array {
  const ctx = mkCanvas(g);
  ctx.fillStyle = '#000';
  paintCanopyShade(ctx, g, trees, alt, az, forest);
  return alphaMask(ctx, g);
}

export interface ShadeResult {
  grid: Grid;
  pavedArea: number; // m²
  baselineFrac: number; // share of paved area shaded by buildings + existing trees
  scenarioFrac: number; // ... plus proposed trees
  newShadedM2: number; // paved area newly shaded by the proposals
  /** `paved` is the paving shade is counted on; `hard` is every paved cell (roads included), where nothing can be planted. */
  masks: { paved: Uint8Array; hard: Uint8Array; building: Uint8Array; bShade: Uint8Array; baseTree: Uint8Array; allTree: Uint8Array };
}

/** `walkOnly` counts shade on pavements and paths only, not road carriageways. The fit harness (src/surrogate/engine_shade.ts) keeps the default, so engine_shade.csv still reproduces. */
export function analyse(site: Site, trees: Tree[], alt: number, az: number, walkOnly = false): ShadeResult {
  const grid = gridFor(site);
  const hard = pavedMask(site, grid);
  const roads = walkOnly ? pavedMask({ ...site, paved: site.roads }, grid) : null;
  const paved = roads ? hard.map((v, i) => (v && !roads[i] ? 1 : 0)) : hard;
  const building = buildingMask(site.buildings, grid);
  const bShade = buildingShadow(site.buildings, grid, alt, az);
  const existing = trees.filter((t) => t.source !== 'proposed');
  const baseTree = canopyShade(existing, grid, alt, az, site.forest);
  const allTree = trees.length === existing.length ? baseTree : canopyShade(trees, grid, alt, az, site.forest);
  let cells = 0, b = 0, s = 0;
  for (let i = 0; i < paved.length; i++) {
    if (!paved[i] || building[i]) continue;
    cells++;
    if (bShade[i] || baseTree[i]) b++;
    if (bShade[i] || allTree[i]) s++;
  }
  const d = Math.max(cells, 1), a = cellArea(grid);
  return { grid, pavedArea: cells * a, baselineFrac: b / d, scenarioFrac: s / d, newShadedM2: (s - b) * a, masks: { paved, hard, building, bShade, baseTree, allTree } };
}

/** Visit the grid cells under a crown (a 10 m tree, as in `paintCanopyShade`), once each. */
function eachCell(g: Grid, x: number, z: number, radius: number, alt: number, az: number, f: (k: number) => void) {
  const rx = (radius * g.nx) / g.w, rz = (radius * g.nz) / g.d;
  const at = crownOffsets(DEFAULT_TREE_HEIGHT, alt, az).map(([dx, dz]) => [cx(g, x + dx), cz(g, z + dz)]);
  const xs = at.map((p) => p[0]), zs = at.map((p) => p[1]);
  for (let j = Math.floor(Math.min(...zs) - rz); j <= Math.ceil(Math.max(...zs) + rz); j++) for (let i = Math.floor(Math.min(...xs) - rx); i <= Math.ceil(Math.max(...xs) + rx); i++) {
    if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
    if (at.some(([px, pz]) => ((i + 0.5 - px) / rx) ** 2 + ((j + 0.5 - pz) / rz) ** 2 <= 1)) f(j * g.nx + i);
  }
}

/** Paved area (m²) a tree at (x, z) would newly shade, given what is shaded now. */
export function shadeGain(res: ShadeResult, x: number, z: number, radius: number, alt: number, az: number, shaded?: Uint8Array): number {
  const { paved, building, bShade, allTree } = res.masks;
  let c = 0;
  eachCell(res.grid, x, z, radius, alt, az, (k) => { if (paved[k] && !building[k] && !(shaded ? shaded[k] : bShade[k] || allTree[k])) c++; });
  return c * cellArea(res.grid);
}

export interface Spot { x: number; z: number; gainM2: number }

/** The same site analysed at one sun position. */
export interface View { res: ShadeResult; alt: number; az: number }

/**
 * Greedy tree siting: candidates are open ground within ~6 m of counted paving (off all paving, outside buildings).
 * Each pick maximises the counted, currently unshaded paving its crown newly covers, averaged over the sun positions in `views`
 * (the app passes 13:30, 14:30 and 15:30, the hours the cooling line covers). `gainM2` is that average.
 */
export function recommend(trees: Tree[], views: View[], count: number, radius: number): Spot[] {
  const g = views[0].res.grid, { paved, hard, building } = views[0].res.masks;
  const shaded = views.map(({ res: { masks: m } }) => m.bShade.map((v, i) => (v || m.allTree[i] ? 1 : 0)));

  const cands: Pt[] = [];
  for (let j = 3; j < g.nz - 3; j += 3) for (let i = 3; i < g.nx - 3; i += 3) {
    const k = j * g.nx + i;
    if (hard[k] || building[k]) continue;
    let near = false;
    for (let b = -3; b <= 3 && !near; b++) for (let a = -3; a <= 3; a++) if (paved[(j + b) * g.nx + i + a]) { near = true; break; }
    if (near) cands.push([((i + 0.5) * g.w) / g.nx - g.w / 2, ((j + 0.5) * g.d) / g.nz - g.d / 2]);
  }
  const taken = trees.map((t): Pt => [t.x, t.z]);
  const spots: Spot[] = [];
  for (let n = 0; n < count; n++) {
    let best: Spot | null = null;
    for (const [x, z] of cands) {
      if (taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < radius * 1.6)) continue;
      const gain = views.reduce((s, v, n) => s + shadeGain(v.res, x, z, radius, v.alt, v.az, shaded[n]), 0) / views.length;
      if (!best || gain > best.gainM2) best = { x, z, gainM2: gain };
    }
    if (!best || best.gainM2 <= 0) break;
    spots.push(best); taken.push([best.x, best.z]);
    const b = best;
    views.forEach((v, n) => eachCell(g, b.x, b.z, radius, v.alt, v.az, (k) => { shaded[n][k] = 1; }));
  }
  return spots;
}
