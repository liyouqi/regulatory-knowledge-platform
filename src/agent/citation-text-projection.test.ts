import { describe, expect, it } from "vitest";
import type { BodyBlock } from "../shared/legal";
import { projectCitationText } from "./citation-text-projection";

// Synthetic fixtures, not purported legal wording.
function block(id: string, text = "", children: BodyBlock[] = []): BodyBlock {
  return {
    id,
    kind: "paragraph",
    marker: "1.",
    text,
    anchor: id,
    sourceLocator: { kind: "xpath", value: `/fixture/${id}` },
    orderedContent: text ? [{ type: "text", text }] : [],
    children,
  };
}

describe("citation text projection", () => {
  it("interleaves exact text runs and nested children without inventing entity IDs or repeating text", () => {
    const child = block("child", "Child before. Child after.", [
      block("nested", "Nested."),
    ]);
    child.orderedContent = [
      { type: "text", text: "Child before." },
      { type: "child", childId: "nested" },
      { type: "text", text: "Child after." },
    ];
    const parent = block("parent", "Before. Between. After.", [
      child,
      block("second", "Second."),
    ]);
    parent.orderedContent = [
      { type: "text", text: "Before." },
      { type: "child", childId: "child" },
      { type: "text", text: "Between." },
      { type: "child", childId: "second" },
      { type: "text", text: "After." },
    ];
    const input = structuredClone(parent);
    const result = projectCitationText([parent]);
    expect(
      result.textSegments.map((s) => [s.entityId, s.contentIndex, s.text]),
    ).toEqual([
      ["parent", 0, "Before."],
      ["child", 0, "Child before."],
      ["nested", 0, "Nested."],
      ["child", 2, "Child after."],
      ["parent", 2, "Between."],
      ["second", 0, "Second."],
      ["parent", 4, "After."],
    ]);
    for (const segment of result.textSegments.filter(
      (s) => s.entityId === "parent",
    )) {
      expect(segment).toMatchObject({
        marker: parent.marker,
        anchor: parent.anchor,
        sourceLocator: parent.sourceLocator,
      });
    }
    expect(parent).toEqual(input);
  });

  it("preserves byte-exact text, top-level order and adjacent text runs", () => {
    const first = block("first", "not used as a fallback");
    first.orderedContent = [
      { type: "text", text: " A\u00a0" },
      { type: "text", text: "B\nC " },
    ];
    expect(
      projectCitationText([first, block("second", "Next.")]).textSegments.map(
        (s) => s.text,
      ),
    ).toEqual([" A\u00a0", "B\nC ", "Next."]);
  });

  it("does not add empty container text or lose children when there is no parent text", () => {
    const parent = block("parent", "", [block("child", "Child.")]);
    parent.orderedContent = [{ type: "child", childId: "child" }];
    expect(
      projectCitationText([parent]).textSegments.map((s) => s.entityId),
    ).toEqual(["child"]);
    expect(projectCitationText([block("empty")]).textSegments).toEqual([]);
  });

  it("counts omitted formula resources and leaves separate source positions without OCR or placeholders", () => {
    const parent = block("formula");
    const resource: BodyBlock["orderedContent"][number] = {
      type: "resource",
      resource: {
        id: "fixture:formula",
        kind: "formula",
        mediaType: "image/png",
        dataUrl: "data:image/png;base64,AQ==",
        sourceFileName: "formula.tif",
        sourceSha256: `sha256:${"a".repeat(64)}`,
        renditionSha256: `sha256:${"b".repeat(64)}`,
      },
    };
    parent.orderedContent = [
      { type: "text", text: "Before." },
      resource,
      { type: "text", text: "After." },
    ];
    const result = projectCitationText([parent]);
    expect(result.textSegments.map((s) => [s.contentIndex, s.text])).toEqual([
      [0, "Before."],
      [2, "After."],
    ]);
    expect(result.textProjection).toEqual({
      scope: "text-only",
      order: "reader-ordered-content",
      markerInsertion: "none",
      omittedResourceCount: 1,
    });
    parent.orderedContent = [resource];
    expect(projectCitationText([parent])).toEqual({
      textSegments: [],
      textProjection: result.textProjection,
    });
  });

  it("fails closed for missing, duplicate and unconsumed child references", () => {
    const parent = block("parent", "", [block("child", "Child.")]);
    for (const content of [
      [],
      [{ type: "child" as const, childId: "missing" }],
      [
        { type: "child" as const, childId: "child" },
        { type: "child" as const, childId: "child" },
      ],
    ]) {
      parent.orderedContent = content;
      expect(() => projectCitationText([parent])).toThrow(/child/iu);
    }
    parent.children.push(block("child", "Duplicate."));
    expect(() => projectCitationText([parent])).toThrow(/duplicate/iu);
  });

  it("rejects duplicate root IDs and cycles without falling back to tree order", () => {
    expect(() =>
      projectCitationText([block("same", "One."), block("same", "Two.")]),
    ).toThrow(/duplicate/iu);
    const parent = block("parent");
    parent.children = [parent];
    parent.orderedContent = [{ type: "child", childId: "parent" }];
    expect(() => projectCitationText([parent])).toThrow(/duplicate|cycle/iu);
  });

  it("rejects complete but reordered child references", () => {
    const parent = block("parent", "", [
      block("first", "One."),
      block("second", "Two."),
    ]);
    parent.orderedContent = [
      { type: "child", childId: "second" },
      { type: "child", childId: "first" },
    ];
    expect(() => projectCitationText([parent])).toThrow(/child.*order/iu);
  });
});
