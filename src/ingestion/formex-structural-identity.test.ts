import { describe, expect, it } from "vitest";
import { parseFormexAct } from "./formex-parser";
import { officialSourceSnapshotSchema } from "./snapshot";
import { sourceDefinitionSchema } from "./source-registry";

// Synthetic structure fixture, not purported legal text.
const source = sourceDefinitionSchema.parse({
  familyId: "family:test-act",
  shortName: "Test Act",
  aliases: ["Test Act"],
  celex: "32025R0001",
  language: "ENG",
  documentType: "regulation",
  regulatoryLevel: "level-1",
  measureType: "primary-act",
  publicationDate: "2025-01-01",
  eliUrl: "https://eur-lex.europa.eu/eli/reg/2025/1/oj/eng",
});
const snapshot = officialSourceSnapshotSchema.parse({
  schemaVersion: "1.0.0",
  snapshotId: `snapshot:cellar:32025R0001:${"a".repeat(64)}`,
  provenance: "official",
  sourceSystem: "cellar",
  celex: "32025R0001",
  language: "en",
  retrievedAt: "2026-10-16T00:00:00Z",
  canonicalUrl: source.eliUrl,
  workUri: "https://publications.europa.eu/resource/cellar/work",
  expressionUri: "https://publications.europa.eu/resource/cellar/expression",
  manifestationUri:
    "https://publications.europa.eu/resource/cellar/manifestation",
  treeNotice: {
    url: "https://publications.europa.eu/resource/celex/32025R0001",
    mediaType: "application/xml",
    etag: null,
    lastModified: null,
    sha256: `sha256:${"b".repeat(64)}`,
    bytes: 1,
    file: "tree-notice.xml",
  },
  content: {
    url: "https://publications.europa.eu/resource/cellar/manifestation/DOC_1",
    mediaType: "application/zip",
    etag: null,
    lastModified: null,
    sha256: `sha256:${"a".repeat(64)}`,
    bytes: 1,
    file: "source.fmx4.zip",
    upstreamStreamName: "fixture.zip",
  },
});
const section = (title: string, article: number) => `<DIVISION>
  <TITLE><TI><P>Section I</P></TI><STI><P>${title}</P></STI></TITLE>
  <ARTICLE IDENTIFIER="${article}"><TI.ART>Article ${article}</TI.ART><ALINEA>Fixture body ${article}.</ALINEA></ARTICLE>
</DIVISION>`;
const act = (sections: string) =>
  `<ACT><TITLE><TI>Fixture</TI></TITLE><ENACTING.TERMS>${sections}</ENACTING.TERMS></ACT>`;
const oldXml = act(section("Original section", 2));
const newXml = act(
  section("Inserted section", 1) + section("Original section", 2),
);
const originalId = "eu:32025R0001:section:i";
const rules = [
  {
    parentLogicalId: "eu:32025R0001",
    kind: "section" as const,
    number: "i",
    title: "Original section",
    occurrence: 1,
    sourceContentSha256: snapshot.content.sha256,
  },
  {
    parentLogicalId: "eu:32025R0001",
    kind: "section" as const,
    number: "i",
    title: "Inserted section",
    occurrence: 2,
    sourceContentSha256: snapshot.content.sha256,
  },
];
const reviewed = { ...source, structuralIdentityOverrides: rules };

describe("reviewed structural identity disambiguation", () => {
  it("retains original IDs and official labels when a same-number section is inserted earlier", () => {
    const before = parseFormexAct(oldXml, source, snapshot).document;
    const after = parseFormexAct(newXml, reviewed, snapshot).document;
    expect(before.structuralNodes[0].logicalId).toBe(originalId);
    expect(after.structuralNodes).toMatchObject([
      {
        logicalId: `${originalId}:occurrence:2`,
        title: "Inserted section",
        label: "Section I",
        displayOrder: 1,
      },
      { logicalId: originalId, title: "Original section", label: "Section I" },
    ]);
    expect(
      after.provisions.find((p) => p.logicalId === "eu:32025R0001:article:2")
        ?.parentLogicalId,
    ).toBe(originalId);
    expect(
      after.provisions.find((p) => p.logicalId === "eu:32025R0001:article:1")
        ?.parentLogicalId,
    ).toBe(`${originalId}:occurrence:2`);
    const reversed = parseFormexAct(
      act(section("Original section", 2) + section("Inserted section", 1)),
      reviewed,
      snapshot,
    ).document;
    expect(reversed.structuralNodes.map((p) => p.logicalId)).toEqual([
      originalId,
      `${originalId}:occurrence:2`,
    ]);
  });

  it("rejects source checksum drift rather than carrying a rule into unreviewed bytes", () => {
    expect(() =>
      parseFormexAct(
        newXml,
        {
          ...source,
          structuralIdentityOverrides: rules.map((rule) => ({
            ...rule,
            sourceContentSha256: `sha256:${"c".repeat(64)}`,
          })),
        },
        snapshot,
      ),
    ).toThrow(/source checksum mismatch/u);
  });

  it("rejects unused rules and repeated consumption", () => {
    expect(() => parseFormexAct(oldXml, reviewed, snapshot)).toThrow(
      /Unused structural identity/u,
    );
    expect(() =>
      parseFormexAct(
        act(
          section("Inserted section", 1) +
            section("Original section", 2) +
            section("Original section", 3),
        ),
        reviewed,
        snapshot,
      ),
    ).toThrow(/matched multiple divisions/u);
  });

  it("requires exact title matching and complete coverage of the overridden group", () => {
    expect(() =>
      parseFormexAct(
        newXml.replace("Inserted section", "Changed title"),
        reviewed,
        snapshot,
      ),
    ).toThrow(/Unreviewed structural identity/u);
    expect(() =>
      parseFormexAct(
        act(
          section("Inserted section", 1) +
            section("Original section", 2) +
            section("Future third section", 3),
        ),
        reviewed,
        snapshot,
      ),
    ).toThrow(/Unreviewed structural identity/u);
    expect(() =>
      parseFormexAct(
        newXml,
        { ...source, structuralIdentityOverrides: [rules[0]] },
        snapshot,
      ),
    ).toThrow(/Unreviewed structural identity/u);
  });

  it("rejects duplicate titles, occurrence collisions and gaps before assigning any IDs", () => {
    for (const invalid of [
      [rules[0], { ...rules[1], occurrence: 1 }],
      [rules[0], { ...rules[1], occurrence: 3 }],
      [rules[0], { ...rules[1], title: rules[0].title }],
    ]) {
      expect(() =>
        parseFormexAct(
          newXml,
          { ...source, structuralIdentityOverrides: invalid },
          snapshot,
        ),
      ).toThrow(/unique titles and contiguous occurrences/u);
    }
  });

  it("leaves unconfigured groups on the existing occurrence contract", () => {
    expect(
      parseFormexAct(newXml, source, snapshot).document.structuralNodes.map(
        (n) => n.logicalId,
      ),
    ).toEqual([originalId, `${originalId}:occurrence:2`]);
  });
});
