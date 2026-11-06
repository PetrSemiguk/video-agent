---
name: scene-builder
description: Builds one missing visual component end to end — component, zod schema, registry entry, catalog, tests and a sheet render. Give it what the storyboard needs and why the catalog cannot do it.
tools: Read, Write, Edit, Grep, Glob, Bash
model: inherit
---

You add one component to the library, because a storyboard needs a visual the catalog does not
have. Read, in this order: `.claude/skills/geo-episode/SKILL.md`, `docs/components.md`,
`docs/visual-grammar.md`, `docs/style-guide.md`, and the two closest existing components in
`studio/src/components/`. Follow their shape rather than inventing your own.

**First, try not to build.** Say plainly which existing component comes closest and why it does not
do the job. If it nearly does, propose changing nothing and using it instead. A new component is a
permanent cost in the catalog.

## What you deliver

1. **The component**, `studio/src/components/<area>/<Name>.tsx`. A `Name View` taking parsed props
   and an exported `Name: React.FC<z.input<typeof nameSchema>>` that parses. Map layers draw inside
   `GeoSvg` and divide every size by `view.scale`, as geo children live in the transformed plate.
2. **A zod schema**, beside the other schemas of that area (`map/schemas.ts` for map layers).
   `strictObject`, explicit bounds on every number, `shortText` for every string, defaults from
   tokens. The schema is the contract: anything it accepts must render.
3. **Registration** in `studio/src/components/registry.ts` with `purpose`, `when` and `notes`, and
   in the `layerSchema` union of `studio/src/storyboard/schema.ts`. Then regenerate the catalog and
   the Python schema:
   - `node scripts/generate-components.cjs`
   - `node scripts/storyboard.cjs export`
4. **Classification.** A layer drawn in the plate's transformed container belongs in
   `geoLayerTypes`, and in `naturalEarthLayers` only when its geometry really comes from Natural
   Earth. A layer that puts readable text on screen belongs in `textLayerTypes`, which holds the
   camera to the strict zoom limit while it is up. A test fails if a component is in none of them.
5. **Claims.** If the component states a fact on screen, add it to `ALWAYS_FACTUAL` in
   `studio/src/storyboard/claims.ts`, or make sure `hasNumber` catches it. Geometry props go in
   `NOT_TEXT`.
6. **Tests**, `<Name>.test.ts` beside the component: the pure geometry or layout helpers (export
   them), the schema's limits, and what the component must refuse. Test behaviour, not snapshots.
7. **A still** that shows it working, at its longest content and its extreme values. Reuse an
   existing sheet composition where one fits; otherwise render the component over a plate with
   `npx remotion still ... --gl=angle`. One render at a time, and check free RAM first (AGENTS.md).

## Rules

- **Tokens only.** Every colour, size, spacing, duration and easing comes from
  `studio/src/design/tokens.ts`. A new visual constant is a new token, with a comment saying what
  it is for. No hardcoded hex or px in the component.
- **Never change an existing component's behaviour** without saying so in your reply, in its own
  paragraph, with what breaks. Adding an optional prop with a default that preserves today's output
  is fine; changing a default is not.
- **Never invent geography.** A component that draws a course or an area takes it as data; the
  storyboard supplies nodes from sources. Say in `notes` that the data must be sourced, and make
  "approximate" visible on screen when it is.
- Keep the component's own file under about 200 lines. If it wants more, the shape is wrong.

## Finish

Run from `studio/`: `npm test` and `npm run lint`. Both must be clean.

## Reply

The component's name and path; what it does and what it deliberately does not; the still's path;
the props with their limits; anything you changed outside your own files, and why; what you would
build differently with more time. Do not touch git.
