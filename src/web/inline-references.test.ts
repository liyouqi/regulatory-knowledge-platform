import { describe, expect, it } from "vitest";
import type { ProvisionRelationship } from "../shared/legal";
import { inlineReferenceRanges } from "./inline-references";

function relationship(text: string, locator: string): ProvisionRelationship {
  return {
    id: "relationship:test",
    relationType: "REFERENCES",
    provenance: "LEGAL_TEXT",
    source: {
      entityId: "eu:test:article:1:paragraph:1",
      documentId: "eu:test",
      documentShortName: "Test law",
      provisionId: "eu:test:article:1",
      kind: "article",
      label: "Article 1",
      title: null,
      path: "/read/test/articles/1#paragraph-1",
    },
    target: {
      entityId: "eu:test:article:2",
      documentId: "eu:test",
      documentShortName: "Test law",
      provisionId: "eu:test:article:2",
      kind: "article",
      label: "Article 2",
      title: null,
      path: "/read/test/articles/2",
    },
    evidence: {
      text,
      locator,
      sourceUrl: "https://example.com/source",
    },
    builder: { method: "explicit-reference", version: "1.0.0" },
    resolutionStatus: "resolved",
  };
}

describe("inline reference ranges", () => {
  it("uses the builder's exact source span rather than another matching phrase", () => {
    const text = "Article 2 applies before Article 2 is reviewed.";
    const item = relationship(
      "Article 2",
      "eu:test:article:1:paragraph:1:text:25-34",
    );

    expect(
      inlineReferenceRanges(text, item.source.entityId, [item]),
    ).toMatchObject([{ start: 25, end: 34, relationship: item }]);
  });

  it("rejects stale offsets, wrong source IDs, and overlapping spans", () => {
    const text = "Article 2 applies.";
    const valid = relationship(
      "Article 2",
      "eu:test:article:1:paragraph:1:text:0-9",
    );
    const stale = relationship(
      "Article 2",
      "eu:test:article:1:paragraph:1:text:1-10",
    );
    const overlap = relationship(
      "Article 2 applies",
      "eu:test:article:1:paragraph:1:text:0-17",
    );
    const otherSource = relationship(
      "Article 2",
      "eu:test:article:2:paragraph:1:text:0-9",
    );

    expect(
      inlineReferenceRanges(text, valid.source.entityId, [
        stale,
        overlap,
        valid,
        otherSource,
      ]),
    ).toEqual([{ start: 0, end: 9, relationship: valid }]);
  });
});
