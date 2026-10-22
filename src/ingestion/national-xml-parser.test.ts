import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateCanonicalDocument } from "../canonical/validate";
import type { ContentUnit } from "../shared/content-unit";
import type { NationalSourceSnapshot } from "./national-snapshot";
import { loadNationalSourceCatalogSync } from "./national-source-registry";
import {
  inspectNationalXml,
  nationalUnitText,
  parseNationalXml,
} from "./national-xml-parser";
const source = loadNationalSourceCatalogSync()[0];
const input = (extra = "") =>
  `<?xml version="1.0"?><dokumente doknr="BJNR182210017"><norm doknr="BJNR182210017"><metadaten><langue>Gesetz über das Aufspüren von Gewinnen aus schweren Straftaten</langue><ausfertigung-datum>2017-06-23</ausfertigung-datum><standangabe><standtyp>Stand</standtyp><standkommentar>Zuletzt geändert durch Art. 12 Abs. 4 G v. 29.6.2026 I Nr. 197</standkommentar></standangabe></metadaten><textdaten><fussnoten><Content><P>Header note</P></Content></fussnoten></textdaten></norm><norm doknr="BJNR182210017G1"><metadaten><gliederungseinheit><gliederungskennzahl>010</gliederungskennzahl><gliederungsbez>Abschnitt 1</gliederungsbez><gliederungstitel>One</gliederungstitel></gliederungseinheit></metadaten><textdaten/></norm><norm doknr="BJNR182210017N1"><metadaten><enbez>§ 1</enbez></metadaten><textdaten><text><Content><P>A<I>B</I>C<BR/>D${extra}</P></Content></text><fussnoten><Content><P>note</P></Content></fussnoten></textdaten></norm></dokumente>`;
function inspect(xml: string) {
  const bytes = Buffer.from(xml);
  const snapshot = {
    localId: source.localId,
    documentId: source.documentId,
    canonicalUrl: source.pageUrl,
    content: {
      url: source.contentUrl,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    },
  } as NationalSourceSnapshot;
  return inspectNationalXml(bytes, snapshot, source);
}
describe("national source XML", () => {
  it("preserves mixed content and isolates footnotes with source locators", () => {
    const result = inspect(input());
    const n = result.norms[2];
    expect(n.text && nationalUnitText(n.text)).toBe("ABC\nD");
    expect(n.footnotes && nationalUnitText(n.footnotes)).toBe("note");
    expect(n.structuralPath).toEqual(["BJNR182210017G1"]);
    expect(n.text?.locator).toContain("/text[1]");
    expect(result.stand[0].text).toContain("29.6.2026");
  });
  it("rejects known elements in unconsumed contexts and duplicate containers", () => {
    expect(() =>
      inspect(
        input().replace(
          "</textdaten></norm>",
          "</textdaten><P>SENTINEL</P></norm>",
        ),
      ),
    ).toThrow("Unsupported XML child");
    expect(() =>
      inspect(
        input().replace("</textdaten></norm>", "</textdaten>SENTINEL</norm>"),
      ),
    ).toThrow("Unexpected direct XML text");
    expect(() =>
      inspect(
        input().replace(
          "</textdaten></norm>",
          "</textdaten><textdaten/></norm>",
        ),
      ),
    ).toThrow("Ambiguous norm containers");
  });

  it("rejects unknown tags and attributes", () => {
    expect(() => inspect(input("<unknown/>"))).toThrow(
      "Unsupported XML element",
    );
    expect(() => inspect(input('<I mystery="x">x</I>'))).toThrow(
      "Unsupported XML attribute",
    );
  });
  it("rejects duplicate official norm IDs and invalid group parent", () => {
    expect(() =>
      inspect(input().replace("BJNR182210017N1", "BJNR182210017G1")),
    ).toThrow("duplicate norm ID");
    expect(() =>
      inspect(
        input().replace(
          "<gliederungskennzahl>010</gliederungskennzahl>",
          "<gliederungskennzahl>010010</gliederungskennzahl>",
        ),
      ),
    ).toThrow("group ancestry");
  });
});

