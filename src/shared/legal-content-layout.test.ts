import { describe, expect, it } from "vitest";
import { type ContentUnit, projectContentUnits } from "./content-unit";
import { bodyBlockSchema } from "./legal";

const sourceLocator = { kind: "fixture" as const, value: "/table" };
const common = { contentRole: "operative-text" as const, sourceLocator };
const units: ContentUnit[] = [
  {
    type: "element",
    name: "table",
    columnCount: 2,
    sourceAttributes: {},
    ...common,
    children: [
      {
        type: "element",
        name: "row",
        sourceAttributes: {},
        ...common,
        children: [
          {
            type: "element",
            name: "cell",
            columnStart: 1,
            columnSpan: 1,
            sourceAttributes: {},
            ...common,
            children: [{ type: "text", text: "Rule", ...common }],
          },
          {
            type: "element",
            name: "cell",
            columnStart: 2,
            columnSpan: 1,
            sourceAttributes: {},
            ...common,
            children: [],
          },
        ],
      },
    ],
  },
];
const block = () => ({
  id: "fixture:norm",
  kind: "other",
  text: "Rule",
  anchor: "norm",
  children: [],
  ...common,
  ...projectContentUnits(units),
});

describe("Runtime Reader structured layout validation", () => {
  it("accepts exact layout with an explicit empty source cell", () => {
    const result = bodyBlockSchema.parse(block());
    expect(result.contentLayout?.[0].children[0].children).toHaveLength(2);
  });
  it.each(["gap", "overlap", "outside", "missing-index"])(
    "rejects tampered %s in Runtime DTO",
    (mutation) => {
      const input = block();
      const cells = input.contentLayout[0].children[0].children;
      if (mutation === "gap") cells[0].columnStart = 2;
      if (mutation === "overlap") cells[1].columnStart = 1;
      if (mutation === "outside") cells[1].columnSpan = 2;
      if (mutation === "missing-index") cells[0].children = [];
      expect(bodyBlockSchema.safeParse(input).success).toBe(false);
    },
  );
});
