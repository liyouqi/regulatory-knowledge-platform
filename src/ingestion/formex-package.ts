import { unzipSync } from "fflate";

const MAX_FORMEX_XML_BYTES = 25 * 1024 * 1024;
const MAX_FORMEX_PACKAGE_XML_BYTES = 100 * 1024 * 1024;

export interface FormexXmlDocument {
  fileName: string;
  xml: string;
}

export interface ExtractedFormexPackage {
  act: FormexXmlDocument;
  annexes: FormexXmlDocument[];
}

function rootElement(xml: string): string | undefined {
  return /^\s*(?:<\?xml[\s\S]*?\?>\s*)?<([A-Z][A-Z0-9.]*)\b/u.exec(xml)?.[1];
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
    if (rootElement(xml) !== "ACT") {
      throw new Error("Single Formex XML source must contain an ACT root");
    }
    return { act: { fileName: singleXmlFileName, xml }, annexes: [] };
  }

  const files = unzipSync(sourceBytes, {
    filter: (file) => {
      if (file.originalSize > MAX_FORMEX_XML_BYTES) {
        throw new Error(`Formex XML exceeds safe size limit: ${file.name}`);
      }
      return file.name.endsWith(".xml");
    },
  });
  const totalBytes = Object.values(files).reduce(
    (total, bytes) => total + bytes.byteLength,
    0,
  );
  if (totalBytes > MAX_FORMEX_PACKAGE_XML_BYTES) {
    throw new Error(
      `Formex package XML exceeds ${MAX_FORMEX_PACKAGE_XML_BYTES} bytes`,
    );
  }
  const documents = Object.entries(files).map(([fileName, bytes]) => ({
    fileName,
    xml: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  }));
  const acts = documents.filter(({ xml }) => rootElement(xml) === "ACT");

  if (acts.length !== 1) {
    throw new Error(`Expected exactly one ACT XML file, found ${acts.length}`);
  }

  return {
    act: acts[0],
    annexes: documents
      .filter(({ xml }) => rootElement(xml) === "ANNEX")
      .sort((left, right) => left.fileName.localeCompare(right.fileName)),
  };
}
