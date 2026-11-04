# Visual style guide

> Design tokens v1: `studio/src/design/tokens.ts` is the single source for colors,
> typography, spacing, motion and plate grading (step 2.1).

## Footage mix
- **80–90%** of runtime: satellite map with 3D terrain.
- **10–20%**: B-roll.
- No on-camera face. Narration is TTS.

## Map & camera
- Dark overall palette.
- Almost constant, smooth camera motion.
- 1–3 hard cuts per minute.
- Semi-transparent region fills, river lines, place labels.

## Accent colors (semantic)
| Role        | Color |
|-------------|-------|
| Region A    | amber |
| Region B    | light blue |
| Conflict    | red   |

## On-screen graphics
- Lower thirds with a colored bar on the left.
- Small all-caps section labels.
- Large dates.
- Bar-chart comparisons, timelines, numbered lists, summary cards.

## Text rule
On-screen text is the condensed essence of the narration — never a transcript.

## Design system v1

- Selected by the owner: Barlow Condensed Bold for caps labels, headlines and dates;
  Inter for body, cities and river labels. Fonts are local and OFL licensed.
- Minimum text size at 1080p: 26 px, including attribution. Map cities/rivers: 30 px;
  region names: 44 px. Debug views are exempt from publication sizing.
- Title safe area: 5%. Key information stays above the bottom 12%, reserved for
  playback controls/captions. Attribution remains secondary at the bottom edge.
- Spacing grid: 8 px; context-specific map geometry and optical offsets use named tokens.
- Region fill: 20%; outside dimming: 24%. Terrain remains visible.
- Motion: 30 fps; standard durations 10/18/30 frames, river draw 120 frames; stagger
  8 frames. Standard in/out/inOut Bezier curves live in motion tokens.
- Muted eight-color polity palette is available for future historical layers.
  It does not imply historical data was verified in step 1.6.
