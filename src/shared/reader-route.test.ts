import { describe, expect, it } from "vitest";
import {
  explorerPath,
  level2LibraryPath,
  parseExplorerPath,
  parseLevel2LibraryPath,
  parseQuickGo,
  parseReaderPath,
  provisionPath,
} from "./reader-route";

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

  it("supports generic provision routes without treating them as Articles", () => {
    const path = provisionPath("cssf-test", "provisions", "section-1");

    expect(parseReaderPath(path)).toEqual({
      slug: "cssf-test",
      collectionId: "provisions",
      number: "section-1",
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

  it("builds and parses a stable Explorer route", () => {
    expect(explorerPath("ai-act")).toBe("/explore/ai-act");
    expect(parseExplorerPath("/explore/ai-act")).toEqual({ slug: "ai-act" });
    expect(parseExplorerPath("/read/ai-act/articles/1")).toBeNull();
  });

  it("builds and parses family Level 2 library routes", () => {
    expect(level2LibraryPath("dora", "rts")).toBe("/library/dora/rts");
    expect(parseLevel2LibraryPath("/library/dora/rts")).toEqual({
      familySlug: "dora",
      measureType: "rts",
    });
    expect(parseLevel2LibraryPath("/library/mica")).toEqual({
      familySlug: "mica",
    });
    expect(parseLevel2LibraryPath("/library/dora/guideline")).toBeNull();
  });
});
