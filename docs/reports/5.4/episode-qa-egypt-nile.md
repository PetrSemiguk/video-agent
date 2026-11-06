# episode-qa — egypt-nile

Verdict of the `episode-qa` agent, run on the MP4 rendered 2026-11-06 14:31. Recorded as the agent
produced it; the step report summarises it.

**Verdict: PASS WITH NOTES.** `studio/out/episode-egypt-nile-synced.mp4`, 273 MB, 5271 frames,
175.68 s, 28 shots, 470 words. The agent re-ran `review:episode` first: the stills on disk were from
Nov 5 23:10, older than `storyboard.json` of Nov 6 11:07, so they were stale.

Nothing on screen is wrong, unsourced, uncredited or out of sync. The findings are four shots whose
only new thing on the key word is a text card, one sub-second camera overshoot, three sub-second
bare-plate dropouts, and some mobile legibility and label-placement weaknesses.

## Shot table (abridged to the shots carrying a finding)

| # | Shot | Key word | What the map does there | Verdict |
|---|---|---|---|---|
| 6 | `differ` | "Sources differ" | Nothing but the card changes; map identical to f1015 | Note 1 |
| 11 | `flood` | "Its great flood" | `followLine` Aswan→Delta, 118 f redraw, "Fertile mud" | OK |
| 14 | `share-86` | "around eighty-six percent" | Card only; mask held, camera pulls back | Note 1 |
| 15 | `rivers` | each tributary's name | Each draws on its own name; Khartoum labelled | OK, note 5 |
| 20 | `strip` | "this strip should" | `followLine` Aswan→Delta, 130 f redraw | OK, note 3 |
| 21 | `nasa` | "roughly ninety-seven" | Card only; river and plate unchanged | Note 1 |
| 22 | `reading` | "water explains" | Nile glows 93 f + "Water (our reading)" | OK, note 2 |
| 23 | `question` | "along the Nile" | Outline returns, Nile glows, Nile label | OK, note 6 |
| 27 | `recap` | "about four percent of the land" | Card only; river and mask held | Note 1 |

The other 19 shots passed cleanly.

## What passed

- **Label leads:** 45, all exactly 3 frames; the sole exception is `open/egypt-name` at frame 0,
  where no lead is possible. Four checked by hand against `words.json`.
- **Attribution:** 5271 / 5271 frames credited, including the Natural Earth credit. No
  `HistoricalLayer`, `RouteLine` or `BRollClip`, so no extra per-layer credit to check.
- **Errata and sources:** no historical slug, so no blocker. All 17 fact-source URLs have a row in
  `docs/licenses.md`; none FORBIDDEN or REFERENCE ONLY; no UNVERIFIED.
- **Claim wording:** every card and claim-bearing label stays inside its claim, including the
  distinction `facts.md` insists on between "published 2012" and "from 2012", and the deliberate
  omission of the exact 1,492 figure behind "around fifteen hundred".
- **One card at a time:** all 13 card intervals listed, zero overlap.
- **Framing:** all 27 adjacent pairs differ by ≥46 px of pan with ≥0.07 zoom, or ≥100 px of pan.
- **Mobile safe area:** no bright text in the bottom 12% or the 5% margins; nearest approach 5.42%.
- **Motion:** video and plan checks both pass; `max_pan_px` 6.32 against a limit of 9.
- **Sound:** −16.1 LUFS, LRA 2.8 LU, true peak −4.5 dBFS. Sync lag 0, correlation 0.999962.
- **Rhythm:** 1.37 hard cuts/min, scale spread 4.09, graphic share 0%, and all four sections have a
  SectionTag, a scale change and a wide shot.

## Fix list

1. **Four shots have no map action on the key word — only a text card appears.** `differ`,
   `share-86`, `nasa`, `recap`. The map layers are all carried over with no `start` anchor, so the
   camera move is the sole map action. `nasa` and `recap` are the worst: the frame is otherwise
   identical to the preceding seconds. This is the thin end of visual-grammar rule 1 and close to
   the pilot-v1 anti-pattern "a centred card on a drifting map".
2. **Zoom exceeds the strict with-label limit in `reading`.** Frames 4288–4310 (142.93–143.70 s)
   run at 9.02–9.20 px/frame of corner zoom against `maxZoomWithLabelPx` 9; it passes only on the
   0.5 tolerance. The label `water-word` starts at exactly frame 4288 — it appears on the fastest
   part of the move, the exact case the limit exists for. Overshoot 0.20 px (2%) over 0.73 s.
3. **Three sub-second bare-plate dropouts at the end of a shot.** In `open`, `density` and `strip`
   the layer window ends before the shot does, so every overlay vanishes and the plate plays bare
   while the camera drifts, then everything pops back at the cut: `open` f167–175 (0.30 s),
   `density` f1522–1540 (0.63 s), `strip` f4039–4048 (0.33 s). Confirmed on the delivered MP4. It
   also makes the `density` review still useless: it is sampled at frame 1522 and shows nothing.
4. **"Valley" and "Delta" labels sit on the wrong ground.** In `answer` and `shares`/`differ`,
   VALLEY is in the Eastern Desert about 200 km from the valley and DELTA is west of the Delta;
   neither has a dot or a leader, so on screen they name the desert. Same in `cairo` with NARROW
   VALLEY.
5. **`rivers` is the hardest shot to read on mobile.** Five text elements compete; at 640 px the
   small italic light-blue river style over a mid-tone plate is borderline and at 384 px illegible.
   One of them, "Blue Nile: more than half of the water", carries claim C10 and should use the
   place-label style instead.
6. **`THE ANSWER` section tag is low contrast**, gold on pale desert; it disappears at 384 px.
7. **Two rhythm warnings.** "source, flood, south, highlands" is partly real — four consecutive
   regional framings mid-episode, cheaply fixed by one detail shot. "question, answer, rest" is an
   accepted trade-off: the recap is meant to recall earlier framings. Also: `pauses` is empty for
   all four sections, so the episode has no dramatic beat at all.
8. **StatCounter animation shows numbers no source supports.** The `density` counter passes through
   values such as "1,028 people per km²" under a label already reading "Around this in the valley
   and Delta".
9. **Marginally short for a mini-episode:** 470 words in 175.7 s against the 480–640 words / 3–4 min
   of `docs/episode-format.md`. Speaking rate 160.5 wpm, inside the 155–165 target.

## What the agent could not judge

The sound itself (pronunciation of "Atbara", "Nasser", "Aswan", pacing, breath, TTS artefacts);
whether the `followLine` runs feel smooth or seasick at speed; whether the drift tails are a
deliberate sentence-pause behaviour or a bug; the absent end card and title card, which are stage 6;
and the frames it did not sample.
