import { describe, expect, it } from "vitest";
import {
  applicabilityPath,
  documentRelationshipGraphPath,
  explorerPath,
  globalRelationshipGraphPath,
  implementationTimelinePath,
  isLevel2MandateQueryPath,
  level2LibraryPath,
  level2MandateQueryPath,
  parseApplicabilityPath,
  parseExplorerPath,
  parseImplementationTimelinePath,
  parseLevel2LibraryPath,
  parseQuickGo,
  parseReaderPath,
  parseRegulatoryDomainPath,
  parseRelationshipGraphPath,
  parseSupervisoryDecisionsPath,
  provisionPath,
  regulatoryDomainPath,
  relationshipGraphPath,
  supervisoryDecisionsPath,
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

  it("builds and parses a focused relationship graph route", () => {
    const path = relationshipGraphPath("dora", "articles", "20");

    expect(path).toBe("/relationships/dora/articles/20");
    expect(parseRelationshipGraphPath(path)).toEqual({
      scope: "provision",
      slug: "dora",
      collectionId: "articles",
      number: "20",
    });
    expect(
      parseRelationshipGraphPath("/relationships/dora/chapters/2"),
    ).toBeNull();
  });

  it("builds and parses a document relationship graph route", () => {
    const path = documentRelationshipGraphPath("dora");

    expect(path).toBe("/relationships/dora");
    expect(parseRelationshipGraphPath(path)).toEqual({
      scope: "document",
      slug: "dora",
    });
  });

  it("builds and parses the global relationship graph route", () => {
    expect(globalRelationshipGraphPath()).toBe("/relationships");
    expect(parseRelationshipGraphPath("/relationships")).toEqual({
      scope: "global",
    });
  });

  it("keeps the deterministic Level 2 mandate query outside graph routes", () => {
    expect(level2MandateQueryPath()).toBe(
      "/relationship-queries/level-2-mandates",
    );
    expect(isLevel2MandateQueryPath(level2MandateQueryPath())).toBe(true);
    expect(parseRelationshipGraphPath(level2MandateQueryPath())).toBeNull();
  });

  it("builds and parses generic implementation timeline routes", () => {
    expect(implementationTimelinePath("ai-act")).toBe("/timelines/ai-act");
    expect(parseImplementationTimelinePath("/timelines/ai-act")).toEqual({
      slug: "ai-act",
    });
    expect(
      parseImplementationTimelinePath("/read/ai-act/articles/113"),
    ).toBeNull();
  });

  it("builds and parses supervisory decision routes", () => {
    expect(supervisoryDecisionsPath("gdpr")).toBe("/decisions/gdpr");
    expect(parseSupervisoryDecisionsPath("/decisions/gdpr")).toEqual({
      slug: "gdpr",
    });
    expect(parseSupervisoryDecisionsPath("/decisions/gdpr/extra")).toBeNull();
  });

  it("builds and parses generic Regulatory Domain routes", () => {
    expect(regulatoryDomainPath("banking-governance-internal-control")).toBe(
      "/domains/banking-governance-internal-control",
    );
    expect(
      parseRegulatoryDomainPath("/domains/banking-governance-internal-control"),
    ).toEqual({ domainSlug: "banking-governance-internal-control" });
    expect(parseRegulatoryDomainPath("/domains/banking/extra")).toBeNull();
  });

  it("builds and parses generic applicability routes", () => {
    expect(applicabilityPath("dora")).toBe("/applicability/dora");
    expect(parseApplicabilityPath("/applicability/dora")).toEqual({
      slug: "dora",
    });
    expect(parseApplicabilityPath("/applicability/dora/extra")).toBeNull();
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
