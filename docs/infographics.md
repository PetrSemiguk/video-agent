# Infographics (step 2.3)

Components and strict Zod schemas are exported from
`studio/src/components/info/index.ts`. Each render parses its props. Unknown keys,
empty text, newlines/tabs, excessive lengths and unsupported numbers fail with
field paths. Strings are trimmed before validation. No text is clipped, truncated
or shrunk to fit.

## Common contract

Native size is 1920x1080 at 30 fps. Boxes use the existing TextFrame's 1120 px
maximum width, local Inter/Barlow Condensed fonts, 5% safe area, and bottom 12%
reservation. Type sizes are 26–88 px. Other frame sizes are not a promise of
responsive typography; scale the composition for distribution.

- `durationInFrames`: integer 69–1800, default 180. Use an enclosing Sequence of
  the same duration; local frame zero starts the animation. The minimum leaves
  room for five staggered reveals and an exit.
- `placement`: `center` (default), `upper-left`, `lower-left`, `flow`. Flow placement
  is intended for parent-managed layouts and the review sheet.
- `title`: required on all except StatCounter; maximum 48 characters.
- Semantic colors: `regionA`, `regionB`, `conflict`, `neutral`; default regionA.
  Bar/event/card colors are specified per item; list/counter color is top-level.

Entry/exit use the shared 18-frame motion timing and standard out/in curves.
Bar growth, counter and playhead use motion.frames.slow (30 frames). List/card
reveals use motion.stagger (8 frames). Seeking is deterministic and does not
depend on timers or accumulated state. All visual values live in tokens.ts.

## BarCompare / barCompareSchema

- `bars`: 2–5 objects `{label, value, color?}`. Labels: maximum 48 characters.
- `value`: finite number from -1,000,000,000,000 to +1,000,000,000,000.
- `unit`: optional string, maximum 12 characters, shown once above the chart.
- `decimals`: integer 0–2, default 0; applies to displayed bar values and endpoints.

The shared domain includes zero. Negative bars grow left from zero, positive bars
right. Values remain in a separate fixed-width column; labels wrap above each
track. Axis labels occupy three distinct columns. A midpoint can add one decimal
place to represent half-steps accurately (0 / 0.5 / 1, for example). All-zero data
uses a reference domain 0–1 with zero-width fills, avoiding division by zero.
Tiny values relative to the domain may be subpixel; values are never given a
misleading minimum bar length. Display precision rounds values; select appropriate
units and decimals for the data.

## TimelineBar / timelineBarSchema

- `startYear`, `endYear`: integers -9999–9999, excluding zero; end must follow start.
- `events`: 1–5 objects `{year, label, color?}` within the span; label maximum 48.
- Negative year means BCE, positive means CE. Labels always include the era, with
  ungrouped year digits, independent of the host locale.

The timeline has a common span and animated playhead. Each chronologically sorted
event has its own aligned track and date/label row, so neighboring or identical
dates cannot collide. Markers at endpoints remain inside their tracks. Original
event input is not mutated. For elapsed distances the implementation converts to
an ordinal internally: 1 BCE -> 0, 1 CE -> 1. Ordinal 0 is displayed as 1 BCE;
historical year zero is never accepted or shown.

## NumberedList / numberedListSchema

`items`: 3–5 strings, maximum 80 characters each. Optional top-level semantic
`color` styles the numbers. Items reveal sequentially in index order while their
layout space stays reserved, avoiding movement of later rows.

## RecapCards / recapCardsSchema

`cards`: 2–4 objects `{title, body, color?}`. Card title maximum 32 characters;
body maximum 80. Two columns with wrapping text; 3–4 cards create a second row.
Cards reveal with a stagger and fade out with the enclosing frame.

## StatCounter / statCounterSchema

- `value`: finite target in ±1 trillion; `from`: same bounds, default 0.
- `label`: required, maximum 80 characters: one line of what the number means.
- `unit`: optional, maximum 20: what is counted, read with the number ("5 river systems").
- `date`: optional, maximum 32: when it held, on its own line. Never put a date in `unit`.
- `decimals`: integer 0–2, default 0; optional semantic `color`.

Forward, negative and reverse counts are supported. Number formatting is explicitly
`Intl.NumberFormat("en-US")` with grouping and fixed decimal precision; negative
zero after rounding is normalized to zero. The number itself never wraps; the unit sits
beside it and moves below when too long. The card is sized to its content.

## Reproduction and evidence

From studio:

```powershell
npm.cmd test
npm.cmd run lint
node scripts/render-info.mjs
```

Use `--sheets-only` to refresh sheets and layout evidence without the video.
The script uses installed Remotion APIs, Rspack, ANGLE and concurrency 1, matching
the existing Windows rendering workflow. Outputs:

- `studio/out/info-sheet.png`: all five components, maximum-length readable text,
  maximum item counts, signed extremes, zero, BCE/CE and coincident dates.
- `studio/out/info-stress.png`: the same data with wide unbroken W strings.
- `studio/out/info-layout.json`: font-ready browser measurements of 10 instances;
  checks text overflow, sibling label/card collisions, containment in review cells,
  and fit within a native 1080p safe height including entrance shift.
- `studio/out/info.mp4`: five 4-second examples over the existing attributed plate,
  20 seconds total. All numbers/dates in the examples are illustrative, not a
  sourced episode dataset. No new data/media/font/model source is used.

The sheets are 1920x4560 to preserve native component widths and font sizes rather
than shrinking five examples into a 1080p image. All output artifacts are ignored.
