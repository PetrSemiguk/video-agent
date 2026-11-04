// Loads Inter from studio/public/fonts/inter/ (committed; never fetched from Google).
// Module-level delayRender: any composition importing this waits for the fonts.
import {
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
} from "remotion";
import { type } from "./tokens";

const FACES: {
  file: string;
  style: "normal" | "italic";
  family: string;
  weight: string;
}[] = [
  {
    file: "fonts/inter/InterVariable.woff2",
    style: "normal",
    family: type.fontFamily,
    weight: "100 900",
  },
  {
    file: "fonts/inter/InterVariable-Italic.woff2",
    style: "italic",
    family: type.fontFamily,
    weight: "100 900",
  },
  {
    file: type.headlineFile,
    style: "normal",
    family: type.headlineFamily,
    weight: "700",
  },
];

let loaded = false;
/** Consumers that measure text must wait for the registered local faces. */
export let fontsReady: Promise<void> = Promise.resolve();

export const ensureFonts = () => {
  if (loaded || typeof document === "undefined") {
    return;
  }
  loaded = true;
  const handle = delayRender("Loading local channel fonts");
  fontsReady = Promise.all(
    FACES.map((f) =>
      new FontFace(f.family, `url(${staticFile(f.file)})`, {
        style: f.style,
        weight: f.weight,
      }).load(),
    ),
  )
    .then((faces) => {
      faces.forEach((face) => document.fonts.add(face));
      continueRender(handle);
    })
    .catch((err) => cancelRender(err));
};

ensureFonts();
