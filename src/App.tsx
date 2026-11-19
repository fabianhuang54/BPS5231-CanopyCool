import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { BuildingCard, Hint, PlanCard, PreviewCard, SpotsCard } from './components/Cards';
import { CampusMap } from './components/CampusMap';
import { Sources } from './components/Sources';
import { DEFAULT_CROWN_RADIUS, DEFAULT_TREE_HEIGHT } from './lib/defaults';
import { AFTERNOON_HOURS, FIT_DAY, SKIES, SKY_LABEL, utciPerShaded, type Sky } from './lib/evidence';
import { computeImpact } from './lib/impact';
import { loadNus, NUS_LL, nusSite, nusWeather, type NusData } from './lib/nus';
import { plantingBlock } from './lib/planting';
import { BLOCK_M, campusExposure, type Block } from './lib/priority';
import { analyse, recommend, shadeGain, type Spot } from './lib/shade';
import { solarPosition, sgDate } from './lib/sun';
import { validateArea, validatePlan } from './lib/validate';
import type { Area, Tree } from './lib/types';

const Scene3D = lazy(() => import('./components/Scene3D')); // Three.js loads only when an area is opened

const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
// the sun of the day this weather option was fitted on, so a result does not depend on the day the app is opened
const sunAt = (sky: Sky, h: number) => solarPosition(sgDate(h, new Date(FIT_DAY[sky])), NUS_LL.lat, NUS_LL.lng);
const proposedTree = (id: string, x: number, z: number): Tree => ({ id, x, z, radius: DEFAULT_CROWN_RADIUS, height: DEFAULT_TREE_HEIGHT, source: 'proposed' });

