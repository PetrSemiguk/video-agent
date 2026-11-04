# Historical boundary sources (step 1.6)

Researched 2026-11-02. Dataset licenses take precedence over software package licenses.

| Source | License / commercial video | Attribution | Coverage / format / access | Accuracy and project decision |
|---|---|---|---|---|
| [CShapes 2.0 / Europe](https://icr.ethz.ch/data/cshapes/) | CC BY-NC-SA 4.0; **FORBIDDEN** for this monetized channel | Schvitz et al. (2022); Europe: Cederman et al. (2025) | Global 1886–2019; Europe from 1816; GeoJSON, shapefile, CSV on publisher page | R package GPL is not permission to use NC data. No download or rendered geometry. 1815 and 1644 outside coverage. |
| [OpenHistoricalMap](https://www.openhistoricalmap.org/copyright) | CC0 by default; per-element exceptions; only CC0/untagged considered | OpenHistoricalMap contributors; source relation URL; CC0 | Worldwide, uneven dates; OSM JSON via [Overpass](https://wiki.openstreetmap.org/wiki/OpenHistoricalMap/Overpass) | Check relation and all geometry members. Reject non-CC0, incomplete geometry, ambiguous dates. Imported water/streams may be CC BY-SA; never assume parent license clears members. Use NE coasts/rivers. Gaps must remain gaps. |
| [historical-basemaps](https://github.com/aourednik/historical-basemaps/blob/master/LICENSE) | GPL-3.0; **REFERENCE ONLY by project policy** | A. Ourednik (reference only) | Worldwide snapshots, GeoJSON/SVG via GitHub | Never download as a rendering source, trace or render. |
| [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria/blob/main/LICENSE.md) | CC BY 4.0; commercial use allowed subject to attribution and provenance review | Seshat Global History Databank, Cliopatria; CC BY 4.0 link; indicate modifications | 3400 BCE–2024 CE, worldwide; ZIP GeoJSON; GitHub/Zenodo | Coarse variable time steps; approximate, overlapping claims. Candidate only, no adapter in the requested cshapes/ohm CLI. Verify per-record original sources before use. |

Do not interpret a failed network request as zero historical coverage. A successful
probe reports candidates, exclusions and incomplete coverage separately. Year-only
queries select January 1 for reproducibility; 1644 includes multiple regime changes
and must not be presented as one precise year-long sovereignty map.

## Documented OHM access alternatives

- [QLever OHM](https://wiki.openstreetmap.org/wiki/OpenHistoricalMap/QLever):
  `https://qlever.dev/api/ohm-planet`, SPARQL tags and GeoSPARQL WKT, daily index.
  Same OHM licensing, not a new external boundary source. The adapter preserves
  license exceptions and refuses incomplete member audits; live endpoint access
  currently times out from this environment.
- [OHM REST/export and planet](https://wiki.openstreetmap.org/wiki/OpenHistoricalMap/Reuse):
  individual relation/full and small bbox API reads are documented but returned 403.
  No regional extract service is documented. Public S3 metadata is accessible;
  current PBF is 1,310,645,505 bytes (2026-11-02). No planet payload downloaded.
