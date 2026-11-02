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
| `admin1` | admin_1_states_provinces | polygons, coverage-simplified |
| `coastline` | coastline | lines |
| `rivers` | rivers_lake_centerlines (+ rivers_europe/north_america at 10m), one feature per river | lines |
| `lakes` | lakes | polygons |
| `regions` | geography_regions_polys + points + marine_polys | polygons (with `label` point) and points |
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
   is raised ×1.5 until it fits, and the log says so (Europe `admin1` needs 2.5 px: Natural
   Earth has ~2000 units there).
6. The files are also mirrored to `studio/public/geo/<plate>/` (git-ignored), where Remotion
   loads them.

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
