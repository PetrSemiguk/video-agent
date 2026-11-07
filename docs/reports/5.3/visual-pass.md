# Egypt visual pass — nine owner findings

Status: **all nine done. The episode's camera passes on every shot, every section has a wide
shot, and the preview is built. The full MP4 is not re-rendered yet: the render guard refuses
below 6 GB of free RAM and the machine has about 5 GB (see "The render" at the end).**

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

## 2. The plate rule, the framings, and the camera engine

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

### The framings, finished

The honest next step named in the first draft of this report was an editorial pass by the
storyboarder, not more nudging. That is what this was. First the failures were measured properly:
`verifyPlates` throws on the first bad frame, so one run only ever shows one failure per shot. A
harness that collects every bad frame instead found **9 bad stretches across 7 of 28 shots**, not
the 4 the earlier pass could see, and said for each whether the bad pose sat **on** a camera key
(a framing the storyboard asked for) or **between** keys (the spline's own excursion). That
distinction decided every fix below. The record is `camera-egypt-v3.txt`.

Four causes, all different from "the camera overshoots at the joints":

1. **Two shots asked for framings that are off the plate.** `share-86` and `ethiopia` were pointed
   at the Ethiopian highlands at the basin plate's widest zoom, which puts the plate's south edge
   in frame: -127 px and -154 px at their own target poses, -562 px mid-shot. The basin plate
   fails the room check for that subject - offsets **0.271 down against a 0.167 limit** - and the
   earlier claim that it "passes the room check for what the episode frames on it" was wrong. The
   other three subjects on that plate do have room (0.06-0.11).
2. **Two shots asked for a zoom past their plate's native zoom.** `recap` at 5.62 and `rest` at
   5.58 on a basin plate sharp to **5.569** - magnification 1.036 and 1.008. `rest` is on the
   egypt plate but crossfades onto the basin one, so its pose has to be legal there too.
3. **A plate crossfade must be legal on both plates, and a zoom-out during one is not.** The
   `recap` to `green` dissolve put a basin framing at lat 20.6 on the egypt plate, whose south
   edge is lat 14: -124 px. The egypt and basin plates overlap only between about lat 22.6 and
   25.5 at zoom 5.48, which is the whole band in which a change between them is possible at all.
4. **The spline cannot stop without overshooting.** `highlands` travels from Egypt to the basin
   and `share-86` then asks for almost the same frame, so the velocity at that joint had nowhere
   to go: the picture coasted **366 px off the plate's south edge in the middle of an 8.6 s shot**
   whose own framing has 92 px of margin.

Cause 4 needed a mechanism that did not exist. `Segment.stillStart` already clamps a joint to zero
velocity and ends the spline's run there, but only `hold` set it. A shot can now carry
**`settle: true`**, which does the same at its own cut. Measured on the pilot: without it the
camera is still moving 1.63 px/frame at the cut and drifts 51 px past the framing it was given;
with it, 0.003 px/frame and 14 px, the remainder being the ease towards the next shot. A settle
stops the camera; it does not freeze it. Every plate change in the episode now settles, so each
dissolve happens on a still frame - which is also what fixes cause 3, since a camera that is not
zooming out while the old plate is still on screen stays inside the narrow band of legal poses.

The editorial half of cause 1 is the part no nudging could reach. On the `nile-basin` plate the
Ethiopian highlands **cannot be both centred and wide**: centring them needs zoom 5.72, past the
plate's native 5.569. That is the room rule's own conclusion, and the answer is not a worse
framing but the right subject. The three shots that name the highlands are about where the Nile's
water comes from - the basin, with the highlands lit inside it - and `rivers` is the shot that is
actually about them close up. `docs/visual-grammar.md` now states both readings a share shot may
take, and that the frame and the declaration have to match.

### One defect in the camera engine, found on the way

With the framings fixed, `open` still grazed the plate's north edge - and its latitude never
moved. The **zoom dipped 0.028 backwards** in mid-shot, which at a wide framing with 188 px of
margin is enough to leave the plate. The cause is `drift`: its `amount` and `zoom` were a fixed
move regardless of how many frames it lasted, so the 9-frame drift that `sync.ts` appends when a
shot absorbs a short pause pushed **four times faster** than the 167-frame shot before it, and the
C2 spline dipped backwards ahead of it to stay smooth. `drift` is documented as "barely
perceptible constant motion", which is a rate, so it is now one: the amounts are measured over
`motion.camera.driftFrames` (90) and scale with duration. A 9-frame drift covers a tenth of what a
90-frame one does, and a 90-frame drift is unchanged. This affected every shot that absorbs a
pause, not only Egypt's opener.

### What the plate rebuild bought, collected

The previous pass rebuilt the `egypt` plate with room around Egypt but left the framings that had
been drawn for the old one. With the stale ones replaced, the episode went from **0 wide shots to
4**, and `open` is now both wide (it ends at 4.990, inside the 5.040 bar) and centred on Egypt
(50/49) - which the old plate could not do at once, and which was the reason it was rebuilt.

| Shot | Was | Now | Why |
|---|---|---|---|
| `open` | 5.36, Egypt at 34% down | 4.96 to 4.990, Egypt at 50/49 | The plate has room now; its comment still reasoned about the old edge |
| `line` | - | `settle` | A wide frame has only ~100 px of margin, so its joint must not swing |
| `coast` | 6.62 | 6.5 | 0.14 under a native 6.760 is not enough headroom for the spline |
| `south` | lat 24.8 | lat 23.6 | Leans towards where the river comes from, and shortens the traverse |
| `highlands` | 5.25 on the highlands | 4.94 on the basin, `settle` | Wide or centred, never both; dissolve on a still frame |
| `share-86` | 4.9, -562 px off plate | 4.79 on the basin, `settle` | The section's wide shot; the share's denominator |
| `nasa` | 6.3, subject the valley | 5.6, subject Egypt | A share of all Egypt, and it carries half the pull-back |
| `reading` | 5.45 | 5.00 | The Dam's wide shot, and the scale change The Answer opens on |
| `rest` | 5.58 | 5.48, lat 24.6 | Legal on the basin plate it crossfades onto |
| `ethiopia` | 4.89, -154 px off plate | 4.79 on the basin, `settle` | The callback to `highlands` |
| `recap` | 5.62, lat 20.6 | 5.48, lat 22.6 | Within the plate's native zoom, legal on both plates |
| `aswan`, `green` | - | `settle` | The other two plate changes |

### Rhythm

Measured on the built preview, `rhythm-egypt-nile-v3.json`:

| | Before this pass | After |
|---|---|---|
| Wide shots | 0 of 28 | **4 of 28** (`open`, `share-86`, `reading`, `ethiopia`) |
| Sections with a wide shot | 0 of 4 | **4 of 4** |
| Warnings | 7 | **2** |

Both remaining warnings are runs at one scale: `source, flood, south, highlands` (four regional)
and `question, answer, rest` (three). Shots per minute (9.22) and hard cuts per minute (1.37) are
unchanged, and hard cuts are inside the 1-3 range the style guide asks for. The graphic share is
0%: every shot acts on the map.

### The render

The storyboard validates, the camera passes on all 28 shots, the preview is built, the 29 review
stills and the sheets are regenerated, and the camera audit reports all **5271 frames credited**,
max centre step 6.77 px/frame, max step change 0.73 px/frame. The full MP4 is **not** re-rendered:
`vap.system.check_render_memory` refuses below 6 GB of free RAM and the machine had 6.3 GB when
this pass began and 4.95 GB when the render was due, all of it the desktop's own applications.
The guard exists because a render out of memory is killed rather than slowed, so it was not worked
around. Re-run `uv run python -m vap.episode build egypt-nile --stage render` with a few GB free;
everything it depends on is cached and green.

## Checks

| Check | Result |
|---|---|
| `npm test` | 170 passed (2 new: `settle`, and drift as a rate) |
| `npm run lint` | Clean |
| `uv run pytest` | 333 passed |
| `uv run ruff check .`, `ruff format --check` | Clean |
| `validate:storyboard` | `egypt-nile` valid, `china-unity-pilot` valid |
| `verifyEpisodeCamera` | **Egypt passes on all 28 shots**; pilot passes |
| Preview stage | Built, 58.3 s; max camera speed 8.19 px/frame over 5270 pairs |
| Camera audit | 5271 of 5271 frames credited; max step 6.77 px, max step change 0.73 px |
| Full MP4 render | **Not run** - the 6 GB RAM guard refused at 4.95 GB free |
