import { describe, expect, it } from "vitest";
import type { DefinitionSearchResult } from "../shared/legal";
import { definedTermRanges } from "./defined-terms";

function definition(
  term: string,
  id = `definition:${term}`,
): DefinitionSearchResult {
  return {
    id,
    documentId: "eu:test",
    jurisdiction: "EU",
    slug: "test-law",
    shortName: "Test law",
    celex: "32000R0001",
    term,
    normalizedTerm: term.toLowerCase(),
    definitionText: `${term} means exact official text`,
    definitionType: "direct",
    sourceUrl: "https://example.com/official",
    provisionId: "eu:test:article:1",
    label: "Article 1",
    path: "/read/test-law/articles/1",
  };
}

describe("defined term ranges", () => {
  it("matches exact terms case-insensitively at complete word boundaries", () => {
    const text = "ICT risk applies, but ICT risks and brisk do not match.";

    expect(definedTermRanges(text, [definition("ICT risk")])).toMatchObject([
      { start: 0, end: 8, definition: { term: "ICT risk" } },
    ]);
  });

  it("prefers the longest unique term and excludes legal-reference spans", () => {
    const text = "critical ICT third-party service provider under Article 1";
    const ranges = definedTermRanges(
      text,
      [
        definition("ICT third-party service provider"),
        definition("third-party service provider"),
        definition("Article 1"),
      ],
      [{ start: 48, end: 57 }],
    );

    expect(ranges).toEqual([
      expect.objectContaining({
        start: 9,
        end: 41,
        definition: expect.objectContaining({
          term: "ICT third-party service provider",
        }),
      }),
    ]);
  });

  it("does not annotate a term with multiple definitions in one document", () => {
    expect(
      definedTermRanges("risk applies", [
        definition("risk", "definition:risk:1"),
        definition("risk", "definition:risk:2"),
      ]),
    ).toEqual([]);
  });
});
