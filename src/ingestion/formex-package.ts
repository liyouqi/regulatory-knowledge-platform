import { unzipSync } from "fflate";

const MAX_FORMEX_XML_BYTES = 25 * 1024 * 1024;
const MAX_FORMEX_PACKAGE_XML_BYTES = 100 * 1024 * 1024;
const MAX_FORMEX_RESOURCE_BYTES = 25 * 1024 * 1024;
const MAX_FORMEX_PACKAGE_RESOURCE_BYTES = 250 * 1024 * 1024;

export interface FormexXmlDocument {
  fileName: string;
  xml: string;
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

function includedFormexDocuments(xml: string): string[] {
  return [...xml.matchAll(/<INCL\.ELEMENT\b([^>]*)\/?\s*>/gu)].flatMap(
    (match) => {
      const attributes = match[1] ?? "";
      if (!/\bTYPE=["']FORMEX\.DOC["']/u.test(attributes)) return [];
      const fileName = /\bFILEREF=["']([^"']+)["']/u.exec(attributes)?.[1];
      return fileName ? [fileName] : [];
    },
  );
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
  const acts = documents.filter(({ xml }) => rootElement(xml) === "ACT");
  const annexes = documents.filter(({ xml }) => rootElement(xml) === "ANNEX");
  const annexFileNames = new Set(annexes.map(({ fileName }) => fileName));

  if (acts.length !== 1) {
    throw new Error(`Expected exactly one ACT XML file, found ${acts.length}`);
  }

  return {
    act: acts[0],
    annexes: annexes
      .filter(
        ({ xml }) =>
          !includedFormexDocuments(xml).some((fileName) =>
            annexFileNames.has(fileName),
          ),
      )
      .sort((left, right) => left.fileName.localeCompare(right.fileName)),
    resources: resourceEntries
      .map(([fileName, bytes]) => ({
        fileName,
        mediaType: "image/tiff" as const,
        bytes,
      }))
      .sort((left, right) => left.fileName.localeCompare(right.fileName)),
  };
}
