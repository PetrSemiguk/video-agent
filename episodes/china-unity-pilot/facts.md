# Pilot facts ledger

Checked: 2026-11-04. Narration: `script.md`, approved by the user before TTS.
The subject is the historical agrarian heartland, not a claim that past empires
had today's borders or that geography determines political legitimacy.

| ID | Narration claim | Source URL and supporting section | Qualification |
|---|---|---|---|
| F01 | Tibetan Plateau above 4,000 m; eastern lowlands support dense settlement and intensive cultivation. | [China: A Country Study, Geography](https://countrystudies.us/china/32.htm), Terrain and Drainage, plateau elevation and eastern scarp paragraphs. | Plateau average, not a minimum at every point; script says plateau rises above this height. No dated population totals are used. |
| F02 | Yellow River crosses North China Plain, a long-established agricultural heartland. | [Geography](https://countrystudies.us/china/32.htm), Yellow River and alluvial plain paragraphs. | River route is shown with existing Natural Earth data; no historical channel reconstruction. |
| F03 | Yangtze connects inland regions to the coast; middle/lower reaches form a major farming region. | [Geography](https://countrystudies.us/china/32.htm), Chang Jiang paragraphs: navigability, East China Sea outlet and agriculture. | Connection is a geographic/transport summary; it does not imply equal navigability everywhere. |
| F04 | Sui organized an imperial Grand Canal transport system in the seventh century; later dynasties maintained/expanded it. | [UNESCO, The Grand Canal](https://whc.unesco.org/en/list/1443/), Brief synthesis. | Earlier sections existed from the fifth century BCE. The script does not say Sui built every section or the later full route. |
| F05 | By the thirteenth century the canal network connected five major river basins and transported grain/supplies for people and troops. | [UNESCO, The Grand Canal](https://whc.unesco.org/en/list/1443/), Brief synthesis and criterion (iii). | Describes a changing network over time, not one unchanged canal alignment. The drawn routes are schematic links between sourced places, see M02. |
| F06 | Political division followed Han collapse; Sui reunification in 589. | [Era of Disunity](https://countrystudies.us/china/8.htm) and [Restoration of Empire](https://countrystudies.us/china/9.htm), opening paragraphs. | Includes a brief Jin reunification within the longer period; narration does not claim uninterrupted division. Spoken date is “five eighty-nine.” |
| I01 | Productive plains and connected waterways gave rulers incentives to unite regions; engineering and administration mattered too. | Synthesis of F01–F05; [UNESCO](https://whc.unesco.org/en/list/1443/), criteria (iii) and (vi), explicitly identifies the canal's contribution to imperial stability and unification. | Editorial inference, not a universal law or an exclusive explanation. The opening is a framing question. “Did not guarantee unity” is supported by F06. |

## What the map shows (added with pilot v2)

| ID | On the map | Source | Qualification |
|---|---|---|---|
| M01 | Tibetan Plateau and eastern lowlands as areas. | `terrain/tibetan-plateau.geojson` (4,000 m contour) and `terrain/eastern-lowlands.geojson` (200 m contour), from the AWS terrain model. | Contours of a terrain model, smoothed. Not surveyed boundaries of named landforms. The label "above 4,000 m" matches the contour drawn. |
| M05 | Lit area "Middle and lower Yangtze". | `terrain/yangtze-lowlands.geojson`: the 200 m lowlands, cut at 32.4° N. | The northern edge is an editorial cut, roughly between the Huai and Yangtze lowlands, not a surveyed divide. |
| M02 | Sui canal system (Y-shaped, hub at Luoyang) and Yuan Grand Canal (Hangzhou to Beijing through Shandong). | `routes/grand-canal-sui.sources.md` and `routes/grand-canal-yuan.sources.md`: every node with its source, and everything simplified. | Approximate, and credited so on screen. The northern Sui branch has only its endpoints confirmed and is one straight dashed line. |
| M03 | The five river systems: Hai, Yellow, Huai, Yangtze, Qiantang. | [Grand Canal (China)](https://en.wikipedia.org/wiki/Grand_Canal_(China)), infobox and history; the UNESCO synthesis in F05 says five basins. | Modern Natural Earth rivers show where the systems lie, not their 13th-century channels (the Yellow River then ran farther south). HydroBASINS polygons were rejected on license, see licenses.md. The Hai line runs through the mapped Sanggan and Yongding, into the Hai near Tianjin. The Qiantang is the mapped "Fuchun" reach; the Huai east of about 116.4° E is extended by hand to Hongze Lake through Huainan, Bengbu and Wuhe. The on-screen wording is "river systems" because rivers are what is drawn. |
| M04 | Northern Zhou, Northern Qi, Chen and Western Liang about 560 CE, then Sui. | `historical/china-560` (composed on Cliopatria frame 561) and `china-592-cliopatria`, by the rule in docs/historical-sources.md. | The 560 map is one moment of a long division, and is dated on screen. The Sui polygon is the first Cliopatria frame after 589, not a survey of 589. Western Liang's contour looks generous (see the layer's sources). |

Bibliography: Robert L. Worden, Andrea Matles Savada and Ronald E. Dolan (eds.),
*China: A Country Study*. Washington: GPO for the Library of Congress, 1987.
[Publisher scan](https://tile.loc.gov/storage-services/master/frd/frdcstdy/ch/chinacountrystud00word/chinacountrystud00word.pdf);
chapter links above are the HTML mirror. UNESCO World Heritage Centre,
*The Grand Canal*, property 1443.

Source handling is recorded in `docs/licenses.md`. Narration is original wording;
no source prose, images, map assets or logos are reproduced. Existing approved
NASA/AWS plates, Natural Earth vectors and local fonts are planned for visuals.
