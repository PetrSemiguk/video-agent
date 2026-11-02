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
                                          multiply blend (--hillshade) → grade (grades.json)
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

`pipeline/src/vap/geo/grades.json` (`dark`, `neutral`). Order: saturation → exposure → gamma →
ocean (water = elevation ≤ 0 and blue-dominant, feathered; multiplied and tinted) → vignette
(r = 1 at the corners, smoothstep from `inner` to `outer`). These values move to design tokens
in step 5.

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
| `RiverLine` | geo | Draws source → mouth at constant speed along the length (`cumfrac`). Width tapers min→max over 24 pieces, optional glow, bright head while growing. |
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
