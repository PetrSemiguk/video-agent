// Loads Inter from studio/public/fonts/inter/ (committed; never fetched from Google).
// Module-level delayRender: any composition importing this waits for the fonts.
import {
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
} from "remotion";
import { type } from "./tokens";

const FACES: { file: string; style: "normal" | "italic" }[] = [
  { file: "fonts/inter/InterVariable.woff2", style: "normal" },
  { file: "fonts/inter/InterVariable-Italic.woff2", style: "italic" },
];

let loaded = false;

export const ensureFonts = () => {
  if (loaded || typeof document === "undefined") {
    return;
  }
  loaded = true;
  const handle = delayRender("Loading Inter");
  Promise.all(
    FACES.map((f) =>
      new FontFace(
        type.fontFamily,
        `url(${staticFile(f.file)}) format("woff2")`,
        {
          style: f.style,
          weight: "100 900",
        },
      ).load(),
    ),
  )
    .then((faces) => {
      faces.forEach((face) => document.fonts.add(face));
      continueRender(handle);
    })
    .catch((err) => cancelRender(err));
};

ensureFonts();
