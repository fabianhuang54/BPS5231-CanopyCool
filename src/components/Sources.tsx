import { useEffect, useRef } from 'react';
import { COEFF, FIT_DAY, REFS, SKIES, SKY_LABEL, UTCI_WINDOW, utciPerShaded } from '../lib/evidence';
import { CELL, CROWN_DEPTH } from '../lib/shade';
import type { Check } from '../lib/validate';
import { DEFAULT_BUILDING_HEIGHT, DEFAULT_CROWN_RADIUS, DEFAULT_LEVEL_HEIGHT, DEFAULT_TREE_HEIGHT } from '../lib/defaults';
import { MARGIN, NUS_LL, type NusData } from '../lib/nus';
import { sgDate, solarPosition } from '../lib/sun';

/** Everything behind the numbers: what each one is, the results and assumptions (each checked against the repo's tables), published studies, data and checks. */
function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="checks">
      {checks.map((c) => <li key={c.name} className={c.pass ? 'ok' : 'bad'}><b>{c.pass ? '✓' : '✗'}</b> {c.name} <small>{c.detail}</small></li>)}
    </ul>
  );
}

/** `build` = checks run against the shapefiles when the data file was made; `area` = checks on the area you have open. */
export function Sources({ onClose, build, area, buildings }: { onClose: () => void; build: Check[]; area: Check[]; buildings: NusData['buildings'] }) {
  // computed from the data file, so the text cannot go stale when it is rebuilt
  const recorded = buildings.filter((b) => b.h || b.f).map((b) => b.h || b.f * DEFAULT_LEVEL_HEIGHT).sort((a, c) => a - c);
  const median = recorded.length ? (recorded[Math.floor((recorded.length - 1) / 2)] + recorded[Math.ceil((recorded.length - 1) / 2)]) / 2 : 0;
  const noHeight = buildings.length - recorded.length;
  const tallest = Math.max(...buildings.map((b) => b.h || b.f * DEFAULT_LEVEL_HEIGHT || DEFAULT_BUILDING_HEIGHT));
  const lowSun = Math.min(...SKIES.map((k) => solarPosition(sgDate(UTCI_WINDOW[1], new Date(FIT_DAY[k])), NUS_LL.lat, NUS_LL.lng).alt)); // lowest sun in the window
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => { sheet.current?.focus(); }, []); // keyboard users land in the panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal" onClick={onClose}>
      <div ref={sheet} tabIndex={-1} className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="About CanopyCool: method, assumptions and sources">
        <div className="card-head"><h2>About CanopyCool</h2><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        <p>A shade and heat-exposure planning tool for NUS Kent Ridge. It maps sun-exposed pavements and paths, calculates the shade a new tree would cast, and estimates the feels-like (UTCI) cooling from that shade. It is a screening tool, not a microclimate simulator. Every figure below names the script or table it comes from (in the project repository); the full account is docs/PROJECT_LOG.md.</p>

        <p>File names such as <code>outputs/tables/…</code> point to the tables and scripts in the team’s private analysis repository (BPS5231).</p>

        <h4>What each number is</h4>
        <ul>
          <li><b>Modelled with SOLWEIG and checked on sites held out from fitting:</b> the feels-like cooling on newly shaded paving, in the afternoon (13:00–16:00).</li>
          <li><b>Calculated geometry, no temperature claim:</b> shaded area, sunlit paving, the heat-exposure ranking and Recommend.</li>
          <li><b>Published, for context:</b> paving surface −{COEFF.surfaceShade.value} °C, street air −{COEFF.airShade.value} °C, green roof −{COEFF.roofSurface.value} °C surface and −{COEFF.roofAir.value} °C air, and feels-like −{COEFF.utciShade.value} °C outside 13:00–16:00. Each is cited below; none is a result of this project.</li>
        </ul>

        <h4>The feels-like figure (13:00–16:00)</h4>
        <p>The headline figure is SOLWEIG’s feels-like (UTCI) cooling per m² of paving a tree newly shades. SOLWEIG is a physics model of sun, shade and radiant heat. A straight line through the origin was fitted on 8,424 cases (936 single trees, each simulated on three days at three sun times) at six campus sites (crown radius 3–6 m, height 6–12 m), with one slope for each sky and sun time (src/surrogate/fit_utci_slope.py):</p>
        <ul>
          {SKIES.map((k) => <li key={k}>{SKY_LABEL[k]} ({FIT_DAY[k]}): {[13.5, 14.5, 15.5].map((h) => `−${utciPerShaded(h, k).value.toFixed(2)} °C`).join(', ')} at 13:30, 14:30, 15:30</li>)}
        </ul>
        <p>On sites it never saw, the line reproduces SOLWEIG with R² 0.92 overall: 0.93 on the clear day, 0.83 on the typical day and 0.82 on the overcast day (outputs/tables/surrogate_engine_comparison_thin.csv). This app’s shaded area and SOLWEIG’s agree with r 0.96, and the app finds 1.03 times SOLWEIG’s area. Several trees add up: the combined cooling of 2, 4 and 8 trees is 1.00, 1.00 and 0.99 of the sum of the single trees.</p>
        <p><b>Scope of the check.</b> The line is checked against SOLWEIG, not against measurements of trees planted on campus; no such measurement exists yet, and a paired shaded and sunlit comfort reading is the next step. SOLWEIG models radiant heat only, so evaporative cooling and wind are outside the figure. “Cooling per m² of newly shaded paving” means SOLWEIG’s total cooling over the paving around the tree divided by the area newly shaded. Outside 13:00–16:00 the app shows the published value (Xu et al. 2024) and says so.</p>

        <h4>What the station study found</h4>
        <ul>
          <li>By day, the sunlight reaching a station goes with how warm it runs: rank correlation 0.79 (95% CI 0.56 to 0.90, 25 stations; outputs/tables/stage1_solar.csv). This is why the tool works on shade.</li>
          <li>Daytime hotspot stations are mostly the sunniest ones: rank correlation 0.51 by day, 0.54 in the afternoon, 27 stations (stage1_hotspot_vs_sun.csv).</li>
          <li><b>The heat-exposure map does not reproduce the stations’ hotspots:</b> rank correlation +0.08 (95% CI −0.31 to +0.45, 27 stations; exposure_vs_hotspot.csv). It ranks where much sunlit paving is, not where stations run hot.</li>
        </ul>

        <h4>Time of day and the sun’s path</h4>
        <ul>
          <li><b>What the feels-like figure is based on.</b> It is modelled for the afternoon: sun at 13:30, 14:30 and 15:30, the station study’s warmest-afternoon window. At other times of day the app still draws the sun’s shadows (its shadow area matches SOLWEIG from 81° down to 24° sun), but the feels-like tile then shows the published figure for context and says so.</li>
          <li><b>A wider check, not used in the app.</b> The same SOLWEIG experiment scored at eight sun times from 09:30 to 16:30 (outputs/tables/hours_test.csv): the line holds with R² 0.84 to 0.92 pooled over the weather options, but it is weaker on the Typical and Cloudy days at low sun (as low as 0.62 on the Typical day at 16:30).</li>
          <li><b>Direction.</b> The sun’s real position sets every shadow. In the afternoon shadows fall away from the sun, with bearings between 9° (north) and 139° (south-east) across the three weather options (outputs/tables/sun_path_check.csv). A tree shades paving only from the sun’s side of it, so Recommend places trees on the sun-facing side of the paving, which differs by option. Morning shade would need the other side.</li>
          <li><b>The weather options also set the sun’s path.</b> Sunny, Typical and Cloudy are real days (10 April, 28 January, 15 October 2025), so they differ in sun path as well as cloud: the April sun is nearly overhead at 13:30, the January sun lower and from the south. They are scenarios, not forecasts, and the cooling per m² follows each day’s own hour-by-hour cloud.</li>
          <li><b>Recommend averages over all three sun paths.</b> Tuned to one path, only 2 of 8 spots on the most exposed 200 m area are shared between Sunny and Typical (5 of 8 for the other pairs). Averaging gives up some shade on that area for the option you pick: Sunny 136 m² against 184 m² when tuned to it, Typical 199 against 208, Cloudy 180 against 180. The heat-exposure ranking is steady across sun paths (7 to 8 of the top 8 blocks shared; rank correlation 0.94 to 0.98) (outputs/tables/sun_path_check.csv).</li>
        </ul>

        <h4>Inputs and settings, and their basis</h4>
        <ul>
          <li><b>Sun position:</b> taken from the day each sky’s line was fitted on ({SKIES.map((k) => `${SKY_LABEL[k]} ${FIT_DAY[k]}`).join(', ')}), so a result does not change with the day you open the app. The heat-exposure map uses the clear day. The sun formula agrees with an independent NOAA calculation to within 0.05° on those days.</li>
          <li><b>Roads are not counted.</b> Shade and exposure are measured on pavements and paths only. The line itself was fitted with roads included, and is applied per m².</li>
          <li><b>Trees cannot be planted on paving,</b> so the middle of a large plaza stays exposed in this tool. Recommend picks up to 8 spots on open ground, by the shade each adds on average over 13:30, 14:30 and 15:30 on all three weather options’ days (see Time of day and the sun’s path).</li>
          <li><b>Trees:</b> the layers hold crown outlines but no tree heights or species, so every tree, mapped or planted, is given one height, {DEFAULT_TREE_HEIGHT} m, the same as in the SOLWEIG runs. The result does not depend much on it: across the 936 fitted trees, the cooling per m² of shade for any tree height (6 to 12 m) or crown radius (3 to 6 m) is within 15% of the overall slope (outputs/tables/slope_by_tree_size.csv). Trees you plant have a crown radius of {DEFAULT_CROWN_RADIUS} m, inside the fitted range. Crowns are drawn as thin discs, the top {CROWN_DEPTH * 100}% of the height, which matches the station pyranometers better than SOLWEIG’s default thick crown (shade error 0.233 against 0.318, outputs/tables/crown_calibration.csv). With crowns four times thicker (depth 0.40) all nine slopes rise by 1 to 15%, so the figure here is the lower of the two (data/surrogate_d40).</li>
          <li><b>Buildings:</b> heights come from the campus layer. {noHeight} of the {buildings.length} buildings have no recorded height; each is set to {DEFAULT_BUILDING_HEIGHT} m, the median of the {recorded.length} that have one ({median.toFixed(1)} m). Buildings up to {MARGIN} m outside the area still cast shadows into it: the tallest is {tallest.toFixed(0)} m and its longest shadow in the afternoon window is {(tallest / Math.tan(lowSun)).toFixed(0)} m. Trees outside the area do not, so shade within {Math.ceil(DEFAULT_TREE_HEIGHT / Math.tan(lowSun) + 6)} m of the edge leaves out trees beyond it (a {DEFAULT_TREE_HEIGHT} m tree’s longest afternoon shadow plus a 6 m crown radius, the largest mapped).</li>
          <li><b>Ground:</b> flat, on a {CELL} m grid; the campus layers have no elevation surface.</li>
          <li><b>Small crowns</b> are drawn as circles of the same area as the mapped canopy; large merged patches keep their outline and shade fully.</li>
          <li><b>Trees drawn inside dense canopy</b> are for display, so the 3D view shows woodland rather than solid patches. Their positions are seeded and repeatable, not surveyed; they cannot be selected and no figure uses them. The shade figures use the mapped canopy outlines.</li>
          <li><b>“Averaged over this area’s pavements and paths”</b> multiplies the in-shade figure by the share of that paving newly shaded. For surface and air the published difference is scaled linearly by that share; these are not simulation results.</li>
          <li><b>No people weighting:</b> busy and empty paving score alike.</li>
        </ul>

        <h4>Known limits</h4>
        <ul>
          <li><b>Shade at one exact spot.</b> At six sunny stations (WS01, WS10, WS22, WS27, WS28, WS29) the pyranometers record 0 to 5% of the hours in shade where the model gives 13 to 69%. Station photos show open sky above those masts, so the mapped crown at the sensor does not match what it sees (outputs/tables/sunny_station_diagnosis.csv). Existing shade next to outlines like these can be too high.</li>
          <li><b>Evidence base.</b> The line was fitted on six sites and three real days and checked on sites held out from fitting; one campus, one year (2025). The method transfers to other sites; the numbers are for NUS only.</li>
          <li>Not covered: green walls, replacing or topping existing canopy, hours outside 13:00–16:00, air temperature from our own work.</li>
        </ul>

        <h4>Published figures used (context)</h4>
        <ol className="refs">
          {REFS.map((r) => (
            <li key={r.id} id={`ref${r.id}`}>
              {r.cite} <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">doi:{r.doi}</a>
              <em>{r.finding}</em>
              {r.note && <span className="warn">{r.note}</span>}
            </li>
          ))}
        </ol>
        <p>These are differences between shaded and sunlit spots (or green and bare roofs) measured elsewhere in Singapore. The surface figure comes from small plots in housing estates and is applied to all counted paving here.</p>

        <h4>Data in the app</h4>
        <ul>
          <li>NUS Kent Ridge campus GIS layers from the BPS5231 project: buildings (height, floors), tree canopy (crown outlines), forest, roads, streets and pavement, turf, shrubs, rooftop greenery and PV (2019–2024).</li>
          <li>NUS 2025 hourly weather, 40 stations (City Syntax Lab, Zenodo 10.5281/zenodo.20477761): the measured average and hottest-10%-of-days air temperature at the nearest station for the hour shown, beside the time slider. Station data, not a model output.</li>
        </ul>

        <h4>Checked against the layers</h4>
        <p>Everything derived or generated is checked against the source layers. A failing check stops the data file being built, and shows a warning here if it happens on screen.</p>
        <p><b>When the data was built</b> ({build.filter((c) => c.pass).length} of {build.length} passed): counts and areas against the shapefiles, layers against each other, and the generated trees.</p>
        <CheckList checks={build} />
        {area.length > 0 && <><p><b>The area you have open</b> ({area.filter((c) => c.pass).length} of {area.length} passed):</p><CheckList checks={area} /></>}
      </div>
    </div>
  );
}
