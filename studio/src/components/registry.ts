import {
  LowerThird,
  lowerThirdSchema,
  SectionTag,
  sectionTagSchema,
  BigDate,
  bigDateSchema,
  KeyFact,
  keyFactSchema,
} from "./text";
import {
  BarCompare,
  barCompareSchema,
  TimelineBar,
  timelineBarSchema,
  NumberedList,
  numberedListSchema,
  RecapCards,
  recapCardsSchema,
  StatCounter,
  statCounterSchema,
} from "./info";
import { TitleCard, titleCardSchema } from "./cards/TitleCard";
import { EndCard, endCardSchema } from "./cards/EndCard";
import { BRollClip, bRollClipSchema } from "./media/BRollClip";
import { RegionHighlight, regionHighlightSchema } from "./map/RegionHighlight";
import { RiverLine, riverLineSchema } from "./map/RiverLine";
import { HistoricalLayer, historicalLayerSchema } from "./map/HistoricalLayer";
import { PlaceLabel, placeLabelSchema } from "./map/PlaceLabel";
import { MapAttribution, mapAttributionSchema } from "./MapAttribution";

/** Production layers; infrastructure and diagnostics are documented separately. */
export const componentRegistry = {
  TitleCard: {
    component: TitleCard,
    schema: titleCardSchema,
    purpose: "Episode title over an attributed PlateStage map.",
    when: "Opening or major chapter; place in the map screen layer.",
    notes:
      "Optional kicker/subtitle. Semantic color styles kicker/rule. Fixed 1080p typography; title wraps. Match Sequence duration to durationInFrames.",
  },
  EndCard: {
    component: EndCard,
    schema: endCardSchema,
    purpose: "Final 20-second hold with room for YouTube elements.",
    when: "Exactly the final 600 frames at 30 fps, over an attributed map.",
    notes:
      "No exit fade. Right-side video and subscribe reservations are in cards.endZones; no fake YouTube elements are burned in. Configure real elements in YouTube Studio. See docs/end-screen.md.",
  },
  BRollClip: {
    component: BRollClip,
    schema: bRollClipSchema,
    purpose:
      "Muted approved local footage with plate-family grade, slow push and source credit.",
    when: "A short illustrative break between maps; never use it as evidence of a location without checking.",
    notes:
      "Only asset IDs in media/broll.ts; remote/file paths cannot be passed. trimBefore + durationInFrames must fit the 30 fps proxy. Current asset is Pexels 1851190, illustrative Earth animation. Grade shares saturation/exposure/gamma with dark plates; no terrain or ocean mask is inferred. Original audio is excluded.",
  },
  LowerThird: {
    component: LowerThird,
    schema: lowerThirdSchema,
    purpose: "Title and optional subtitle with a semantic left bar.",
    when: "Introduce a place, theme or section without covering the whole map.",
    notes:
      "Duration uses local frames. Placement defaults lower-left; flow is for parent-managed layouts. See docs/text-layers.md.",
  },
  SectionTag: {
    component: SectionTag,
    schema: sectionTagSchema,
    purpose: "Small caps chapter label.",
    when: "A short navigational cue, not a transcript.",
    notes:
      "Displayed uppercase; default upper-left. Match enclosing Sequence duration.",
  },
  BigDate: {
    component: BigDate,
    schema: bigDateSchema,
    purpose: "Large count-up/roll year with optional era and caption.",
    when: "A date is the focus of the narration.",
    notes:
      "Target year 1–9999; BCE/CE selected separately. fromYear=0 is an animation origin only. Supports reverse rolls; settles after motion.frames.slow.",
  },
  KeyFact: {
    component: KeyFact,
    schema: keyFactSchema,
    purpose: "One statement with a colored emphasized substring.",
    when: "One concise narrated idea needs reinforcement.",
    notes:
      "emphasis must occur exactly once in statement, case sensitive; this conditional rule supplements the generated JSON contract.",
  },
  BarCompare: {
    component: BarCompare,
    schema: barCompareSchema,
    purpose: "Compare 2–5 signed quantities on a shared zero-based scale.",
    when: "Categories share a unit and a meaningful comparable quantity.",
    notes:
      "Explicit en-US numbers. All-zero fallback domain 0–1 has zero-width fills. Values at ±1 trillion; choose units/precision carefully. Midpoint labels may add one decimal. See docs/infographics.md.",
  },
  TimelineBar: {
    component: TimelineBar,
    schema: timelineBarSchema,
    purpose: "A year span, separate event lanes and animated playhead.",
    when: "Show chronology, including clustered or coincident dates.",
    notes:
      "No historical year zero. Negative years are BCE. endYear must follow startYear; every event must lie inside the span. Ordinal mapping skips year zero in elapsed distances. Events sort on a copy.",
  },
  NumberedList: {
    component: NumberedList,
    schema: numberedListSchema,
    purpose: "Sequential reveal of 3–5 short items.",
    when: "A narrated argument has explicit ordered parts.",
    notes:
      "Layout space is reserved during staggered reveals; local duration must include the full exit.",
  },
  RecapCards: {
    component: RecapCards,
    schema: recapCardsSchema,
    purpose: "Two-column summary of 2–4 points.",
    when: "End a section with a brief recap.",
    notes:
      "Titles and bodies wrap; 3–4 cards create a second row. Per-card semantic colors.",
  },
  StatCounter: {
    component: StatCounter,
    schema: statCounterSchema,
    purpose: "One large signed number counting from a specified origin.",
    when: "A single quantity deserves emphasis.",
    notes:
      "Explicit en-US grouping, fixed decimal precision, normalized rounded negative zero. Value and from are bounded at ±1 trillion. Unit is on a separate line.",
  },
  RegionHighlight: {
    component: RegionHighlight,
    schema: regionHighlightSchema,
    purpose:
      "Terrain-readable polygon fill, drawn outline and optional outside dimming.",
    when: "In PlateStage geo; use supported custom/admin/country polygons.",
    notes:
      "geojson is nonempty Feature or FeatureCollection of Polygon/MultiPolygon; closed rings, finite Web Mercator lon/lat. Never render schematic Natural Earth geography_regions polygons as shapes. GeoJSON custom validation is stronger than its unrepresentable JSON-schema field. exitAt is relative to the local Sequence.",
  },
  HistoricalLayer: {
    component: HistoricalLayer,
    schema: historicalLayerSchema,
    purpose: "Fills all polities of a historical layer on the shot's plate.",
    when: "In PlateStage geo, to show who held what on a date; name polities with PlaceLabel.",
    notes:
      "slug is data/processed/<plate>/historical/<slug>.geojson. credit must equal the layer's `attribution`; validation checks it. A layer whose <slug>.errata.json has a blocker fails validation and the episode build unless errataOverride gives a reason. See docs/maps.md for choosing a layer.",
  },
  RiverLine: {
    component: RiverLine,
    schema: riverLineSchema,
    purpose: "Source-to-mouth tapered river draw with optional glow.",
    when: "In PlateStage geo, with vap.geo.river output.",
    notes:
      "Exactly one LineString feature. properties.cumfrac length equals coordinates, starts 0, ends 1, is finite/nondecreasing within 0–1. This runtime GeoJSON rule supplements the generated contract.",
  },
  PlaceLabel: {
    component: PlaceLabel,
    schema: placeLabelSchema,
    purpose: "Projected city, region or river label with constant screen size.",
    when: "In PlateStage screen; lonLat is geographic, never plate pixels.",
    notes:
      "City labels include dots. Anchors can be overridden; label boxes clamp into the safe area above the bottom reserve. Region labels display uppercase. Supply concise place names even though the validation budget is 40 characters.",
  },
  MapAttribution: {
    component: MapAttribution,
    schema: mapAttributionSchema,
    purpose: "Visible source credit overlay.",
    when: "Automatic for PlateStage/PlateSequence and BRollClip; add directly only for another licensed media layer.",
    notes:
      "Text comes from docs/licenses.md and source metadata. It is secondary information at the bottom edge; never omit it from a map shot.",
  },
} as const;
