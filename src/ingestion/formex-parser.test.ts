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
      </ALINEA><ALINEA>After the list.</ALINEA></PARAG>
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
  </GR.SEQ><GR.SEQ LEVEL="1">
    <TITLE><TI><NP><NO.P>(Where applicable) 14.</NO.P><TXT>Additional information</TXT></NP></TI></TITLE>
    <NP><NO.P>1.</NO.P><TXT>The official descriptive marker is preserved.</TXT></NP>
  </GR.SEQ><LIST TYPE="alpha"><ITEM><NP><NO.P>(c)</NO.P><TXT>A direct annex item.</TXT></NP></ITEM></LIST></CONTENTS>
</ANNEX>`;

const tableAnnexXml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNEX>
  <TITLE><TI><P>ANNEX I</P></TI><STI><P>Classification table</P></STI></TITLE>
  <CONTENTS><TBL NO.SEQ="0001"><CORPUS>
    <ROW TYPE="HEADER"><CELL>Bucket</CELL><CELL>Items</CELL></ROW>
    <ROW><CELL>1</CELL><CELL><LIST TYPE="alpha">
      <ITEM><NP><NO.P>(a)</NO.P><TXT>First item:</TXT><P><LIST TYPE="roman">
        <ITEM><NP><NO.P>(i)</NO.P><TXT>first detail;</TXT></NP></ITEM>
        <ITEM><NP><NO.P>(ii)</NO.P><TXT>second detail.</TXT></NP></ITEM>
      </LIST></P></NP></ITEM>
      <ITEM><NP><NO.P>(b)</NO.P><TXT>Second item.</TXT></NP></ITEM>
      <ITEM><NP><NO.P>☐</NO.P><TXT>Checklist item.</TXT></NP></ITEM>
    </LIST></CELL></ROW>
  </CORPUS></TBL></CONTENTS>
</ANNEX>`;

