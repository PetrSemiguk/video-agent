# Map plates

A **plate** is a pre-rendered 4K still of a region in Web Mercator (EPSG:3857). Remotion moves it
with CSS transforms (the fixed map plate technique from the remotion-maps skill), so satellite
detail never shimmers. Every plate comes with a JSON file that maps lon/lat to plate pixels.

Mapbox is not used anywhere (see [licenses.md](licenses.md)). Live vector maps, if needed later,
use MapLibre GL JS with our own sources.

## Pipeline

```
bbox (lon/lat) ──► fit to W:H in EPSG:3857 (centre kept)
                    │
NASA Blue Marble NG ─┼─► reproject 4326 → 3857 onto the exact extent ─┐
(500 m JPEG tiles)   │                                                 │
AWS Terrain Tiles ───┴─► terrarium z-tiles → elevation (m) → hillshade ┤
(terrarium PNG)                                                        ▼
                                          multiply blend (--hillshade) → grade (design tokens)
                                                                       ▼
                         studio/public/plates/<name>.png (git-ignored) + <name>.json (committed)
```

Code: `pipeline/src/vap/geo/` — `mercator.py` (math), `bluemarble.py`, `terrain.py`,
`look.py` (hillshade + grade), `sources.py` (attribution texts), `plate.py` (CLI).

### Sources and caches (`data/raw/`, git-ignored)

- **Blue Marble NG, topography + bathymetry, August 2004**, 8 tiles of 21600×21600 px
  (A–D = 90° of longitude each from 180° W; row 1 = 90° N–0°, row 2 = 0°–90° S; 240 px/degree).
  URL: `https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/august/world.topo.bathy.200408.3x21600x21600.<A-D><1-2>.jpg`.
  Only tiles that intersect the plate are downloaded (~55–90 MB each), to `data/raw/bluemarble/`.
  The JPEG is read with a window plus decimation; GDAL uses the JPEG's built-in reduced-resolution
  decoding, so a full tile is never held in memory.
- **Why August:** on the 5400×2700 previews, August has the least bright, unsaturated (snow)
  pixels of June/July/August over Tibet (1.52 % vs 1.74 % in July), the Alps (0.08 % vs 0.18 %),
  eastern China and Europe. Clouds are already removed in BMNG.
- **AWS Terrain Tiles**, terrarium encoding
  (`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`,
  elevation = R·256 + G + B/256 − 32768 m), cached as `data/raw/terrain/terrarium/z/x/y.png`.
  Zoom = the smallest z whose pixel is at least as fine as the plate pixel (z7 for a 4K plate of
  a ~60° wide region), capped at 2500 tiles. A missing tile (404) is cached as an empty file.

### Hillshade

- Azimuth 315°, sun altitude 45°, vertical exaggeration `--exaggeration` (default 3).
- Ground pixel size = Mercator pixel size × cos(latitude), per row.
- Elevations below 0 are flattened, so the ocean stays neutral (BMNG already shows bathymetry).
- Normalised so that flat ground = 1.0. Blend: `rgb × lerp(1, shade, --hillshade)` (a multiply
  in which flat ground is unchanged and lit slopes brighten slightly).

### Grade

`studio/src/design/tokens.ts` is the single source (`plateLookJson`, a JSON string
read by Python without executing TypeScript). `dark` is grade v2; `dark_v1` is retained
for reproducible comparisons; `neutral` bypasses styling. Order: saturation, exposure,
gamma, land midtone lift (+12.5%) with a smooth highlight shoulder, ocean tint/multiply,
and vignette. The land adjustment uses the inverse feathered ocean mask, so fully
masked sea pixels match v1 exactly. Default hillshade is 0.65.

`uv run python -m vap.geo.grade_review` rebuilds the China/europe review pairs from
licensed source caches and refreshes their production PNG/metadata without changing
projection extents. `china-east-hs05` is a legacy identifier; metadata records the
current 0.65 hillshade. Other historical A/B plates retain their explicit settings.
Run `node scripts/render-design-review.mjs` from studio for all 2.1 renders.

## Metadata contract (`<name>.json`)

