# Egypt visual pass — nine owner findings

Status: **seven of nine done; the framing rule (2) is built and has exposed more than it can fix
on the current plates, so the episode is not re-rendered yet.**

## Done

### 4. No working notes on screen
`SERVICE_NOTES` in `studio/src/storyboard/grammar.ts` rejects "our reading", "TODO", "placeholder"
and the like in any on-screen text. Honest disclosure is explicitly not a note: "approximate",
"estimate", "one account", "(FAO)" stay required and are covered by a test. The Egypt label now
reads **"Valley and Delta"** — a place name for the ground the sentence is about — and the
editorial "our reading" stays in the narration, where it belongs.

### 1. Nothing was ever highlighted
The storyboard did have `RegionHighlight` layers, but a 20% fill on bright sand reads as nothing,
and `dimOutside` was never used. Three changes:

- **A settled band**, `data/processed/egypt/terrain/valley-delta.geojson`, from the new
  `vap.geo.rivermask`: a 9.5 km buffer around the Nile and the Damietta branch, widened to 43 km
  north of 30.2° N for the Delta, clipped to Natural Earth land. Its area is **40,414 km², 4.0% of
  Egypt** — the width was chosen so the band matches the ~4% that `facts.md` claim C01 records,
  and `valley-delta.sources.md` says plainly that this is a drawn band, not a survey of irrigated
  land, and that no claim may describe it as measured.
- **A share is now shown as a share:** `shareOfEgypt()` pairs the country dimmed out (the
  denominator) with the band lit inside it (the numerator), on `shares`, `differ`, `density`,
  `nasa`, `reading`, `recap`. `share-86` lights the Ethiopian highlands and dims the rest of the
  basin, because that figure is about where the water starts.
- **The validator enforces it:** a shot stating a share or an area needs a highlight with
  `dimOutside`, and at least 25% of an episode's shots must mark an area.

### 9. Shots where only a card appeared
`differ`, `share-86`, `nasa` and `recap` now act on the map on their key word — the band or the
highlands come up under the figure rather than the frame merely drifting.

### 3. Labels adrift
Every `PlaceLabel` must sit within 40 km of something its shot draws, or carry `leader` to the
point it names (a new prop, drawn as a thin pointer with a dot), or declare `openGround: true`
when it names unmarked ground such as open desert. The rule found **nine** adrift labels in Egypt
and **four** in the pilot; each was moved onto its subject by measuring the nearest point of the
geometry it names, not by eye. `HistoricalLayer` keeps its polygons in a file, so the validator
passes a reader for them; without it three pilot polity labels were false positives.

### 6. Aswan and the High Dam collided
13 km apart on the ground. Aswan's label now sits above its dot and the dam's below.

### 7. The bare plate before a cut
Root cause found: a gap too short for its own shot is absorbed by extending the previous shot
(`sync.ts`), but only the camera was extended — its layers kept their old end, so every overlay
vanished for 0.3–0.6 s. Layers that ran to the old end now grow with the shot. Fixed with a test;
the three Egypt dropouts (`open`, `density`, `strip`) are gone.

### 8. The pilot's heartland mask
`facts.md` gains row **M06**: the mask is a union of seven **present-day** provinces, an editorial
framing standing in for the North China core, with no source claiming those lines existed then.

### 5. The washed-out grade
Grade **v3**. The old one is kept as `dark_v2`, so the two can be compared:

- the land highlight knee bites earlier and compresses harder (`highlight_start` 0.48 → 0.40,
  `highlight_scale` 0.65 → 0.45), so bright sand rolls off instead of flattening into one mass;
- a new **vegetation** term darkens and saturates green ground on land only
  (`darken` 0.26, `saturate` 1.45), so the cultivated strip reads as a dark ribbon in the sand.

**The sea is untouched.** My first attempt raised global saturation and gamma, which also moved
the sea and broke the step 2.1 decision that the sea stays dark; the test caught it. All the
contrast now lives in the land and vegetation terms, both masked off the water.

Compare: `studio/out/grade-compare-egypt.png` (whole frame and a Delta crop at plate resolution),
from the new `vap.geo.grade_compare`. Both Egypt plates were rebuilt at their original sizes;
`china-east-hs05` and `europe` still carry v2 and should be rebuilt when convenient.

## The plate rule, and where the Egypt framings stand

### Room around the subject is now a rule with a check

Derived from the two conditions rather than guessed. The widest frame a plate can safely show is
the plate itself, so at that zoom the frame's middle third **is** the plate's middle third. The
build requires a shot's subject to settle in the frame's middle third. Both hold at once only if
the subject's centre already lies in the middle third of the plate — that is, **at least a third
of the plate's span from every edge**.

`vap.geo.plate --subject w,s,e,n` reports the offsets and the bbox that would give room, warns,
and fails under `--strict`; the result is kept in the plate's metadata as `subject_room`. The rule
is in `docs/maps.md` ("Room around the subject") and in `storyboarder.md`, which now says to
design the plate around the subject rather than to its borders. Four tests cover it, including
that the bbox the tool suggests itself satisfies the rule.

