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
