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

  it("preserves a numbered quoted outer annex and binds its nested source", () => {
    const outer =
      '<ANNEX><TITLE><TI><P>ANNEX II</P></TI></TITLE><CONTENTS><QUOT.S><P><QUOT.START/><INCL.ELEMENT FILEREF="leaf.xml" TYPE="FORMEX.DOC"/><QUOT.END/></P></QUOT.S></CONTENTS></ANNEX>';
    const leaf =
      "<ANNEX><TITLE><TI><P>ANNEX V</P></TI></TITLE><CONTENTS><P>Quoted legal text.</P></CONTENTS></ANNEX>";
    const result = extractFormexPackage(
      zipSync({
        "act.xml": strToU8("<ACT/>"),
        "outer.xml": strToU8(outer),
        "leaf.xml": strToU8(leaf),
      }),
    );
    expect(result.annexes).toEqual([
      {
        fileName: "outer.xml",
        xml: outer,
        quotedAnnex: { fileName: "leaf.xml", xml: leaf },
      },
    ]);
  });

  it.each([
    "mixed",
    "missing",
    "multiple",
    "cycle",
    "shared",
    "unbalanced",
    "reversed",
    "outside",
  ])("rejects unsafe annex inclusion: %s", (shape) => {
    const include = (target: string) =>
      `<INCL.ELEMENT FILEREF="${target}" TYPE="FORMEX.DOC"/>`;
    const wrapper = (body: string) =>
      `<ANNEX><TITLE><TI><P>ANNEX</P></TI></TITLE><CONTENTS>${body}</CONTENTS></ANNEX>`;
    const leaf =
      "<ANNEX><TITLE><TI><P>ANNEX I</P></TI></TITLE><CONTENTS><P>Legal text.</P></CONTENTS></ANNEX>";
    const body =
      shape === "mixed"
        ? `<P>Keep this legal text.${include("leaf.xml")}</P>`
        : shape === "multiple"
          ? `<P>${include("leaf.xml")}${include("other.xml")}</P>`
          : shape === "reversed"
            ? `<QUOT.S><P><QUOT.END/>${include("leaf.xml")}<QUOT.START/></P></QUOT.S>`
            : shape === "outside"
              ? `<QUOT.S><P>${include("leaf.xml")}<QUOT.START/><QUOT.END/></P></QUOT.S>`
              : shape === "unbalanced"
                ? `<QUOT.S><P><QUOT.START/>${include("leaf.xml")}</P></QUOT.S>`
                : `<P>${include(shape === "missing" ? "absent.xml" : "leaf.xml")}</P>`;
    const files: Record<string, Uint8Array> = {
      "act.xml": strToU8("<ACT/>"),
      "outer.xml": strToU8(
        ["unbalanced", "reversed", "outside"].includes(shape)
          ? wrapper(body).replace("ANNEX</P>", "ANNEX II</P>")
          : wrapper(body),
      ),
      "leaf.xml": strToU8(
        shape === "cycle" ? wrapper(`<P>${include("outer.xml")}</P>`) : leaf,
      ),
      "other.xml": strToU8(leaf),
    };
    if (shape === "shared")
      files["second.xml"] = strToU8(wrapper(`<P>${include("leaf.xml")}</P>`));
    expect(() => extractFormexPackage(zipSync(files))).toThrow();
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
