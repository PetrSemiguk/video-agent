import { describe, expect, test } from "vitest";
import { infoLayer, motion } from "../../design/tokens";
import { maximumInfoSamples } from "../../demo/Info";
import {
  barAxisLabels,
  barCompareSchema,
  barDomain,
  barGeometry,
} from "./BarCompare";
import { timelineBarSchema } from "./TimelineBar";
import { numberedListSchema } from "./NumberedList";
import { recapCardsSchema } from "./RecapCards";
import { statCounterSchema } from "./StatCounter";
import {
  countValueAt,
  formatNumber,
  formatYear,
  growthAt,
  ordinalYear,
  revealAt,
  yearFraction,
  yearOrdinal,
} from "./shared";

test.each([false, true])(
  "maximum content and extremes validate (stress=%s)",
  (stress) => {
    const sample = maximumInfoSamples(stress),
      l = infoLayer.limits;
    expect(barCompareSchema.safeParse(sample.barCompare).success).toBe(true);
    expect(timelineBarSchema.safeParse(sample.timelineBar).success).toBe(true);
    expect(numberedListSchema.safeParse(sample.numberedList).success).toBe(
      true,
    );
    expect(recapCardsSchema.safeParse(sample.recapCards).success).toBe(true);
    expect(statCounterSchema.safeParse(sample.statCounter).success).toBe(true);
    expect(sample.barCompare.title).toHaveLength(l.title);
    expect(sample.barCompare.unit).toHaveLength(l.unit);
    sample.barCompare.bars.forEach((bar) =>
      expect(bar.label).toHaveLength(l.label),
    );
    sample.timelineBar.events.forEach((event) =>
      expect(event.label).toHaveLength(l.label),
    );
    sample.numberedList.items.forEach((item) =>
      expect(item).toHaveLength(l.item),
    );
    sample.recapCards.cards.forEach((card) => {
      expect(card.title).toHaveLength(l.cardTitle);
      expect(card.body).toHaveLength(l.cardBody);
    });
    expect(sample.statCounter.label).toHaveLength(l.statLabel);
  },
);

test("all bounded strings reject one extra character, including nested paths", () => {
  const sample = maximumInfoSamples(true),
    l = infoLayer.limits;
  const checks = [
    [
      barCompareSchema,
      { ...sample.barCompare, title: "W".repeat(l.title + 1) },
      ["title"],
    ],
    [
      barCompareSchema,
      { ...sample.barCompare, unit: "W".repeat(l.unit + 1) },
      ["unit"],
    ],
    [
      barCompareSchema,
      {
        ...sample.barCompare,
        bars: [
          { label: "W".repeat(l.label + 1), value: 0 },
          { label: "Second", value: 1 },
        ],
      },
      ["bars", 0, "label"],
    ],
    [
      timelineBarSchema,
      {
        ...sample.timelineBar,
        events: [{ year: 1, label: "W".repeat(l.label + 1) }],
      },
      ["events", 0, "label"],
    ],
    [
      numberedListSchema,
      { ...sample.numberedList, items: ["A", "B", "W".repeat(l.item + 1)] },
      ["items", 2],
    ],
    [
      recapCardsSchema,
      {
        ...sample.recapCards,
        cards: [
          { title: "W".repeat(l.cardTitle + 1), body: "Body" },
          { title: "B", body: "Body" },
        ],
      },
      ["cards", 0, "title"],
    ],
    [
      recapCardsSchema,
      {
        ...sample.recapCards,
        cards: [
          { title: "A", body: "W".repeat(l.cardBody + 1) },
          { title: "B", body: "Body" },
        ],
      },
      ["cards", 0, "body"],
    ],
    [
      statCounterSchema,
      { value: 0, label: "W".repeat(l.statLabel + 1) },
      ["label"],
    ],
  ] as const;
  for (const [schema, props, path] of checks) {
    const result = schema.safeParse(props);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some(
          (issue) => JSON.stringify(issue.path) === JSON.stringify(path),
        ),
      ).toBe(true);
  }
});

test("array cardinality, unknown fields and invalid types fail", () => {
  const s = maximumInfoSamples();
  for (const count of [0, 1, 6])
    expect(
      barCompareSchema.safeParse({
        ...s.barCompare,
        bars: Array.from({ length: count }, () => s.barCompare.bars[0]),
      }).success,
    ).toBe(false);
  for (const count of [0, 2, 6])
    expect(
      numberedListSchema.safeParse({
        ...s.numberedList,
        items: Array.from({ length: count }, () => "Item"),
      }).success,
    ).toBe(false);
  for (const count of [0, 1, 5])
    expect(
      recapCardsSchema.safeParse({
        ...s.recapCards,
        cards: Array.from({ length: count }, () => s.recapCards.cards[0]),
      }).success,
    ).toBe(false);
  expect(
    barCompareSchema.safeParse({ ...s.barCompare, typo: true }).success,
  ).toBe(false);
  expect(
    statCounterSchema.safeParse({ value: "1", label: "Label" }).success,
  ).toBe(false);
  expect(
    numberedListSchema.safeParse({ title: "Title", items: ["A", "B", " "] })
      .success,
  ).toBe(false);
});