describe("Formex ACT parser", () => {
  it("preserves encoded and literal quotation characters in Reader text and ordered lists", () => {
    const quotedXml = xml
      .replace(
        "First<NOTE>",
        '<QUOT.START CODE="2018"/>First<QUOT.END CODE="2019"/><NOTE>',
      )
      .replace("Second recital.", "Second “literal” recital.")
      .replace(
        "one rule;",
        '<QUOT.START CODE="2018"/>one <HT TYPE="ITALIC">rule</HT><QUOT.END CODE="2019"/>;',
      )
      .replace(
        "After the list.",
        '<QUOT.START CODE="201C"/>After <QUOT.START CODE="2018"/>the<QUOT.END CODE="2019"/> list.<QUOT.END CODE="201D"/>',
      );
    const { document } = parseFormexAct(quotedXml, source, snapshot);
    const find = (id: string) =>
      document.provisions.find((provision) => provision.logicalId === id);
    expect(find("eu:32025R0001:recital:1")?.text).toBe("‘First’ recital.");
    expect(find("eu:32025R0001:recital:2")?.text).toBe(
      "Second “literal” recital.",
    );
    expect(find("eu:32025R0001:article:1:paragraph:1:point:a")?.text).toBe(
      "‘one rule’;",
    );
    expect(find("eu:32025R0001:article:1:paragraph:1")?.orderedContent).toEqual(
      [
        { type: "text", text: "This Act provides:" },
        {
          type: "child",
          childLogicalId: "eu:32025R0001:article:1:paragraph:1:point:a",
        },
        { type: "text", text: "“After ‘the’ list.”" },
      ],
    );
    expect(
      toDocumentView(document, "encoded-quotation-test").provisions.find(
        (provision) => provision.id === "eu:32025R0001:article:1",
      )?.blocks[0].children[0].text,
    ).toBe("‘one rule’;");
  });

  it.each([
    ['<QUOT.START CODE="2018"/>(a)', "a"],
    ["‘(a)", "item-1"],
  ])(
    "keeps point identity rules separate from quoted labels: %s",
    (number, identity) => {
      const { document } = parseFormexAct(
        xml.replace("<NO.P>(a)</NO.P>", `<NO.P>${number}</NO.P>`),
        source,
        snapshot,
      );
      expect(
        document.provisions.find((provision) => provision.kind === "point"),
      ).toMatchObject({
        logicalId: `eu:32025R0001:article:1:paragraph:1:point:${identity}`,
        numberRaw: "‘(a)",
        label: "‘(a)",
      });
    },
  );

  it("keeps Annex identity stable while preserving an encoded quoted heading", () => {
    const quotedAnnex = annexXml.replace(
      "ANNEX IV",
      '<QUOT.START CODE="2018"/>ANNEX IV<QUOT.END CODE="2019"/>',
    );
    const { document } = parseFormexAct(xml, source, snapshot, [
      { fileName: "annex.xml", xml: quotedAnnex },
    ]);
    expect(
      document.provisions.find((provision) => provision.kind === "annex"),
    ).toMatchObject({
      logicalId: "eu:32025R0001:annex:iv",
      numberRaw: "IV",
      label: "‘ANNEX IV’",
      title: "Technical documentation",
    });
  });

  it("keeps a quoted Annex section heading tied to its existing identity and locator", () => {
    const sectionAnnex = `<ANNEX><TITLE><TI>ANNEX II</TI></TITLE><CONTENTS>
      <GR.SEQ><TITLE><TI><P>Section <QUOT.START CODE="2018"/>Introductory text<QUOT.END CODE="2019"/></P></TI></TITLE>
      <P>Official section body.</P></GR.SEQ></CONTENTS></ANNEX>`;
    const { document } = parseFormexAct(xml, source, snapshot, [
      { fileName: "annex.xml", xml: sectionAnnex },
    ]);
    expect(
      document.provisions.find((provision) => provision.kind === "annex-part"),
    ).toMatchObject({
      logicalId: "eu:32025R0001:annex:ii:annex-part:introductory",
      label: "Section ‘Introductory text’",
      sourceLocator: {
        kind: "xpath",
        value: "annex.xml#/ANNEX/CONTENTS/GR.SEQ[1]",
      },
    });
  });

  it("preserves encoded quotations in Annex tables and their ordered point content", () => {
    const quotedTable = tableAnnexXml.replace(
      "First item:",
      '<QUOT.START CODE="201C"/>First item:<QUOT.END CODE="201D"/>',
    );
    const { document } = parseFormexAct(xml, source, snapshot, [
      { fileName: "annex.xml", xml: quotedTable },
    ]);
    expect(
      document.provisions.find((provision) => provision.kind === "table")?.text,
    ).toContain("“First item:”");
    expect(
      document.provisions.some(
        (provision) =>
          provision.kind === "point" &&
          provision.text.startsWith("“First item:”"),
      ),
    ).toBe(true);
  });

  it("preserves an explicit quoted Annex section number without changing its ID", () => {
    const sectionAnnex = `<ANNEX><TITLE><TI>ANNEX II</TI></TITLE><CONTENTS>
      <GR.SEQ><TITLE><TI><NP><NO.P>Section <QUOT.START CODE="2018"/>1.</NO.P><TXT>Lender<QUOT.END CODE="2019"/></TXT></NP></TI></TITLE>
      <P>Official section body.</P></GR.SEQ></CONTENTS></ANNEX>`;
    const { document } = parseFormexAct(xml, source, snapshot, [
      { fileName: "annex.xml", xml: sectionAnnex },
    ]);
    expect(
      document.provisions.find((provision) => provision.kind === "annex-part"),
    ).toMatchObject({
      logicalId: "eu:32025R0001:annex:ii:annex-part:section-1",
      numberRaw: "Section ‘1.",
      label: "Section ‘1. Lender’",
    });
  });

  it.each([
    "<QUOT.START/>",
    '<QUOT.END CODE="FFFF"/>',
    '<QUOT.START CODE="toString"/>',
    '<QUOT.START CODE="2018">unexpected text</QUOT.START>',
  ])("rejects missing or unsupported quotation encodings: %s", (marker) => {
    expect(() =>
      parseFormexAct(xml.replace("one rule;", marker), source, snapshot),
    ).toThrow("Unsupported Formex quotation marker");
  });

  it("preserves official CODE even when an opening marker encodes a closing quote", () => {
    const officialCell = tableAnnexXml.replace(
      "Bucket",
      'Mandatory if <QUOT.START CODE="2019" ID="QS0036" REF.END="QE0036"/>Yes<QUOT.END CODE="2019" ID="QE0036" REF.START="QS0036"/> is reported in B_02.02.0140',
    );
    const { document } = parseFormexAct(xml, source, snapshot, [
      { fileName: "annex.xml", xml: officialCell },
    ]);
    expect(
      document.provisions.find((provision) => provision.kind === "table")?.text,
    ).toContain("Mandatory if ’Yes’ is reported in B_02.02.0140");
  });

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
    const paragraph = document.provisions.find(
      (provision) =>
        provision.logicalId === "eu:32025R0001:article:1:paragraph:1",
    );
    expect(paragraph?.orderedContent).toEqual([
      { type: "text", text: "This Act provides:" },
      {
        type: "child",
        childLogicalId: "eu:32025R0001:article:1:paragraph:1:point:a",
      },
      { type: "text", text: "After the list." },
    ]);
    expect(
      toDocumentView(document, "ordered-content-test").provisions[0]?.blocks[0]
        ?.orderedContent,
    ).toEqual([
      { type: "text", text: "This Act provides:" },
      {
        type: "child",
        childId: "eu:32025R0001:article:1:paragraph:1:point:a",
      },
      { type: "text", text: "After the list." },
    ]);
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

  it("preserves an official formula at its exact position as a verified resource", () => {
    const formulaXml = xml.replace(
      "It applies immediately.",
      '<P><INCL.ELEMENT CONTENT="FORMULA" FILEREF="TEST.0001.tif" TYPE="TIFF"/></P>',
    );
    const sourceBytes = new Uint8Array([1, 2, 3]);
    const renditionBytes = new Uint8Array([4, 5, 6]);
    const { document, report } = parseFormexAct(
      formulaXml,
      source,
      snapshot,
      [],
      [
        {
          fileName: "TEST.0001.tif",
          sourceMediaType: "image/tiff",
          sourceBytes,
          mediaType: "image/png",
          renditionBytes,
        },
      ],
    );

    expect(report.warningCount).toBe(0);
    const formulaProvision = document.provisions.find(
      (provision) =>
        provision.logicalId === "eu:32025R0001:article:2:subparagraph:1",
    );
    expect(formulaProvision?.text).toBe("");
    expect(formulaProvision?.orderedContent).toEqual([
      {
        type: "resource",
        resourceId: "eu:32025R0001:resource:test.0001.tif",
      },
    ]);
    expect(document.resources).toHaveLength(1);
    const view = toDocumentView(document, "formula-test");
    expect(view.provisions[1]?.blocks[0]?.orderedContent[0]).toMatchObject({
      type: "resource",
      resource: {
        id: "eu:32025R0001:resource:test.0001.tif",
        mediaType: "image/png",
        dataUrl: "data:image/png;base64,BAUG",
      },
    });
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

  it("parses a pinned consolidated expression without changing stable IDs", () => {
    const consolidatedSource = sourceDefinitionSchema.parse({
      ...source,
      expressionCelex: "02025R0001-20260101",
      eliUrl: "https://eur-lex.europa.eu/eli/reg/2025/1/2026-01-01/eng",
      sourceStatus: {
        basis: "consolidated",
        textAsOf: "2026-01-01",
        checkedAt: "2026-01-02T00:00:00.000Z",
        currentVersionUrl: "https://eur-lex.europa.eu/eli/reg/2025/1",
        corrections: [],
      },
    });
    const consolidatedSnapshot = officialSourceSnapshotSchema.parse({
      ...snapshot,
      schemaVersion: "1.2.0",
      expressionCelex: "02025R0001-20260101",
      canonicalUrl: "https://eur-lex.europa.eu/eli/reg/2025/1/2026-01-01/eng",
    });
    const consolidatedXml = xml
      .replace("<ACT>", "<CONS.ACT><CONS.DOC>")
      .replace(
        "</ACT>",
        "<CONS.ANNEX><TITLE><TI><P>ANNEX I</P></TI></TITLE><CONTENTS><P>Consolidated annex.</P></CONTENTS></CONS.ANNEX></CONS.DOC></CONS.ACT>",
      );

    const { document, report } = parseFormexAct(
      consolidatedXml,
      consolidatedSource,
      consolidatedSnapshot,
    );

    expect(document.logicalId).toBe("eu:32025R0001");
    expect(document.source.sourceStatus).toMatchObject({
      basis: "consolidated",
      textAsOf: "2026-01-01",
    });
    expect(document.sourceLocator.value).toBe("/CONS.ACT");
    expect(report).toMatchObject({ articleCount: 2, annexCount: 1 });
    expect(
      document.provisions.find(
        (provision) => provision.logicalId === "eu:32025R0001:annex:i",
      )?.sourceLocator.value,
    ).toBe("/CONS.ACT/CONS.DOC/CONS.ANNEX[1]");
  });

  it("parses separately stored annexes with stable internal anchors", () => {
    const { document, report } = parseFormexAct(xml, source, snapshot, [
      { fileName: "TEST.annex-iv.xml", xml: annexXml },
    ]);

    expect(report).toMatchObject({
      annexCount: 1,
      paragraphCount: 5,
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
        (provision) =>
          provision.logicalId === "eu:32025R0001:annex:iv:annex-part:14",
      ),
    ).toMatchObject({
      numberRaw: "(Where applicable) 14.",
      numberNormalized: "14",
      label: "(Where applicable) 14. Additional information",
    });
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

  it("preserves Annex table rows and nested list markers as ordered content", () => {
    const { document, report } = parseFormexAct(xml, source, snapshot, [
      { fileName: "TEST.annex-i.xml", xml: tableAnnexXml },
    ]);

    expect(report).toMatchObject({ annexCount: 1, pointCount: 6 });
    const table = document.provisions.find(
      (provision) => provision.logicalId === "eu:32025R0001:annex:i:table:1",
    );
    expect(table).toMatchObject({
      kind: "table",
      label: "Table 1",
      text: "Bucket Items 1 First item: first detail; second detail. Second item. Checklist item.",
    });
    expect(table?.orderedContent).toEqual([
      { type: "text", text: "Bucket Items 1" },
      {
        type: "child",
        childLogicalId: "eu:32025R0001:annex:i:table:1:point:a",
      },
      {
        type: "child",
        childLogicalId: "eu:32025R0001:annex:i:table:1:point:b",
      },
      {
        type: "child",
        childLogicalId: "eu:32025R0001:annex:i:table:1:point:item-3",
      },
    ]);
    const annex = toDocumentView(document, "table-test").provisions.find(
      (provision) => provision.kind === "annex",
    );
    expect(annex?.blocks[0]).toMatchObject({
      kind: "other",
      marker: "Table 1",
    });
  });
});
