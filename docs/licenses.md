# Data & media licenses

Rule: before using a **new** source, add a row here. Sources marked **FORBIDDEN** are never used.
The channel is monetized, so only sources allowing commercial use are acceptable.

| Source | License | Commercial use? | Attribution text |
|---|---|---|---|
| Natural Earth (v5.1.2 vector layers) | Public domain | ✅ Yes | Not required; recommended credit, which we use: "Made with Natural Earth". |
| CShapes 2.0 / CShapes-Europe | CC BY-NC-SA 4.0 ([publisher](https://icr.ethz.ch/data/cshapes/)) | ⛔ **FORBIDDEN** for this monetized channel | — |
| historical-basemaps | GPL-3.0 | **REFERENCE ONLY** by project policy; never rendered or traced | — |
| Mapbox (all products: styles, tiles, Satellite, Terrain, APIs) | Mapbox Product Terms | ⛔ **FORBIDDEN** — Licensed Map Content may not be used in video without separately purchased print/video rights | — |
| Sentinel-2 cloudless **2016** (EOX) | ⏸ **ON HOLD** — conflicting terms: the 2016 layer page says CC BY 4.0, the general EOX license says a commercial license is required | ⏸ Do not use until EOX confirms in writing | (only if confirmed) "Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)" |
| Sentinel-2 cloudless **2018+** (EOX) | CC BY-NC-SA 4.0 | ⛔ **FORBIDDEN** | — |
| GADM | Non-commercial only | ⛔ **FORBIDDEN** | — |
| Copernicus DEM | Copernicus DEM licence (free, commercial use allowed with attribution) | ✅ Yes | ⚠️ Verify exact attribution wording. Draft: "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA." |
| AWS Terrain Tiles (Mapzen / Tilezen joerd), `elevation-tiles-prod`, terrarium PNG | Mixed open sources (SRTM, GMTED2010, 3DEP, ETOPO1, EU-DEM, …) — per-source terms | ✅ Yes (per source terms) | Video description: the exact block in [AWS Terrain Tiles attribution](#aws-terrain-tiles-attribution). On screen (map plates): "Terrain: USGS, NOAA, EU-DEM (Copernicus) et al. via AWS Terrain Tiles". |
| NASA Blue Marble: Next Generation (2004, topography + bathymetry, 500 m) | Public domain (NASA imagery is not copyrighted) | ✅ Yes | NASA asks to credit "NASA Earth Observatory". Video description: `Blue Marble: Next Generation imagery courtesy of "NASA Earth Observatory" (Reto Stöckli, NASA Goddard Space Flight Center).` On screen: "Imagery: NASA Earth Observatory". Never use NASA logos or insignia. |
| Pexels | Pexels License | ✅ Yes | Not required; credit when practical. |
| Pixabay | Pixabay Content License | ✅ Yes | Not required; credit when practical. |
| Wikimedia Commons | Per file (CC BY, CC BY-SA, PD, …) | ⚠️ Per file | Check the license of **every** file. Record each one in `episodes/<slug>/attributions.md` (file URL, author, license, required credit). Never use NC/ND files. |
| Inter font v4.1 (rsms/inter), `studio/public/fonts/inter/` | SIL Open Font License 1.1 | ✅ Yes (embedding in video is allowed) | Not required on screen; keep `LICENSE.txt` next to the font files. Never sell the font files on their own. |
| maplibre-gl (software library) | BSD-3-Clause | ✅ Yes | Not required on screen; keep the license notice (shipped in the package). |
| Remotion (software) | Remotion License | ✅ Yes — free for individuals and companies of up to 3 people, commercial use allowed | Not required. ⚠️ A company license is required if the team grows to 4+ people. |

## AWS Terrain Tiles attribution

Exact "Required attribution" text from
[tilezen/joerd docs/attribution.md](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
The variant with a leading "Mapzen" line applies only to Mapzen's former hosted service.
Paste it verbatim into the description of every episode that uses terrain:

```
* ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and
  funded under National Science Foundation awards 1043681, 1559691, and 1542736;
* Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017;
* Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM)
  Österreich;
* Canada terrain data contains information licensed under the Open Government
  Licence – Canada;
* Europe terrain data produced using Copernicus data and information funded by the
  European Union - EU-DEM layers;
* Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration
* Mexico terrain data source: INEGI, Continental relief, 2016;
* New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New
  Zealand and the New Zealand Government (All rights reserved);
* Norway terrain data © Kartverket;
* United Kingdom terrain data © Environment Agency copyright and/or database right
  2015. All rights reserved;
* United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data
  courtesy of the U.S. Geological Survey.
```

The same texts are embedded in every plate's `studio/public/plates/<name>.json`
(`attribution.on_screen`, `attribution.full`), generated from `pipeline/src/vap/geo/sources.py`.

## Historical boundary sources

Parser software: [pyosmium 4.3.2](https://github.com/osmcode/pyosmium/blob/master/LICENSE.TXT)
is BSD-2-Clause, commercial use allowed. Keep the distributed license notice.
Using this library does not change the licenses of the OHM elements it reads.

See [historical-sources.md](historical-sources.md) for coverage, download methods and limitations.

| Source | License | Commercial use? | Attribution text |
|---|---|---|---|
| OpenHistoricalMap boundary relations and geometry members | CC0 by default, per-element exceptions | Yes for CC0/untagged elements only; reject explicit other licenses on relation or members | OpenHistoricalMap contributors (CC0); retain relation URLs. |
| Cliopatria (candidate only; not imported) | CC BY 4.0 | Yes, subject to attribution and per-record provenance review before use | Seshat Global History Databank, Cliopatria; https://creativecommons.org/licenses/by/4.0/; indicate changes. |

## Step 2.1 headline candidates (local, unmodified Google Fonts files)

| Source | License | Commercial use? | Attribution text |
|---|---|---|---|
| Barlow Condensed Bold, [Google Fonts](https://github.com/google/fonts/tree/main/ofl/barlowcondensed), `studio/public/fonts/barlowcondensed/` | SIL Open Font License 1.1 ([license](https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt)) | Yes, including video embedding | No on-screen credit required; retain OFL.txt beside the unmodified font. |
| Oswald variable, [Google Fonts](https://github.com/google/fonts/tree/main/ofl/oswald), `studio/public/fonts/oswald/` | SIL Open Font License 1.1 ([license](https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/OFL.txt)) | Yes, including video embedding | No on-screen credit required; retain OFL.txt beside the unmodified font. |
| Anton Regular, [Google Fonts](https://github.com/google/fonts/tree/main/ofl/anton), `studio/public/fonts/anton/` | SIL Open Font License 1.1 ([license](https://raw.githubusercontent.com/google/fonts/main/ofl/anton/OFL.txt)) | Yes, including video embedding | No on-screen credit required; retain OFL.txt beside the unmodified font. |
