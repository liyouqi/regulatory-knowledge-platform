import { describe, expect, it } from "vitest";
import { parseFormexAct } from "../../ingestion/formex-parser";
import type { OfficialSourceSnapshot } from "../../ingestion/snapshot";
import type { SourceDefinition } from "../../ingestion/source-registry";
import { earthReadingBlockSchema } from "../contract/article-reading";
import {
  auditArticleReadings,
  validateReadingHashes,
} from "./article-source-audit";

// Deliberately test-only text and identities; no official legal text is fabricated.
const source: SourceDefinition = {
  familyId: "family:test",
  shortName: "Fixture",
  aliases: [],
  celex: "39999R9999",
  language: "ENG",
  documentType: "regulation",
  regulatoryLevel: "level-1",
  measureType: "primary-act",
  publicationDate: "2099-01-01",
  eliUrl: "https://example.test/act",
};
const snapshot = {
  schemaVersion: "1.0.0",
  snapshotId: "fixture-snapshot",
  provenance: "official",
  sourceSystem: "cellar",
  celex: source.celex,
  language: "en",
  retrievedAt: "2026-09-26T00:00:00.000Z",
  canonicalUrl: source.eliUrl,
  content: {
    sha256: `sha256:${"a".repeat(64)}`,
    etag: null,
    url: "https://example.test/content",
    bytes: 2000,
  },
} as OfficialSourceSnapshot;
const xml = `<ACT><TITLE><TI><P>Test-only Act</P></TI></TITLE><ENACTING.TERMS>
<ARTICLE IDENTIFIER="001"><TI.ART>Article 1</TI.ART><PARAG IDENTIFIER="001.001"><NO.PARAG>1.</NO.PARAG><ALINEA>Before.<LIST TYPE="alpha"><ITEM><NP><NO.P>(a)</NO.P><TXT>Parent before.<LIST TYPE="roman"><ITEM><NP><NO.P>(i)</NO.P><TXT>Nested text.<NOTE>Excluded footnote.</NOTE></TXT></NP></ITEM></LIST>Parent after.</TXT></NP></ITEM><ITEM><NP><NO.P>(b)</NO.P><TXT>Second point.</TXT></NP></ITEM></LIST>After.</ALINEA></PARAG></ARTICLE>
<ARTICLE IDENTIFIER="002"><TI.ART>Article 2</TI.ART><ALINEA>First subparagraph.</ALINEA><P>Second subparagraph.</P></ARTICLE>
</ENACTING.TERMS></ACT>`;
const parse = (value = xml) =>
  parseFormexAct(value, source, snapshot).document.provisions;

describe("Earth-only Article source audit", () => {
  it("preserves interleaved text and nested points, with unique source paths and hashes", () => {
    const readings = auditArticleReadings(xml, parse());
    expect(readings).toHaveLength(2);
    const blocks = readings[0]?.blocks ?? [];
    expect(blocks.map((block) => block.marker)).toEqual([
      "1.",
      "(a)",
      "(i)",
      "(b)",
    ]);
    expect(blocks[0]?.content.map((entry) => entry.type)).toEqual([
      "text",
      "child",
      "child",
      "text",
    ]);
    expect(blocks[1]?.content.map((entry) => entry.type)).toEqual([
      "text",
      "child",
      "text",
    ]);
    expect(blocks[2]?.sourcePath).toBe(
      "/ACT[1]/ENACTING.TERMS[1]/ARTICLE[1]/PARAG[1]/ALINEA[1]/LIST[1]/ITEM[1]/NP[1]/TXT[1]/LIST[1]/ITEM[1]",
    );
    expect(JSON.stringify(blocks)).not.toContain("Excluded footnote");
    expect(() => validateReadingHashes(blocks)).not.toThrow();
    expect(
      earthReadingBlockSchema.safeParse({
        ...blocks[0],
        id: "earth:graph-identity",
      }).success,
    ).toBe(false);
    // The shared parser's mixed-tag hint is not silently corrected or trusted.
    expect(readings[1]?.blocks[1]?.parserLocator).toContain("/P[2]");
    expect(readings[1]?.blocks[1]?.sourcePath).toContain("/P[1]");
  });
  it("rejects missing and reordered content, tables, mixed body containers, and element namespaces", () => {
    const provisions = parse();
    const block = provisions.find((p) => p.kind === "paragraph");
    if (!block?.orderedContent) throw new Error("Missing test block");
    const altered = structuredClone(provisions);
    const paragraph = altered.find((p) => p.kind === "paragraph");
    paragraph?.orderedContent?.reverse();
    expect(() => auditArticleReadings(xml, altered)).toThrow(
      "ordered source drift",
    );
    expect(() =>
      auditArticleReadings(
        xml,
        provisions.filter((p) => p.kind !== "subpoint"),
      ),
    ).toThrow("Incomplete Article list");
    const mixed = xml.replace(
      "<PARAG IDENTIFIER=",
      "<ALINEA>Omitted body.</ALINEA><PARAG IDENTIFIER=",
    );
    expect(() => auditArticleReadings(mixed, parse(mixed))).toThrow(
      "Unconsumed Article body",
    );
    const table = xml.replace(
      "Before.",
      "Before.<TABLE><ROW>Table text.</ROW></TABLE>",
    );
    expect(() => auditArticleReadings(table, parse(table))).toThrow(
      "does not support Article tables",
    );
    expect(() =>
      auditArticleReadings(
        xml.replace("<ACT>", '<ACT xmlns="https://example.test/namespace">'),
        provisions,
      ),
    ).toThrow("Namespaced");
    const declared = xml.replace(
      "<ACT>",
      '<ACT xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:fmx="http://opoce" xsi:noNamespaceSchemaLocation="https://example.test/formex.xsd">',
    );
    expect(() => auditArticleReadings(declared, provisions)).not.toThrow();
    expect(() =>
      auditArticleReadings(
        declared.replace("<ALINEA>", '<ALINEA xsi:type="bad">'),
        provisions,
      ),
    ).toThrow("Namespaced");
    expect(() =>
      auditArticleReadings(
        xml.replace(
          "<ACT>",
          '<ACT xsi:noNamespaceSchemaLocation="https://example.test/formex.xsd">',
        ),
        provisions,
      ),
    ).toThrow("Namespaced");
    expect(() =>
      auditArticleReadings(
        xml.replace("<PARAG IDENTIFIER=", "<GRAPHIC/><PARAG IDENTIFIER="),
        provisions,
      ),
    ).toThrow("Unsupported Article non-text body");
  });
});
