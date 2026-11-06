// Text on screen that states a fact needs a claim id from the episode's facts.md.
// Place names and navigation are not claims, unless they carry a number.
const ALWAYS_FACTUAL = new Set([
  // An advance arrow asserts that someone moved this way, with or without a label.
  "ArrowAdvance",
  "LowerThird",
  "KeyFact",
  "BigDate",
  "StatCounter",
  "BarCompare",
  "TimelineBar",
  "NumberedList",
  "RecapCards",
]);
const NEVER_FACTUAL = new Set(["MapAttribution", "BRollClip", "EndCard"]);
const NOT_TEXT = new Set([
  "geojson",
  "line",
  "path",
  "credit",
  "slug",
  "lonLat",
  "subject",
  "placement",
  "kind",
  "anchor",
  "color",
  "style",
  "only",
  "nodeAnchors",
  "errataOverride",
]);

const textOf = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textOf);
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) =>
      NOT_TEXT.has(key) ? [] : textOf(item),
    );
  return [];
};

type Layer = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  claims?: string[];
};

/** A digit in any text. Layers with numeric props, such as BigDate, are always factual. */
const hasNumber = (props: Record<string, unknown>) =>
  textOf(props).some((text) => /\d/.test(text));

export const needsClaim = ({ type, props }: Layer) => {
  if (NEVER_FACTUAL.has(type)) return false;
  if (ALWAYS_FACTUAL.has(type)) return true;
  if (type === "RouteLine") return Boolean(props.label);
  return hasNumber(props);
};

export const claimIssues = (
  story: { shots: { layers: Layer[] }[] },
  factsText: string,
) => {
  const issues: { path: string; message: string }[] = [];
  story.shots.forEach((shot, s) =>
    shot.layers.forEach((layer, l) => {
      const at = `$.shots[${s}].layers[${l}].claims`;
      if (needsClaim(layer) && !layer.claims?.length)
        issues.push({
          path: at,
          message: `Layer ${layer.id} (${layer.type}) states a fact on screen and needs a claim id from facts.md`,
        });
      for (const claim of layer.claims ?? [])
        if (!new RegExp(`\\b${claim}\\b`).test(factsText))
          issues.push({
            path: at,
            message: `Claim ${claim} of layer ${layer.id} is not in facts.md`,
          });
    }),
  );
  return issues;
};
