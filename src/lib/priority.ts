import { AFTERNOON_HOURS, FIT_DAY } from './evidence';
import { NUS_LL, campusBounds, nusSite, type NusData } from './nus';
import { analyse, type Grid } from './shade';
import { solarPosition, sgDate } from './sun';

/**
 * Heat need = exposure only: paved ground in the sun, averaged over the validated afternoon window.
 * It uses no pedestrian counts, and it is the same sunlit paved area the validated cooling line turns into °C.
 */
export const EXPOSURE_HOURS = AFTERNOON_HOURS;
export const BLOCK_M = 100;

export interface Block { cx: number; cz: number; sunlitM2: number; pavedM2: number }

/** Sunlit paved m² per square block. `shaded[h]` marks cells in building or tree shade at hour h; origin (ox, oz) shifts the grid to campus metres. */
export function exposureBlocks(g: Grid, paved: Uint8Array, building: Uint8Array, shaded: Uint8Array[], ox = 0, oz = 0, block = BLOCK_M): Block[] {
  const cw = g.w / g.nx, cd = g.d / g.nz, a = cw * cd;
  const acc = new Map<string, Block>();
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
    const k = j * g.nx + i;
    if (!paved[k] || building[k]) continue;
    const x = ox - g.w / 2 + (i + 0.5) * cw, z = oz - g.d / 2 + (j + 0.5) * cd;
    const bx = Math.floor(x / block), bz = Math.floor(z / block), key = `${bx},${bz}`;
    let b = acc.get(key);
    if (!b) acc.set(key, (b = { cx: (bx + 0.5) * block, cz: (bz + 0.5) * block, sunlitM2: 0, pavedM2: 0 }));
    b.pavedM2 += a;
    b.sunlitM2 += (a * shaded.reduce((s, m) => s + (m[k] ? 0 : 1), 0)) / shaded.length;
  }
  return [...acc.values()].sort((p, q) => q.sunlitM2 - p.sunlitM2);
}

/** Whole-campus exposure on pavements and paths (roads left out), with the shade engine (needs a browser canvas): existing buildings and trees only.
 *  Sun of the clear fitted day (10 April 2025), the date the station test in the log used. */
export function campusExposure(data: NusData): Block[] {
  const b = campusBounds(data);
  const area = { cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2, w: b.x1 - b.x0, d: b.z1 - b.z0 };
  const site = nusSite(data, area);
  const day = new Date(FIT_DAY.clear);
  const shaded: Uint8Array[] = [];
  let first: ReturnType<typeof analyse> | null = null;
  for (const h of EXPOSURE_HOURS) {
    const sun = solarPosition(sgDate(h, day), NUS_LL.lat, NUS_LL.lng);
    const r = analyse(site, site.trees, sun.alt, sun.az, true); // people walk on pavements, not in the carriageway
    first ??= r;
    shaded.push(r.masks.bShade.map((v, i) => (v || r.masks.allTree[i] ? 1 : 0)));
  }
  return exposureBlocks(first!.grid, first!.masks.paved, first!.masks.building, shaded, area.cx, area.cz);
}
