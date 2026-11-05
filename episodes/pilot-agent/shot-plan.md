# Shot plan: pilot-agent

Storyboard of the existing pilot narration (`episodes/china-unity-pilot/`, 67.6 s, 182 words), from scratch.
Facts limit: `facts.md` F01-F06, I01, M01-M05 of that episode. One plate: `china-east-hs05`.

## Rhythm, planned first

- **Plate limits.** Sharp zoom is 4.56 (whole plate) to 5.56 (1:1). At latitude 32 that is 5,400 to 2,700 km of
  ground. So this plate gives wide (zoom up to about 4.8) and regional, and never detail. A true detail shot needs its
  own plate, which this test does not add. West of lon 96 the camera cannot centre at high zoom.
- **Cuts.** 11 shots, 10 cuts, about 9 per minute against the 1-3 range. Accepted, see below. Each sentence that names a
  new map subject gets a shot; sentences of one subject share one (Yangtze; Sui; Yuan; division and reunification).
- **Scale sequence.** W R W R R W R R W R W. No three in a row.
- **Sections.** The narration has no `##`, so no `SectionTag`. Its four paragraphs open on shots 1, 4, 7 and 9.
- **Dramatic beat.** None available: the only mark is `[pause 0.2]`, below the 0.6-1.5 s range, and the script is fixed.
- **Graphic-only shots.** None; every shot is a map.
- **Cards.** Title, one `StatCounter`, and two `BigDate` in sequence. Everything else is on-map labels.

## Shots

| Shot | Words (first, last) | Subject on the map | Key word | Map action | Camera, framing | Scale | Data needed |
|---|---|---|---|---|---|---|---|
| 1 open | Why ... landscape. | Relief of the whole plate | landscape | Title clears off the relief as "the landscape" is spoken | `establish`, plate centre, slow push and westward drift | W | plate |
| 2 plateau | In the west ... meters. | Tibetan Plateau | Tibetan Plateau | 4,000 m mask with `dimOutside`; label; "above 4,000 m" on "four thousand" | `flyTo` west, lon 98 | R | terrain/tibetan-plateau |
| 3 lowlands | Farther east ... settlement. | Eastern lowlands against the plateau | plains | Dim fades; 200 m mask and "below 200 m" label on "plains" | `flyTo` east and out, both masks in frame | W | terrain/eastern-lowlands |
| 4 yellow | The Yellow River ... heartland. | Yellow River on the North China Plain | crosses, North China Plain | River draws to the sea; plain mask lights on its name | `followLine` lower Yellow | R | rivers/yellow, terrain/north-china-lowlands (new, cut at 32.4 N) |
| 5 yangtze | To the south ... region. | Yangtze, inland to coast, then its lowlands | Yangtze, coast, middle and lower | River draws from Sichuan, reaching the sea on "coast"; lowland mask on "middle and lower" | `focusOn` the whole reach, south | R | rivers/yangtze, terrain/yangtze-lowlands |
| 6 connect | These are ... them. | Both lowlands and both rivers | different landscapes, waterways | Two labels on "different landscapes"; rivers glow on "waterways" | `flyTo` out | W | as above |
| 7 sui | That connection ... system. | Sui canal system, hub Luoyang | seventh century, Grand Canal | South branch draws to Luoyang from "the seventh century", arriving on "Canal"; north branch dashed after it | `focusOn` canal bounds | R | routes/grand-canal-sui |
| 8 yuan | Successive ... troops. | Yuan canal and five river systems | linked five | Sui line stays through "expanded", then the Yuan line draws; each river lights as the head reaches it; stat on "five major" | `flyTo` east, sea at right for the card | R | routes/grand-canal-yuan, rivers/hai, huai, qiantang |
| 9 division | Geography ... eighty-nine. | States of 560, then Sui | political division, reunified | 560 map with its date and names; Sui fill replaces it on "the Sui reunified"; date rolls 560 to 589 | `flyTo` out | W | historical/china-560, china-592-cliopatria |
| 10 reasons | But productive ... together. | Plains and waterways | productive plains, connected waterways | Plains light on their words, rivers and muted canal on theirs | `focusOn` eastern lowlands | R | as above |
| 11 close | The landscape ... empire. | Recap in sentence order | landscape, canals, empire | Plateau on "landscape", canal brightens on "canals", Sui state on "empire" | `flyTo` out to the opening view | W | as above |

