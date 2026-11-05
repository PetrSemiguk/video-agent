# Shot plan: egypt-nile

Narration 145.6 s, 470 words, 4 sections. Facts limit: `facts.md`. Generator: `make-storyboard.cjs`. Plates: `egypt` and
`nile-basin`, both new.

## Rhythm, planned first

- **Plates.** `egypt`, bbox 11.55-50.45 E, 13-33 N, at 6000x3375 rather than the usual 3840 wide. Sharp from zoom 5.26 to
  6.76 (edge oversampling 0.77), so it reaches detail (about 1,300 km) and still covers the frame at the zoom where
  `nile-basin` takes over. `nile-basin`, 4.56-61.44 E, 3-33 N, 3840x2160, sharp from 4.57 to 5.57, gives wide and regional.
- **Hard cuts.** 4 plate changes, all crossfades: to the basin on "Here are the highlands", back on "Now come back", to the basin
  on "The river brings", back on "Look at that". 1.65 per minute (0, 2, 2 by minute), limit 3. Each happens in a frame both plates
  cover: zoom about 5.5, centre latitude 23-25. Two of them use 14 frames rather than 24, as the camera is leaving the `egypt` plate fast.
- **Shot changes.** 28 shots, 11 per minute, all on one continuous camera path; no camera breaks.
- **Scale sequence.** R D R D D R R D D R D R R W R R D D R D R D R D R W R R. No three in a row.
- **Sections.** The Strip (opens regional), The Water (R to D), The Dam (R to D), The Answer (D to R). Each has a `SectionTag`.
- **Dramatic beat.** None: the script has no `[pause]` mark, and the script is fixed.
- **Graphic-only shots.** None; 0% of runtime.

## Shots

| Shot | Words (first, last) | Subject on the map | Key word | Map action | Camera, framing | Scale | Data needed |
|---|---|---|---|---|---|---|---|
| 1 open | This ... desert. | Egypt | Egypt, desert | Outline draws and name on "This is Egypt"; Desert label on "desert" | `establish` on whole Egypt, slow push | R | plate egypt, custom/egypt |
| 2 line | Now look ... its end. | Nile and Delta | the Nile, Delta | Nile draws Aswan to sea on "That is the Nile"; Damietta branch and Delta label on "Delta at its end" | `flyTo` in on the strip | D | rivers/nile-aswan-sea, rivers/damietta |
| 3 why | Why here ... else? | Strip against the desert | Why here, nowhere else | River glows on "Why here"; outline returns on "nowhere else" | `flyTo` out | R | as above |
| 4 cairo | Most Egyptians ... Cairo. | Delta, valley, Cairo | Delta, narrow valley, Cairo | Three labels in spoken order | `flyTo` in | D | NE place Cairo |
| 5 shares | Together ... there. | Valley and Delta | four percent, ninety-seven | River glows; labels; card "About 4%", then "About 97%" added | `flyTo` west, desert free for the card | D | none new |
| 6 differ | Sources ... everyone. | Same, with sources line | Sources differ | Card adds "Sources differ" | `flyTo` out and west | R | none new |
| 7 density | In the nineteen ... that. | Valley against desert | fifteen hundred, tiny fraction | Stat "1,500 people per km²", dated 1990s; desert label "A tiny fraction of that" | `flyTo` out and west | R | none new |
| 8 desert | Move out ... here. | Western desert | desert, no rain | Tag; Desert label, then "Almost no rain (FAO estimate)" | `flyTo` in on the desert | D | none new |
| 9 coast | The north ... river. | North coast, then Nile | north coast, one river | Coast label; Nile glows on "one river" | `flyTo` north | D | none new |
| 10 source | The FAO ... Egypt. | Nile | main source | "Nile: main source of water (FAO)" | `flyTo` out and east | R | none new |
| 11 flood | That river ... it. | River through Egypt | flood, fertile mud | Line redraws Aswan to sea; "Fertile mud (before the dam)" | `followLine` north, aim stops at 28 N | D | none new |
| 12 south | But follow ... border. | Egypt's southern border | far beyond | Upstream Nile draws, outline lights | `flyTo` south and out | R | rivers/nile (egypt) |
| 13 highlands | Here are ... Ethiopia. | Ethiopian highlands | highlands | Mask and label lights while the camera flies to it | `flyTo` south, crossfade to basin | R | plate nile-basin, terrain/ethiopian-highlands |
| 14 share-86 | By a common ... counted. | Highlands, Nile north of them | eighty-six | Card "Around 86%"; camera settles on highlands | `flyTo` out | W | none new |
| 15 rivers | The Blue Nile ... rest. | Blue Nile, White Nile, Atbara | their names | Each draws and is named on its word; Blue Nile's share on "carries more than half" | `flyTo` in | R | rivers/blue-nile, white-nile, atbara |
| 16 another | So most ... country. | Main stem into Egypt | another country | Nile redraws north; Egypt outline lights as the head arrives | `flyTo` north | R | rivers/nile, custom/egypt (basin) |
| 17 aswan | Now come ... seventy. | Aswan, High Dam | Aswan, High Dam, the dates | Labels; `BigDate` 1960 rolling to 1970 | `flyTo` in, crossfade to egypt | D | dam point (own coordinate) |
| 18 lake | Behind ... end. | Lake Nasser | Lake Nasser, floods | Lake lights; "Floods ended (one account)" | `flyTo` south-west | D | NE lake Nasser |
| 19 sediment | An older ... fertilizer. | Lake, river downstream | sediment, less silt | "Sediment retained (older study)"; "Less silt, more fertilizer (FAO)" | `flyTo` north past the dam | R | none new |
| 20 strip | By our ... not. | The strip | this strip | Line redraws; "This strip" | `followLine` north | D | none new |
| 21 nasa | NASA's ... dam. | Valley and Delta | ninety-seven | Stat "97", "NASA, published 2012" | `flyTo` out and west | R | none new |
| 22 reading | Our reading ... does. | Nile | water explains | River glows | `flyTo` in on the Delta | D | none new |
| 23 question | So why ... Nile? | Strip | along the Nile | Tag; river glows | `flyTo` out | R | none new |
| 24 answer | Our answer ... water. | Valley and Delta | valley and Delta, reliable water | Labels; river glows | `flyTo` in | D | none new |
| 25 rest | The rest ... rain. | Desert | mostly desert | Desert label | `flyTo` out and south | R | none new |
| 26 ethiopia | The river ... Ethiopia. | Blue Nile, highlands | far to the south, Ethiopia | Blue Nile glows; highlands return | `flyTo` south, crossfade to basin | W | none new |
| 27 recap | By recent ... people. | Shares, Nile back into Egypt | four percent | Card "About 4% of the land holds about 97% of the people" | `flyTo` north | R | none new |
| 28 green | Look at ... country. | Green line, Egypt | green line, Egypt's map | River glows; outline returns | `flyTo` to the opening framing, crossfade to egypt | R | none new |

