import { describe, expect, it } from "vitest";
import { discoverEnglishFmx, officialCellarHttpsUrl } from "./cellar";

const treeNotice = `<?xml version="1.0" encoding="UTF-8"?>
<NOTICE type="tree">
  <WORK>
    <URI><VALUE>http://publications.europa.eu/resource/cellar/work-id</VALUE></URI>
  </WORK>
  <EXPRESSION>
    <URI><VALUE>http://publications.europa.eu/resource/cellar/expression-fra</VALUE></URI>
    <SAMEAS><URI><VALUE>http://publications.europa.eu/resource/celex/32022R2554.FRA</VALUE></URI></SAMEAS>
  </EXPRESSION>
  <EXPRESSION>
    <URI><VALUE>http://publications.europa.eu/resource/cellar/expression-eng</VALUE></URI>
    <SAMEAS><URI><VALUE>http://publications.europa.eu/resource/celex/32022R2554.ENG</VALUE></URI></SAMEAS>
    <EXPRESSION_MANIFESTED_BY_MANIFESTATION>
      <URI><VALUE>http://publications.europa.eu/resource/cellar/manifestation-xhtml</VALUE></URI>
    </EXPRESSION_MANIFESTED_BY_MANIFESTATION>
    <EXPRESSION_MANIFESTED_BY_MANIFESTATION>
      <URI><VALUE>http://publications.europa.eu/resource/cellar/manifestation-fmx</VALUE></URI>
    </EXPRESSION_MANIFESTED_BY_MANIFESTATION>
  </EXPRESSION>
  <MANIFESTATION manifestation-type="xhtml">
    <URI><VALUE>http://publications.europa.eu/resource/cellar/manifestation-xhtml</VALUE></URI>
  </MANIFESTATION>
  <MANIFESTATION manifestation-type="fmx4">
    <URI><VALUE>http://publications.europa.eu/resource/cellar/manifestation-fmx</VALUE></URI>
    <MANIFESTATION_HAS_ITEM>
      <URI><VALUE>http://publications.europa.eu/resource/cellar/manifestation-fmx/DOC_1</VALUE></URI>
      <IDENTIFIER><VALUE>DOC_1</VALUE></IDENTIFIER>
      <TECHMD><STREAM_NAME><VALUE>DORA_ENG.fmx4.zip</VALUE></STREAM_NAME></TECHMD>
    </MANIFESTATION_HAS_ITEM>
  </MANIFESTATION>
</NOTICE>`;

const officialJournalTreeNotice = `<?xml version="1.0" encoding="UTF-8"?>
<NOTICE type="tree">
  <WORK><URI><VALUE>http://publications.europa.eu/resource/cellar/ai-work</VALUE></URI></WORK>
  <EXPRESSION>
    <URI><VALUE>http://publications.europa.eu/resource/cellar/ai-expression</VALUE></URI>
    <SAMEAS><URI><VALUE>http://publications.europa.eu/resource/oj/L_202401689.ENG</VALUE></URI></SAMEAS>
    <EXPRESSION_USES_LANGUAGE><OP-CODE>ENG</OP-CODE></EXPRESSION_USES_LANGUAGE>
    <EXPRESSION_BELONGS_TO_WORK><URI><VALUE>http://publications.europa.eu/resource/cellar/ai-work</VALUE></URI></EXPRESSION_BELONGS_TO_WORK>
    <EXPRESSION_MANIFESTED_BY_MANIFESTATION>
      <URI><VALUE>http://publications.europa.eu/resource/cellar/ai-fmx</VALUE></URI>
    </EXPRESSION_MANIFESTED_BY_MANIFESTATION>
  </EXPRESSION>
  <MANIFESTATION manifestation-type="fmx4">
    <URI><VALUE>http://publications.europa.eu/resource/cellar/ai-fmx</VALUE></URI>
    <MANIFESTATION_HAS_ITEM>
      <URI><VALUE>http://publications.europa.eu/resource/cellar/ai-fmx/DOC_1</VALUE></URI>
      <IDENTIFIER><VALUE>DOC_1</VALUE></IDENTIFIER>
      <TECHMD><STREAM_NAME><VALUE>AI_ACT_ENG.fmx4.zip</VALUE></STREAM_NAME></TECHMD>
    </MANIFESTATION_HAS_ITEM>
  </MANIFESTATION>
</NOTICE>`;

