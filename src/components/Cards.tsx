import { COEFF } from '../lib/evidence';
import { freeRoofM2, type Impact } from '../lib/impact';
import { shadowOffset } from '../lib/sun';
import type { Spot } from '../lib/shade';
import type { Building } from '../lib/types';

export const Ref = ({ ids, open }: { ids: number[]; open: () => void }) => (
  <>{ids.map((i) => <button key={i} className="ref" onClick={open} title="Open sources">[{i}]</button>)}</>
);

/** The standing note under every result: what the numbers are based on and where they stop. It changes with the time shown; the full account is in About. */
export function Basis({ open, validated }: { open: () => void; validated: boolean }) {
  return (
    <p className="basis">
      <b>What this shows.</b>{' '}
      {validated
        ? 'The feels-like cooling is modelled with SOLWEIG for the afternoon sun (about 1–4 pm), for new trees on open ground with the cooling counted on paving. It reproduces SOLWEIG on campus sites it was not fitted on (R² 0.92). Surface and air figures are published values. None of it is a measurement of trees planted on campus.'
        : 'Shade and shaded areas are calculated for the time shown. The feels-like figure here is the published value from Xu et al. (2024), for context: our SOLWEIG modelling covers the afternoon (about 1–4 pm).'}{' '}
      Shadows are drawn from the sun’s real position, and each weather option uses its own day’s sun path.{' '}
      <button className="link" onClick={open}>How these numbers are made</button>
    </p>
  );
}

const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
const drop = (n: number) => (n === 0 ? '0' : `−${n.toFixed(Math.abs(n) < 0.1 ? 2 : 1)}`);

/** Shaded share of the paved area, before and after. The lighter segment is what the plan adds. */
function ShadeBars({ before, after, labels = ['Now', 'After'] }: { before: number; after: number; labels?: [string, string] }) {
  return (
    <div className="bars" role="img" aria-label={`Shaded paving ${pct(before)} to ${pct(after)}`}>
      <div className="bar-row"><span>{labels[0]}</span><div className="track"><i style={{ width: `${before * 100}%` }} /></div><b>{pct(before)}</b></div>
      <div className="bar-row"><span>{labels[1]}</span><div className="track"><i style={{ width: `${before * 100}%` }} /><i className="add" style={{ width: `${Math.max(after - before, 0) * 100}%` }} /></div><b>{pct(after)}</b></div>
    </div>
  );
}

/** What a person standing in the new shade gets: the feels-like figure first (fitted on SOLWEIG afternoon runs), then the published surface and air differences as context. */
function ShadeTiles({ utci, open }: { utci: { value: number; validated: boolean }; open: () => void }) {
  const { surfaceShade: s, airShade: a, utciShade: u } = COEFF;
  return (
    <div className="tiles">
      <div className="lead"><b>−{utci.value.toFixed(1)} °C</b><span>feels-like (UTCI)</span><small>{utci.validated ? 'modelled with SOLWEIG' : <>published, Xu 2024 <Ref ids={u.ref} open={open} /></>}</small></div>
      <div><b>−{s.value} °C</b><span>paving surface</span><small>published, Ow 2020, peak on concrete <Ref ids={s.ref} open={open} /></small></div>
      <div><b>−{a.value} °C</b><span>air at street level</span><small>published, Xu 2024 <Ref ids={a.ref} open={open} /></small></div>
    </div>
  );
}

export function Hint({ children }: { children: React.ReactNode }) { return <div className="card hint"><p>{children}</p></div>; }

export function PreviewCard({ ok, reason, gainM2, pavedArea, utci, open }: { ok: boolean; reason: string | null; gainM2: number; pavedArea: number; utci: { value: number; validated: boolean }; open: () => void }) {
  if (!ok) return <div className="card bad"><h3>Can’t plant here</h3><p>{reason}</p></div>;
  return (
    <div className="card">
      <h3>If you plant here</h3>
      <div className="hero"><b>+{gainM2.toFixed(0)} m²</b><span>of paving newly shaded ({pct(gainM2 / Math.max(pavedArea, 1))} of this area’s paving)</span></div>
      {gainM2 < 1
        ? <p className="muted">This spot adds almost no shade: the paving here is already shaded. Orange paving on the ground is sunlit.</p>
        : <><p className="eyebrow">For anyone standing in that new shade</p><ShadeTiles utci={utci} open={open} /></>}
      {gainM2 >= 1 && <Basis open={open} validated={utci.validated} />}
      <p className="muted">Click to plant · click a planted tree to remove it</p>
    </div>
  );
}

export function PlanCard({ im, open }: { im: Impact; open: () => void }) {
  return (
    <div className="card">
      <h3>Your plan</h3>
      <ShadeBars before={im.shadeBefore} after={im.shadeAfter} />
      <div className="facts">
        {im.addedTrees > 0 && <p><b>{im.addedTrees}</b> trees · +{im.addedCanopyM2.toFixed(0)} m² canopy · <b>{im.newShadedM2.toFixed(0)} m²</b> paving newly shaded</p>}
        {im.greenRoofs > 0 && <p><b>{im.greenRoofs}</b> green roofs · {im.greenRoofM2.toFixed(0)} m² · roof surface −{im.roofSurface} °C (published) <Ref ids={COEFF.roofSurface.ref} open={open} /></p>}
      </div>
      {im.addedTrees > 0 && (im.newShadedM2 >= 1
        ? <><p className="eyebrow">In the new shade</p><ShadeTiles utci={{ value: im.inShade.utci, validated: im.utciValidated }} open={open} /></>
        : <p className="muted">These trees add almost no shade: the paving under them is already shaded.</p>)}
      <p className="eyebrow">Averaged over this area’s pavements and paths</p>
      <div className="facts"><p>Feels-like <b>{drop(im.areaMean.utci)} °C</b> · street air <b>{drop(im.areaMean.air)} °C</b> (published){im.roofAir > 0 && <> · roof air <b>{im.roofAir < 0.005 ? '<0.01' : drop(im.roofAir).slice(1)} °C</b> (published)</>}</p></div>
      <p className="muted">Roads are not counted. Surface and air figures are the published differences, scaled in proportion to the share of paving newly shaded.</p>
      <Basis open={open} validated={im.utciValidated} />
    </div>
  );
}

