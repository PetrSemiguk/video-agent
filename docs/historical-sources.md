# Historical boundary sources

Researched 2026-11-02, updated 2026-11-05 (step 1.7). Dataset licenses take precedence over
software package licenses. Results behind this page: [reports/1.7.md](reports/1.7.md).

## Which source for which map

Start here. Every rule still requires the steps at the end of this section.

| Period and region | Use | Why |
|---|---|---|
| Europe, about 1900 onward | OHM | 1914: 11 of 11 checks, 99.9% of land, dated to the day. Borders follow rivers. |
| Europe, about 1800-1870 | A composed map: Cliopatria as the base, named and split by hand | OHM lacks Bavaria and Austria in 1815. Cliopatria has them but lumps Prussia and Saxony into one row. Neither layer alone passes. |
| China before 1000 | A composed map on the Cliopatria frame right after the event | OHM has none of these states. A Cliopatria frame can lag events by years: frame 561 is right for 560, while frame 555 still shows states gone since 557. |
| China, 1644 | Cliopatria frame 1645 for a map "after the fall of Beijing" | OHM paints all of China as Qing from 1644-06-05. Cliopatria's 1642-1644 frame shows Ming still in Beijing. |
| Anywhere else | Probe both, then decide | Both vary a lot by region. Nothing here was checked outside these cases. |

Whatever the source:

1. Run `probe`, and for Cliopatria look at the neighbouring frames too.
2. Add checks for the map's date to `vap.geo.hist_qa` and run it.
3. Write what you find in `<slug>.errata.json`. A `blocker` stops the episode build.
4. Do not read an absent polity as proof that a state did not exist.

How to compose a map: [maps.md](maps.md#composing-historical-maps).

## Sources

| Source | License / commercial video | Attribution | Coverage / format / access | Accuracy and project decision |
|---|---|---|---|---|
| [OpenHistoricalMap](https://www.openhistoricalmap.org/copyright) | CC0 by default, with per-element exceptions. CC0, untagged and CC BY 4.0 elements are used; anything else is skipped with a report. | Generated per layer in `<slug>.attribution.md`. Keep relation URLs. | Worldwide, uneven by date. Dated to the day. OSM JSON through [Overpass](https://wiki.openstreetmap.org/wiki/OpenHistoricalMap/Overpass). | Good for modern Europe, gaps and errors earlier. |
| [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria) v0.2.1 | CC BY 4.0: commercial use allowed with attribution | See [licenses.md](licenses.md#historical-cc-by-attribution) | 3400 BCE-2024 CE, worldwide, about 14,000 rows in 508 frames of whole years. GeoJSON in a ZIP. | Redrawn by hand from published maps, then converted to polygons and reviewed by Seshat researchers ([paper](https://doi.org/10.1038/s41597-025-04516-9)). Encodes no border uncertainty. Names can be stale. Bracketed rows, such as `(French Third Republic)`, cover an empire on top of its countries. Best early coverage. |
| [CShapes 2.0 / Europe](https://icr.ethz.ch/data/cshapes/) | CC BY-NC-SA 4.0: **FORBIDDEN** for this monetized channel | - | Global 1886-2019; Europe from 1816. | The GPL of its R package is no permission to use NC data. Not downloaded. |
| [historical-basemaps](https://github.com/aourednik/historical-basemaps/blob/master/LICENSE) | GPL-3.0: **REFERENCE ONLY** by project policy | - | Worldwide snapshots, GeoJSON. | Never downloaded as a rendering source, traced or rendered. |

## CC BY ways inside OHM

Some OHM borders reuse modern national data, and those ways carry their own license. Sources
found so far: IGN CNIG (Spain), Kartverket (Norway), HDX COD-AB (Ukraine, Costa Rica), and the
Slovenian national border record. Exact texts: [licenses.md](licenses.md#historical-cc-by-attribution).

## Access

Overpass answers to an honest User-Agent, which every request sends. Cliopatria is one pinned
ZIP from GitHub, checked against its SHA-256. The OHM REST API returned 403 even to curl on
2026-11-05 and is not used. QLever did not accept connections from this machine. The planet dump
is not downloaded.
