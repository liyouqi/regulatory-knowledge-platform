import { describe, expect, it } from "vitest";
import { loadDoraDocumentView } from "../data/document-repository";
import {
  buildCurrentDocumentSearchIndex,
  parseCurrentDocumentQuery,
  searchCurrentDocument,
} from "./current-document-search";

const document = loadDoraDocumentView();
const index = buildCurrentDocumentSearchIndex(document);

describe("current-document search", () => {
  it("builds a deterministic index tied to the canonical build", () => {
    const rebuilt = buildCurrentDocumentSearchIndex(document);
    expect(index).toEqual(rebuilt);
    expect(index).toMatchObject({
      schemaVersion: "1.0.0",
      documentId: "eu:32022R2554",
      buildId: document.buildId,
    });
    expect(index.records.length).toBeGreaterThan(document.provisions.length);
    expect(index.postings.management.length).toBeGreaterThan(0);
  });

  it("parses quoted phrases separately from strict AND terms", () => {
    expect(parseCurrentDocumentQuery('risk "management body" polic')).toEqual({
      phrases: ["management body"],
      terms: ["risk", "polic"],
    });
  });

  it("finds all unquoted terms with prefix matching", () => {
    const results = searchCurrentDocument(index, "ICT risk manag");
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((result) => result.path.startsWith("/read/dora/")),
    ).toBe(true);
    expect(results.some((result) => result.path.includes("#"))).toBe(true);
    expect(results[0].highlights).toEqual(["manag", "risk", "ict"]);
  });

  it("supports exact phrase search and paragraph-level targets", () => {
    const results = searchCurrentDocument(index, '"management body"');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result) => result.path.includes("#paragraph-"))).toBe(
      true,
    );
  });

  it("returns no result when strict AND terms do not coexist", () => {
    expect(searchCurrentDocument(index, "operational nonexistentterm")).toEqual(
      [],
    );
  });

  it("limits query complexity and result count", () => {
    expect(
      parseCurrentDocumentQuery("one two three four five six seven eight nine")
        .terms,
    ).toHaveLength(8);
    expect(searchCurrentDocument(index, "the", 3)).toHaveLength(3);
  });
});
