import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";

// TODO(step 5): replace hardcoded colors and fonts with design tokens.
const BACKGROUND = "#0b0f14";
const TEXT = "#f2f5f8";
const MUTED = "#8a96a3";
const ERROR = "#ff5c5c";

type GlInfo =
  | { available: false }
  | { available: true; version: string; renderer: string; vendor: string };

const probeWebGl = (): GlInfo => {
  const canvas = document.createElement("canvas");
  const gl2 = canvas.getContext("webgl2");
  const gl: WebGLRenderingContext | WebGL2RenderingContext | null =
    gl2 ?? canvas.getContext("webgl");
  if (!gl) {
    return { available: false };
  }
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
    : `${String(gl.getParameter(gl.RENDERER))} (debug info unavailable)`;
  const vendor = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL))
    : `${String(gl.getParameter(gl.VENDOR))} (debug info unavailable)`;
  return {
    available: true,
    version: `${gl2 ? "WebGL 2" : "WebGL 1"} — ${String(gl.getParameter(gl.VERSION))}`,
    renderer,
    vendor,
  };
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ marginBottom: 32 }}>
    <div style={{ color: MUTED, fontSize: 22, letterSpacing: 4 }}>{label}</div>
    <div style={{ color: TEXT, fontSize: 34, fontWeight: 700 }}>{value}</div>
  </div>
);

export const GlCheck: React.FC = () => {
  const [handle] = useState(() => delayRender("Probing WebGL context"));
  const [info, setInfo] = useState<GlInfo | null>(null);

  useEffect(() => {
    setInfo(probeWebGl());
  }, []);

  useEffect(() => {
    if (info) {
      continueRender(handle);
    }
  }, [info, handle]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUND,
        justifyContent: "center",
        padding: 80,
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      {info === null ? null : info.available ? (
        <>
          <Row label="VERSION" value={info.version} />
          <Row label="UNMASKED_RENDERER_WEBGL" value={info.renderer} />
          <Row label="UNMASKED_VENDOR_WEBGL" value={info.vendor} />
        </>
      ) : (
        <div style={{ color: ERROR, fontSize: 80, fontWeight: 700 }}>
          WEBGL UNAVAILABLE
        </div>
      )}
    </AbsoluteFill>
  );
};
