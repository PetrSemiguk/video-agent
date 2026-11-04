# End screen, cards and B-roll (step 2.4)

## YouTube research (2026-11-04)

The current [official YouTube Help](https://support.google.com/youtube/answer/6388789)
allows end-screen elements during the last 5–20 seconds, with up to four elements
on standard 16:9 videos. A video must be at least 25 seconds long. Placement is
editable in Studio; the help page does not specify one universal set of pixel
coordinates. YouTube also says appearance can vary by device/context. These are
platform facts; the following rectangles are **our design reservations**, not
claimed YouTube size/position restrictions.

At native 1920x1080, `cards.endZones` reserves:

| Element | x | y | width | height |
|---|---:|---:|---:|---:|
| Video / playlist | 1104 | 162 | 640 | 360 |
| Subscribe | 1320 | 630 | 240 | 240 |

EndCard text occupies x=96..856 and stays above the bottom 12% reserve. The right
reservations remain free of key information for all final 600 frames at 30 fps.
The map may continue behind them; source attribution stays below the reserved
zones. Production EndCard does not burn in outlines, fake video thumbnails or
clickable-looking subscribe elements. `CardCheck` outlines are QA only.

When publishing, place the actual video/playlist and subscribe elements in these
areas in YouTube Studio and preview the result. EndCard does not configure or
publish YouTube elements. The showreel uses the clean end card from 40–60 seconds.

## New components

See the generated [component catalog](components.md) for exact input schemas and
limits. TitleCard is a screen layer over PlateStage; a map source is never silently
invented by the card. EndCard has exactly a 600-frame duration and an entrance but
no exit fade, keeping the closing layout steady through the final frame.

BRollClip only accepts an approved asset ID from `studio/src/media/broll.ts`.
It reads a local public/ proxy, excludes original audio, slowly pushes from scale
1 to cards.brollPush, and uses the plate grade's saturation/exposure/gamma in an
sRGB SVG filter. This matches the base color treatment; it does not apply terrain
hillshade or infer an ocean/land mask from arbitrary footage. Credits remain
unscaled and unfiltered at a minimum 26 px.

The approved sample is Pexels 1851190, [The Sun Illuminating Earth's Surface](https://www.pexels.com/video/the-sun-illuminating-earth-s-surface-1851190/),
whose current creator is Ingrid. The official page marks it free, and
[Pexels permits commercial video use](https://www.pexels.com/license/).
It is illustrative Earth animation, not NASA imagery or footage proving a named
location. The licenses.md row was added before downloading/using it. Its source
URL, creator credit, SHA-256 and technical metadata are recorded in broll.ts.

Original: `assets/broll/pexels-1851190.mp4` (4K, 25 fps, 16 s, no audio stream).
Render proxy: `studio/public/broll/pexels-earth-1851190.mp4` (1080p, 30 fps,
480 frames, audio stripped). Both are git-ignored. Run from studio:

```powershell
node scripts/prepare-broll.mjs
```

This downloads the approved public CDN object if missing, verifies its original
hash, and creates the proxy with system ffmpeg. A changed hash fails for source
review instead of silently accepting a replacement. Additional assets require a
licenses.md entry and manifest/schema update before use. No arbitrary URL/path
prop is accepted. The current trim and duration are checked against the proxy.

## Transitions and showreel

Installed `@remotion/transitions` exactly 4.0.539, matching existing Remotion.
No upgrade was run. Implementation uses the vendor's
[TransitionSeries](https://www.remotion.dev/docs/transitions/transitionseries)
and [custom presentation API](https://www.remotion.dev/docs/transitions/presentations/custom):

- crossfade: `fade()` with the outgoing scene retained underneath;
- map-to-graphic wipe: `wipe({direction: "from-left"})`;
- dip-to-dark: a custom presentation, both scene opacities zero at progress 0.5,
  revealing the colors.background surface below the series.

Transitions use motion easing and the cards.transitionFrames token (24 frames).
Five overlaps subtract 120 frames from scene lengths totaling 1320, producing the
first 1200 frames / 40 seconds. EndCard then holds for 600 frames, giving exactly
1800 frames / 60 seconds. Scene content is defined in `demo/Showreel.tsx`:

| Content | Global interval |
|---|---|
| TitleCard on map | 0–5 s |
| RegionHighlight, RiverLine, PlaceLabel | 4.2–12.2 s |
| Four text layers | 11.4–19.4 s |
| Five infographics on a dark surface | 18.6–30.6 s |
| BRollClip | 29.8–33.8 s |
| Recap on map | 33–40 s |
| Clean EndCard on map | 40–60 s |

Intervals intentionally overlap at transitions. Example statistics/dates are
illustrative, not a sourced episode script.

From studio:

```powershell
node scripts/generate-components.cjs
npm.cmd test
npm.cmd run lint
node scripts/render-showreel.mjs
```

Use `--checks-only` to refresh the four card stills and browser layout evidence
without rerendering the minute video. The script uses installed Remotion APIs,
Rspack, ANGLE, concurrency 1 and BT.709. It does not start Studio.

Catalog tests list every registered component, check that all public production
exports are registered and compare the entire generated document with live Zod
input contracts and behavior notes. Custom refinements/GeoJSON checks are recorded
in prose because JSON Schema cannot represent them; runtime schemas remain final.
