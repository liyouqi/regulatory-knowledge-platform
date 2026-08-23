import { describe, expect, it } from "vitest";
import { parseQuickGo, parseReaderPath, provisionPath } from "./reader-route";

describe("Reader routes", () => {
  it("builds and parses a stable readable provision route", () => {
    const path = provisionPath("dora", "articles", "6a");

    expect(path).toBe("/read/dora/articles/6a");
    expect(parseReaderPath(path)).toEqual({
      slug: "dora",
      collectionId: "articles",
      number: "6a",
    });
  });

  it.each([
    ["23", { collectionId: "articles", number: "23" }],
    ["art 23", { collectionId: "articles", number: "23" }],
    ["article 6a", { collectionId: "articles", number: "6a" }],
    ["rec 40", { collectionId: "recitals", number: "40" }],
    ["annex IV", { collectionId: "annexes", number: "iv" }],
  ])("resolves Quick Go input %s", (input, expected) => {
    expect(parseQuickGo(input)).toEqual(expected);
  });

  it("rejects ambiguous free text", () => {
    expect(parseQuickGo("security controls")).toBeNull();
  });
});
