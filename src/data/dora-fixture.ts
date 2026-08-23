import {
  documentLogicalId,
  provisionLogicalId,
  sourceVersionId,
} from "../canonical/ids";
import { CANONICAL_SCHEMA_VERSION } from "../canonical/schema";
import { sha256, validateCanonicalDocument } from "../canonical/validate";

const celex = "32022R2554";
const documentId = documentLogicalId(celex);
const sourceVersion = "fixture-0.1";
const sourceSnapshotId = "snapshot:fixture:dora:0.1";
const article1Id = provisionLogicalId(documentId, "article", "1");
const article2Id = provisionLogicalId(documentId, "article", "2");
const article1Text =
  "This temporary fixture proves the Reader contract and navigation flow. It is not a production legal-text source.";
const article2Text =
  "The EUR-Lex acquisition and Formex parser will provide the authoritative text and structure in a later implementation step.";

// This is deliberately non-authoritative sample content. It still obeys the
// production canonical contract so fixture-only shortcuts cannot leak into it.
export const doraCanonicalFixture = validateCanonicalDocument({
  schemaVersion: CANONICAL_SCHEMA_VERSION,
  logicalId: documentId,
  sourceVersionId: sourceVersionId(documentId, sourceVersion),
  sourceSnapshotId,
  displayOrder: 0,
  sourceLocator: { kind: "fixture", value: "dora-fixture" },
  parserWarnings: ["Temporary UI fixture; contains no official legal text."],
  jurisdiction: "EU",
  language: "en",
  documentType: "regulation",
  identifiers: {
    celex,
    eli: "https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng",
  },
  familyIds: ["family:dora"],
  shortName: "DORA",
  officialTitle:
    "Regulation (EU) 2022/2554 on digital operational resilience for the financial sector",
  publicationDate: "2022-12-27",
  source: {
    id: sourceSnapshotId,
    provenance: "fixture",
    sourceSystem: "fixture",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    canonicalUrl: "https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng",
    contentUrl: "https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng",
    mediaType: "text/plain",
    sha256: sha256(`${article1Text}\n${article2Text}`),
    bytes: Buffer.byteLength(`${article1Text}\n${article2Text}`),
    sourceVersion,
  },
  structuralNodes: [],
  provisions: [
    {
      logicalId: article1Id,
      sourceVersionId: sourceVersionId(article1Id, sourceVersion),
      sourceSnapshotId,
      displayOrder: 10,
      sourceLocator: { kind: "fixture", value: "article-1" },
      parserWarnings: [],
      kind: "article",
      numberRaw: "1",
      numberNormalized: "1",
      label: "Article 1",
      title: "Subject matter",
      text: "",
      contentHash: sha256(""),
      structuralPath: [],
    },
    {
      logicalId: provisionLogicalId(article1Id, "paragraph", "1"),
      sourceVersionId: sourceVersionId(
        provisionLogicalId(article1Id, "paragraph", "1"),
        sourceVersion,
      ),
      sourceSnapshotId,
      displayOrder: 11,
      sourceLocator: { kind: "fixture", value: "article-1-paragraph-1" },
      parserWarnings: [],
      kind: "paragraph",
      numberRaw: "1",
      numberNormalized: "1",
      label: "Paragraph 1",
      text: article1Text,
      contentHash: sha256(article1Text),
      parentLogicalId: article1Id,
      structuralPath: [],
    },
    {
      logicalId: article2Id,
      sourceVersionId: sourceVersionId(article2Id, sourceVersion),
      sourceSnapshotId,
      displayOrder: 20,
      sourceLocator: { kind: "fixture", value: "article-2" },
      parserWarnings: [],
      kind: "article",
      numberRaw: "2",
      numberNormalized: "2",
      label: "Article 2",
      title: "Scope",
      text: "",
      contentHash: sha256(""),
      structuralPath: [],
    },
    {
      logicalId: provisionLogicalId(article2Id, "paragraph", "1"),
      sourceVersionId: sourceVersionId(
        provisionLogicalId(article2Id, "paragraph", "1"),
        sourceVersion,
      ),
      sourceSnapshotId,
      displayOrder: 21,
      sourceLocator: { kind: "fixture", value: "article-2-paragraph-1" },
      parserWarnings: [],
      kind: "paragraph",
      numberRaw: "1",
      numberNormalized: "1",
      label: "Paragraph 1",
      text: article2Text,
      contentHash: sha256(article2Text),
      parentLogicalId: article2Id,
      structuralPath: [],
    },
  ],
});
