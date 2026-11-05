# Visual grammar

Rules for storyboards, written for the storyboard agent. Pilot v1 is the counterexample and pilot v2
the worked example: `studio/scripts/pilot-storyboard.cjs` generates `episodes/china-unity-pilot/storyboard.json`.
Components are in [components.md](components.md), the storyboard format in [storyboard.md](storyboard.md).

## The rules

**The map is the protagonist.** The viewer should be able to follow the argument with the sound down.

1. Every shot has at least one map action: a highlight, a draw, an on-map label or a camera move to the
   subject. It happens on the key word of the narration, through a `phrase` anchor on the layer.
2. Name each shot's subject and its key word before choosing components. If you cannot point at the
   subject on the map, the shot is not ready.

**The camera moves, and framing follows the subject.**

3. The camera moves in every shot. Use `focusOn`, `flyTo` or `followLine` to reach the subject, and
   `establish` to open. Use `drift` only where nothing better applies.
4. Two adjacent shots never share a framing. Tested on the pilot: a shot must end at least 100 px of pan
   or 0.1 of zoom away from the one before.
5. `hold` is explicit: `{"preset": "hold", "params": {"reason": "..."}}`. Without a reason, a hold over 2 s
   fails the build.

**Text comes second.**

6. An on-map `PlaceLabel` beats a card. Use `LowerThird` only for concepts that cannot be pointed at.
7. At most one text card at a time. `SectionTag`, `LowerThird`, `BigDate`, `KeyFact` and `StatCounter` are
   all cards; `PlaceLabel` and the labels of `RouteLine` are not.
8. Text never covers the shot's subject or the bottom 12%. Give `LowerThird` the subject:
   `"placement": "auto", "subject": [west, south, east, north]`. It takes the first corner clear of the
   subject over its whole life on screen. Keep the bounds tight but include what the narration is talking
   about: rivers named in the shot are part of its subject, not only the area in the middle of the frame.
   Shorten the text if no corner is clear.
9. A number is a claim. It reads as one sentence with its unit and its meaning, and its date has its own line.

**Everything drawn is honest about what it is.**

10. Masks and routes are approximate, and the route's credit says so. `RouteLine` with `style: "dashed"`
    marks a course of which only the nodes are known.
11. Historical layers follow the source rule in [historical-sources.md](historical-sources.md). No layer
    with an errata blocker. Show the date of the map on screen when it is not the date being narrated. A
    recap that recalls a map already dated needs no second date.
12. A highlight shows only what its label or the narration names. Do not reuse a larger mask for a part of it:
    cut it with `--bbox` and say the edge is editorial.
13. Labels of one map leave with that map. No old name stays over a new fill: use `exitAt`.

## Narration says, map does

| Narration says | Map does | How |
|---|---|---|
| relief, plateau, mountains | Elevation-mask reveal | `vap.geo.terrainregion --min-elev`, then `RegionHighlight` with `dimOutside` and a `PlaceLabel` |
| plains, lowlands | Lowland mask | `vap.geo.terrainregion --max-elev`, then `RegionHighlight` |
| river flows, crosses | The river draws and the camera goes with it | `RiverLine` with camera `followLine`; `fromFraction` and a matching `line` for one reach of a long river |
| route, canal, campaign, trade path | The route draws with its era | `RouteLine` with `label`, from `vap.geo.route` |
| "linked" or "united" X | Items light up in order, and the connection draws | Time each item from the moment the route reaches it; `RouteLine` over `RiverLine`s or `RegionHighlight`s |
| division, then unification | One map of states, then the united state | `HistoricalLayer` with `exitAt`, then `HistoricalLayer` with `only` and `color`; the source rule applies |
| number, date | `BigDate` or `StatCounter` over a map showing what the number is about | The card goes where the map is empty |
| recap | Callbacks to what was already shown | Reuse the same masks, rivers and routes, in the order of the sentence. No new card or list |

## Motion is a build rule

`vap.episode build` fails on any stretch over **2 s** with the camera below **0.03 px/frame**. The preview
stage checks the camera plan of every frame before anything renders, counting pan and zoom. The render
stage checks the finished video by phase correlation, and does not count a stretch where the plan shows a
zoom, since phase correlation cannot see one.

`drift` passes: its default measures 0.10-0.15 px/frame, while the freeze in pilot v1 measured 0.007-0.014.
`hold` passes only with a reason, and only for the part inside that shot. Run the check by hand:

```
uv run python -m vap.qa.motion --plan ../studio/out/<slug>-camera-plan.json --check
uv run python -m vap.qa.motion ../studio/out/episode-<slug>-synced.mp4 --plan ../studio/out/<slug>-camera-plan.json --check
```

The rule catches a frozen camera, not a badly chosen one. Fast moves need your own eye: keep the jump
between far subjects short, by starting a `followLine` on the reach the narration is about.

**Speed limit.** The build also fails when the camera pans faster than `motion.camera.maxSpeedPx`, 9 px/frame,
in any shot. That is the "7 seconds to cross the frame" rule of thumb for pans. In pilot v2 a label appearing at
14 px/frame could not be read. `followLine` keeps to the limit by itself, by chasing its aim point. For `focusOn`
and `flyTo`, bring the framings closer or lengthen the shot when the error names them.

## Anti-patterns from pilot v1

| Shot | What v1 did | Why it fails | v2 |
|---|---|---|---|
| 2, plateau | A wide view with a card saying "Tibetan Plateau" | The word "plateau" changes nothing on the map | The camera moves west and the 4,000 m mask lights up on the name |
| 3, eastern lowlands | The same wide view with a card saying "Plains, river valleys and farming" | The card describes what the map could show, and repeats the narration | The lowland mask lights up on "plains", labelled on the map |
| 6, Grand Canal | A card plus a section tag, no canal on the map | The story's main object is absent, and two cards compete | The Sui system draws from "the seventh century", with its hub at Luoyang |
| 7, five basins | A stat of "5 / 13th century / Major river basins linked" | It reads as nonsense, a date is used as a unit, and no basin is shown | The Yuan canal draws and each river lights as the canal reaches it, under "5 river systems / linked by the Grand Canal" |
| 9, incentives | A centered `KeyFact` on a drifting map | The map plays no part in the argument | The plains light up on "productive plains" and the waterways on "connected waterways" |
| 10, closing | A numbered list over a wide view | A recap told in text, with nothing recalled | Plateau, plains, rivers and canal return in the order of the sentence, and the Sui state closes on "an empire" |

**The 45-55 s freeze.** Shot 8 used `hold` with no reason and shot 9 a faint `drift`. The camera measured
0.007-0.014 px/frame for 10 s while the narration covered division and reunification. The motion rule
measures 42.5-55.6 s on the v1 video and now fails that build.

Other findings in v1: a card covering the Yangtze in the very shot about the Yangtze (rule 8), wide cards
with empty space (cards now fit their text), and a small title (`TitleCard` now sets a short title large,
directly on the map).

## Checklist for a shot

- [ ] Subject on the map, and the key word from `words.json`.
- [ ] A map action anchored to that word.
- [ ] The camera moves to the subject, and the framing differs from the previous shot.
- [ ] Text only if the map cannot say it; one card at most, clear of the subject and the bottom 12%.
- [ ] Every new layer's source in [licenses.md](licenses.md), and its credit on screen.