| Field | Meaning |
|---|---|
| `image` | path under `studio/public/` (`plates/<name>.png`) |
| `width`, `height` | plate size in px |
| `requested_bbox_lonlat` | bbox passed to the CLI |
| `bbox_lonlat` | actual extent after fitting to W:H: `[minLon, minLat, maxLon, maxLat]` |
| `bbox_3857` | same in EPSG:3857 metres: `[minX, minY, maxX, maxY]` |
| `pixel_size_m` | Mercator metres per pixel (same on both axes) |
| `zoom.tile512` / `zoom.tile256` | equivalent web-mercator zoom (MapLibre uses 512) |
| `projection` | `radius_m` and the formula below |
| `params` | hillshade, exaggeration, sun, grade, Blue Marble month, terrain zoom |
| `attribution` | `sources[]`, `on_screen` (overlay line), `full` (video description) |

### lon/lat → plate pixels

```
R    = 6378137
x_m  = R · lon · π/180
y_m  = R · ln(tan(π/4 + lat · π/360))        (lat clamped to ±85.0511287798066)
px   = (x_m − minX) / (maxX − minX) · width
py   = (maxY − y_m) / (maxY − minY) · height
```

(0, 0) is the **top-left corner** of the image and (width, height) the bottom-right corner; the
centre of pixel (i, j) is (i + 0.5, j + 0.5). Implementations: `Extent.lonlat_to_px` in
`pipeline/src/vap/geo/mercator.py` and `lonLatToPlatePx` in `studio/src/geo/plate.ts`.
Tests: `pipeline/tests/test_mercator.py` (centre → centre, bbox corners → image corners).

To draw on a plate placed with `object-fit: cover` in a frame, use `coverFit` from
`studio/src/geo/plate.ts`: `frame = offset + px · scale`.

## Vector layers (Natural Earth)

