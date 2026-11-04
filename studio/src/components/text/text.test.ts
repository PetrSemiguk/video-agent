import { describe, expect, test } from "vitest";
import { bigDateSchema, countYearAt } from "./BigDate";
import { keyFactSchema } from "./KeyFact";
import { lowerThirdSchema } from "./LowerThird";
import { sectionTagSchema } from "./SectionTag";
import { textAnimationAt } from "./shared";
import { motion, textLayer } from "../../design/tokens";
import { maximumTextSamples } from "../../demo/TextLayers";

describe("text layer content contracts", () => {
  test.each([false, true])(
    "maximum-length samples are valid (stress=%s)",
    (stress) => {
      const sample = maximumTextSamples(stress);
      expect(lowerThirdSchema.safeParse(sample.lowerThird).success).toBe(true);
      expect(sectionTagSchema.safeParse(sample.sectionTag).success).toBe(true);
      expect(bigDateSchema.safeParse(sample.bigDate).success).toBe(true);
      expect(keyFactSchema.safeParse(sample.keyFact).success).toBe(true);
      expect(sample.lowerThird.title).toHaveLength(textLayer.limits.title);
      expect(sample.lowerThird.subtitle).toHaveLength(
        textLayer.limits.subtitle,
      );
      expect(sample.sectionTag.text).toHaveLength(textLayer.limits.tag);
      expect(sample.bigDate.caption).toHaveLength(textLayer.limits.caption);
      expect(sample.keyFact.statement).toHaveLength(textLayer.limits.statement);
      expect(sample.keyFact.emphasis).toHaveLength(textLayer.limits.emphasis);
    },
  );
  test("every bounded text field rejects one extra character with a field path", () => {
    const sample = maximumTextSamples(true);
    const cases = [
      [lowerThirdSchema, sample.lowerThird, "title"],
      [lowerThirdSchema, sample.lowerThird, "subtitle"],
      [sectionTagSchema, sample.sectionTag, "text"],
      [bigDateSchema, sample.bigDate, "caption"],
      [keyFactSchema, sample.keyFact, "statement"],
      [keyFactSchema, sample.keyFact, "emphasis"],
    ] as const;
    for (const [schema, props, field] of cases) {
      const result = schema.safeParse({
        ...props,
        [field]: "W".repeat(
          textLayer.limits[field === "text" ? "tag" : field] + 1,
        ),
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(
          result.error.issues.some((issue) => issue.path[0] === field),
        ).toBe(true);
    }
  });
  test("rejects empty, multiline, unknown and mistyped inputs", () => {
    for (const title of ["", "   ", "two\nlines", "two\tcolumns"])
      expect(lowerThirdSchema.safeParse({ title }).success).toBe(false);
    expect(
      sectionTagSchema.safeParse({ text: "PART 2", typo: true }).success,
    ).toBe(false);
    expect(lowerThirdSchema.safeParse({ title: 1644 }).success).toBe(false);
    expect(
      lowerThirdSchema.safeParse({
        title: "Title",
        durationInFrames: 2 * motion.frames.base,
      }).success,
    ).toBe(false);
    expect(
      sectionTagSchema.safeParse({ text: "PART 2", color: "pink" }).success,
    ).toBe(false);
  });
  test("key fact emphasis must occur exactly once", () => {
    expect(
      keyFactSchema.safeParse({ statement: "Two rivers", emphasis: "three" })
        .success,
    ).toBe(false);
    expect(
      keyFactSchema.safeParse({
        statement: "river and river",
        emphasis: "river",
      }).success,
    ).toBe(false);
    expect(
      keyFactSchema.safeParse({ statement: "Two rivers", emphasis: "Two" })
        .success,
    ).toBe(true);
  });
  test("date era is explicit, historical year zero and non-integers are rejected", () => {
    for (const year of [0, -1644, 10000, 1.5])
      expect(bigDateSchema.safeParse({ year }).success).toBe(false);
    expect(bigDateSchema.safeParse({ year: 221, era: "BCE" }).success).toBe(
      true,
    );
    expect(bigDateSchema.safeParse({ year: 1644 }).success).toBe(true);
    expect(bigDateSchema.safeParse({ year: 1644, era: "AD" }).success).toBe(
      false,
    );
  });
});

test("entrance, hold and exit use local frames and settle at sequence boundaries", () => {
  const duration = textLayer.demo.slot;
  expect(textAnimationAt(0, duration).opacity).toBe(0);
  expect(textAnimationAt(motion.frames.base, duration)).toEqual({
    opacity: 1,
    shift: 0,
  });
  expect(textAnimationAt(duration - motion.frames.base, duration).opacity).toBe(
    1,
  );
  expect(textAnimationAt(duration - 1, duration).opacity).toBe(0);
  expect(textAnimationAt(duration + 10, duration).opacity).toBe(0);
});

test("year count-up and reverse roll are deterministic under seeking", () => {
  expect(countYearAt(0, 0, 1644)).toBe(0);
  expect(countYearAt(motion.frames.slow, 0, 1644)).toBe(1644);
  expect(countYearAt(100, 0, 1644)).toBe(1644);
  expect(countYearAt(0, 2000, 1644)).toBe(2000);
  expect(countYearAt(motion.frames.slow, 2000, 1644)).toBe(1644);
  const frames = [0, 8, 16, 30];
  const years = frames.map((frame) => countYearAt(frame, 0, 1644));
  expect(years).toEqual([...years].sort((a, b) => a - b));
  expect(countYearAt(8, 0, 1644)).toBe(years[1]);
});
