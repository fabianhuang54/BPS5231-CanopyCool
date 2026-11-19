# CanopyCool Singapore

Explore the NUS Kent Ridge campus, see where paving is sunlit, and test where trees and green roofs would help. Works offline; no API keys.

1. The whole campus opens first.
2. Drag a rectangle (or click for a 300 m square) over an area with buildings or trees to open it in 3D; empty ground can't be selected.
3. Click a building for its height, floors, footprint, rooftop PV/greenery and shadow length.
4. **Plant trees** to place trees: a live card shows the paving each would newly shade.
5. **Recommend** ranks the best planting spots and shows what they would change before you accept them.

6. **Green roof**: select a building and add a green roof; the roof area used is the footprint less mapped solar panels and mapped greenery.
7. **Heat exposure** (button on the campus map): ranks 100 m blocks by sunlit pavement and path area, 13:30 to 15:30, roads left out. Exposure only: it does not count people.
8. The **Sky** selector (clear, typical, overcast) changes the feels-like slope; the time slider runs 07:00 to 18:30.

The feels-like cooling figure between 13:00 and 16:00 comes from a line fitted on SOLWEIG runs (see below); every other temperature
figure is a published, cited difference (see **Sources** in the app, or `src/lib/evidence.ts`).

## Run

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit tests
npm run build
```

## Data

**Offline first.** The default sites (`NUS · Zone 1 … 7`) use the NUS Kent Ridge campus layers bundled in `public/data/nus.json`, so they need no network: buildings (with recorded heights), tree canopy, forest, paved areas, turf, shrubs, existing green roofs and rooftop PV, plus typical hourly conditions from the 40 campus weather stations (2025). After the first visit a service worker keeps the app and data available offline (production build only).

Rebuild the bundle from the team's private analysis repository (`SHP_files/` and `data/raw/`, not included here):

```bash
node scripts/build-nus-data.mjs "<path to the BPS5231 repo>"
```

## Checks against the layers

Anything derived or generated is checked against the source layers, in three places:

1. **Build** (`node scripts/build-nus-data.mjs`): record counts and areas against the raw shapefiles (in their own projected metres, which also tests the coordinate conversion), layers against each other (PV and greenery sit on buildings, everything inside the campus boundary), and the generated trees (inside a canopy outline, 1.5 m off buildings, crown sizes from the layer, cover near target). The file is not written if any check fails, and the results are stored in `nus.json`.
2. **Each area you open** (`src/lib/validate.ts`): mapped and generated trees against the outlines and buildings, and the shade-analysis grid against the vector layers by sampling. A failure shows a warning banner and is listed in Sources.
3. **Your plan**: planted trees, recommended spots and green roofs must respect buildings and paving, and planting must never reduce shade.

`npm test` runs these on the real campus file, including 40 random areas, and tests that they do fail when something is wrong.

## Cooling figures

All coefficients live in `src/lib/evidence.ts` with the study each comes from; the app lists the references and their limits.

- **Feels-like (UTCI) cooling, 13:00 to 16:00:** `UTCI_SLOPE` is the mean cooling per newly shaded paved cell from a line fitted on 8,424 SOLWEIG cases (936 single trees x 3 days x 3 times)
  (six campus sites, thin crowns, `data/surrogate_thin`), applied to this app's own shaded area. It scored R² about 0.92 on sites it never saw. It covers new trees, with the cooling counted on
  paving, three station-median sky types and three sun times (13:30, 14:30, 15:30, interpolated between). SOLWEIG models radiant heat only, so this is the
  sun-and-shade part of feels-like temperature, not evaporative cooling. Outside the window the app shows the published 3.1 °C and labels it "not checked at this hour".
- **Surface and air cooling, and the green roof figures:** published values (Ow 2020, Xu 2024, Qin 2012; all checked against their papers, limits noted in Sources), scaled
  linearly by the share of paving newly shaded (and roof air by the share of roof greened). A planning estimate, not a simulation. The roof surface figure is not area-scaled.
- Assumptions with no data behind them (`src/lib/defaults.ts`): every tree 10 m tall, planted crowns 4 m radius, buildings without a height use floors x 3.2 m else 12 m.
  Shade is computed on the paving only, on a 2 m grid, with the sun position of the day each sky's line was fitted on (`FIT_DAY` in `evidence.ts`); roads are not counted.

Full validation record and failed criteria: the project log (`docs/PROJECT_LOG.md`, section 8) in the team's private analysis repository.
