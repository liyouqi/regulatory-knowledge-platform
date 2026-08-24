import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDoraDocumentView } from "../data/document-repository";
import {
  FullTextSearchService,
  parseDefinitionQuery,
  parseFullTextQuery,
} from "./full-text-search";
import { buildRuntimeDatabase } from "./sqlite-search-index";

const testDirectory = mkdtempSync(join(tmpdir(), "regulatory-search-"));
const firstPath = join(testDirectory, "search.sqlite");
const secondPath = join(testDirectory, "search-rebuilt.sqlite");
let service: FullTextSearchService | undefined;

beforeAll(() => {
  buildRuntimeDatabase([loadDoraDocumentView()], [], firstPath);
  service = new FullTextSearchService(firstPath);
});

afterAll(() => {
  service?.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("SQLite FTS5 search artifact", () => {
  it("rebuilds with a stable content-derived build ID", () => {
    const first = buildRuntimeDatabase(
      [loadDoraDocumentView()],
      [],
      secondPath,
    );
    const second = buildRuntimeDatabase(
      [loadDoraDocumentView()],
      [],
      secondPath,
    );
    expect(first.buildId).toBe(second.buildId);
    expect(first).toMatchObject({
      documentCount: 1,
      relatedRecitalCount: 0,
      tfidfBenchmark: null,
    });
    expect(first.recordCount).toBeGreaterThan(900);
    expect(first.definitionCount).toBe(65);
    expect(first.byteCount).toBeGreaterThan(0);
  });

  it("turns user input into constrained AND, phrase, and prefix syntax", () => {
    expect(parseFullTextQuery('risk "management body" polic')).toEqual({
      normalizedQuery: '"management body" risk polic',
      matchExpression: '"management body" AND "risk"* AND "polic"*',
    });
    expect(parseFullTextQuery("OR *** operational")).toEqual({
      normalizedQuery: "or operational",
      matchExpression: '"or"* AND "operational"*',
    });
  });

  it("returns phrase matches as safe highlighted segments", () => {
    const response = service?.search('"management body"');
    expect(response).toBeDefined();
    if (!response) return;
    expect(response.results.length).toBeGreaterThan(0);
    expect(
      response.results.some((result) =>
        result.snippet.some(
          (segment) =>
            segment.highlighted &&
            segment.text.toLowerCase().includes("management body"),
        ),
      ),
    ).toBe(true);
  });

  it("uses strict AND with prefix matching and stable paragraph targets", () => {
    const response = service?.search("operational resil");
    expect(response).toBeDefined();
    if (!response || !service) return;
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results.some((result) => result.path.includes("#"))).toBe(
      true,
    );
    expect(
      response.results.every((result) => result.documentId === "eu:32022R2554"),
    ).toBe(true);
    expect(service.search("operational nonexistentterm").results).toEqual([]);
  });

  it("supports exact document scope and bounded result counts", () => {
    expect(
      service?.search("operational", {
        documentId: "eu:32022R2554",
        limit: 3,
      }).results,
    ).toHaveLength(3);
    expect(
      service?.search("operational", { documentId: "eu:unknown" }).results,
    ).toEqual([]);
  });

  it("builds bounded definition term queries without raw FTS syntax", () => {
    expect(parseDefinitionQuery('"digital operational resilience"')).toEqual({
      normalizedQuery: "digital operational resilience",
      matchExpression: 'term : "digital operational resilience"',
    });
    expect(parseDefinitionQuery("risk OR *** management")).toEqual({
      normalizedQuery: "risk or management",
      matchExpression: 'term : ("risk"* AND "or"* AND "management"*)',
    });
    expect(parseDefinitionQuery("a")).toEqual({
      normalizedQuery: "a",
      matchExpression: 'term : ("a"*)',
    });
  });

  it("returns exact and prefix definition terms with traceable source text", () => {
    const exact = service?.searchDefinitions("digital operational resilience");
    expect(exact?.results[0]).toMatchObject({
      jurisdiction: "EU",
      shortName: "DORA",
      term: "digital operational resilience",
      label: "Article 3",
      marker: "(1)",
      definitionType: "direct",
      path: "/read/dora/articles/3#subparagraph-1-point-1",
    });
    expect(exact?.results[0]?.definitionText).toContain(
      "digital operational resilience means",
    );
    expect(service?.searchDefinitions("legacy ict").results[0]?.term).toBe(
      "legacy ICT system",
    );
    expect(
      service?.searchDefinitions("network and information system").results[0],
    ).toMatchObject({ definitionType: "incorporated" });
  });
});
