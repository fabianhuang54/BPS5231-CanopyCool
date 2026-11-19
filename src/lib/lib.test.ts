import { describe, expect, it } from 'vitest';
import { inRing, inPoly, ringArea } from './geo';
import { computeImpact } from './impact';
import { exposureBlocks } from './priority';
import { AFTERNOON_HOURS, COEFF, FIT_DAY } from './evidence';
import { sgDate, shadowOffset, solarPosition } from './sun';
import { recommend, shadeGain, type ShadeResult } from './shade';
import type { Site, Tree } from './types';

const deg = (r: number) => (r * 180) / Math.PI;

describe('sun', () => {
  it('is near-overhead at solar noon on the equator at the March equinox', () => {
    // 2026-03-20 is within a day of the equinox; ~12:07 local solar noon at 103.8°E is ~05:00 UTC
    const { alt } = solarPosition(new Date('2026-03-20T05:07:00Z'), 0, 103.8);
    expect(deg(alt)).toBeGreaterThan(85);
  });
  it('fitted days give the fitted sun: 81.0 degrees high at 13:30 on the clear day (independent NOAA value), wherever the browser is', () => {
    expect(deg(solarPosition(sgDate(13.5, new Date(FIT_DAY.clear)), 1.2993, 103.7751).alt)).toBeCloseTo(81.02, 1);
    expect(deg(solarPosition(sgDate(15.5, new Date(FIT_DAY.typical)), 1.2993, 103.7751).alt)).toBeCloseTo(52.15, 1);
  });
  it('is below the horizon at local midnight', () => {
    expect(solarPosition(new Date('2026-06-21T16:00:00Z'), 1.28, 103.85).alt).toBeLessThan(0);
  });
  it('casts the shadow away from the sun: afternoon sun in the west puts shade to the east (+x)', () => {
    const [dx] = shadowOffset(10, Math.PI / 4, (270 * Math.PI) / 180);
    expect(dx).toBeGreaterThan(9);
  });
});

describe('geo', () => {
  const sq: [number, number][] = [[0, 0], [2, 0], [2, 2], [0, 2]];
  it('point in ring, and holes are respected', () => {
    expect(inRing(1, 1, sq)).toBe(true);
    expect(inRing(3, 1, sq)).toBe(false);
    const hole: [number, number][] = [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5]];
    expect(inPoly(1, 1, [sq, hole])).toBe(false);
    expect(inPoly(0.2, 0.2, [sq, hole])).toBe(true);
  });
  it('ring area', () => { expect(ringArea(sq)).toBe(4); });
});

describe('impact', () => {
  const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10], [x, 0]];
  const b = (id: number, x: number, outside = false) => ({ id, ring: sq(x), height: 10, heightRecorded: true, floors: 0, floorsBelow: 0, footprint: 100, pvM2: 0, greenRoofM2: 0, outside });
  const site: Site = { w: 300, d: 300, trees: [], generated: [], buildings: [b(1, 0), b(2, 50), b(3, 500, true)], paved: [], roads: [], turf: [], shrubs: [], forest: [], roofGreen: [], pv: [] };
  const res = (before: number, after: number) => ({ baselineFrac: before, scenarioFrac: after, newShadedM2: 0 } as ShadeResult);
  const tree: Tree = { id: 'p', x: 0, z: 0, radius: 4, height: 10, source: 'proposed' };

  it('reports zero cooling when nothing changes', () => {
    const im = computeImpact(site, [], res(0.3, 0.3), new Set());
    expect(im.airTotal).toBe(0);
    expect(im.areaMean.utci).toBe(0);
  });
  it('scales the published coefficients by the extra shaded share', () => {
    const im = computeImpact(site, [tree], res(0.2, 0.3), new Set());
    expect(im.areaMean.air).toBeCloseTo(COEFF.airShade.value * 0.1);
    expect(im.areaMean.utci).toBeCloseTo(COEFF.utciShade.value * 0.1);
    expect(im.inShade.air).toBe(COEFF.airShade.value); // people in the new shade get the full measured difference
    expect(im.addedCanopyM2).toBeCloseTo(Math.PI * 16);
  });
  it('uses the SOLWEIG-fitted feels-like slope inside 13:00-16:00 and the published figure outside', () => {
    const inside = computeImpact(site, [tree], res(0.2, 0.3), new Set(), { hour: 14.5, sky: 'clear' });
    expect(inside.utciValidated).toBe(true);
    expect(inside.areaMean.utci).toBeCloseTo(6.34 * 0.1);
    const outside = computeImpact(site, [tree], res(0.2, 0.3), new Set(), { hour: 9, sky: 'clear' });
    expect(outside.utciValidated).toBe(false);
    expect(outside.areaMean.utci).toBeCloseTo(COEFF.utciShade.value * 0.1);
  });
  it('the afternoon sun times are the middles of the three fitted hours', () => { expect(AFTERNOON_HOURS).toEqual([13.5, 14.5, 15.5]); });
  it('a green roof does not count the roof area already under solar panels', () => {
    const pv = { ...site, buildings: [{ ...site.buildings[0], pvM2: 40 }, site.buildings[1], site.buildings[2]] };
    expect(computeImpact(pv, [], res(0, 0), new Set([1])).greenRoofM2).toBe(60);
  });
  it('a green roof leaves out mapped greenery too and never goes below zero', () => {
    const at = (pvM2: number, greenRoofM2: number) => computeImpact({ ...site, buildings: [{ ...site.buildings[0], pvM2, greenRoofM2 }, site.buildings[1], site.buildings[2]] }, [], res(0, 0), new Set([1])).greenRoofM2;
    expect(at(40, 30)).toBe(30);
    expect(at(80, 80)).toBe(0);
  });
  it('green roof share ignores buildings outside the selected area', () => {
    const im = computeImpact(site, [], res(0, 0), new Set([1]));
    expect(im.roofAir).toBeCloseTo(COEFF.roofAir.value * 0.5); // 1 of the 2 buildings inside
  });
});

