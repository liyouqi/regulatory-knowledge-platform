import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractFormexPackage } from "./formex-package";

describe("Formex content boundary", () => {
  it("accepts an official single-XML Formex manifestation", () => {
    const xml = '<?xml version="1.0"?><ACT />';

    expect(extractFormexPackage(strToU8(xml), "GDPR.doc.xml")).toEqual({
      act: { fileName: "GDPR.doc.xml", xml },
      annexes: [],
    });
  });

  it("selects the ACT XML and ignores the document metadata XML", () => {
    const zip = zipSync({
      "TEST.doc.xml": strToU8("<DOC />"),
      "TEST.xml": strToU8('<?xml version="1.0"?><ACT />'),
    });

    expect(extractFormexPackage(zip)).toEqual({
      act: {
        fileName: "TEST.xml",
        xml: '<?xml version="1.0"?><ACT />',
      },
      annexes: [],
    });
  });

  it("returns separately stored ANNEX documents in file order", () => {
    const zip = zipSync({
      "TEST.0001.xml": strToU8("<ACT />"),
      "TEST.0003.xml": strToU8("<ANNEX><TITLE>II</TITLE></ANNEX>"),
      "TEST.0002.xml": strToU8("<ANNEX><TITLE>I</TITLE></ANNEX>"),
    });

    expect(
      extractFormexPackage(zip).annexes.map(({ fileName }) => fileName),
    ).toEqual(["TEST.0002.xml", "TEST.0003.xml"]);
  });

  it("rejects an ambiguous package with multiple ACT candidates", () => {
    const zip = zipSync({
      "ONE.xml": strToU8("<ACT />"),
      "TWO.xml": strToU8("<ACT />"),
    });

    expect(() => extractFormexPackage(zip)).toThrow(
      "Expected exactly one ACT XML file",
    );
  });
});
