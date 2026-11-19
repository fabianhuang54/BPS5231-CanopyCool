/**
 * Every cooling coefficient used by the simulator, with the published study it comes from.
 * Nothing else in the app produces a temperature figure.
 */
export interface Ref { id: number; cite: string; doi: string; finding: string; note?: string }

export const REFS: Ref[] = [
  {
    id: 1,
    cite: 'Ow, L.F., Ghosh, S. & Mohd Yusof, M.L. (2020). The benefits of tree shade and turf on globe and surface temperatures in an urban tropical environment. Arboriculture & Urban Forestry 46(3):228–244.',
    doi: '10.48044/jauf.2020.017',
    finding: 'Singapore field plots, June peak: sunlit concrete 53 °C vs 48 °C in tree shade (−5 °C). Turf cut a further 10–12 °C, so the paper’s 12 °C is shaded turf vs shaded concrete, not tree shade alone.',
    note: 'Full text checked (Results and Discussion, Fig. 2). The 5 °C is a peak-hour value on concrete in the warmest month, so it is an upper-end figure for tree shade on hard surface.',
  },
  {
    id: 2,
    cite: 'Xu, L., Bardhan, R., Mei, H., Gopalakrishnan, S., Zheng, X. & Schroepfer, T. (2024). Harnessing street shade to mitigate heat stress: an in-situ parallel investigation under extreme heat conditions in tropical Singapore. Science of the Total Environment 958:177864 (2025; online 13 Dec 2024).',
    doi: '10.1016/j.scitotenv.2024.177864',
    finding: '20 paired sunlit/shaded street locations: shade lowered air temperature by 0.8 °C (up to about 2 °C), mean radiant temperature by 10.0 °C and UTCI by 3.1 °C on average.',
    note: 'Full text checked. One hot afternoon (23 Aug 2023, 14:00–16:00), 2-minute static readings in the one-north district, not on campus. Shade types are mixed (buildings and trees), so 3.1 °C is not tree shade alone.',
  },
  {
    id: 3,
    cite: 'Meili, N., Acero, J.A., Peleg, N., Manoli, G., Burlando, P. & Fatichi, S. (2021). Vegetation cover and plant-trait effects on outdoor thermal comfort in a tropical city. Building and Environment 195:107733.',
    doi: '10.1016/j.buildenv.2021.107733',
    finding: 'Model study: raising tree and ground vegetation cover lowered midday UTCI by 0.9–2.9 °C (10-month average).',
    note: 'Context only. This is a cover-change simulation, not a shaded-versus-sunlit measurement, so no figure here is taken from it.',
  },
  {
    id: 4,
    cite: 'Qin, X., Wu, X., Chiew, Y.-M. & Li, Y. (2012). A green roof test bed for stormwater management and reduction of urban heat island effect in Singapore. British Journal of Environment & Climate Change 2(4):410–420 (online 19 Jan 2013).',
    doi: '10.5281/zenodo.8073',
    finding: 'NTU test bed, 10:00–16:00: green roofs averaged 7.3 °C cooler roof surface and 0.5 °C cooler air than a bare roof.',
    note: 'Full text checked. Three 2 m × 2 m planter boxes on one NTU roof; the averages come from the 9–13 Aug 2012 profile (maxima 15.3 °C surface, 1.3 °C air). Air was measured 0.3 m above the roof, so the 0.5 °C is a roof-level figure, not street-level cooling.',
  },
];

/** Central value and the range reported in the literature. `ref` indexes REFS. */
export const COEFF = {
  /** Surface temperature under tree shade vs sunlit hard surface, °C. Peak-hour concrete figure from small plots (ref 1). Applied here to all paved street area. */
  surfaceShade: { value: 5, ref: [1] },
  /** Air temperature difference, shaded vs sunlit street, °C. */
  airShade: { value: 0.8, ref: [2] },
  /** UTCI (perceived heat) difference, shaded vs sunlit, °C. */
  utciShade: { value: 3.1, ref: [2] },
  /** Green roof vs bare roof: roof surface and ambient air, °C. */
  roofSurface: { value: 7.3, ref: [4] },
  roofAir: { value: 0.5, ref: [4] },
};

export type Sky = 'clear' | 'typical' | 'overcast';
export const SKIES: Sky[] = ['clear', 'typical', 'overcast'];
/** How the options read in the app. Each is one real 2025 day (FIT_DAY), so each also carries that day's sun path; the About panel says so. */
export const SKY_LABEL: Record<Sky, string> = { clear: 'Sunny', typical: 'Typical', overcast: 'Cloudy' };

/**
 * Mean feels-like (UTCI) cooling in °C on the paving a tree newly shades (SOLWEIG's benefit in °C·m² divided by the newly shaded m²), fitted on SOLWEIG results for 8,424 cases (936 single trees x 3 days x 3 times) at six NUS sites
 * (data/surrogate_thin, crown depth 0.10) with CanopyCool's own shaded area as the input (refit by src/surrogate/fit_utci_slope.py); the line scores R² 0.92 on sites it
 * never saw. SOLWEIG models radiant heat only, so this is the sun-and-shade part of UTCI, not evaporative air cooling.
 * Fitted for clock hours 13:00–16:00 (sun taken at 13:30, 14:30, 15:30) on three station-median days: clear, typical, overcast.
 */
export const UTCI_WINDOW: [number, number] = [13, 16];
/** The sun times the app works at: the middle of each afternoon hour the line was fitted on. The app has no time control; everything is an afternoon estimate. */
export const AFTERNOON_HOURS = [13.5, 14.5, 15.5];
/** The station-median day each sky's slopes were fitted on (data/surrogate_thin/day_types.json). The app takes the sun position from the same day, so a result does not change with the day you open it. */
export const FIT_DAY: Record<Sky, string> = { clear: '2025-04-10', typical: '2025-01-28', overcast: '2025-10-15' };
const UTCI_SLOPE: Record<Sky, [number, number, number]> = { clear: [5.58, 6.34, 8.0], typical: [2.94, 2.87, 2.21], overcast: [1.98, 1.92, 1.33] };

/** Mean UTCI cooling (°C) on the paving a tree newly shades, at this clock hour: the SOLWEIG-fitted slope inside 13:00–16:00, else the published figure. */
export function utciPerShaded(hour: number, sky: Sky): { value: number; validated: boolean } {
  if (hour < UTCI_WINDOW[0] || hour > UTCI_WINDOW[1]) return { value: COEFF.utciShade.value, validated: false };
  const t = Math.min(Math.max(hour - 13.5, 0), 2), i = Math.min(Math.floor(t), 1), k = UTCI_SLOPE[sky];
  return { value: k[i] + (k[i + 1] - k[i]) * (t - i), validated: true };
}
