import { XMLParser } from "fast-xml-parser";
import { unzipSync } from "fflate";

const MAX_FORMEX_XML_BYTES = 25 * 1024 * 1024;
const MAX_FORMEX_PACKAGE_XML_BYTES = 100 * 1024 * 1024;
const MAX_FORMEX_RESOURCE_BYTES = 25 * 1024 * 1024;
const MAX_FORMEX_PACKAGE_RESOURCE_BYTES = 250 * 1024 * 1024;

export interface FormexXmlDocument {
  fileName: string;
  xml: string;
  quotedAnnex?: FormexXmlDocument;
}

export interface ExtractedFormexPackage {
  act: FormexXmlDocument;
  annexes: FormexXmlDocument[];
  resources: FormexResourceDocument[];
}

export interface FormexResourceDocument {
  fileName: string;
  mediaType: "image/tiff";
  bytes: Uint8Array;
}

function rootElement(xml: string): string | undefined {
  return /^\s*(?:<\?xml[\s\S]*?\?>\s*)?<([A-Z][A-Z0-9.]*)\b/u.exec(xml)?.[1];
}

type XmlNode = Record<string, unknown>;
const xmlParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: false,
  processEntities: false,
  trimValues: false,
});
function tag(node: XmlNode): string | undefined {
  return Object.keys(node).find(
    (key) => key !== ":@" && key !== "#text" && !key.startsWith("?"),
  );
}
function children(node: XmlNode): XmlNode[] {
  const name = tag(node);
  const value = name ? node[name] : undefined;
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}
function text(node: XmlNode): string {
  return "#text" in node
    ? String(node["#text"] ?? "")
    : children(node).map(text).join(" ");
}
function descendants(node: XmlNode, name: string): XmlNode[] {
  return children(node).flatMap((child) => [
    ...(tag(child) === name ? [child] : []),
    ...descendants(child, name),
  ]);
}
function wrapperInfo(
  document: FormexXmlDocument,
): { kind: "delegate" | "quoted"; target: string } | null {
  const parsed = xmlParser.parse(document.xml) as XmlNode[];
  const root = parsed.find((node) => tag(node) === "ANNEX");
  if (!root) throw new Error(`Invalid annex XML: ${document.fileName}`);
  const contents = children(root).find((node) => tag(node) === "CONTENTS");
  if (!contents) return null;
  const includes = descendants(contents, "INCL.ELEMENT").filter(
    (node) =>
      (node[":@"] as Record<string, unknown> | undefined)?.TYPE ===
      "FORMEX.DOC",
  );
  if (!includes.length) return null;
  if (includes.length !== 1)
    throw new Error(`Ambiguous annex inclusions: ${document.fileName}`);
  const target = (includes[0][":@"] as Record<string, unknown> | undefined)
    ?.FILEREF;
  if (typeof target !== "string" || !target)
    throw new Error(`Missing annex inclusion target: ${document.fileName}`);
  const title = children(root).find((node) => tag(node) === "TITLE");
  const ti = title && children(title).find((node) => tag(node) === "TI");
  const label = ti ? text(ti).replace(/\s+/gu, " ").trim() : "";
  const significant = (node: XmlNode): XmlNode[] => {
    const nodes = children(node);
    if (
      nodes.some(
        (child) => "#text" in child && String(child["#text"] ?? "").trim(),
      )
    ) {
      throw new Error(
        `Unsupported mixed annex inclusion: ${document.fileName}`,
      );
    }
    return nodes.filter((child) => tag(child));
  };
  const shape = (node: XmlNode, expected: string[]): XmlNode[] => {
    const nodes = significant(node);
    if (
      nodes.length !== expected.length ||
      nodes.some((child, index) => tag(child) !== expected[index])
    ) {
      throw new Error(
        `Unsupported annex inclusion order: ${document.fileName}`,
      );
    }
    return nodes;
  };
  const direct = significant(contents);
  const quoted = direct.length === 1 && tag(direct[0]) === "QUOT.S";
  if (quoted && /^ANNEX\s+(?:[IVXLCDM]+[A-Z]?|\d+[A-Z]?)$/iu.test(label)) {
    const [quote] = shape(contents, ["QUOT.S"]);
    const [paragraph] = shape(quote, ["P"]);
    const markers = shape(paragraph, [
      "QUOT.START",
      "INCL.ELEMENT",
      "QUOT.END",
    ]);
    if (markers.some((marker) => significant(marker).length))
      throw new Error(`Unexpected annex marker content: ${document.fileName}`);
    return { kind: "quoted", target };
  }
  if (!quoted && /^ANNEX$/iu.test(label)) {
    const [paragraph] = shape(contents, ["P"]);
    const [inclusion] = shape(paragraph, ["INCL.ELEMENT"]);
    if (significant(inclusion).length)
      throw new Error(
        `Unexpected annex inclusion content: ${document.fileName}`,
      );
    return { kind: "delegate", target };
  }
  throw new Error(`Unsupported annex wrapper: ${document.fileName}`);
}