Measured on the old plate: offsets **0.004 across, 0.216 down** against a limit of 0.167 — the
`egypt` plate had been drawn to Egypt's own borders (lat 10–33 for a country reaching 31.7).

### The plate was rebuilt and its data checked

`egypt` is now `7,14,55,38` at **7400×4162** (offsets 0.004 / 0.010, oversampling 0.72 centre,
0.82 edge). The width went up because a wider bbox lowers the plate's native zoom, and the
episode's closest shots at zoom 6.7 would otherwise be upscaled past 1:1.

Vectors were re-extracted and compared against the committed geometry. One real drift was caught
and fixed: rebuilt without `--also "Rosetta Branch"`, the Nile stopped at Cairo (2,730 km instead
of 2,963 km) and never reached the sea. With the Rosetta reach restored the lines match the old
ones to within 0.1% — 2,962.0 vs 2,963.3 km for the Nile, 1,151.9 vs 1,152.5 for the Aswan-to-sea
reach, 227.4 vs 227.5 for the Damietta branch — and all endpoints are identical. The band was
rebuilt on the new plate: 40,411 km², unchanged at 4.0% of Egypt.

### The framings are not finished

The new plate fixed every shot on it that had been running off the north edge. What remains is
four shots on the **basin** plate and at the plate-change joints:

| Shot | Failure |
|---|---|
| `share-86` | plate edge within −2.4 px at frame 1 (needs ≥ 2) |
| `rivers` | −127 px at frame 0, the joint out of `share-86` |
| `recap` | −154 px at frame 0, the joint out of `ethiopia` |
| `green` | −124 px at frame 0, the joint out of `recap` |

These are camera-spline overshoots at joints, not plate-room failures: the basin plate passes the
room check for what the episode frames on it. The cause is the shot order — the episode walks from
the Ethiopian highlands (lat ~10) to Egypt (lat ~27) and back more than once, and with each shot
now pointed at its own subject the camera has to travel far between neighbours. Five tuning passes
moved the numbers around without converging; each change propagates through the spline to its
neighbours, and the last pass made `green` five times worse, so I reverted it.

**This needs an editorial pass, not more nudging:** intermediate framings, or a shot order that
does not cross the basin twice, or a `hold` with a reason at the joints. That is the
storyboarder's work, and it is the honest next step.

**So the Egypt episode still does not build, and the render, `episode-qa` and the step review have
not run.** Everything else in this report is in and tested.

## 2. The framing rule — built, and it found more than I could fix

`verifyEpisodeCamera` now fails a shot whose subject does not settle in the **middle third** of
the frame, from `subject` bounds declared per shot (`subjectOnScreen`, `SUBJECT_BAND`).

It immediately found **12 of Egypt's 28 shots** pointing away from their own subject — including
`recap` at **86% down**, which is the 2:48 frame where the valley sat at the edge with Arabia
filling half the screen. Pointing the cameras at their subjects fixed all 28.

**But it then pushed ten shots off the plate.** The `egypt` plate stops at 33° N and Egypt reaches
31.7° N; `nile-basin` stops at 33° N as well. With the subjects honoured, the camera path runs out
of plate at the turns: `shares` and `source` overshoot the north edge by 88 and 108 px at their
joints, `rivers` and `recap` by 70 px, and six more are within 5 px of it. Two gentler passes
halved the overshoots without clearing them.

The same extent also makes **wide and centred mutually exclusive**. For Egypt's centre to sit in
the middle third the frame must satisfy `mpp ≤ 2228` m/px, that is zoom ≥ 5.135; for the frame to
count as wide it must be zoom ≤ 5.155. A window of 0.02 — and inside it the plate's north edge
shows. A sweep of 48 (zoom, latitude) pairs found no framing that is safe, wide and centred.

**Recommended fix: give the episode a plate with room around its subject** — rebuild `egypt` on a
bbox such as `7,14,55,38`, which puts Egypt in the middle of the plate instead of against its top
edge (that box also happens to match the 6950×3909 Mercator aspect almost exactly). It resolves
the edge overshoots and the wide-versus-centred conflict together. The cost is re-extracting the
plate's vector data, which can change the geometry the storyboard inlines, so I did not do it
mid-session.

**Until then the Egypt episode does not build**, and the render, `episode-qa` and the step review
have not run. Everything else above is in and tested.

## Checks

| Check | Result |
|---|---|
| `npm test` | 168 passed |
| `npm run lint` | Clean |
| `uv run pytest` | 329 passed |
| `uv run ruff check .`, `ruff format --check` | Clean |
| `validate:storyboard` | `egypt-nile` valid, `china-unity-pilot` valid |
| `verifyEpisodeCamera` | Pilot passes; Egypt fails on 10 shots at the plate edges |
