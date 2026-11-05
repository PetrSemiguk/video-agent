# Historical boundary sources (step 1.6)

Researched 2026-11-02, updated 2026-11-05. Dataset licenses take precedence over software
package licenses.

| Source | License / commercial video | Attribution | Coverage / format / access | Accuracy and project decision |
|---|---|---|---|---|
| [OpenHistoricalMap](https://www.openhistoricalmap.org/copyright) | CC0 by default, with per-element exceptions. Only CC0 or untagged elements are used. | On screen: "Map data courtesy of OpenHistoricalMap". Keep relation URLs. | Worldwide, uneven by date. OSM JSON through [Overpass](https://wiki.openstreetmap.org/wiki/OpenHistoricalMap/Overpass). | Used. Relation and geometry ways are checked. Coverage and accuracy vary a lot: see [reports/1.6.md](reports/1.6.md). Gaps stay gaps. |
| [CShapes 2.0 / Europe](https://icr.ethz.ch/data/cshapes/) | CC BY-NC-SA 4.0: **FORBIDDEN** for this monetized channel | - | Global 1886-2019; Europe from 1816. | The GPL of its R package is no permission to use NC data. Not downloaded. |
| [historical-basemaps](https://github.com/aourednik/historical-basemaps/blob/master/LICENSE) | GPL-3.0: **REFERENCE ONLY** by project policy | - | Worldwide snapshots, GeoJSON. | Never downloaded as a rendering source, traced or rendered. |
| [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria/blob/main/LICENSE.md) | CC BY 4.0: commercial use allowed with attribution | Seshat Global History Databank, Cliopatria; CC BY 4.0 link; indicate modifications | 3400 BCE-2024 CE, worldwide; ZIP GeoJSON. | Candidate only. Not used without the owner's decision. |

Do not read a failed request, or an absent polity, as proof that a state did not exist.

## CC BY ways inside OHM

Some OHM borders reuse modern national data, and those ways carry their own license. They
are all CC BY 4.0, which allows commercial use with attribution, and the project does not
currently use them. Sources found in the checked polities: IGN CNIG (Spain), Kartverket
(Norway), HDX COD-AB (Ukraine, Costa Rica), and the Slovenian national border record.

## Access

Overpass answers to an honest User-Agent, which every request now sends. The REST API returned
403 even to curl on 2026-11-05 and is not used. QLever did not accept connections from this
machine, so its adapter was removed. The planet dump is not downloaded.