const legacyMultiItemTreeNotice = treeNotice
  .replace(
    "<MANIFESTATION_HAS_ITEM>",
    `<MANIFESTATION_HAS_ITEM>
      <URI><VALUE>http://publications.europa.eu/resource/cellar/manifestation-fmx/DOC_1</VALUE></URI>
      <IDENTIFIER><VALUE>DOC_1</VALUE></IDENTIFIER>
      <TECHMD><STREAM_NAME><VALUE>LEGACY.doc.xml</VALUE></STREAM_NAME></TECHMD>
    </MANIFESTATION_HAS_ITEM>
    <MANIFESTATION_HAS_ITEM>`,
  )
  .replace("DORA_ENG.fmx4.zip", "LEGACY.01000101.xml");

describe("Cellar tree notice discovery", () => {
  it("upgrades official Cellar HTTP identifiers without accepting other hosts", () => {
    expect(
      officialCellarHttpsUrl(
        "http://publications.europa.eu/resource/cellar/work-id",
      ),
    ).toBe("https://publications.europa.eu/resource/cellar/work-id");
    expect(() =>
      officialCellarHttpsUrl("https://example.com/resource/cellar/work-id"),
    ).toThrow("Unexpected Cellar host");
  });

  it("selects the English FMX4 content stream for the requested CELEX work", () => {
    expect(discoverEnglishFmx(treeNotice, "32022R2554")).toEqual({
      workUri: "https://publications.europa.eu/resource/cellar/work-id",
      expressionUri:
        "https://publications.europa.eu/resource/cellar/expression-eng",
      manifestationUri:
        "https://publications.europa.eu/resource/cellar/manifestation-fmx",
      contentUrl:
        "https://publications.europa.eu/resource/cellar/manifestation-fmx/DOC_1",
      streamName: "DORA_ENG.fmx4.zip",
      contentItems: [
        {
          contentUrl:
            "https://publications.europa.eu/resource/cellar/manifestation-fmx/DOC_1",
          streamName: "DORA_ENG.fmx4.zip",
        },
      ],
    });
  });

  it("uses explicit language and work links for newer Official Journal acts", () => {
    expect(discoverEnglishFmx(officialJournalTreeNotice, "32024R1689")).toEqual(
      {
        workUri: "https://publications.europa.eu/resource/cellar/ai-work",
        expressionUri:
          "https://publications.europa.eu/resource/cellar/ai-expression",
        manifestationUri:
          "https://publications.europa.eu/resource/cellar/ai-fmx",
        contentUrl:
          "https://publications.europa.eu/resource/cellar/ai-fmx/DOC_1",
        streamName: "AI_ACT_ENG.fmx4.zip",
        contentItems: [
          {
            contentUrl:
              "https://publications.europa.eu/resource/cellar/ai-fmx/DOC_1",
            streamName: "AI_ACT_ENG.fmx4.zip",
          },
        ],
      },
    );
  });

  it("selects legal ACT XML instead of legacy document metadata", () => {
    expect(
      discoverEnglishFmx(legacyMultiItemTreeNotice, "32022R2554"),
    ).toMatchObject({
      contentUrl:
        "https://publications.europa.eu/resource/cellar/manifestation-fmx/DOC_1",
      streamName: "LEGACY.01000101.xml",
    });
    expect(
      discoverEnglishFmx(legacyMultiItemTreeNotice, "32022R2554").contentItems,
    ).toEqual([
      {
        contentUrl:
          "https://publications.europa.eu/resource/cellar/manifestation-fmx/DOC_1",
        streamName: "LEGACY.01000101.xml",
      },
      {
        contentUrl:
          "https://publications.europa.eu/resource/cellar/manifestation-fmx/DOC_1",
        streamName: "LEGACY.doc.xml",
      },
    ]);
  });

  it("fails closed when the English expression is absent", () => {
    expect(() => discoverEnglishFmx(treeNotice, "32024R1689")).toThrow(
      "English expression not found",
    );
  });
});