## Review against visual-grammar.md

Two revision rounds. Before them, only spline overshoot and coverage were fixed from the camera check. Round 1: labels off the river
lines, closer to their subject; cards clear of the river; Nile kept under its redraw in `another`; a cut after "So" moved before it;
the highlands reached sooner. Round 2: recap and 86% moved camera and card; Blue Nile's share from a card to a label. Stills at key
words: frames 240, 1800, 1976, 1990, 2010, 2100, 2200, 2320, 2910, 3050, 4100.

| Shot | Action on the key word | Subject in frame then | Label collisions | Card over something drawn |
|---|---|---|---|---|
| 1 open | Yes | Yes | None | Tag only, clear |
| 2 line | Yes (240) | Yes; Delta coast near the top edge | "Nile" sits on its own line, as a river label does | None |
| 3 why | Yes | Yes | None | None |
| 4 cairo | Yes | Yes | Delta and Cairo close, not touching | None |
| 5 shares | Yes | Yes | None | Clear |
| 6 differ | Yes | Yes | None | Clear, narrowly, of the river near Aswan |
| 7 density | Yes | Yes | None | Clear |
| 8 desert | Yes | Yes | None | Tag only |
| 9 coast | Yes | Yes | None | None |
| 10 source | Yes | Yes | Label runs over the Red Sea, readable | None |
| 11 flood | Yes (1800) | Yes | Label starts at the bend, off the line | None |
| 12 south | Yes | Yes | None | None |
| 13 highlands | Label yes; **mask only just enters at the bottom (1976), half in by 2010** | **Not on "highlands"; yes by the end of "Ethiopia" and in shot 14** | None | None |
| 14 share-86 | Yes (2100, 2200) | Yes | Label wider than the mask | **FAILS: lower left corner of the card covers a stretch of the Nile near 25-28 N** |
| 15 rivers | Yes (2320) | Yes; south tip of the mask below the frame | "Blue Nile" is named twice, as the share label sits west of both rivers | None |
| 16 another | Yes | Yes | None | None |
| 17 aswan | Yes | Yes | Aswan and High Dam close, on either side | Clear |
| 18 lake | Yes | Yes | "Lake Nasser" ends at the lake's tail | None |
| 19 sediment | Yes (3050) | Yes | None | None |
| 20 strip | Yes | Yes | None | None |
| 21 nasa | Card on the word; no other map action | Yes | None | Clear |
| 22 reading | Yes | Yes | None | None |
| 23 question | Yes | Yes | None | Tag only |
| 24 answer | Yes | Yes | None | None |
| 25 rest | Yes | Yes | None | None |
| 26 ethiopia | Yes | Yes | Mask label crosses the Blue Nile, readable | None |
| 27 recap | Yes (4100 clear) | Yes | None | **FAILS narrowly: late in the shot (4142) the left end of the card touches the Nile** |
| 28 green | Yes | Yes | None | None |

Only the frames listed above were stilled at the key word. For the other shots, "Yes" rests on the phrase anchor in the storyboard and
on the shot's review still, which comes after the key word. Frames 240, 1800, 1976, 1990, 2010 and 2910 predate the last round; that
round did not touch those shots' layers, but it changed the camera of shot 14 that follows them.

Rules checked for every shot: map action on a phrase anchor (shot 21 by its card only), camera moving, adjacent framings differ by more
than 100 px or 0.1 zoom, no text in the bottom 12% except the attribution, one card at a time.

The two card failures and shot 13 remain after round 2, the limit. Likely fixes for the next round: a shorter 86% statement, or the
camera a further 2 degrees east in shots 14 and 27; and in shot 13 the mask starting on "Ethiopia", or a word later.

## Rhythm warnings accepted

None reported. `vap.qa.motion --check`: no failures, no still stretch.
