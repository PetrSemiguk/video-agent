# Backlog

Decided by the owner, not scheduled in a roadmap step.

## Disputed territories

- **A style** for disputed areas on maps: hatching or a dashed border, from design tokens.
- **A rule for choosing by episode:** which view an episode shows, recorded in the episode's notes. Natural Earth's de facto view stays the default until then.

First case: Egypt's outline in `episodes/egypt-nile` follows the default, which puts the disputed Hala'ib Triangle inside Egypt. The owner kept that for the test episode.

## A bare plate at the end of a shot

Found by `episode-qa` on the Egypt mini-episode and confirmed against the assembly: a shot extended
to the next sentence pause keeps that tail for the camera, but its layers end at their anchors, so
every overlay — river, outline, labels, cards — vanishes and the plate plays bare before the cut.

In `egypt-nile`, 3 of 28 shots: `open` 9 frames (0.30 s), `density` 19 (0.63 s), `strip` 10 (0.33 s).
It also spoils the review still for `density`, which is sampled inside the gap and shows nothing.

The likely fix is the one already used for plate crossfades (`layerFrames` in
`studio/src/episode/plan.ts`): a layer that has no explicit `end` should run to the end of its shot,
not to its anchor window. Check with:

```
node -e "const a=require('./studio/out/<slug>-prepared.json'); a.assembly.shots.forEach(s=>{const e=Math.max(...s.layers.map(l=>l.from+l.durationInFrames),0); if(s.layers.length&&e<s.durationInFrames) console.log(s.id, s.durationInFrames-e)})"
```

Fixing it needs a re-render of both episodes, so it was left out of step 5.4's scope. It is now
item 2 of the one combined re-render pass below.

## One re-render pass after step 5.3b

Decided by the owner on 2026-11-23, closing step 5.3. Two defects each need a re-render of the
Egypt episode, so they are done together, once, after step 5.3b - not before it.

1. **The `nile-basin` plate has no room to the south.** `highlands`, `share-86` and `ethiopia` put
   the subject their sentence names 82-86% down the frame; in `highlands` it is clipped by the
   bottom edge, with its label just above the attribution strip. The plate was cut at lat 3 and the
   highlands run from lat 5.0 to 14.7, so they live in its bottom sixth. Neither framing on today's
   plate is good: the one that reads well sits 5.6 px from the south edge, and the safe wide one
   buries the highlands. The fix the subject rule prescribes is to rebuild the plate with room to
   the south, about lat -2 to 33 (~4736x2664 px against today's 3840x2160), then re-extract and
   re-verify every `nile-basin` vector - the Egypt rebuild caught the Nile losing its Rosetta reach
   exactly that way. Account: `docs/reports/5.3/visual-pass.md`.
2. **A bare plate at the end of a shot**, above - which the pilot needs the re-render for too.

The pass replaces `studio/out/egypt_final.mp4`.
