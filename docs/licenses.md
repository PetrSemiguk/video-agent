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
| Pexels video 1851190, [The Sun Illuminating Earth's Surface](https://www.pexels.com/video/the-sun-illuminating-earth-s-surface-1851190/), current creator Ingrid (checked 2026-11-04) | [Pexels License](https://www.pexels.com/license/); video page marked Free | Yes; local graded/trimmed video use | We use "Video: Ingrid / Pexels" on screen. Source is illustrative Earth animation, not a geographic measurement or NASA imagery. Retain source URL/hash in the local media manifest. |
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

## Pilot factual research sources (step 4.4)

These entries authorize factual research and original narration, not importing
website imagery, maps, logos, screenshots or prose into the video.

| Source | License / permitted use | Commercial use? | Attribution / handling |
|---|---|---|---|
| Worden, Savada and Dolan (eds.), *China: A Country Study* (GPO for Library of Congress, 1987), [text mirror](https://countrystudies.us/china/) and [LOC scan](https://tile.loc.gov/storage-services/master/frd/frdcstdy/ch/chinacountrystud00word/chinacountrystud00word.pdf) | US federal publication; use factual information in original wording only here. No third-party illustrations or quoted passages imported. | Yes, factual research and original narration | Cite edition and exact chapter URLs in the pilot facts ledger. Use only historical facts and physical geography, not its dated current-affairs statistics or border descriptions. |
| UNESCO World Heritage Centre, [The Grand Canal](https://whc.unesco.org/en/list/1443/) | Page description marked CC BY-SA IGO 3.0. This pilot uses independently worded factual statements, not a reproduction/adaptation of the description or its media. | Yes, factual research and original narration | Cite UNESCO and URL in the pilot ledger/description. No photos, maps, logos, quoted prose or page assets imported. Any later media reuse requires separate review. |

## Map data derived for episodes (step 4.6)

Terrain masks (`vap.geo.terrainregion`) use only the AWS Terrain Tiles and Natural Earth rows above, and
need no new credit beyond theirs. Canal routes use these factual references:

| Source | License / permitted use | Commercial use? | Attribution / handling |
|---|---|---|---|
| Wikipedia, [Grand Canal (China)](https://en.wikipedia.org/wiki/Grand_Canal_(China)) and [Sui dynasty](https://en.wikipedia.org/wiki/Sui_dynasty), read 2026-11-05 | Text is CC BY-SA. Used only for facts (which places a canal section connects). No text, map or image imported. | Yes, as factual research | Cited per node in `routes/<slug>.sources.md`. Coordinates are our own, of the modern cities. |
| China Highlights, [Grand Canal in China](https://www.chinahighlights.com/travelguide/culture/grand-canal.htm), read 2026-11-05 | Publisher's website; no open license looked for, as nothing is reused. Facts only (endpoints and years of sections). No text, map or image imported. | Yes, as factual research | Cited per node. A travel guide, so never the only source of a claim that matters. |

**[HydroSHEDS / HydroBASINS](https://www.hydrosheds.org/products/hydrobasins) v1: NOT USED.** Read 2026-11-05 in
[Technical Documentation v1.4](https://data.hydrosheds.org/file/technical-documentation/HydroSHEDS_TechDoc_v1_4.pdf),
Appendix A. Commercial use is allowed, but the license is not clean for this channel: end users must be
bound by a written license at least as protective, records of use must be kept for 2 years and open to WWF's
inspection, the licensee indemnifies WWF, and WWF may terminate at its sole discretion. Nothing was
downloaded. As the roadmap directs, the pilot lights the rivers themselves, from Natural Earth. **Do not**
take HydroSHEDS v2 (announced as CC BY 4.0) for these terms: it is a separate product and was not reviewed.

## Voice models and watermarking

Step 3.3 alignment sources (checked 2026-11-04, before installation/download):

| Source | License | Commercial use? | Attribution / handling |
|---|---|---|---|
| [faster-whisper 1.2.1](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE) | MIT | Yes | Keep distributed copyright/license notices; no on-screen credit required. |
| [CTranslate2 4.8.5](https://github.com/OpenNMT/CTranslate2/blob/master/LICENSE) | MIT | Yes | Keep distributed copyright/license notices. |
| [Systran/faster-whisper-small.en weights](https://huggingface.co/Systran/faster-whisper-small.en/blob/main/README.md), converted from OpenAI Whisper small.en | MIT ([upstream license](https://github.com/openai/whisper/blob/main/LICENSE)) | Yes | Pinned revision `d1d751a5f8271d482d14ca55d9e2deeebbae577f`; retain notices. Used only for transcription/alignment; no external audio/media is imported. |

| Source | License | Commercial use? | Attribution text |
|---|---|---|---|
| [Chatterbox TTS 0.1.7 code](https://github.com/resemble-ai/chatterbox/blob/master/LICENSE) | MIT | Yes | Retain the distributed copyright/license notice. No on-screen credit required. |
| [ResembleAI/chatterbox weights](https://huggingface.co/ResembleAI/chatterbox) (original English model) | MIT, per publisher model card | Yes | Retain model provenance and revision in voice manifests. No voice-cloning rights are granted by a model license. |
| [Resemble Perth watermarking](https://github.com/resemble-ai/Perth/blob/master/LICENSE) | MIT | Yes | Retain distributed copyright/license notices. Keep the built-in watermark enabled; do not substitute a dummy watermarker. |

## Historical boundary sources

Spec parser: [PyYAML](https://github.com/yaml/pyyaml/blob/main/LICENSE), MIT, commercial use allowed.

Factual references for composed maps: Wikipedia article URLs, cited per state in `<slug>.sources.md`. Facts only: no text, maps or images are imported.

Parser software: [pyosmium 4.3.2](https://github.com/osmcode/pyosmium/blob/master/LICENSE.TXT)
is BSD-2-Clause, commercial use allowed. Keep the distributed license notice.
Using this library does not change the licenses of the OHM elements it reads.

See [historical-sources.md](historical-sources.md) for coverage, download methods and limitations.

| Source | License | Commercial use? | Attribution text |
|---|---|---|---|
| OpenHistoricalMap boundary relations and geometry ways | CC0 by default, per-element exceptions | Yes for CC0, untagged and CC BY 4.0 elements; NC, SA, ND and anything unrecognised is skipped with a report | On screen: "Historical borders: OpenHistoricalMap contributors and others - see description". Description: the layer's `<slug>.attribution.md`. Retain relation URLs. |
| [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria) v0.2.1 (`cliopatria.geojson.zip`, checked 2026-11-05) | CC BY 4.0, per its [LICENSE.md](https://github.com/Seshat-Global-History-Databank/cliopatria/blob/main/LICENSE.md) | Yes, with attribution | On screen: "Historical borders: Cliopatria (Seshat), CC BY 4.0 - see description". Description: the exact block under [Historical CC BY attribution](#historical-cc-by-attribution). Hand-drawn from published maps at varying timesteps; check facts per layer. |

## Historical CC BY attribution

Used only through OHM ways that carry these sources, or through Cliopatria. Each layer's
`<slug>.attribution.md` lists only those it uses. Checked 2026-11-05.

| Source | Publisher's license | Commercial use? | Exact attribution text |
|---|---|---|---|
| IGN CNIG (Spain), municipal and national boundary lines ([license](https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf)) | CC BY 4.0 | Yes. The license asks for the credit at the foot of the map, or in credits only if that is manifestly impossible. | `Obra derivada de BDLJE CC-BY 4.0 ign.es`: derived-work form of the license. BDLJE is the product id in the [scne.es table](https://www.scne.es/productos.php) that best fits the ways' `LILIM` source; shown on the frame as well. |
| Kartverket, Norway ([terms](https://www.kartverket.no/api-og-data/vilkar-for-bruk)) | CC BY 4.0 | Yes | `© Kartverket` with a link to https://www.kartverket.no where possible |
| Surveying and Mapping Authority of the Republic of Slovenia (GURS), Evidenca državne meje ([general terms, 2022-09-19](https://www.e-prostor.gov.si/fileadmin/struktura/EGP/preberi_me.pdf), read at the source 2026-11-05) | CC BY 4.0 | Yes: the terms allow non-commercial and commercial use, sharing and adaptation, with the source credited. Use ends at once if the terms are broken. | `Geodetska uprava Republike Slovenije, Evidenca državne meje, stanje najkasneje 2026-05`. The terms require the data type and date. OHM records no state date, so this is an upper bound: the latest OHM edit of these ways. |
| HDX COD-AB Ukraine ([dataset](https://data.humdata.org/dataset/cod-ab-ukr)), source State Scientific Production Enterprise "Kartographia", via OCHA | **CC BY-IGO 3.0** at the source ([legal code](http://creativecommons.org/licenses/by/3.0/igo/legalcode)). Discrepancy: the OHM ways are tagged CC BY 4.0; the source's terms are followed. Kept by the owner's decision, 2026-11-05. | Yes: commercial use is not restricted, attribution required | `Ukraine - Subnational Administrative Boundaries, State Scientific Production Enterprise "Kartographia", via OCHA on HDX (https://data.humdata.org/dataset/cod-ab-ukr). License: CC BY-IGO 3.0, http://creativecommons.org/licenses/by/3.0/igo/legalcode. Changes: via OpenHistoricalMap, clipped, simplified. No endorsement implied.` |
| HDX COD-AB Costa Rica ([dataset](https://data.humdata.org/dataset/cod-ab-cri)), source Costa Rica National Statistics Office, via OCHA | **CC BY-IGO 3.0** at the source, with the same discrepancy and decision as Ukraine | Yes: commercial use is not restricted, attribution required | `Costa Rica - Subnational Administrative Boundaries, Costa Rica National Statistics Office, via OCHA on HDX (https://data.humdata.org/dataset/cod-ab-cri). License: CC BY-IGO 3.0, http://creativecommons.org/licenses/by/3.0/igo/legalcode. Changes: via OpenHistoricalMap, clipped, simplified. No endorsement implied.` |
| Cliopatria | CC BY 4.0 | Yes | `Bennett, J. S. et al. Cliopatria - A geospatial database of world-wide political entities from 3400BCE to 2024CE. Scientific Data 12, 247 (2025). https://doi.org/10.1038/s41597-025-04516-9. Data v0.2.1: https://github.com/Seshat-Global-History-Databank/cliopatria. License: https://creativecommons.org/licenses/by/4.0/. Changes: clipped to Natural Earth land, simplified.` |

## Step 2.1 headline candidates (local, unmodified Google Fonts files)

| Source | License | Commercial use? | Attribution text |
|---|---|---|---|
| Barlow Condensed Bold, [Google Fonts](https://github.com/google/fonts/tree/main/ofl/barlowcondensed), `studio/public/fonts/barlowcondensed/` | SIL Open Font License 1.1 ([license](https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt)) | Yes, including video embedding | No on-screen credit required; retain OFL.txt beside the unmodified font. |
| Oswald variable, [Google Fonts](https://github.com/google/fonts/tree/main/ofl/oswald), `studio/public/fonts/oswald/` | SIL Open Font License 1.1 ([license](https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/OFL.txt)) | Yes, including video embedding | No on-screen credit required; retain OFL.txt beside the unmodified font. |
| Anton Regular, [Google Fonts](https://github.com/google/fonts/tree/main/ofl/anton), `studio/public/fonts/anton/` | SIL Open Font License 1.1 ([license](https://raw.githubusercontent.com/google/fonts/main/ofl/anton/OFL.txt)) | Yes, including video embedding | No on-screen credit required; retain OFL.txt beside the unmodified font. |
