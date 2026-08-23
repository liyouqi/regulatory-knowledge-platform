import { describe, expect, it } from "vitest";
import { toDocumentView } from "../canonical/to-document-view";
import { parseFormexAct } from "./formex-parser";
import { officialSourceSnapshotSchema } from "./snapshot";
import { sourceDefinitionSchema } from "./source-registry";

const source = sourceDefinitionSchema.parse({
  familyId: "family:test-act",
  shortName: "Test Act",
  aliases: ["Test Regulation"],
  celex: "32025R0001",
  language: "ENG",
  documentType: "regulation",
  regulatoryLevel: "level-1",
  measureType: "primary-act",
  publicationDate: "2025-01-02",
  eliUrl: "https://eur-lex.europa.eu/eli/reg/2025/1/oj/eng",
});

const snapshot = officialSourceSnapshotSchema.parse({
  schemaVersion: "1.0.0",
  snapshotId: `snapshot:cellar:32025R0001:${"a".repeat(64)}`,
  provenance: "official",
  sourceSystem: "cellar",
  celex: "32025R0001",
  language: "en",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  canonicalUrl: "https://eur-lex.europa.eu/eli/reg/2025/1/oj/eng",
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
    bytes: 10,
    file: "tree-notice.xml",
  },
  content: {
    url: "https://publications.europa.eu/resource/cellar/manifestation/DOC_1",
    mediaType: "application/zip",
    etag: '"Con-20250102030405000"',
    lastModified: "Thu, 02 Jan 2025 02:04:05 GMT",
    sha256: `sha256:${"a".repeat(64)}`,
    bytes: 20,
    file: "source.fmx4.zip",
    upstreamStreamName: "TEST_ENG.fmx4.zip",
  },
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ACT>
  <TITLE><TI><P>Regulation (EU) 2025/1</P><P>on parser tests</P></TI></TITLE>
  <PREAMBLE><GR.CONSID>
    <CONSID><NP><NO.P>(1)</NO.P><TXT>First<NOTE><P>Hidden footnote.</P></NOTE> recital.</TXT></NP></CONSID>
    <CONSID><NP><NO.P>(2)</NO.P><TXT>Second recital.</TXT></NP></CONSID>
  </GR.CONSID></PREAMBLE>
  <ENACTING.TERMS><DIVISION>
    <TITLE><TI><P>CHAPTER I</P></TI><STI><P>General provisions</P></STI></TITLE>
    <ARTICLE IDENTIFIER="001">
      <TI.ART>Article 1</TI.ART><STI.ART>Subject matter</STI.ART>
      <PARAG IDENTIFIER="001.001"><NO.PARAG>1.</NO.PARAG><ALINEA>
        <P>This Act provides:</P><LIST TYPE="alpha"><ITEM><NP><NO.P>(a)</NO.P><TXT>one rule;</TXT></NP></ITEM></LIST>
      </ALINEA></PARAG>
    </ARTICLE>
    <ARTICLE IDENTIFIER="002">
      <TI.ART>Article 2</TI.ART><STI.ART>Application</STI.ART>
      <ALINEA>It applies immediately.</ALINEA><ALINEA>It is binding.</ALINEA>
    </ARTICLE>
  </DIVISION></ENACTING.TERMS>
</ACT>`;

const annexXml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNEX>
  <TITLE><TI><P>ANNEX IV</P></TI><STI><P>Technical documentation</P></STI></TITLE>
  <CONTENTS><GR.SEQ LEVEL="1">
    <TITLE><TI><NP><NO.P>1.</NO.P><TXT>General requirements</TXT></NP></TI></TITLE>
    <NP><NO.P>1.</NO.P><TXT>The documentation shall contain:</TXT><P><LIST TYPE="alpha">
      <ITEM><NP><NO.P>(a)</NO.P><TXT>a general description;</TXT></NP></ITEM>
      <ITEM><NP><NO.P>(b)</NO.P><TXT>the system elements.</TXT></NP></ITEM>
    </LIST></P></NP>
  </GR.SEQ><LIST TYPE="alpha"><ITEM><NP><NO.P>(c)</NO.P><TXT>A direct annex item.</TXT></NP></ITEM></LIST></CONTENTS>
</ANNEX>`;

describe("Formex ACT parser", () => {
  it("preserves legal hierarchy, stable IDs, and normalized text", () => {
    const { document, report } = parseFormexAct(xml, source, snapshot);

    expect(document.logicalId).toBe("eu:32025R0001");
    expect(document.source.provenance).toBe("official");
    expect(document.structuralNodes[0]).toMatchObject({
      logicalId: "eu:32025R0001:chapter:i",
      kind: "chapter",
      title: "General provisions",
    });
    expect(report).toMatchObject({
      articleCount: 2,
      recitalCount: 2,
      annexCount: 0,
      paragraphCount: 3,
      pointCount: 1,
      structuralNodeCount: 1,
      warningCount: 0,
    });
    expect(
      document.provisions.find(
        (provision) => provision.logicalId === "eu:32025R0001:recital:1",
      )?.text,
    ).toBe("First recital.");
    expect(
      document.provisions.find(
        (provision) =>
          provision.logicalId === "eu:32025R0001:article:1:paragraph:1:point:a",
      )?.text,
    ).toBe("one rule;");
    expect(
      document.provisions.find(
        (provision) =>
          provision.logicalId === "eu:32025R0001:article:2:subparagraph:2",
      )?.text,
    ).toBe("It is binding.");
  });

  it("binds every entity to the exact Cellar content version", () => {
    const { document } = parseFormexAct(xml, source, snapshot);

    expect(document.source.sourceVersion).toBe("Con-20250102030405000");
    expect(
      document.provisions.every((provision) =>
        provision.sourceVersionId.endsWith("@Con-20250102030405000"),
      ),
    ).toBe(true);
  });

  it("parses official acts whose articles are direct ENACTING.TERMS children", () => {
    const ungroupedXml = xml
      .replace("<ENACTING.TERMS><DIVISION>", "<ENACTING.TERMS>")
      .replace("</DIVISION></ENACTING.TERMS>", "</ENACTING.TERMS>");
    const { document, report } = parseFormexAct(ungroupedXml, source, snapshot);

    expect(report).toMatchObject({
      articleCount: 2,
      structuralNodeCount: 0,
      warningCount: 0,
    });
    expect(
      document.provisions.find(
        (provision) => provision.logicalId === "eu:32025R0001:article:1",
      )?.parentLogicalId,
    ).toBe(document.logicalId);
  });

  it("parses separately stored annexes with stable internal anchors", () => {
    const { document, report } = parseFormexAct(xml, source, snapshot, [
      { fileName: "TEST.annex-iv.xml", xml: annexXml },
    ]);

    expect(report).toMatchObject({
      annexCount: 1,
      paragraphCount: 4,
      pointCount: 4,
      warningCount: 0,
    });
    expect(
      document.provisions.find(
        (provision) => provision.logicalId === "eu:32025R0001:annex:iv",
      ),
    ).toMatchObject({
      kind: "annex",
      label: "ANNEX IV",
      title: "Technical documentation",
      sourceLocator: {
        value: "TEST.annex-iv.xml#/ANNEX",
      },
    });
    expect(
      document.provisions.find(
        (provision) =>
          provision.logicalId ===
          "eu:32025R0001:annex:iv:annex-part:1:paragraph:1:point:b",
      )?.text,
    ).toBe("the system elements.");
    expect(
      document.provisions.find(
        (provision) => provision.logicalId === "eu:32025R0001:annex:iv:point:c",
      )?.sourceLocator.value,
    ).toBe("TEST.annex-iv.xml#/ANNEX/CONTENTS/LIST[1]/ITEM[1]");
    const annex = toDocumentView(document, "annex-test").provisions.find(
      (provision) => provision.kind === "annex",
    );
    expect(annex?.path).toBe("/read/test-act/annexes/iv");
    expect(annex?.blocks[0]).toMatchObject({
      kind: "annex-part",
      marker: "1. General requirements",
      anchor: "annex-part-1",
    });
  });
});
