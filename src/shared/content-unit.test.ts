import { describe, expect, it } from "vitest";
import {
  type ContentUnit,
  contentUnitSchema,
  contentUnitsText,
  legacyContentUnitSchema,
  projectContentUnits,
  validateContentLayout,
} from "./content-unit";

const locator = { kind: "fixture" as const, value: "/root/p[1]" };
const text = (
  value: string,
  contentRole: ContentUnit["contentRole"] = "operative-text",
): ContentUnit => ({
  type: "text",
  text: value,
  contentRole,
  sourceLocator: locator,
});
const element = (
  name: "emphasis" | "line-break",
  children: ContentUnit[],
): ContentUnit => ({
  type: "element",
  name,
  sourceAttributes: {},
  children,
  contentRole: "operative-text",
  sourceLocator: locator,
});

describe("structured content units", () => {
  it("concatenates inline text and emphasis without inventing spaces", () => {
    const units = [
      text("Geld"),
      element("emphasis", [text("wäsche")]),
      text("gesetz"),
    ];

    expect(contentUnitsText(units, "operative-text")).toBe("Geldwäschegesetz");
  });

  it("preserves an explicit line break", () => {
    const units = [
      text("First line"),
      element("line-break", []),
      text("Second line"),
    ];

    expect(contentUnitsText(units, "operative-text")).toBe(
      "First line\nSecond line",
    );
  });

  it("isolates source notes from operative text", () => {
    const units = [text("Rule."), text("Editorial note.", "source-note")];

    expect(contentUnitsText(units, "operative-text")).toBe("Rule.");
    expect(contentUnitsText(units, "source-note")).toBe("Editorial note.");
  });

  it.each([
    { indexes: [0, 1], description: "valid" },
    { indexes: [0, 0], description: "duplicate" },
    { indexes: [0], description: "missing" },
    { indexes: [1, 0], description: "reordered" },
  ])("validates layout indexes ($description)", ({ indexes, description }) => {
    const runs = [text("A"), text("B")];
    const projected = projectContentUnits(runs);
    const layout = indexes.map((contentIndex) => ({
      name: "run" as const,
      contentRole: "operative-text" as const,
      sourceLocator: locator,
      contentIndex,
      children: [],
    }));

    if (description === "valid") {
      expect(() =>
        validateContentLayout(projected.orderedContent, layout),
      ).not.toThrow();
    } else {
      expect(() =>
        validateContentLayout(projected.orderedContent, layout),
      ).toThrow(
        "Structured content must reference every ordered run once in source order",
      );
    }
  });
});

describe("table layout metadata", () => {
  const cell = (columnStart: number, columnSpan: number) => ({
    name: "cell" as const,
    contentRole: "operative-text" as const,
    sourceLocator: locator,
    columnStart,
    columnSpan,
    children: [],
  });
  const table = (cells: ReturnType<typeof cell>[]) => ({
    name: "table" as const,
    contentRole: "operative-text" as const,
    sourceLocator: locator,
    columnCount: 3,
    children: [
      {
        name: "row" as const,
        contentRole: "operative-text" as const,
        sourceLocator: locator,
        children: cells,
      },
    ],
  });
  it("accepts explicit empty cells with continuous coverage", () => {
    expect(() =>
      validateContentLayout([], [table([cell(1, 2), cell(3, 1)])]),
    ).not.toThrow();
  });
  it.each([
    [cell(2, 2)],
    [cell(1, 1)],
    [cell(1, 2), cell(2, 1)],
    [cell(1, 4)],
    [cell(3, 1), cell(1, 2)],
  ])("rejects gaps, overlaps, reversed and out of bounds cells", (...cells) => {
    expect(() => validateContentLayout([], [table(cells)])).toThrow();
  });
  it("rejects metadata outside its context", () => {
    expect(() => validateContentLayout([], [cell(1, 1)])).toThrow();
  });
});

it("freezes 1.3 content units against 1.4 table fields", () => {
  const table = {
    type: "element",
    name: "table",
    sourceAttributes: {},
    sourceLocator: locator,
    contentRole: "operative-text",
    columnCount: 2,
    children: [],
  };
  expect(legacyContentUnitSchema.safeParse(table).success).toBe(false);
  expect(contentUnitSchema.safeParse(table).success).toBe(true);
});