Source: Natural Earth **v5.1.2** (latest release; public domain, credit "Made with Natural
Earth"), downloaded as GeoJSON from `github.com/nvkelso/natural-earth-vector` (tag v5.1.2) into
`data/raw/naturalearth/v5.1.2/` (git-ignored, cached). 10m and 50m variants of:
admin_0_countries, admin_1_states_provinces (10m only), coastline, land, ocean,
rivers_lake_centerlines (+ 10m rivers_europe, rivers_north_america), lakes,
geography_regions_polys/points, geography_marine_polys, populated_places.

**Disputed borders.** Natural Earth ships `admin_0_countries` in the default *de facto* view
and also in point-of-view variants (`admin_0_countries_<iso>`, e.g. how China, India or
Pakistan see Kashmir, Arunachal Pradesh, Aksai Chin and similar areas). We currently use the
default de facto file. Which view to show for disputed territories is an editorial decision
made per episode and recorded in that episode's notes; it is not a pipeline default.

### Output layers (`data/processed/<plate>/<layer>.geojson`, committed)

| Layer | Sources | Geometry |
|---|---|---|
| `countries` | admin_0_countries | polygons, coverage-simplified |
| `admin1` | admin_1_states_provinces — **opt-in**: `--admin1-countries CHN,MNG` (only those countries) | polygons, coverage-simplified |
| `coastline` | coastline | lines |
| `rivers` | rivers_lake_centerlines (+ rivers_europe/north_america at 10m), one feature per river | lines |
| `lakes` | lakes | polygons |
| `regions` | geography_regions_polys + points + marine_polys | polygons (with `label` point) and points; marine areas (seas, bays, straits) are stored as their label point only |
| `places` | populated_places | points |
| `land`, `ocean` | land, ocean (only with `--layers`) | polygons |

Properties: `id`, `name_en`, `type` (Natural Earth `featurecla`), `scalerank` (+ `label` for
region polygons). Ids: countries use ISO_A3 (ADM0_A3 where ISO_A3 is −99, e.g. France,
Norway); rivers from rivers_lake_centerlines use `rivernum-<n>` (that layer has no ne_id); all
others use `ne-<ne_id>`. Coordinates are rounded to 4 decimals (~11 m).

### How the extractor works (`vap.geo.extract`)

1. Clip box = plate `bbox_3857` + 10 % on every side.
2. Scale: 10m when the plate zoom (tile512) is ≥ 3, otherwise 50m.
3. Rank filter (Natural Earth scalerank, 0 = most important): with z = floor(zoom tile256),
   rivers/lakes/regions keep `scalerank ≤ z + 1` and places keep `scalerank ≤ z − 1`.
   `--min-rank N` overrides this with `scalerank ≤ N` for all ranked layers.
4. Geometry is projected to EPSG:3857 and simplified there with a tolerance of 0.75 plate
   pixels (`0.75 × pixel_size_m`).
   - **Topology:** `countries` and `admin1` are simplified as a polygon coverage with
     `shapely.coverage_simplify` (GEOS ≥ 3.12). Every shared edge is simplified once, so both
     neighbours keep identical border vertices: no gaps, no slivers. Tested on CHN/MNG
     (`tests/test_extract.py`).
   - Other polygons and lines: `simplify(preserve_topology=True)` per feature. Polygons
     smaller than ~2×2 px are dropped.
5. Size limits: ≤ 1.5 MB per file and ≤ 5 MB per plate. If a file is too big, its tolerance
   is raised ×1.5 until it fits, and the log says so. `admin1` is therefore opt-in and limited
   to the countries in focus (`--admin1-countries`), which keeps it at 0.75 px.
6. Regions filter: classes `Continent`, `Geoarea` (e.g. "Siberia", "East Antarctica") and
   `Dragons-be-here` are dropped, as is any region polygon larger than 20 % of the plate area
   ("Polynesia" and similar super-regions). Marine polygons become label points.
7. The files (including `custom/` and `rivers/`) are mirrored to `studio/public/geo/<plate>/`
   (git-ignored), where Remotion loads them; stale mirrored files are removed.

> **Rule:** NE geography_regions polygons are schematic — use them for labels only, never as
> highlighted shapes. Highlight real units built with `vap.geo.compose` instead.

### Generate for a new plate

```
cd pipeline
uv run python -m vap.geo.extract --plate <name>            # default layers
uv run python -m vap.geo.extract --plate <name> --layers rivers,places --min-rank 5
```

Check the result (from `studio/`). `GeoDebug` draws every layer with the plate's own lon/lat →
px formula, inside the variant-B transform:

```
npm run still:geodebug -- out/geodebug-<name>.png --props=props/geodebug-<name>.json
```

With props `{"plate": "<name>"}`, or add `"focus": {"lon": …, "lat": …}, "scale": 1` for a 1:1
crop.

### Find an object by name

```
uv run python -m vap.geo.find "Yellow" --layer rivers      # whole 10m dataset
uv run python -m vap.geo.find "Sichuan"                     # all layers
uv run python -m vap.geo.find "Tibet" --layer regions --plate china-east-hs05
```

It prints layer, id, name_en, type and scalerank; the ids match the extracted files. Note that
Natural Earth uses English short names, e.g. the Huang He is "Yellow" (`rivernum-95`).

### Custom regions (`vap.geo.compose`)

```
uv run python -m vap.geo.compose --plate china-east-hs05 --name heartland \
    --admin1 "Henan,Shandong,Hebei,Shanxi,Shaanxi,Beijing,Tianjin" --admin1-country CHN
uv run python -m vap.geo.compose --plate europe --name low-countries --countries NLD,BEL,LUX
```

Unions the selected Natural Earth 10m countries and/or admin1 units (names match `name_en`
or the local name; `--admin1-country` disambiguates). Before the union every part is
buffered by +½ tolerance and the result by −½ tolerance, which closes slivers between
neighbours, so there are no internal borders. The result is simplified like `extract`.
Holes smaller than ~2×2 px are dropped (`--fill-holes` removes all holes). Output:
`data/processed/<plate>/custom/<name>.geojson`, one feature with a `label` point and
`parts`. Beware of enclaves: e.g. Beijing and Tianjin sit inside Hebei, so leaving them out
cuts a notch into the region.

### River main stems (`vap.geo.river`)

```
uv run python -m vap.geo.river --plate china-east-hs05 --name "Yellow"
uv run python -m vap.geo.river --plate china-east-hs05 --name "Yangtze" [--also "Jinsha"]
```

1. Collects all 10m segments named `--name`. Natural Earth splits some rivers into reaches
   with different names, so known ones are added automatically (`ALIASES`: Yellow ← "Huang",
   Yangtze ← "Tongtian"); add others with `--also`.
2. `line_merge`, then the longest simple path through the graph of pieces (endpoints snapped
   within 3 plate px). That path is the main stem: branches, distributaries and lake stubs are
   dropped, and diagnostics are printed when pieces do not connect.
3. Orients the line source → mouth with terrarium elevations at z9 (median of the 5 end
   vertices; the source end must be higher).
4. Simplifies like `extract` and stores `cumfrac` (cumulative length fraction per vertex),
   `length_km`, `source_elev_m` and `mouth_elev_m`.

Output: `data/processed/<plate>/rivers/<slug>.geojson`, one `LineString`. Natural Earth
ends rivers where wide estuaries begin (the Yangtze stops at Zhenjiang; below it the
estuary is part of the coastline).

### River mouths (`vap.geo.mouth`, used by `vap.geo.river`)

A river must reach the water it flows into. After orienting the main stem, `river` tries,
in order:

1. **Manual:** `data/processed/<plate>/rivers/<slug>.extend.json` = `{"points": [[lon, lat], …]}`
   is appended to the mouth (Catmull-Rom). Always wins when the file exists.
2. **Estuary (automatic):** if the mouth touches the NE ocean polygon (NE ends rivers where
   a wide estuary starts), the ocean around it is rasterised (0.5 km cells). Distance to
   shore comes from repeated erosion of the water mask. Dijkstra with a step cost that grows
   near the shore follows the centre line to open water (≥ 15 km from shore). The path is cut
   at its last point within 5 km of the coastline (the estuary exit) and smoothed.
   Yangtze: Zhenjiang → South Branch → mouth at 121.90° E, 31.41° N (+277 km).
3. **Nearest shore:** a mouth more than 5 km from coastline/lakes gets a straight segment to
   the nearest shore (≤ 60 km). Yellow River: 7.6 km → 0 km.

The properties record `extended`, `extend_method` and the mouth-to-water distance before
and after. `--from lon,lat --to lon,lat --slug <name>` cuts a reach instead (e.g. the Danube
from Vienna to Belgrade); cut reaches are not extended.

### Terrain masks (`vap.geo.terrainregion`)

```
uv run python -m vap.geo.terrainregion --plate china-east-hs05 --name tibetan-plateau --min-elev 4000 --seed 90,32 --smooth 40
uv run python -m vap.geo.terrainregion --plate china-east-hs05 --name eastern-lowlands --max-elev 200 --seed 115,34.5 --smooth 25
```

Elevation on the plate grid, from the tiles the plate itself uses, cut at the threshold and limited to
Natural Earth 10m land. `--smooth` blurs the mask by that many km, which removes specks and thin links;
then the connected part holding `--seed` is kept, or the largest part without a seed. Output:
`data/processed/<plate>/terrain/<name>.geojson`, with `method`, `threshold_m`, `smooth_km`, `seed`, `area_km2`,
`label` and `approximate: true`. It is a contour of the terrain model, not a surveyed boundary of a landform.
`--bbox w,s,e,n` keeps one part of a larger region; that edge is editorial, so say so where it is used.
Tune the threshold until the contour sits on the edge visible on the plate: for the Tibetan Plateau 4,000 m
follows the edge, while 3,500 m wraps around the Qaidam Basin and reaches into Sichuan.

### Custom routes (`vap.geo.route`)

```
uv run python -m vap.geo.route --plate china-east-hs05 --spec ../data/processed/china-east-hs05/routes/specs/grand-canal-sui.yaml
```

A spec lists `branches` of `nodes` (`{name, lonlat, sources: [id], label: bool}`), the `sources` and the
`simplifications`. Every node needs a source; a node with `follow: <river slug>` makes the leg to it follow
`rivers/<slug>.geojson`, and it must lie within 0.25° of that river. Only follow a river where a source says
the route used it and the mapped course is the same one. Output: `routes/<slug>.geojson`, one LineString per
branch with `cumfrac`, `nodes` and `approximate: true`, and a generated `routes/<slug>.sources.md`. Draw it
with `RouteLine`. Between nodes a line is a schematic link: if a stretch is unconfirmed, keep it straight and
say so under `simplifications`.

### Plate resolution (oversampling)

`vap.geo.plate` reports `resolution.center` and `resolution.edge`: plate px per Blue Marble
px (the max of x/y). Mercator stretches latitude by 1/cos(lat), so the edge value is the
largest. Above 1.25 the plate is upscaled (soft): the generator warns and prints the
narrowest bbox width that stays sharp; `--strict` turns this into an error. PlateStage
caps the camera magnification of every plate at `min(1, 1 / resolution.edge)`.

| Plate | centre | edge |
|---|---|---|
| china-east | 0.33 | 0.40 |
| europe | 0.36 | 0.47 |
| central-europe | 0.82 | 0.91 |

## Camera (`studio/src/camera/`)

Rules:
- **The camera almost never stands still.** Use `drift()` for "static" shots; `hold()` only for
  QA and deliberate pauses.
- **Velocity is continuous.** Presets only emit keys. `cameraTimeline()` runs one C2 cubic
  spline through all keys per channel (centre x/y in Mercator metres, zoom = log2 scale,
  pitch, bearing), so velocity and acceleration are continuous across preset joints. Keys of
  `hold()` are clamped to zero velocity, so the camera eases into a hold and stays exactly
  still. Splines can overshoot between keys; the plate check catches that at render time.
- **Zoom limits:** `plateZoomLimits(meta)` gives `cover` (whole plate), `native` (1:1) and
  `max` (`native` + log2 of the oversampling cap). Pass `maxZoom` to `focusOn` near the limit.
  Pseudo-pitch magnifies the near edge (~5 % at 6°, ~15 % at 25°), so keep a margin.
- **Speed limit in episodes:** `motion.camera.maxSpeedPx` (9 px/frame), for the movement on screen, pan and zoom together at the frame's corners. `followLine` chases its aim point and zoom within this with `maxSpeed`,
  which episodes always pass; the storyboard check and `vap.qa.motion --check` fail on any preset above it.
- **Every frame is verified** (plate edges never visible, magnification within limits) before
  rendering; `npm test` runs the same check on the showreel timeline.

Presets (`presets.ts`; all frames counted from the segment start, all zooms absolute):

```ts
const tl = cameraTimeline([
  establish({ center: { lon: 10.6, lat: 48.6 }, zoom: E.cover + 0.12 }, 120), // 8 % push + drift
  flyTo({ center: { lon: 11.6, lat: 47.3 }, zoom: 5.2 }, 105),  // far → van Wijk zoom-out arc
  focusOn(alpsGeojson, 30, { tilt: 6, maxZoom: E.max - 0.16 }),  // fit into safe area − padding
  followLine(river, progress, 336, { zoom: 6.4, lead: 0.05, lag: 8, smooth: 24, blend: 60 }),
  drift(90),
  hold(30),
], { fps: 30, width: 1920, height: 1080 });
<PlateStage plate="…" camera={tl.path} … />
```

| Preset | What it does |
|---|---|
| `establish(target, frames, {push, drift})` | Opening pose plus a slow 6–10 % push-in with a light drift. Must be the first segment. |
| `flyTo(to, frames, {from})` | If the target is more than 1.2 frame widths away: van Wijk & Nuij optimal path (as map `flyTo`), zooming out mid-way in proportion to distance. Otherwise a direct pan. |
| `focusOn(geojson \| bbox, frames, {padding, tilt, bearing, maxZoom})` | Fits the object into the safe area minus `space.focusPadding`. |
| `followLine(line, progress, frames, {lead, lag, smooth, zoom, blend})` | Aims `lead` (length fraction) ahead of where the drawing head was `lag` frames ago, averaged over ±`smooth` frames, so the river's bends do not jerk the camera. Pass the same `progress` as `RiverLine`. Land on the aim point before the drawing starts, otherwise the camera has to chase the head. |
| `drift(frames, {dir, amount, zoom})` | Barely perceptible motion. |
| `hold(frames)` | Exactly static. |

### PlateSequence (several plates, one camera)

```tsx
<PlateSequence plates={["europe", "central-europe"]} transitionAt={300}
               transitionFrames={45} camera={tl.path} geo={…} screen={…} />
```

- One geo-camera (centre in lon/lat, zoom = metres per screen px) drives every plate. Each
  plate converts it into its own pixels, so a city lands on the same screen pixel on both
  plates: 0.015 px in vitest, 0.019 px measured in Chromium (`TransitionCheck` composition).
- Plate B crossfades over plate A. The geo layer (one copy) sits in its own container with
  the active plate's transform and switches plates mid-transition; it neither fades nor jumps.
  The screen layer is never duplicated.
- **Zoom-through window:** the next plate covers the frame only from a certain zoom, so the
  plate being replaced may be magnified up to `FADE_OUT_MAX_MAG` (1.4) from one transition
  length before the crossfade until it ends. In the showreel europe peaks at 1.35× for about
  1.5 s while zooming. The next plate must still cover the frame whenever it is visible.
  Size the next plate so that it covers the frame at the outgoing plate's sharp limit plus
  this window. That is why central-europe is 28.5° wide, not a tight 6° box around the Danube.

### Motion QA

`uv run python -m vap.qa.motion <mp4> [--marks 4,9.5]` estimates the image shift between
consecutive frames by phase correlation (grey, 480×270, Hann window, sub-pixel peak). It
writes `<video>-motion.png` (speed in blue, jump = change of the shift vector in red, joints
marked) and prints max speed, max/p99 jump and the max jump near each mark. Pure zooms read as
~0 speed, and fading overlays add measurement noise of ~1 px/frame².

With `--plan <slug>-camera-plan.json --check`, the same tool applies the build rule on still stretches; see
"Motion is a build rule" in [visual-grammar.md](visual-grammar.md).

## PlateStage (map engine)

`studio/src/map/PlateStage.tsx` packages the variant-B engine:

```tsx
<PlateStage plate="china-east-hs05" camera={keyframedCamera([...])}
            geo={<RiverLine … />} screen={<PlaceLabel … />} />
```

- **Camera:** a `CameraPath` (`studio/src/camera/types.ts`). Build one with
  `keyframedCamera` (`camera/keyframes.ts`): keys `{t, center, zoom, pitch, bearing, ease}`.
  Zoom can be `{cover: d}` (relative to "the plate fills the frame") or `{native: d}`
  (relative to 1 plate px = 1 frame px), and the centre is interpolated in Mercator. Before
  rendering, every frame is checked: no plate edge may become visible and nothing may be
  magnified above 1:1, otherwise the render fails and names the frame.
- **`geo` layer:** rendered inside the transformed plate container in plate pixels (use
  `GeoSvg`). It moves, scales and tilts with the map.
- **`screen` layer:** untransformed, on top of the map. Position elements with
  `useMapProjection().toScreen([lon, lat])`; they follow the map but keep a constant size
  (labels).
- **`useMapProjection()`** returns `toPlatePx`, `toScreen`, `plateToScreen`, `view` (centre,
  scale, pitch, bearing) and `meta`. `toScreen` is the exact forward form of the CSS
  transform + perspective (`projectToScreen` in `camera/plateProjection.ts`). It is tested
  two ways:
  - `npm test` (vitest): composes the CSS matrices from the very `transform` string;
    error ~1e-13 px;
  - the `ProjectionCheck` composition in Chromium: `getBoundingClientRect` of probes in the
    geo layer; max error 0.014 px over 10 tilted frames.
- **Stroke widths:** `vector-effect: non-scaling-stroke` does **not** compensate the CSS
  transform of an HTML ancestor: a 10 px stroke rendered at 6 px at scale 0.6, measured in
  `ProjectionCheck`. Geo components therefore divide widths by `view.scale` themselves.

Components (`studio/src/components/map/`; timings in frames from the enclosing `<Sequence>`,
styles only from `studio/src/design/tokens.ts`):

| Component | Layer | What it does |
|---|---|---|
| `RegionHighlight` | geo | Fill fades to `opacity.regionFill`. The outline draws around the perimeter (`pathLength=1` + dash offset per ring). `dimOutside` adds an even-odd mask built from the same rings, so there are no seams. |
| `RiverLine` | geo | Draws source → mouth at constant speed along the length (`cumfrac`). Width tapers min→max over 24 pieces, optional glow, bright head while growing. `fromFraction` fades in the upstream part and draws the rest. |
| `RouteLine` | geo | Draws `vap.geo.route` output at constant speed, branch after branch; solid or dashed from tokens, optional direction arrows, node labels when the head passes, an era label, and a mandatory credit. |
| `PlaceLabel` | screen | City dot + text with halo; fade + slide entrance; constant size; label box kept inside the 5 % safe area. |

## Camera moves: plate + CSS vs MapLibre 3D (step 1.2)

The shared trajectory lives in `studio/src/camera/flyover.ts` (centre/zoom keys, easing, and
the tilt profile of each variant).

- **B, plate + CSS** (`studio/src/ab/AbPlate.tsx`, `camera/plateProjection.ts`): the plate is
  moved with `translate(W/2,H/2) rotateX(pitch) rotateZ(-bearing) scale(s) translate(-cx,-cy)`
  under `perspective: 2000px`. `unprojectToPlate()` inverts this exactly. Before rendering,
  every frame is checked: the frame corners must land ≥ 2 plate px inside the plate, and the
  plate must never be magnified above 1:1 (the render fails otherwise). With 25° of
  pseudo-pitch the near edge is magnified ~15 %, so the end zoom stays 0.25 below native.
  Overlays sit inside the transformed layer at `lonLatToPlatePx()` positions.
- **A, MapLibre 3D** (`studio/src/ab/AbMapLibre.tsx`): a fully local style. The plate is an
  `image` source at `bbox_lonlat`, the terrain is a terrarium `raster-dem` from
  `studio/public/terrain/` (export with `vap.geo.terrain_export`), and markers are GeoJSON
  layers. The worker is served from `public/maplibre/` (`npm run prepare:maplibre`).
  Per-frame sync: `delayRender → jumpTo → triggerRepaint → once('idle') → continueRender`.
  Caveat: with high pitch the far edge of the plate (and the background behind it) comes
  into view, so 3D shots need a plate that extends well beyond the visible horizon.

## Adding a region

1. Choose a bbox (it is grown to 16:9 in Mercator around its centre; see `bbox_lonlat` in the
   output for what you actually got).
2. Generate (from `pipeline/`):
   ```
   uv run python -m vap.geo.plate --name <name> --bbox=<minLon,minLat,maxLon,maxLat> --hillshade 0.5
   ```
   Use the `--bbox=` form: a bbox starting with a negative longitude is otherwise parsed as a flag.
3. Add `studio/props/plate-<name>.json` with `{"plate": "<name>", "markers": [{"lon": …, "lat": …}]}`
   and render a check still (from `studio/`):
   ```
   npm run still:plate -- out/plate-<name>.png --props=props/plate-<name>.json
   ```
   Check that the marker lands on the right place and that the attribution is visible.
4. Commit `studio/public/plates/<name>.json` (the PNG is git-ignored and can be regenerated).

Limits: the bbox must stay within ±85.05° latitude and must not cross the antimeridian.
Blue Marble caps detail at 500 m per pixel, so plates tighter than about zoom 7.5 (tile512)
start to look soft.

## Historical layers

Source and license comparison: [historical-sources.md](historical-sources.md). Evidence
and results of the current layers: [reports/1.6.md](reports/1.6.md).

Run from `pipeline/`:

```
uv run python -m vap.geo.hist probe --plate europe --date 1914-07-01 [--search "Bavaria|Bayern"]
uv run python -m vap.geo.hist extract --plate europe --date 1914-07-01 --slug europe-1914
uv run python -m vap.geo.hist validate --file europe/historical/europe-1914.geojson
uv run python -m vap.geo.hist_qa
```

Run from `studio/`:

```
npm run still:hist -- out/hist-europe-1914.png --props=props/hist-europe-1914.json
```

`china-east` is an alias of the `china-east-hs05` plate. `probe` writes
`docs/reports/1.7/probe-<plate>-<date>.json`. `extract` writes
`data/processed/<plate>/historical/<slug>.geojson` (committed), an adjacent `.report.json`
and a copy under `studio/public/geo/`.

**Network.** All of `vap.geo` goes through the client in `vap/geo/http.py`, with an honest
User-Agent: Cloudflare in front of OHM rejects the default python-httpx one. Overpass requests
keep a 2 s pause and retry 429/504 with backoff. Every complete response is cached in
`data/raw/historical/`, so a repeated run does not touch the network.

**What counts as a state.** A relation with `admin_level=2`, `boundary=administrative` and
`type=boundary`, active on the date (inclusive start, exclusive end; partial dates expand to
their first day). This drops, for example, Scottish parliamentary districts
(`boundary=political`) and zones. The rule is `state_exclusion` in `hist.py`.

**Licenses.** The relation and every way of its geometry must be CC0, untagged or CC BY 4.0,
because OHM's default is CC0 but single ways may carry their own license. Anything else skips the
polity with a report; a skipped polity is left unfilled, not approximated.

**Attribution.** `extract` and `compose` record the short on-screen credit as `attribution` on the
layer and write the full list to `<slug>.attribution.md`, from what the layer really uses inside the
plate. `vap.episode build` copies it into a marked block of `episodes/<slug>/attributions.md`.

**Errata.** `<slug>.errata.json` lists known factual errors, each with `feature`, `problem`, `correct`,
`source` (URL) and `severity` (`blocker` or `warning`). It is written by hand and survives
regeneration. A shot using a layer with a blocker fails validation and the build, unless the layer has
`errataOverride: {"reason": "..."}`. In a storyboard, draw a layer with the `HistoricalLayer` component.

**Cliopatria.** `--source cliopatria` works with `probe` and `extract`, from one pinned release. Its
rows are whole-year frames that can lag events by years: compare neighbouring frames, and pick one
with `--frame-year`. See [historical-sources.md](historical-sources.md).

**Geometry.** Rings are assembled from the outer and inner ways. An open ring is an error and
is never closed. Absence from OHM stays a gap: no contour is drawn for it.

**Alignment.** Polygons are clipped to Natural Earth 10m land, which is what the plate's sea
mask comes from, so coasts match the plate. OHM polities are normally not a topological
coverage: then each inland border is simplified on its own at 0.75 plate px and the result is
cut with the land simplified at the same tolerance. If they do form a valid coverage,
`coverage_simplify` keeps shared borders identical. Overlaps never stop an extraction; each
pair is listed in the report as nesting (at least 90% of the smaller polity), sliver (at most
2%) or conflict.

**Feature fields.** `id`, `name_en`, `valid_from`, `valid_to` (null for no known end),
`source` (`ohm` or `custom`; CShapes is forbidden because its data is NC), `source_ref`,
`license`, `confidence` (high/medium/low), `approximate`, `notes`, plus `label` (lon/lat on the
surface of the largest part), `area_km2` and `palette_index` (0-7, neighbours differ, into
`polityPalette` in tokens). Dates are signed ISO years, negative for BCE, with no year zero.

Passing validation does not certify historical truth. Never use REFERENCE ONLY or FORBIDDEN
geometry. Snapping custom borders to rivers is not built.

## Composing historical maps

**When to compose.** First try a ready layer: run `probe` for the date and check the facts with
`vap.geo.hist_qa`. Use a ready layer if its states and names are right on your date and its errata has
no blocker. Compose when a good contour exists under the wrong name or frame, when one row must be
split or merged, or when only some states of a ready layer are wanted. Do not compose to fill a gap with
a guess: if no source shows a state's extent, say so in the script or leave it out.

**Spec.** `data/processed/<plate>/historical/specs/<slug>.yaml`:

```yaml
slug: china-560
states:
  - name_en: Northern Zhou
    valid_from: "0557"        # signed ISO; whole years are fine
    valid_to: "0581"          # exclusive
    confidence: medium        # high | medium | low
    color: regionB            # optional: regionA, regionB, conflict, neutral
    approximate: true         # the default
    sources:
      - https://en.wikipedia.org/wiki/Northern_Zhou
    notes: Cliopatria frame 561 contour.
    geometry:
      union:
        - layer: china-561-cliopatria
          feature: cliopatria-northern-zhou-561
      minus:
        - polygon: [[111, 30], [113, 30], [113, 31], [111, 30]]
```

A part of `union` or `minus` is one of:

| Part | Meaning | Find the id |
|---|---|---|
| `{ne_admin0: CHN}` | A Natural Earth country | `vap.geo.find "<name>" --layer countries` |
| `{ne_admin1: ne-123}` | A Natural Earth province | `vap.geo.find "<name>" --layer admin1` |
| `{layer: <slug>, feature: <id>}` | A feature of a layer on this plate | `properties.id` in the layer |
| `{polygon: [[lon, lat], ...]}` | Your own closed ring | Last resort, see below |

Prefer a layer's feature over Natural Earth, and Natural Earth over a polygon. Modern provinces are
only a fair stand-in where a historical border really followed them. Say so in `notes`.

**Compile.** `uv run python -m vap.geo.hist compose --plate <p> --spec <file>` writes the layer, its
report and attribution, and a `<slug>.sources.md` of the states' sources. States that overlap by 1 km²
or more stop the build and name the pair: decide who held the area and subtract it from the other.
Everything is clipped to land, and neighbours share exact borders.

**Sources and confidence.** Each state needs at least one URL that really supports its existence and
rough extent. Open each URL before citing it. Dates come from the source, in whole years unless it
gives more. Use:

- `high`: the border follows a documented line, such as a treaty or a river.
- `medium`: a published map or dataset shows this extent, and it agrees with the written sources.
- `low`: the location is known, the extent is not. A hand-made polygon is always `low`, and its `notes`
  must say it was not traced.

**After compiling.** Add the facts for your date to `LAYERS` in `vap/geo/hist_qa.py` and run it. Render
with `npm run still:hist`. Look at the picture. Record anything wrong in `<slug>.errata.json`.
