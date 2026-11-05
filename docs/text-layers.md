# Text layers (step 2.2)

Imports and Zod schemas are exported from `studio/src/components/text/index.ts`.
Every component parses its props during rendering; schemas are also available for
pre-render validation. Unknown properties fail. Text is trimmed; empty text and
newlines/tabs are rejected. Limits apply to the normalized string (Zod 4.5.4).
Content wraps without truncation, clipping or font shrinking.

| Component / schema | Content | Maximum lengths | Default placement |
|---|---|---|---|
| LowerThird / lowerThirdSchema | `title`, optional `subtitle`, `subject` for `placement: "auto"` | 64 / 96 | lower-left; `auto` picks a corner clear of the subject |
| SectionTag / sectionTagSchema | `text`, displayed as caps | 32 | upper-left |
| BigDate / bigDateSchema | integer `year`, optional `era`, `caption`, `fromYear` | year 1–9999; caption 80 | center |
| KeyFact / keyFactSchema | `statement`, `emphasis` | 120 / 24 | lower-left |

KeyFact's emphasis must occur exactly once in the statement, case sensitive. It is
styled in place, preserving the rest of the sentence. BigDate takes a positive
historical year; select `BCE` or `CE` using `era`, or omit it. Historical year zero
and negative years fail. `fromYear` defaults to 0 (an animation origin, not a
historical year); 0–9999 is allowed, including a reverse roll from a higher year.
The integer counter reaches the target at motion.frames.slow, independent of seek
order, with no locale-dependent grouping.

All schemas also accept:

- `durationInFrames`: integer, 37–1800, default 120. Place inside a Remotion Sequence
  of this duration, so each component's local frame starts at zero and its exit
  completes on the Sequence's final frame.
- `color`: `regionA` (default), `regionB`, `conflict`, `neutral`.
- `placement`: `lower-left`, `upper-left`, `lower-right`, `upper-right`, `center`, `flow`
  (`LowerThird` also `auto`). Screen placements use
  5% safe margins and the 12% bottom reservation. `flow` removes absolute placement
  for a parent-managed layout, including the review sheet.

Native rendering contract: 1920x1080, 30 fps; fixed type sizes from tokens, minimum
26 px. Cards size to their text between `textLayer.fit.minWidth` and `maxWidth`, and wrap beyond it.
Different frame sizes are
not a promise of responsive typography: rescale the composition for distribution.
The review sheet is 1920x2160 so all four blocks can be inspected at native pixel
size, with each block keeping the same width as in a 1080p video.

Entry/exit use the standard motion.frames.base duration and out/in curves.
BigDate's roll uses motion.frames.slow. Background, padding, bars, sizes, colors,
radius and example timing live in `studio/src/design/tokens.ts`. The small
`fontsReady` export lets browser measurements wait for actual local font faces.

## Verification and rendering

Run from studio:

```powershell
npm.cmd test
npm.cmd run lint
node scripts/render-text-layers.mjs
```

Use `node scripts/render-text-layers.mjs --sheets-only` to refresh the sheets and
layout evidence after changing review text without rerendering the unchanged demo.

The script renders sheets at frame 60, one with readable maximum-length samples
and one with wide unbroken W/M strings. Browser checks wait for local fonts, then
reject scroll overflow, content outside a text box, or a box outside its review
cell. The script requires evidence for all eight instances before rendering the
450-frame / 15-second map demo (ANGLE, concurrency 1, H.264 BT.709).

Outputs: `studio/out/text-layers-sheet.png`, `text-layers-stress.png`,
`text-layers-layout.json`, `text-layers.mp4`. A repeated run replaces these ignored
review artifacts. The map uses only the already approved local China plate and
its existing visible attribution. Example text is a component demonstration,
not a sourced episode script. No new data, media, font or model source is used.

Zod reference: [official schema API](https://zod.dev/api); installed version 4.5.4
is pinned directly, matching the existing Remotion transitive dependency.
