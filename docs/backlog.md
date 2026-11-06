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

Fixing it needs a re-render of both episodes, so it was left out of step 5.4's scope.
