import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { toDocumentView } from "../canonical/to-document-view";
import { validateCanonicalDocument } from "../canonical/validate";
import { FORMEX_PARSER_VERSION } from "../canonical/versions";
import { AMF_HTML_PARSER_VERSION } from "../ingestion/amf-canonical-parser";
import { CSSF_HTML_PARSER_VERSION } from "../ingestion/cssf-html-parser";
import { CSSF_PDF_PARSER_VERSION } from "../ingestion/cssf-pdf-parser";
import { EBA_GUIDELINES_PDF_PARSER_VERSION } from "../ingestion/eba-guidelines-pdf-parser";
import { NATIONAL_XML_PARSER_VERSION } from "../ingestion/national-xml-parser";
import { type DocumentView, documentViewSchema } from "../shared/legal";
import { doraCanonicalFixture } from "./dora-fixture";

const DORA_CELEX = "32022R2554";

function officialCandidates(artifactRoot: string, identifier: string) {
  const directory = resolve(artifactRoot, identifier);
  if (!existsSync(directory)) return [];

  const candidates = readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        (entry.name.endsWith(`-parser-${FORMEX_PARSER_VERSION}`) ||
          entry.name.endsWith(
            `-parser-cssf-html-${CSSF_HTML_PARSER_VERSION}`,
          ) ||
          entry.name.endsWith(`-parser-cssf-pdf-${CSSF_PDF_PARSER_VERSION}`) ||
          entry.name.endsWith(
            `-parser-eba-pdf-${EBA_GUIDELINES_PDF_PARSER_VERSION}`,
          ) ||
          entry.name.endsWith(
            `-parser-national-xml-${NATIONAL_XML_PARSER_VERSION}`,
          ) ||
          entry.name.endsWith(`-parser-amf-html-${AMF_HTML_PARSER_VERSION}`)),
    )
    .map((entry) => ({
      name: entry.name,
      path: resolve(directory, entry.name, "document.json"),
    }))
    .filter((candidate) => existsSync(candidate.path))
    .sort((left, right) => right.name.localeCompare(left.name));
  const latestRetrievalToken = candidates[0]?.name.match(/^\d{8}T\d{9}Z/u)?.[0];
  const latestCandidates = latestRetrievalToken
    ? candidates.filter((candidate) =>
        candidate.name.startsWith(latestRetrievalToken),
      )
    : candidates;

  return latestCandidates
    .map((candidate) =>
      validateCanonicalDocument(
        JSON.parse(readFileSync(candidate.path, "utf8")),
      ),
    )
    .filter(
      (document) =>
        (document.identifiers.celex === identifier ||
          document.identifiers.localId === identifier) &&
        document.source.provenance === "official",
    )
    .sort((left, right) => {
      const statusOrder = (
        right.source.sourceStatus?.checkedAt ?? ""
      ).localeCompare(left.source.sourceStatus?.checkedAt ?? "");
      if (statusOrder !== 0) return statusOrder;
      return right.source.sourceVersion.localeCompare(
        left.source.sourceVersion,
      );
    })
    .slice(0, 1);
}

function documentBuildId(
  document: ReturnType<typeof validateCanonicalDocument>,
): string {
  const sourceStatusToken = document.source.sourceStatus
    ? `-status-${createHash("sha256")
        .update(JSON.stringify(document.source.sourceStatus))
        .digest("hex")
        .slice(0, 12)}`
    : "";
  const parserToken =
    document.source.sourceSystem === "eba"
      ? `eba-pdf-${EBA_GUIDELINES_PDF_PARSER_VERSION}`
      : document.source.sourceSystem === "gii"
        ? `national-xml-${NATIONAL_XML_PARSER_VERSION}`
        : document.source.sourceVersion.startsWith("cssf-pdf-")
          ? `cssf-pdf-${CSSF_PDF_PARSER_VERSION}`
          : document.source.sourceSystem === "cssf"
            ? `cssf-html-${CSSF_HTML_PARSER_VERSION}`
            : document.source.sourceSystem === "amf"
              ? `amf-html-${AMF_HTML_PARSER_VERSION}`
              : FORMEX_PARSER_VERSION;
  return `canonical-${document.schemaVersion}-parser-${parserToken}-${document.source.sha256.slice(7, 19)}${sourceStatusToken}`;
}

export function loadDocumentViews(
  artifactRoot = resolve(process.cwd(), "data/artifacts/canonical"),
): DocumentView[] {
  const officialDocuments = existsSync(artifactRoot)
    ? readdirSync(artifactRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => officialCandidates(artifactRoot, entry.name)[0])
        .filter((document) => document !== undefined)
    : [];
  if (
    !officialDocuments.some(
      (document) => document.identifiers.celex === DORA_CELEX,
    )
  ) {
    officialDocuments.push(doraCanonicalFixture);
  }

  return officialDocuments
    .map((document) =>
      documentViewSchema.parse(
        toDocumentView(
          document,
          document.source.provenance === "official"
            ? documentBuildId(document)
            : "fixture-0.2",
        ),
      ),
    )
    .sort((left, right) => {
      if (left.id === `eu:${DORA_CELEX}`) return -1;
      if (right.id === `eu:${DORA_CELEX}`) return 1;
      return left.shortName.localeCompare(right.shortName);
    });
}

export function loadDoraDocumentView(
  artifactRoot = resolve(process.cwd(), "data/artifacts/canonical"),
): DocumentView {
  const document = loadDocumentViews(artifactRoot).find(
    (candidate) => candidate.id === `eu:${DORA_CELEX}`,
  );
  if (!document) throw new Error("DORA document is unavailable");
  return document;
}
