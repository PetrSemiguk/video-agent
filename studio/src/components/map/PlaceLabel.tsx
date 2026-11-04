import { z } from "zod";
import { placeLabelSchema } from "./schemas";
export { placeLabelSchema } from "./schemas";
// Map label in the PlateStage screen layer: follows its [lon, lat] through camera moves but
// keeps a constant on-screen size. City labels get a dot. Entrance: fade + small slide.
// The label box is pushed back inside the 5 % safe area if it would leave the frame
// (the dot stays on its point). Timing: frames from the enclosing <Sequence>.
import { useMemo } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import {
  colors,
  fontStack,
  headlineStack,
  motion,
  space,
  stroke,
  type,
} from "../../design/tokens";
import { LonLatTuple, useMapProjection } from "../../map/PlateStage";

export type LabelKind = "city" | "region" | "river";
export type LabelAnchor = "right" | "left" | "top" | "bottom" | "center";

const STYLE: Record<
  LabelKind,
  {
    size: number;
    weight: number;
    italic: boolean;
    upper: boolean;
    tracking: number;
    color: string;
  }
> = {
  city: {
    size: type.size.labelCity,
    weight: type.weight.medium,
    italic: false,
    upper: false,
    tracking: 0,
    color: colors.labelText,
  },
  region: {
    size: type.size.labelRegion,
    weight: type.weight.bold,
    italic: false,
    upper: true,
    tracking: type.tracking.region,
    color: colors.labelText,
  },
  river: {
    size: type.size.labelRiver,
    weight: type.weight.medium,
    italic: true,
    upper: false,
    tracking: 0,
    color: colors.river,
  },
};

let canvas: HTMLCanvasElement | null = null;
const measure = (text: string, font: string, trackingPx: number) => {
  canvas ??= document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  return (
    ctx.measureText(text).width + trackingPx * Math.max(0, text.length - 1)
  );
};

const PlaceLabelView: React.FC<{
  lonLat: LonLatTuple;
  text: string;
  kind: LabelKind;
  anchor?: LabelAnchor;
  enterFrame?: number;
}> = ({ lonLat, text, kind, anchor, enterFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { toScreen, width: W, height: H } = useMapProjection();
  const st = STYLE[kind];
  const shown = st.upper ? text.toUpperCase() : text;
  // Defaults: cities to the right of their dot, rivers above the line, regions centred.
  const resolvedAnchor: LabelAnchor =
    anchor ?? (kind === "city" ? "right" : kind === "river" ? "top" : "center");

  const family = kind === "region" ? type.headlineFamily : type.fontFamily;
  const font = `${st.italic ? "italic " : ""}${st.weight} ${st.size}px ${family}`;
  const trackingPx = st.tracking * st.size;
  const textW = useMemo(
    () => measure(shown, font, trackingPx),
    [shown, font, trackingPx],
  );
  const textH = st.size * type.lineHeight;

  const t = frame - enterFrame;
  const appear = interpolate(t, [0, motion.frames.base], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: motion.easing.out,
  });
  if (appear <= 0) {
    return null;
  }

  const pt = toScreen(lonLat);
  const gap =
    kind === "city" ? space.labelGap + space.cityDot / 2 : space.labelGap;
  let x = pt.x - textW / 2;
  let y = pt.y - textH / 2;
  if (resolvedAnchor === "right") x = pt.x + gap;
  if (resolvedAnchor === "left") x = pt.x - gap - textW;
  if (resolvedAnchor === "top") y = pt.y - gap - textH;
  if (resolvedAnchor === "bottom") y = pt.y + gap;

  // Keep the label box inside the safe area.
  const sx = W * space.safeArea;
  const sy = H * space.safeArea;
  x = Math.min(Math.max(x, sx), W - sx - textW);
  y = Math.min(
    Math.max(y, sy),
    H * (1 - space.bottomReserve) - textH - space.enterShift,
  );
  const shift = space.enterShift * (1 - appear);

  return (
    <>
      {kind === "city" ? (
        <div
          style={{
            position: "absolute",
            left: pt.x - space.cityDot / 2,
            top: pt.y - space.cityDot / 2,
            width: space.cityDot,
            height: space.cityDot,
            borderRadius: space.cityDot / 2,
            backgroundColor: colors.labelText,
            boxShadow: `0 0 0 ${stroke.labelHalo / 2}px ${colors.labelHalo}`,
            opacity: appear,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y + shift,
          width: textW,
          height: textH,
          lineHeight: `${textH}px`,
          whiteSpace: "nowrap",
          fontFamily: kind === "region" ? headlineStack : fontStack,
          fontSize: st.size,
          fontWeight: st.weight,
          fontStyle: st.italic ? "italic" : "normal",
          letterSpacing: `${st.tracking}em`,
          color: st.color,
          WebkitTextStroke: `${stroke.labelHalo}px ${colors.labelHalo}`,
          paintOrder: "stroke fill",
          opacity: appear,
        }}
      >
        {shown}
      </div>
    </>
  );
};

export const PlaceLabel: React.FC<z.input<typeof placeLabelSchema>> = (
  props,
) => <PlaceLabelView {...placeLabelSchema.parse(props)} />;