describe("CALS grid", () => {
  const table =
    '<table><tgroup cols="3" colsep="1"><colspec colname="a"/><colspec colname="b"/><colspec colname="c"/><tbody><row><entry namest="a" nameend="b">X</entry><entry/></row></tbody></tgroup></table>';
  const parse = (markup: string) => {
    const bytes = Buffer.from(input(markup));
    const snapshot = {
      localId: source.localId,
      documentId: source.documentId,
      canonicalUrl: source.pageUrl,
      snapshotId: "fixture",
      retrievedAt: "2026-10-21T00:00:00Z",
      content: {
        url: source.contentUrl,
        bytes: bytes.length,
        sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      },
    } as NationalSourceSnapshot;
    return parseNationalXml(bytes, snapshot, source);
  };
  it("normalizes a span and retains an empty cell", () => {
    const result = parse(table);
    expect(JSON.stringify(result)).toContain('"columnSpan":2');
    expect(JSON.stringify(result)).toContain('"columnStart":3');
  });
  const walk = (unit: ContentUnit, fn: (unit: ContentUnit) => void) => {
    fn(unit);
    if (unit.type === "element")
      for (const child of unit.children) walk(child, fn);
  };
  it("rejects deleting all 1.4 table column metadata", () => {
    const document = parse(table).document;
    expect(() => validateCanonicalDocument(document)).not.toThrow();
    for (const provision of document.provisions as {
      orderedUnits: ContentUnit[];
    }[]) {
      for (const unit of provision.orderedUnits)
        walk(unit, (current) => {
          if (current.type === "element") {
            current.columnCount = undefined;
            current.columnStart = undefined;
            current.columnSpan = undefined;
          }
        });
    }
    expect(() =>
      validateCanonicalDocument(JSON.parse(JSON.stringify(document))),
    ).toThrow("Table must have a column count");
  });
  it.each(["columnCount", "columnStart", "columnSpan"] as const)(
    "rejects %s on a line break before projection",
    (field) => {
      const document = parse(table).document;
      let changed = false;
      for (const provision of document.provisions as {
        orderedUnits: ContentUnit[];
      }[]) {
        for (const unit of provision.orderedUnits)
          walk(unit, (current) => {
            if (current.type === "element" && current.name === "line-break") {
              current[field] = 1;
              changed = true;
            }
          });
      }
      expect(changed).toBe(true);
      expect(() => validateCanonicalDocument(document)).toThrow(
        /belong(s)? only/,
      );
    },
  );
  it("writes complete metadata even without spans", () => {
    const result = parse(
      '<table><tgroup cols="2"><colspec colname="a"/><colspec colname="b"/><tbody><row><entry>A</entry><entry>B</entry></row></tbody></tgroup></table>',
    );
    expect(JSON.stringify(result)).toContain('"columnCount":2');
    expect(JSON.stringify(result)).toContain('"columnStart":2');
    expect(() => validateCanonicalDocument(result.document)).not.toThrow();
  });
  it.each([
    table.replace(' nameend="b"', ""),
    table.replace('nameend="b"', 'nameend="z"'),
    table.replace('nameend="b"', 'nameend="c"'),
    table.replace("<entry/>", ""),
    table.replace('colname="b"', 'colname="a"'),
    table.replace('colname="b"', 'colname="b" colnum="1"'),
    table.replace('namest="a"', 'colname="a" namest="a"'),
    table.replace('colsep="1"', 'colsep="2"'),
    table.replace("<entry/>", '<entry morerows="1"/>'),
    table.replace("<tbody>", "<spanspec/><tbody>"),
  ])("rejects unsupported or malformed grids", (markup) => {
    expect(() => parse(markup)).toThrow();
  });
});

it("keeps repeated group codes under their distinct source ancestors", () => {
  const group = (id: string, code: string, label: string) =>
    `<norm doknr="BJNR182210017${id}"><metadaten><gliederungseinheit><gliederungskennzahl>${code}</gliederungskennzahl><gliederungsbez>${label}</gliederungsbez><gliederungstitel>Title</gliederungstitel></gliederungseinheit></metadaten><textdaten/></norm>`;
  const norm = (id: string) =>
    `<norm doknr="BJNR182210017${id}"><metadaten><enbez>§ 1</enbez></metadaten><textdaten/></norm>`;
  const xml = input().replace(
    "</dokumente>",
    `${group("C8", "080", "Kapitel 8")}${norm("N8")}${group("C9", "080", "Kapitel 9")}${norm("N9")}</dokumente>`,
  );
  const result = inspect(xml);
  expect(
    result.norms.find((n) => n.sourceId.endsWith("N8"))?.structuralPath,
  ).toEqual(["BJNR182210017C8"]);
  expect(
    result.norms.find((n) => n.sourceId.endsWith("N9"))?.structuralPath,
  ).toEqual(["BJNR182210017C9"]);
});
