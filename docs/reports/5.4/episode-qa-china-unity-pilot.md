# episode-qa — china-unity-pilot

Verdict of the `episode-qa` agent, run on the MP4 rendered 2026-11-06 14:35. Recorded as the agent
produced it; the step report summarises it.

**Verdict: PASS WITH NOTES.** `studio/out/episode-china-unity-pilot-synced.mp4`, 124 MB,
1920×1080, 30 fps, 2028 frames, 67.60 s, h264 High + AAC.

Nothing ship-blocking. Sync exact (lag 0 samples, correlation 0.99996); all 2028 frames carry the
plate credit; every layer with its own credit shows it while it is up; no forbidden or unverified
source; no errata blocker; no still frame and no runaway camera.

## Shot table

| # | Shot | Key word (frame) | What the map does there | Verdict |
|---|---|---|---|---|
| 1 | `opening` | "China's heartland" (f55) | Heartland fills + on-map label; `establish` push 0.1 | PASS |
| 2 | `plateau` | "the Tibetan Plateau" (f173), "above four thousand" (f206) | 4,000 m mask lights with `dimOutside`; two labels; camera moves west | PASS |
| 3 | `eastern-lowlands` | "into plains" (f315) | 200 m lowland mask lights; two labels; `flyTo` east | PASS |
| 4 | `yellow-river` | "The Yellow River" (f444) | River draws over 145 f; "North China Plain" (f472); heartland callback | PASS |
| 5 | `yangtze` | "the Yangtze" (f610) | Yangtze draws over 327 f; farmland mask + label (f692); Yellow redrawn | PASS (note 4) |
| 6 | `grand-canal` | "the seventh century" | Sui Y-system draws over 150 f, hub at Luoyang; route credit on screen | PASS (notes 1, 7) |
| 7 | `five-basins` | "five major river basins" (f1270) | Yuan canal draws, five rivers light in order; StatCounter | PASS (note 6) |
| 8 | `division-and-reunion` | "After the Han collapsed" (f1484) → "the Sui reunified" (f1581) | f1480 bare plate → f1540 four states labelled; Sui fill enters; BigDate 589 | PASS |
| 9 | `incentives` | "productive plains" (f1668), "connected waterways" (f1702) | Lowland mask, then rivers + canal redraw together | PASS (note 5) |
| 10 | `closing` | "into an empire" (f1988) | Plateau, lowlands, rivers, canal, Sui fill return in sentence order | PASS |

## What passed

- **Label leads:** all 26 exactly 3 frames; five checked by hand against `words.json`.
- **Motion:** no stills, no failures, no too-fast. Max zoom 4.45 px/frame, far under both limits.
- **Rhythm:** 2.66 hard cuts/min (in range), graphic share 0%, all 9 cuts land on silence.
- **Sound:** −16.0 LUFS integrated, true peak −4.6 dBFS, LRA 2.1 LU. Meets `docs/voice.md`.
- **Errata and sources:** `china-560` has a warning, no blocker; the storyboard avoids the two
  slugs that do carry blockers. Every source is in `docs/licenses.md` and permitted. On-screen
  credit strings match the `.attribution.md` files character for character.
- **Claim wording** checked against `facts.md`, not just the ids, for every card and label.

## Fix list

1. **A label breaks the 5% top safe area.** `grand-canal`'s "Beijing area" route-node label occupies
   rows 38–65 of 1080 (top edge 3.52%), 16 px above the 54 px line. Cause: `camera.params.bounds`
   `[113,30.2,121.2,40]` puts the node at lat 39.9 against the top, with padding applied to the dot
   but not to the text above it. Check: `studio/out/china-unity-pilot-review-grand-canal.png`.
2. **The `heartland` mask has no row in the facts ledger.** It is a union of seven **modern**
   provinces and is the opening's main image, returning twice more. Every other mask has an M-row;
   this one has none, and nothing discloses that the outline is present-day admin-1 geometry in an
   episode about ancient unification. A ledger gap, not a licence problem. Check: an M-row in
   `episodes/china-unity-pilot/facts.md` naming the file, its seven parts and the editorial framing.
3. **The episode is shot at one scale.** `scale_spread` 1.76× against the 2× rule, seven consecutive
   regional shots. Root cause: all ten shots share the single plate `china-east-hs05`. Fixing it
   needs a second, tighter plate, not a storyboard tweak.
4. **Pan marginally over its limit.** Six frames, f620–f625 (20.67–20.83 s, inside `yangtze`), peak
   9.10 px/frame against `maxPanPx` 9; passes on the 0.5 tolerance. Zoom there is 0.36 px, so this
   is cosmetic, not a readability failure.
5. **Three on-screen statements carry no `claims`.** "Intensive farming", "Middle and lower Yangtze"
   and "Productive plains" are assertions, not place names. The facts exist (F01, M05, I01) but are
   not linked.
6. **`five-basins` anchors five map actions to hardcoded times, not phrases** (40.28 s … 43.348 s).
   Absolute seconds silently desync if the voice is regenerated.
7. **A card where an on-map label would do:** `grand-canal`'s `LowerThird` for an object already
   drawn and already carrying its era chip.
8. **`SectionTag` used as a date caption.** `script.md` has no `##` headings, so `sections: []` and
   the section rules are simply unchecked for this episode.
9. **"Western Liang" is drawn as a city** (`kind: "city"`, dot plus small text) for a polity.
10. **Zero margin on the StatCounter** in `five-basins`: exactly on the 5% line on both axes.
11. **Scope:** 67.6 s against the channel's 12–14 min format. Expected for a pilot.
12. **A fragile credit coupling.** `china-560`'s on-screen credit does not name Cliopatria; no frame
    is under-credited today only because `sui-map` drags that credit onto every frame of the shot.

## What the agent could not judge

Anything audible (pronunciation of "Luoyang", "Yangzhou", "Qiantang", "Hangzhou", "Linqing" — none
in `lexicon.yaml` — pacing, breath, TTS artefacts); whether the `heartland` outline is the intended
editorial choice; real-device mobile readability of the smallest italic river labels; music,
subtitles, thumbnail and packaging (stage 6).