describe('exposure blocks', () => {
  // 4x2 cells of 50 m covering x 0..200, z 0..100 -> two 100 m blocks (cells 0,1,4,5 and 2,3,6,7)
  const g = { nx: 4, nz: 2, w: 200, d: 100 };
  const ones = new Uint8Array(8).fill(1), none = new Uint8Array(8);
  it('counts sunlit paved area averaged over the hours and ranks the sunnier block first', () => {
    const h1 = Uint8Array.from([1, 1, 1, 1, 1, 1, 0, 0]); // left block shaded; right block 2 of 4 cells sunlit
    const h2 = Uint8Array.from([1, 1, 0, 0, 1, 1, 0, 0]); // left shaded; right fully sunlit
    const blocks = exposureBlocks(g, ones, none, [h1, h2], 100, 50);
    expect(blocks.map((b) => b.cx)).toEqual([150, 50]);
    expect(blocks[0].sunlitM2).toBeCloseTo(7500); // (2 + 4) / 2 cells x 2500 m2
    expect(blocks[1].sunlitM2).toBe(0);
    expect(blocks[0].pavedM2).toBe(10000);
  });
  it('ignores buildings and unpaved ground', () => {
    const paved = Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(exposureBlocks(g, paved, none, [none], 100, 50).map((b) => b.pavedM2)).toEqual([2500]);
    expect(exposureBlocks(g, paved, paved, [none], 100, 50)).toEqual([]);
  });
});

describe('recommend', () => {
  // 40 x 40 m at 2 m cells: a footpath strip (cells 8-11) beside a road strip (12-14); the road is hard ground but not counted
  const n = 20, grid = { nx: n, nz: n, w: 40, d: 40 };
  const col = (a: number, b: number) => Uint8Array.from({ length: n * n }, (_, k) => (k % n >= a && k % n <= b ? 1 : 0));
  const none = new Uint8Array(n * n);
  const res = { grid, masks: { paved: col(8, 11), hard: col(8, 14), building: none, bShade: none, baseTree: none, allTree: none } } as ShadeResult;
  const rad = Math.PI / 180;
  const views = [{ res, alt: 60 * rad, az: 270 * rad }, { res, alt: 45 * rad, az: 180 * rad }];
  it('ranks by shade averaged over the sun positions, and never puts a tree on paving or road', () => {
    const spots = recommend([], views, 2, 4);
    expect(spots.length).toBe(2);
    const first = spots[0];
    expect(first.gainM2).toBeCloseTo(views.reduce((s, v) => s + shadeGain(res, first.x, first.z, 4, v.alt, v.az), 0) / 2);
    expect(first.gainM2).toBeGreaterThan(0);
    for (const s of spots) expect(res.masks.hard[Math.floor((s.z + 20) / 2) * n + Math.floor((s.x + 20) / 2)]).toBe(0);
    expect(spots[1].gainM2).toBeLessThanOrEqual(first.gainM2); // greedy: what the first tree shades is not counted again
  });
});