export function extractFormexPackage(
  sourceBytes: Uint8Array,
  singleXmlFileName = "source.fmx4.xml",
): ExtractedFormexPackage {
  const sourcePrefix = new TextDecoder("utf-8").decode(
    sourceBytes.slice(0, 256),
  );
  if (sourcePrefix.trimStart().startsWith("<")) {
    if (sourceBytes.byteLength > MAX_FORMEX_XML_BYTES) {
      throw new Error(
        `Formex XML exceeds safe size limit: ${singleXmlFileName}`,
      );
    }
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
    if (!["ACT", "CONS.ACT"].includes(rootElement(xml) ?? "")) {
      throw new Error(
        "Single Formex XML source must contain an ACT or CONS.ACT root",
      );
    }
    return {
      act: { fileName: singleXmlFileName, xml },
      annexes: [],
      resources: [],
    };
  }

  const files = unzipSync(sourceBytes, {
    filter: (file) => {
      const isXml = file.name.endsWith(".xml");
      const isTiff = /\.tiff?$/iu.test(file.name);
      if (isXml && file.originalSize > MAX_FORMEX_XML_BYTES) {
        throw new Error(`Formex XML exceeds safe size limit: ${file.name}`);
      }
      if (isTiff && file.originalSize > MAX_FORMEX_RESOURCE_BYTES) {
        throw new Error(
          `Formex resource exceeds safe size limit: ${file.name}`,
        );
      }
      return isXml || isTiff;
    },
  });
  const xmlEntries = Object.entries(files).filter(([fileName]) =>
    fileName.endsWith(".xml"),
  );
  const resourceEntries = Object.entries(files).filter(([fileName]) =>
    /\.tiff?$/iu.test(fileName),
  );
  const totalBytes = xmlEntries.reduce(
    (total, [, bytes]) => total + bytes.byteLength,
    0,
  );
  if (totalBytes > MAX_FORMEX_PACKAGE_XML_BYTES) {
    throw new Error(
      `Formex package XML exceeds ${MAX_FORMEX_PACKAGE_XML_BYTES} bytes`,
    );
  }
  const totalResourceBytes = resourceEntries.reduce(
    (total, [, bytes]) => total + bytes.byteLength,
    0,
  );
  if (totalResourceBytes > MAX_FORMEX_PACKAGE_RESOURCE_BYTES) {
    throw new Error(
      `Formex package resources exceed ${MAX_FORMEX_PACKAGE_RESOURCE_BYTES} bytes`,
    );
  }
  const documents = xmlEntries.map(([fileName, bytes]) => ({
    fileName,
    xml: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  }));
  const acts = documents.filter(({ xml }) =>
    ["ACT", "CONS.ACT"].includes(rootElement(xml) ?? ""),
  );
  const annexes = documents.filter(({ xml }) => rootElement(xml) === "ANNEX");
  const annexByName = new Map(
    annexes.map((document) => [document.fileName, document]),
  );
  const references = new Map<
    string,
    { kind: "delegate" | "quoted"; target: string }
  >();
  for (const document of annexes) {
    const reference = wrapperInfo(document);
    if (reference) {
      if (!annexByName.has(reference.target))
        throw new Error(`Missing annex inclusion target: ${reference.target}`);
      references.set(document.fileName, reference);
    }
  }
  const referenced = new Set<string>();
  for (const [name, reference] of references) {
    if (references.has(reference.target))
      throw new Error(`Nested or cyclic annex inclusion: ${name}`);
    if (referenced.has(reference.target))
      throw new Error(`Annex referenced multiple times: ${reference.target}`);
    referenced.add(reference.target);
  }
  const selectedAnnexes = annexes.flatMap((document) => {
    const reference = references.get(document.fileName);
    if (reference?.kind === "quoted") {
      const quotedAnnex = annexByName.get(reference.target);
      if (!quotedAnnex)
        throw new Error(`Missing quoted annex: ${reference.target}`);
      return [{ ...document, quotedAnnex }];
    }
    if (reference?.kind === "delegate" || referenced.has(document.fileName)) {
      if (
        referenced.has(document.fileName) &&
        [...references.values()].some(
          (r) => r.target === document.fileName && r.kind === "delegate",
        )
      )
        return [document];
      return [];
    }
    return [document];
  });

  if (acts.length !== 1) {
    throw new Error(`Expected exactly one ACT XML file, found ${acts.length}`);
  }

  return {
    act: acts[0],
    annexes: selectedAnnexes.sort((left, right) =>
      left.fileName.localeCompare(right.fileName),
    ),
    resources: resourceEntries
      .map(([fileName, bytes]) => ({
        fileName,
        mediaType: "image/tiff" as const,
        bytes,
      }))
      .sort((left, right) => left.fileName.localeCompare(right.fileName)),
  };
}