export function SpotsCard({ now, withSpots, spots, onApply, onDismiss, open }: { now: Impact; withSpots: Impact; spots: Spot[]; onApply: () => void; onDismiss: () => void; open: () => void }) {
  const max = Math.max(...spots.map((s) => s.gainM2), 1);
  const gain = withSpots.newShadedM2 - now.newShadedM2; // same time and basis as the Now / With spots bars and the plan card after Apply
  return (
    <div className="card">
      <h3>Recommended spots</h3>
      <p className="muted">Best places for {spots.length} trees: open ground next to sunlit pavements and paths, ranked by the shade each adds across the afternoon and across all three weather options’ sun paths. Trees cannot go on paving, so open plazas stay exposed.</p>
      <div className="row2"><button className="primary" onClick={onApply}>Plant these {spots.length}</button><button onClick={onDismiss}>Dismiss</button></div>
      <ShadeBars before={now.shadeAfter} after={withSpots.shadeAfter} labels={['Now', 'With spots']} />
      <div className="hero"><b>+{gain.toFixed(0)} m²</b><span>of paving newly shaded at the time shown · +{(withSpots.addedCanopyM2 - now.addedCanopyM2).toFixed(0)} m² canopy</span></div>
      <ol className="spots">{spots.map((s, i) => (
        <li key={i}><span>{i + 1}</span><div className="track"><i style={{ width: `${(s.gainM2 / max) * 100}%` }} /></div><b>+{s.gainM2.toFixed(0)} m²</b></li>
      ))}</ol>
      <p className="muted">Spot bars: each spot’s shade added, averaged over the afternoon and the three sun paths.</p>
      <p className="eyebrow">In the new shade</p>
      <ShadeTiles utci={{ value: withSpots.inShade.utci, validated: withSpots.utciValidated }} open={open} />
      <p className="eyebrow">Averaged over this area’s pavements and paths</p>
      <div className="facts"><p>Feels-like <b>{drop(withSpots.areaMean.utci - now.areaMean.utci)} °C</b> · street air <b>{drop(withSpots.areaMean.air - now.areaMean.air)} °C</b> (published) more than now</p></div>
      <Basis open={open} validated={withSpots.utciValidated} />
    </div>
  );
}

export function BuildingCard({ b, hour, sun, greenRoof, onGreenRoof, onClose, open }: {
  b: Building; hour: string; sun: { alt: number; az: number }; greenRoof: boolean; onGreenRoof: () => void; onClose: () => void; open: () => void;
}) {
  const shadow = Math.hypot(...shadowOffset(b.height, sun.alt, sun.az));
  const free = freeRoofM2(b);
  const row = (k: string, v: React.ReactNode) => <div className="row"><span>{k}</span><b>{v}</b></div>;
  return (
    <div className="card">
      <div className="card-head"><h3>Building</h3><button className="x" onClick={onClose} aria-label="Close">×</button></div>
      {row('Height', <>{b.height.toFixed(1)} m <em className={b.heightRecorded ? 'tag' : 'tag warn'} title={b.heightRecorded ? undefined : 'Not in the campus layer: set to the median recorded height'}>{b.heightRecorded ? 'recorded' : 'campus median'}</em></>)}
      {row('Floors', b.floors ? `${b.floors} above ground${b.floorsBelow ? ` · ${b.floorsBelow} below` : ''}` : 'not recorded')}
      {row('Footprint', `${b.footprint.toFixed(0)} m²`)}
      {b.floors > 0 && row('Floor area (est.)', `≈ ${(b.footprint * b.floors).toFixed(0)} m²`)}
      {row('Rooftop PV mapped', b.pvM2 > 0 ? `${b.pvM2.toFixed(0)} m²` : 'none')}
      {row('Rooftop greenery mapped', b.greenRoofM2 > 0 ? `${b.greenRoofM2.toFixed(0)} m²` : 'none')}
      {row(`Shadow at ${hour}`, sun.alt > 0.02 ? `${shadow.toFixed(0)} m long` : 'sun is down')}
      {(b.pvM2 > 0 || b.greenRoofM2 > 0) && <p className="muted">{b.pvM2 > 0 && `${b.pvM2.toFixed(0)} m² of this roof carries solar panels. `}{b.greenRoofM2 > 0 && `${b.greenRoofM2.toFixed(0)} m² is already mapped as green. `}{free > 0 ? `A green roof here counts only the remaining ${free.toFixed(0)} m².` : 'No free roof is left for a green roof.'}</p>}
      <button className={greenRoof ? 'primary' : ''} onClick={onGreenRoof} disabled={free === 0 && !greenRoof}>{greenRoof ? 'Green roof added ✓' : 'Add a green roof'}</button>
      <p className="muted">Measured on a Singapore test bed: a green roof ran {COEFF.roofSurface.value} °C cooler at the roof surface than a bare roof (Qin et al. 2012) <Ref ids={COEFF.roofSurface.ref} open={open} /></p>
    </div>
  );
}