test("numeric bounds reject nonfinite numbers and unsupported precision", () => {
  for (const value of [
    NaN,
    Infinity,
    -Infinity,
    infoLayer.valueLimit + 1,
    -infoLayer.valueLimit - 1,
  ])
    expect(statCounterSchema.safeParse({ value, label: "Label" }).success).toBe(
      false,
    );
  for (const value of [0, -infoLayer.valueLimit, infoLayer.valueLimit])
    expect(statCounterSchema.safeParse({ value, label: "Label" }).success).toBe(
      true,
    );
  for (const decimals of [-1, 3, 0.5])
    expect(
      statCounterSchema.safeParse({ value: 1, label: "Label", decimals })
        .success,
    ).toBe(false);
});

describe("bar scale", () => {
  test("all-zero values have a finite reference domain and no visible fill", () => {
    const d = barDomain([0, 0]);
    expect(d).toEqual({ min: 0, max: 1 });
    expect(barGeometry(0, d.min, d.max, 1)).toEqual({
      left: 0,
      width: 0,
      zero: 0,
    });
    expect(barAxisLabels(0, 1, 0)).toEqual(["0", "0.5", "1"]);
    expect(barAxisLabels(-1, 0, 0)).toEqual(["-1", "-0.5", "0"]);
    expect(barAxisLabels(0, 0.01, 2)).toEqual(["0.00", "0.005", "0.01"]);
  });
  test.each([
    [0, 10],
    [-10, 0],
    [-1e12, 1e12],
  ])("signed growth remains within the axis %s..%s", (min, max) => {
    for (const value of [min, 0, max])
      for (const progress of [0, 0.5, 1]) {
        const bar = barGeometry(value, min, max, progress);
        expect(bar.left).toBeGreaterThanOrEqual(0);
        expect(bar.width).toBeGreaterThanOrEqual(0);
        expect(bar.left + bar.width).toBeLessThanOrEqual(1);
        if (progress === 0) expect(bar.width).toBe(0);
      }
  });
});

describe("BCE timeline", () => {
  test("the BCE/CE join has no historical year zero or doubled gap", () => {
    expect(formatYear(-1)).toBe("1 BCE");
    expect(formatYear(1)).toBe("1 CE");
    expect(yearOrdinal(1) - yearOrdinal(-1)).toBe(1);
    expect(ordinalYear(0)).toBe(-1);
    expect(yearFraction(-1, -2, 2)).toBeCloseTo(1 / 3);
    expect(yearFraction(1, -2, 2)).toBeCloseTo(2 / 3);
    expect(yearFraction(2, -2, 2)).toBe(1);
  });
  test("rejects zero, reversed spans and out-of-span markers with paths", () => {
    const s = maximumInfoSamples().timelineBar;
    expect(timelineBarSchema.safeParse({ ...s, startYear: 0 }).success).toBe(
      false,
    );
    expect(
      timelineBarSchema.safeParse({ ...s, startYear: 5, endYear: 1 }).success,
    ).toBe(false);
    const result = timelineBarSchema.safeParse({
      ...s,
      events: [{ year: 10000, label: "Outside" }],
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "events.0.year",
        ),
      ).toBe(true);
    expect(timelineBarSchema.safeParse({ ...s, events: [] }).success).toBe(
      false,
    );
  });
});

test("formatting is fixed en-US, including large, fractional and near-zero values", () => {
  expect(formatNumber(1e12, 2)).toBe("1,000,000,000,000.00");
  expect(formatNumber(-1234567.5, 2)).toBe("-1,234,567.50");
  expect(formatNumber(0, 0)).toBe("0");
  expect(formatNumber(-0.001, 2)).toBe("0.00");
  expect(formatNumber(-0, 0)).toBe("0");
});

test("counters and staggered reveals are seekable and reach their targets", () => {
  expect(countValueAt(0, -1e12, 1e12)).toBe(-1e12);
  expect(countValueAt(motion.frames.slow, -1e12, 1e12)).toBe(1e12);
  expect(countValueAt(500, 1e12, -1e12)).toBe(-1e12);
  expect(countValueAt(10, 0, 0)).toBe(0);
  expect(growthAt(-1)).toBe(0);
  expect(revealAt(0, 1)).toBe(0);
  expect(revealAt(motion.stagger + motion.frames.base, 1)).toBe(1);
  const sampled = countValueAt(12, 100, -100);
  countValueAt(30, 100, -100);
  expect(countValueAt(12, 100, -100)).toBe(sampled);
});
