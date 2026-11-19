import { COEFF, utciPerShaded, type Sky } from './evidence';
import type { ShadeResult } from './shade';
import type { Building, Site, Tree } from './types';

export interface Impact {
  addedTrees: number;
  addedCanopyM2: number;
  shadeBefore: number; // share of paved area shaded
  shadeAfter: number;
  newShadedM2: number; // paved area newly shaded
  /** Published shaded-vs-sunlit differences: what a person standing in the new shade gets. */
  inShade: { surface: number; air: number; utci: number };
  /** Those differences scaled by the share of the area's paving newly shaded. */
  areaMean: { surface: number; air: number; utci: number };
  /** True when the feels-like figure comes from the SOLWEIG-fitted line (13:00–16:00); false means the published figure. */
  utciValidated: boolean;
  greenRoofs: number;
  greenRoofM2: number;
  roofSurface: number;
  roofAir: number; // area-scaled by the share of roof area greened
  airTotal: number; // street air + roof air, area-scaled
}

/** Roof a new green roof can use: the footprint less mapped solar panels and mapped greenery (overlap between the two layers is not known, so this can undercount). */
export const freeRoofM2 = (b: Building) => Math.max(b.footprint - b.pvM2 - b.greenRoofM2, 0);

/**
 * Linear scaling of the published shaded-vs-sunlit differences by the share of paved area that the plan newly
 * shades. Surface and air use the published figures. Feels-like uses the SOLWEIG-fitted line when `when` falls in 13:00–16:00
 * (see evidence.ts); elsewhere it is the published figure, unvalidated. A planning approximation, not a simulation.
 */
export function computeImpact(site: Site, trees: Tree[], res: ShadeResult, greenRoofIds: Set<number>, when?: { hour: number; sky: Sky }): Impact {
  const added = trees.filter((t) => t.source === 'proposed');
  const dFrac = Math.max(0, res.scenarioFrac - res.baselineFrac);
  const inSite = site.buildings.filter((b) => !b.outside); // margin buildings only cast shadows
  const roofTotal = inSite.reduce((s, b) => s + b.footprint, 0);
  const greenM2 = inSite.filter((b) => greenRoofIds.has(b.id)).reduce((s, b) => s + freeRoofM2(b), 0);
  const roofShare = roofTotal > 0 ? greenM2 / roofTotal : 0;
  const utci = when ? utciPerShaded(when.hour, when.sky) : { value: COEFF.utciShade.value, validated: false };
  const inShade = { surface: COEFF.surfaceShade.value, air: COEFF.airShade.value, utci: utci.value };
  const roofAir = COEFF.roofAir.value * roofShare;
  const areaMean = { surface: inShade.surface * dFrac, air: inShade.air * dFrac, utci: inShade.utci * dFrac };
  return {
    addedTrees: added.length,
    addedCanopyM2: added.reduce((s, t) => s + Math.PI * t.radius * t.radius, 0),
    shadeBefore: res.baselineFrac,
    shadeAfter: res.scenarioFrac,
    newShadedM2: res.newShadedM2,
    inShade, areaMean,
    utciValidated: utci.validated,
    greenRoofs: greenRoofIds.size,
    greenRoofM2: greenM2,
    roofSurface: COEFF.roofSurface.value,
    roofAir,
    airTotal: areaMean.air + roofAir,
  };
}