export default function App() {
  const [data, setData] = useState<NusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [hour, setHour] = useState(14); // a hot afternoon
  const [sky, setSky] = useState<Sky>('typical');
  const [proposed, setProposed] = useState<Tree[]>([]);
  const [greenRoofs, setGreenRoofs] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [plantMode, setPlantMode] = useState(false);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [hoverPt, setHoverPt] = useState<{ x: number; z: number } | null>(null);
  const [sources, setSources] = useState(false);
  const [heat, setHeat] = useState<Block[] | null>(null);
  const [heatBusy, setHeatBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { loadNus().then(setData, (e) => setError(String(e.message ?? e))); }, []);

  const showHeat = () => {
    if (heat) return setHeat(null);
    setHeatBusy(true);
    setTimeout(() => { try { setHeat(campusExposure(data!)); } finally { setHeatBusy(false); } }, 30); // let 'Computing…' paint first
  };
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast((t) => (t === m ? null : t)), 2800); };
  const openArea = (a: Area) => { setArea(a); setProposed([]); setGreenRoofs(new Set()); setSelectedId(null); setPlantMode(false); setSpots([]); setHoverPt(null); };

  const site = useMemo(() => (data && area ? nusSite(data, area) : null), [data, area]);
  const trees = useMemo(() => (site ? [...site.trees, ...proposed] : []), [site, proposed]);
  // the slider moves at once; the heavy shade and ground work follows the latest value instead of every step
  const settledHour = useDeferredValue(hour);
  const sun = useMemo(() => sunAt(sky, settledHour), [sky, settledHour]);
  const res = useMemo(() => (site ? analyse(site, trees, sun.alt, sun.az, true) : null), [site, trees, sun]);
  const impact = useMemo(() => (site && res ? computeImpact(site, trees, res, greenRoofs, { hour: settledHour, sky }) : null), [site, trees, res, greenRoofs, settledHour, sky]);
  const weather = useMemo(() => (data && area ? nusWeather(data, area, settledHour) : null), [data, area, settledHour]);

  // feedback loop: everything shown is checked against the layers, and a failure is surfaced instead of hidden
  const siteChecks = useMemo(() => (site ? validateArea(site, res) : []), [site, !!res]); // heavier: only when the area changes
  const planChecks = useMemo(() => (site ? validatePlan(site, trees, greenRoofs, res) : []), [site, trees, greenRoofs, res]); // light: on every change
  const checks = useMemo(() => [...siteChecks, ...planChecks], [siteChecks, planChecks]);
  const failing = checks.filter((c) => !c.pass);
  useEffect(() => { if (failing.length) console.error('Data checks failed:', failing); }, [failing.length]);

  // recommendations are for the current plan and weather option (they rank the afternoon, not the slider time): drop them when either changes
  useEffect(() => { setSpots([]); }, [proposed, sky, area]);
  const spotImpact = useMemo(() => {
    if (!site || !impact || !spots.length) return null;
    const all = [...trees, ...spots.map((s, i) => proposedTree(`spot${i}`, s.x, s.z))];
    return computeImpact(site, all, analyse(site, all, sun.alt, sun.az, true), greenRoofs, { hour: settledHour, sky });
  }, [site, impact, spots, trees, sun, greenRoofs, settledHour, sky]);

  const block = site && hoverPt ? plantingBlock(site, trees, hoverPt.x, hoverPt.z) : null;
  const ghost = plantMode && hoverPt ? { ...hoverPt, radius: DEFAULT_CROWN_RADIUS, ok: !block } : null;
  const gain = ghost?.ok && res ? shadeGain(res, ghost.x, ghost.z, DEFAULT_CROWN_RADIUS, sun.alt, sun.az) : 0;
  const selected = site?.buildings.find((b) => b.id === selectedId) ?? null;

  const onPick = (id: number | null, x: number, z: number, treeId?: string) => {
    if (!site) return;
    if (!plantMode) { setSelectedId(id); return; }
    if (treeId) { setProposed((p) => p.filter((t) => t.id !== treeId)); return; } // clicked a tree you planted
    const why = id != null ? 'Inside a building' : plantingBlock(site, trees, x, z);
    if (why) return flash(why);
    setProposed((p) => [...p, proposedTree(`p${Date.now()}`, x, z)]);
  };

  const suggest = () => {
    if (!site || !res) return;
    // ranked over the afternoon sun times of all three weather options (nine sun positions), so the spots are not tuned to one season;
    // a spot must also pass the same rules as a click
    const wide = SKIES.flatMap((k) => AFTERNOON_HOURS.map((h) => { const s = sunAt(k, h); return { res: analyse(site, trees, s.alt, s.az, true), ...s }; }));
    const found = recommend(trees, wide, 8, DEFAULT_CROWN_RADIUS).filter((s) => !plantingBlock(site, trees, s.x, s.z));
    setSpots(found);
    setPlantMode(false);
    if (!found.length) flash('No sunlit pavement left to improve here');
  };
  const applySpots = () => { setProposed((p) => [...p, ...spots.map((s, i) => proposedTree(`p${Date.now()}_${i}`, s.x, s.z))]); };
  const toggleRoof = (id: number) => setGreenRoofs((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const changed = !!impact && (impact.addedTrees > 0 || impact.greenRoofs > 0);

  let card = <Hint>Click a building for its details, or press <b>Plant trees</b> and click the ground. <b>Recommend</b> finds the best spots.</Hint>;
  if (impact && res && site) {
    if (spots.length && spotImpact) card = <SpotsCard now={impact} withSpots={spotImpact} spots={spots} onApply={applySpots} onDismiss={() => setSpots([])} open={() => setSources(true)} />;
    else if (plantMode && ghost) card = <PreviewCard ok={ghost.ok} reason={block} gainM2={gain} pavedArea={res.pavedArea} utci={utciPerShaded(settledHour, sky)} open={() => setSources(true)} />;
    else if (selected && !plantMode) card = <BuildingCard b={selected} hour={fmtHour(hour)} sun={sun} greenRoof={greenRoofs.has(selected.id)} onGreenRoof={() => toggleRoof(selected.id)} onClose={() => setSelectedId(null)} open={() => setSources(true)} />;
    else if (changed) card = <PlanCard im={impact} open={() => setSources(true)} />;
    else if (plantMode) card = <Hint>Move over the ground: orange paving is sunlit, teal is shaded. Click to plant.</Hint>;
  }

  return (
    <div className="app">
      {!area || !site || !res ? (
        <>
          <div className="map">{data ? <CampusMap data={data} onSelect={openArea} heat={heat} /> : <div className="center">{error ? `Couldn’t load the campus data: ${error}` : 'Loading campus data…'}</div>}</div>
          <header className="top">
            <div><h1>CanopyCool</h1><span>NUS Kent Ridge</span></div>
            <p className="pill">Drag a rectangle over any area to explore it in 3D · or click to pick a {300} m square</p>
            <button onClick={showHeat} disabled={!data || heatBusy}>{heatBusy ? 'Computing…' : heat ? 'Hide heat exposure' : '🔥 Heat exposure'}</button>
            <button className="link" onClick={() => setSources(true)}>About &amp; sources</button>
          </header>
          {heat && (
            <aside className="side card">
              <h3>Most sun-exposed paving</h3>
              <p className="muted">Sunlit pavement and path area per {BLOCK_M} m block, averaged over the afternoon, from the mapped buildings and trees. It maps sunlit paving, not measured heat: at block level it does not track the stations’ hotspots (rank r 0.08), and it does not count people, so busy and empty paving score alike.</p>
              <ol className="rank">
                {heat.slice(0, 8).map((b, i) => (
                  <li key={i}><button className="link" onClick={() => openArea({ cx: b.cx, cz: b.cz, w: 200, d: 200 })}>
                    <b>{Math.round(b.sunlitM2).toLocaleString()} m²</b> sunlit · {Math.round((100 * b.sunlitM2) / b.pavedM2)}% of its paving
                  </button></li>
                ))}
              </ol>
            </aside>
          )}
          <div className="legend"><i style={{ background: '#6b7a8d' }} />Buildings <i style={{ background: '#22a85a' }} />Trees <i style={{ background: '#0f4429' }} />Dense canopy <i style={{ background: '#2b3644' }} />Paving <i style={{ background: '#1d4ed8' }} />Rooftop PV</div>
        </>
      ) : (
        <>
          <Suspense fallback={<div className="center">Loading 3D…</div>}>
            <Scene3D
              key={`${area.cx},${area.cz},${area.w},${area.d}`}
              site={site} trees={trees} greenRoofs={greenRoofs} sun={sun}
              selectedId={selectedId} plantMode={plantMode} ghost={ghost} spots={spots}
              onHoverGround={setHoverPt} onPick={onPick}
            />
          </Suspense>
          <header className="top">
            <button onClick={() => setArea(null)}>← Campus</button>
            <p className="pill">{Math.round(area.w)} × {Math.round(area.d)} m · {site.buildings.filter((b) => !b.outside).length} buildings · {site.trees.length} mapped trees · {site.generated.length.toLocaleString()} generated in dense canopy</p>
            <button className="link" onClick={() => setSources(true)}>About &amp; sources</button>
          </header>
          {failing.length > 0 && <div className="alert" role="alert">⚠ Data check failed: {failing.map((c) => c.name).join('; ')}. <button className="link" onClick={() => setSources(true)}>Details</button></div>}
          <aside className="side">{card}</aside>
          <div className="bar">
            <button className={plantMode ? 'primary' : ''} onClick={() => { setPlantMode((m) => !m); setSelectedId(null); setSpots([]); }}>🌳 Plant trees</button>
            <button onClick={suggest}>✨ Recommend</button>
            <button onClick={() => { setProposed([]); setGreenRoofs(new Set()); setSpots([]); }} disabled={!changed}>Reset</button>
            <div className="time">
              <label>{fmtHour(hour)} · sun {Math.round((sun.alt * 180) / Math.PI)}° high
                <input type="range" aria-label="Time of day" min={7} max={18.5} step={0.25} value={hour} onChange={(e) => setHour(+e.target.value)} />
              </label>
              <label>Weather <select value={sky} onChange={(e) => setSky(e.target.value as Sky)} title="Each option is one real 2025 day, so it also sets the sun’s path. See About.">{SKIES.map((k) => <option key={k} value={k}>{SKY_LABEL[k]}</option>)}</select></label>
              {weather && <small>Station {weather.station}, measured in 2025 at this hour: average {weather.year[0].toFixed(1)} °C · hottest 10% of days {weather.hot[0].toFixed(1)} °C</small>}
            </div>
          </div>
        </>
      )}
      {toast && <div className="toast">{toast}</div>}
      {sources && data && <Sources onClose={() => setSources(false)} build={data.validation.checks} area={checks} buildings={data.buildings} />}
    </div>
  );
}