## Review against visual-grammar.md

Two revision rounds. Before them, spline overshoot forced lower zooms and more central wide framings, as the coverage
check failed at the plate edge and at 1:1. Round 1 fixed label collisions and long credits, round 2 a clipped route label and
a card touching the coast. Stills at key words: frames 108, 180, 480, 668, 1262, 1320, 1560, 1878 (first round, 1320 and
1560 again after the second).

| Shot | Action on the key word | Subject in frame then | Label collisions | Card over something drawn |
|---|---|---|---|---|
| 1 open | Title leaves on "with", relief is clear on "landscape" (frame 108) | Yes | None | Title over relief only, by design |
| 2 plateau | Yes (frame 180): label and outline on the name, while the camera is still flying | Yes; contour leaves frame at the plate's west side | None | No card |
| 3 lowlands | Yes, on "into plains" | Yes, both masks | None. Label is wider than the mask at this scale | No card |
| 4 yellow | Yes (frame 480): river drawing, plain label and outline starting | Yes | None | No card |
| 5 yangtze | Yes (frame 668): head at the sea on "coast"; mask on "middle and lower" | Yes | None | No card |
| 6 connect | Yes | Yes, small at wide scale | Labels clear of each other and the rivers | No card |
| 7 sui | Yes: starts on "From the seventh", head at Luoyang on "Canal" | Yes | None | No card |
| 8 yuan | Yes (frames 1262, 1320): rivers light in canal order; all five by "basins" | Yes | Fixed: Hai/Beijing, Yellow/Jining | Stat is in open sea, clear |
| 9 division | Yes (frame 1560) | Yes | "Western Liang" is wider than its polygon and overlaps its neighbours' fills | Date cards clear of the fill, narrowly at the Zhejiang coast on 589 |
| 10 reasons | Yes | Yes | Luoyang moved left, off the Yellow | No card |
| 11 close | Yes (frame 1878) on "canals"; Sui on "into an empire" | Yes | "Sui" sits just under "Luoyang", not touching | No card |

Rules checked for every shot: map action on a phrase anchor, camera moving, adjacent framings differ by more than 100 px or
0.1 zoom, no text in the bottom 12% except the attribution, at most one card at a time, and old labels leaving with their map.

Known weak points:

- Sui route has no `exitAt`, so it disappears at once on "thirteenth century" in shot 8. Rivers and the Yuan canal also pop
  off at the cut into shot 9. The catalog has no fade for these.
- Spline overshoot: in shot 8 the zoom swells to 5.53 before settling at 5.2, and shot 7 first dips outward before pushing in.
- In shot 11 the amber canal is low contrast over the amber Sui fill in the last second.
- "by 1293" in shot 8 rests on the route's era line, whose only source for that year is the travel guide; "about 604-610"
  is not in `facts.md` either. Both pass M02 through the `sources.md` files, but "13th century" and "7th century" would
  match the ledger better. Not changed, as the revision rounds were used up.

## Rhythm warnings accepted

`8.9 cuts per minute, range 1-3`: accepted. Reasons: 67.6 s carries 16 sentences across 11 subjects, and the grammar
requires a map action per subject; `visual-grammar.md` names this exact case as allowed for a short test. Every cut is at a
sentence end, and all shots share one plate and one continuous camera, so a "cut" here changes layers, not the picture. A
13-minute episode must not do this. No other warning was reported.
