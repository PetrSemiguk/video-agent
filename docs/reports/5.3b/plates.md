# Step 5.3b — the plates, and how they were sized

Four new plates, designed by the room rule (`docs/maps.md`, "Room around the subject") rather than
drawn to their subjects' borders. Every one passes `vap.geo.plate --strict`, which checks both
oversampling and subject room.

## Sized from the real polity extents, not by eye

The episode draws Chinese and European polities from Cliopatria. Sizing a plate to a guess would
clip them, and a clipped polity shows a false straight border wherever the camera reaches it. So
the extents were read straight out of `cliopatria-v0.2.1` before any plate was rendered:

| Frame | Polity | lon | lat |
|---|---|---|---|
| 221 BC | Qin | 100.6 .. 124.8 | 28.3 .. 41.9 |
| 100 | Han | 73.1 .. 127.0 | 16.9 .. 42.9 |
| 100 | Xiongnu | 79.0 .. 110.7 | 39.4 .. 52.3 |
| 280 | Western Jin, Eastern Wu | 73.1 .. 127.0 | 16.9 .. 42.8 |
| 745 | Tang | 73.1 .. 122.7 | 17.8 .. 42.8 |
| 980 | Northern Song, Liao | 99.7 .. 138.4 | 18.2 .. 48.8 |
| 1140 | Great Jin, Southern Song | 100.9 .. 140.7 | 18.2 .. 50.9 |
| 1310 | Yuan | 78.5 .. 141.6 | 18.2 .. **61.6** |
| 1400 | Ming, Northern Yuan | 84.6 .. 127.8 | 18.2 .. 56.0 |
| 1800 | Qing | 73.4 .. **141.6** | 18.2 .. 56.2 |
| 395 | Western and Eastern Rome | -9.6 .. 41.8 | **23.4** .. 55.4 |
| 555 | Eastern Rome (Justinian) | -8.3 .. 42.4 | 23.4 .. 46.2 |
| 800 / 850 | Franks, and the three kingdoms after Verdun | -2.8 .. 19.2 | 41.3 .. 54.5 |
| 1000 / 1300 | Holy Roman Empire, and its minor states | 3.4 .. 17.8 | 41.3 .. 54.9 |

Two of these decide the plates. The **Yuan reaches 61.6 N** and the **Qing 141.6 E**, which the
existing `china-east` plate (lon 81.4-138.6, lat 18-45) cuts on three sides. **Rome in 395 reaches
23.4 N**, below the 30 N a Europe plate would naturally start at.

## The plates

| Plate | bbox after the 16:9 fit | px | m/px | native | widest | spread | oversampling | room |
|---|---|---|---|---|---|---|---|---|
| `eurasia` | -12.0, 0.7, 145.0, 66.1 | 8000x4500 | 2185 | 5.163 | 3.178 | 3.96x | 0.281 / 0.524 | yes |
| `east-asia` | 50.2, 15.0, 164.8, 62.0 | 8000x4500 | 1593 | 5.618 | 3.634 | 3.96x | 0.396 / 0.620 | yes |
| `europe-wide` | -32.4, 20.0, 65.4, 60.0 | 7400x4162 | 1472 | 5.733 | 3.860 | 3.66x | 0.432 / 0.630 | yes |
| `north-china` | 87.2, 26.0, 136.8, 48.0 | 7400x4162 | 747 | 6.712 | 4.840 | 3.66x | 0.786 / 0.928 | yes |

Frame widths, which is what the rhythm report means by scale: `eurasia` 16,603 km at its widest,
`north-china` 1,434 km at its sharpest. **The episode's scale spread is therefore about 11.6x**,
against the 1.76x that one `china-east` plate allows and the 2x minimum in
`docs/visual-grammar.md`.

Each plate's declared subject, the one it is designed to show both wide and centred:

| Plate | Subject | Offsets (limit 0.167) |
|---|---|---|
| `eurasia` | both ends together, -10,20,123,55 | 0.064 / 0.017 |
| `east-asia` | the Qing at its peak, 73.4,18.2,141.6,56.2 | 0.000 / 0.062 |
| `europe-wide` | Rome in 395, -9.6,23.4,41.9,55.4 | 0.004 / 0.045 |
| `north-china` | the North China Plain, 112,32,121,40 | 0.091 / 0.077 |

**What the room rule does not promise here.** On `east-asia` the Tang's centre sits 0.227 of the
span below the middle, because the plate has to reach 62 N for the Yuan. The Tang is therefore
framed at its own medium zoom, never at the plate's widest, which the per-frame edge check allows
and the room rule never required. The Egypt pass is the reason this is written down: a subject
declared wider than the shot really frames is how a frame ends up weighted on empty ground.

## Two findings worth keeping

**Scale spread is set by a plate's pixel width, not its bbox.** Measured across every plate in the
repo: `spread ~= width_px / 1920 x 0.95`. Every 3840 px plate gives exactly 1.90x; 7400 px gives
3.66x; 8000 px gives 3.96x. To plan an episode's scale range, choose the pixel width first.

**`--height` is not optional.** `--width 7400` alone leaves the default height of 2160, so the
aspect fit grows the *width* instead: the first `north-china` came out 7400x2160 covering lon
64.2-159.8, nearly twice the intended span at half the resolution. Pass both, matching 16:9.

## Cost

| Plate | Blue Marble | Terrain | Shade, grade, write | Total | PNG |
|---|---|---|---|---|---|
| `north-china` | 10.0 s | 21.8 s (z8) | 13.2 s | **45.0 s** | 37.8 MB |
| `east-asia` | 19.9 s | 16.4 s (z7) | 14.4 s | **50.6 s** | 38.4 MB |
| `europe-wide` | 14.6 s | 6.7 s (z7) | 12.4 s | **33.8 s** | 30.0 MB |
| `eurasia` | 35.4 s | 16.2 s (z7) | 14.8 s | **66.4 s** | 40.2 MB |

196 s and 146 MB of PNG in all (git-ignored; the four `.json` files are committed). A 7400-8000 px
plate costs about 125 MB of RAM decoded, which is the reason the full render goes in parts.
