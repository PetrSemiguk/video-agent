import { describe, expect, expectTypeOf, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import sample from "../../../episodes/_sandbox/tts-test/storyboard.json";
import { componentRegistry } from "../components/registry";
import { bigDateSchema } from "../components/text/BigDate";
import { exportStoryboardSchema } from "./jsonSchema";
import {
  anchorSchema,
  cameraSchema,
  layerSchema,
  storyboardSchema,
  type Storyboard,
} from "./schema";

const copy = () => structuredClone(sample);
const issuePath = (value: unknown, path: (string | number)[]) => {
  const parsed = storyboardSchema.safeParse(value);
  expect(parsed.success).toBe(false);
  if (!parsed.success)
    expect(
      parsed.error.issues.some(
        (i) => JSON.stringify(i.path) === JSON.stringify(path),
      ),
    ).toBe(true);
};
describe("storyboard authoring contract", () => {
  it("accepts the real sandbox with all three anchor forms and component defaults", () => {
    const parsed = storyboardSchema.parse(sample);
    expect(parsed.shots).toHaveLength(6);
    const title = parsed.shots[0].layers[0];
    expect(title.type).toBe("TitleCard");
    expect(title.props).toHaveProperty("durationInFrames");
  });
  it("covers exactly the production registry and retains each props schema", () => {
    expect(layerSchema.options.map((s) => s.shape.type.value).sort()).toEqual(
      Object.keys(componentRegistry).sort(),
    );
    for (const option of layerSchema.options)
      expect(option.shape.props).toBe(
        componentRegistry[option.shape.type.value].schema,
      );
    type DateProps = Extract<
      Storyboard["shots"][number]["layers"][number],
      { type: "BigDate" }
    >["props"];
    expectTypeOf<DateProps>().toEqualTypeOf<z.input<typeof bigDateSchema>>();
  });
  it("rejects an unknown layer type at its exact path", () => {
    const input = copy();
    input.shots[0].layers[0].type = "Typo";
    issuePath(input, ["shots", 0, "layers", 0, "type"]);
  });
  it("preserves component refinement paths for invalid props", () => {
    const input = copy();
    (input.shots[4].layers[0].props as Record<string, unknown>).emphasis =
      "missing";
    issuePath(input, ["shots", 4, "layers", 0, "props", "emphasis"]);
    const date = copy();
    (date.shots[5].layers[0].props as Record<string, unknown>).year = 0;
    issuePath(date, ["shots", 5, "layers", 0, "props", "year"]);
  });
  it("rejects malformed and ambiguous anchors", () => {
    for (const anchor of [
      { time: -1 },
      { word: 0.5 },
      { phrase: " " },
      { time: 1, word: 2 },
      {},
    ])
      expect(anchorSchema.safeParse(anchor).success).toBe(false);
  });
  it("checks plate references, uniqueness and outgoing transitions", () => {
    const p = copy();
    p.shots[0].plate = "absent";
    issuePath(p, ["shots", 0, "plate"]);
    const s = copy();
    s.shots[1].id = s.shots[0].id;
    issuePath(s, ["shots", 1, "id"]);
    const l = copy();
    (l.shots[0].layers as unknown[]).push(
      structuredClone(l.shots[0].layers[0]),
    );
    issuePath(l, ["shots", 0, "layers", 1, "id"]);
    const t = copy();
    t.shots[5].transition = { kind: "cut" };
    issuePath(t, ["shots", 5, "transition"]);
  });
  it("checks comparable ranges without resolving mixed anchors", () => {
    const input = copy();
    input.shots[0].start = { time: 3 };
    input.shots[0].end = { time: 2 };
    issuePath(input, ["shots", 0, "end"]);
    expect(storyboardSchema.safeParse(sample).success).toBe(true);
  });
  it("rejects unknown top-level fields and unsafe local paths", () => {
    expect(storyboardSchema.safeParse({ ...sample, typo: true }).success).toBe(
      false,
    );
    for (const src of [
      "../voice.wav",
      "https://example.com/voice.wav",
      "C:\\voice.wav",
      "/voice.wav",
      "x/../voice.wav",
    ]) {
      const input = copy();
      input.audio.src = src;
      issuePath(input, ["audio", "src"]);
    }
  });
  it("uses all six serializable camera presets and rejects function-like/unknown options", () => {
    expect(
      cameraSchema.options.map((s) => s.shape.preset.value).sort(),
    ).toEqual(
      ["establish", "drift", "hold", "focusOn", "flyTo", "followLine"].sort(),
    );
    expect(
      cameraSchema.safeParse({
        preset: "focusOn",
        params: { bounds: [10, 20, 5, 30] },
      }).success,
    ).toBe(false);
    expect(
      cameraSchema.safeParse({
        preset: "followLine",
        params: {
          line: {
            points: [
              [0, 0],
              [1, 1],
            ],
            cumfrac: [0, 0.5],
          },
          drawFrames: 60,
        },
      }).success,
    ).toBe(false);
    expect(
      cameraSchema.safeParse({ preset: "hold", params: { arbitrary: 1 } })
        .success,
    ).toBe(false);
  });
  it("keeps the committed Python JSON Schema in sync, with concrete map payloads", () => {
    const exported = exportStoryboardSchema();
    expect(
      JSON.parse(readFileSync("../docs/storyboard.schema.json", "utf8")),
    ).toEqual(exported);
    const json = JSON.stringify(exported);
    expect(json).toContain("cumfrac");
    expect(json).toContain("MultiPolygon");
    expect(json).toContain("x-runtime-validation");
    expect(exported.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
  });
  it("validates serialized structural contracts independently of source refinements", () => {
    const portable = z.fromJSONSchema(exportStoryboardSchema());
    expect(portable.safeParse(sample).success).toBe(true);
    const invalid = copy();
    (invalid.shots[5].layers[0].props as Record<string, unknown>).year = 0;
    expect(portable.safeParse(invalid).success).toBe(false);
    const typo = copy();
    typo.shots[0].layers[0].type = "Unknown";
    expect(portable.safeParse(typo).success).toBe(false);
  });
  describe("validation CLI", () => {
    const validate = (value: unknown) => {
      const folder = mkdtempSync(path.join(tmpdir(), "storyboard-"));
      const file = path.join(folder, "storyboard.json");
      writeFileSync(file, JSON.stringify(value), "utf8");
      try {
        const result = spawnSync(
          process.execPath,
          ["scripts/storyboard.cjs", "validate", file],
          { encoding: "utf8" },
        );
        return { status: result.status, report: JSON.parse(result.stdout) };
      } finally {
        rmSync(folder, { recursive: true });
      }
    };
    it("accepts the sandbox", () => {
      const { status, report } = validate(sample);
      expect(status).toBe(0);
      expect(report.valid).toBe(true);
    });
    it.each([
      [
        "an unknown layer type",
        (s: ReturnType<typeof copy>) => {
          s.shots[0].layers[0].type = "Typo";
        },
        "$.shots[0].layers[0].type",
      ],
      [
        "invalid KeyFact emphasis",
        (s: ReturnType<typeof copy>) => {
          (s.shots[4].layers[0].props as { emphasis: string }).emphasis =
            "not present";
        },
        "$.shots[4].layers[0].props.emphasis",
      ],
      [
        "an unknown plate",
        (s: ReturnType<typeof copy>) => {
          s.shots[0].plate = "absent";
        },
        "$.shots[0].plate",
      ],
    ])("exits 1 with the exact path for %s", (_name, mutate, expected) => {
      const value = copy();
      mutate(value);
      const { status, report } = validate(value);
      expect(status).toBe(1);
      expect(report.issues.map((i: { path: string }) => i.path)).toContain(
        expected,
      );
    });
  });
});
