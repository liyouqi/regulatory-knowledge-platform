import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { toDocumentView } from "../canonical/to-document-view";
import { validateCanonicalDocument } from "../canonical/validate";
import { FORMEX_PARSER_VERSION } from "../canonical/versions";
import { type DocumentView, documentViewSchema } from "../shared/legal";
import { doraCanonicalFixture } from "./dora-fixture";

const DORA_CELEX = "32022R2554";

function officialCandidates(artifactRoot: string, celex: string) {
  const directory = resolve(artifactRoot, celex);
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.endsWith(`-parser-${FORMEX_PARSER_VERSION}`),
    )
    .map((entry) => resolve(directory, entry.name, "document.json"))
    .filter(existsSync)
    .map((path) =>
      validateCanonicalDocument(JSON.parse(readFileSync(path, "utf8"))),
    )
    .filter(
      (document) =>
        document.identifiers.celex === celex &&
        document.source.provenance === "official",
    )
    .sort((left, right) => {
      const retrievalOrder = right.source.retrievedAt.localeCompare(
        left.source.retrievedAt,
      );
      if (retrievalOrder !== 0) return retrievalOrder;
      return (right.source.sourceStatus?.checkedAt ?? "").localeCompare(
        left.source.sourceStatus?.checkedAt ?? "",
      );
    });
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
  return `canonical-${document.schemaVersion}-parser-${FORMEX_PARSER_VERSION}-${document.source.sha256.slice(7, 19)}${sourceStatusToken}`;
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
