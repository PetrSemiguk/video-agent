import { z } from "zod";
import { storyboardSchema } from "./schema";
import {
  regionGeo,
  regionGeoContract,
  riverGeo,
  riverGeoContract,
  routeGeo,
  routeGeoContract,
} from "../components/map/schemas";

/** Fail on unexpected custom validators rather than silently exporting `{}`. */
export const exportStoryboardSchema = () => ({
  ...z.toJSONSchema(storyboardSchema, {
    io: "input",
    target: "draft-2020-12",
    unrepresentable: ({ zodSchema }) => {
      if (zodSchema === regionGeo)
        return z.toJSONSchema(regionGeoContract, { io: "input" });
      if (zodSchema === riverGeo)
        return z.toJSONSchema(riverGeoContract, { io: "input" });
      if (zodSchema === routeGeo)
        return z.toJSONSchema(routeGeoContract, { io: "input" });
      return "throw";
    },
  }),
  $id: "urn:video-agent:storyboard:1",
  title: "video-agent storyboard v1",
  description:
    "Authoring input contract. Run npm run validate:storyboard for full Zod semantic validation.",
  "x-runtime-validation": [
    "Unique plate/shot ids and layer ids per shot; declared plate references; no outgoing transition on final shot.",
    "Ordered same-kind time/word ranges, geographic bounds, matching monotone followLine fractions.",
    "Component refinements: KeyFact emphasis, TimelineBar chronology/event bounds/no year zero, BRollClip trim budget.",
    "Polygon ring closure; RiverLine and RouteLine coordinate/cumfrac lengths, endpoints and monotonicity.",
    "Text is trimmed by Zod before checking length; JSON Schema validates the raw input string.",
  ],
});
