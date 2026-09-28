import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractFormexPackage } from "./formex-package";

describe("Formex content boundary", () => {
  it("accepts an official single-XML Formex manifestation", () => {
    const xml = '<?xml version="1.0"?><ACT />';

    expect(extractFormexPackage(strToU8(xml), "GDPR.doc.xml")).toEqual({
      act: { fileName: "GDPR.doc.xml", xml },
      annexes: [],
      resources: [],
    });
  });

  it("accepts a consolidated CONS.ACT Formex manifestation", () => {
    const xml = '<?xml version="1.0"?><CONS.ACT><CONS.DOC /></CONS.ACT>';

    expect(extractFormexPackage(strToU8(xml), "CRR.consolidated.xml")).toEqual({
      act: { fileName: "CRR.consolidated.xml", xml },
      annexes: [],
      resources: [],
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
      resources: [],
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

  it("unwraps a packaging ANNEX and returns only the referenced legal annex", () => {
    const zip = zipSync({
      "TEST.0001.xml": strToU8("<ACT />"),
      "TEST.0002.xml": strToU8(
        '<ANNEX><TITLE><TI><P>ANNEX</P></TI></TITLE><CONTENTS><P><INCL.ELEMENT FILEREF="TEST.0003.xml" TYPE="FORMEX.DOC"/></P></CONTENTS></ANNEX>',
      ),
      "TEST.0003.xml": strToU8(
        "<ANNEX><TITLE><TI><P>ANNEX I</P></TI></TITLE><CONTENTS><P>Legal annex text.</P></CONTENTS></ANNEX>",
      ),
    });

    expect(
      extractFormexPackage(zip).annexes.map(({ fileName }) => fileName),
    ).toEqual(["TEST.0003.xml"]);
  });

  it("extracts official TIFF formula resources separately from legal XML", () => {
    const resource = new Uint8Array([73, 73, 42, 0]);
    const zip = zipSync({
      "TEST.0001.xml": strToU8("<ACT />"),
      "TEST.0002.tif": resource,
    });

    expect(extractFormexPackage(zip).resources).toEqual([
      {
        fileName: "TEST.0002.tif",
        mediaType: "image/tiff",
        bytes: resource,
      },
    ]);
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
