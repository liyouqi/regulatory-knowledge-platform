import { createHash } from "node:crypto";
import { validateCanonicalDocument } from "../canonical/validate";
import {
  type ContentRole,
  type ContentUnit,
  contentUnitsText,
} from "../shared/content-unit";
import {
  type AmfCandidateContent,
  inspectAmfCandidate,
} from "./amf-candidate-parser";
import type { AmfSourceSnapshot } from "./amf-snapshot";
import type { AmfSourceDefinition } from "./amf-source-registry";

export const AMF_HTML_PARSER_VERSION = "1.0.1";
const hash = (value: string | Uint8Array) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
type Element = Extract<AmfCandidateContent, { type: "element" }>;
const cls = (n: Element, c: string) =>
  (n.attributes.class ?? "").split(/\s/u).includes(c);
const locator = (value: string) => ({ kind: "xpath" as const, value });
const id = (kind: "article" | "structure", url: string) =>
  `fr:amf:rg:${kind}:${hash(url).slice(7)}`;
const children = (node: Element): Element[] =>
  node.children.filter((n): n is Element => n.type === "element");

function units(
  node: AmfCandidateContent,
  role: ContentRole,
  parentLocator: string,
  textIndex: number,
): ContentUnit {
  if (node.type === "text")
    return {
      type: "text",
      text: node.text,
      contentRole: role,
      sourceLocator: locator(`${parentLocator}/text()[${textIndex}]`),
    };
  const names = {
    div: "group",
    span: "group",
    p: "paragraph",
    i: "emphasis",
    a: "link",
    sup: "superscript",
    ol: "list",
    ul: "list",
    li: "list-item",
  } as const;
  const name = names[node.tag as keyof typeof names];
  if (!name) throw new Error(`Unsupported AMF content element: ${node.tag}`);
  let textCount = 0;
  const result: ContentUnit = {
    type: "element",
    name,
    sourceName: node.tag,
    sourceAttributes: node.attributes,
    contentRole: role,
    sourceLocator: locator(node.locator),
    children: node.children.map((child) =>
      units(child, role, node.locator, child.type === "text" ? ++textCount : 0),
    ),
    ...(node.tag === "a"
      ? {
          href: new URL(node.attributes.href, "https://www.amf-france.org")
            .href,
        }
      : {}),
    ...(node.tag === "ol" || node.tag === "ul"
      ? {
          listStyle:
            node.tag === "ol" ? ("ordered" as const) : ("unordered" as const),
        }
      : {}),
  };
  return result;
}

export function parseAmfHtml(
  bytes: Uint8Array,
  snapshot: AmfSourceSnapshot,
  source: AmfSourceDefinition,
) {
  const candidate = inspectAmfCandidate(bytes);
  const b = candidate.baseline;
  const q = source.quality;
  if (
    hash(bytes) !== snapshot.content.sha256 ||
    b.input.sha256 !== q.inputSha256 ||
    candidate.legalContentAstHash !== q.astSha256 ||
    hash(JSON.stringify(b)) !== q.baselineSha256 ||
    b.source.canonicalUrl !== source.versionUrl ||
    b.source.title !== source.officialTitle
  )
    throw new Error("AMF canonical input differs from reviewed candidate");
  const noteHash = (
    owner: string,
    position: number,
    orderedUnits: ContentUnit[],
  ) => {
    const expected = b.notes.find(
      (note) =>
        note.scope !== "article" &&
        note.ownerSourceUrl === owner &&
        note.position === position,
    );
    const actual = hash(contentUnitsText(orderedUnits, "source-note"));
    if (!expected || expected.textSha256 !== actual)
      throw new Error("AMF scoped note differs from reviewed candidate");
    return actual;
  };
  const version = source.sourceVersionDate;
  const entity = (logicalId: string, order: number, xpath: string) => ({
    logicalId,
    sourceVersionId: `${logicalId}@${version}`,
    sourceSnapshotId: snapshot.snapshotId,
    displayOrder: order,
    sourceLocator: locator(xpath),
    parserWarnings: [] as string[],
  });
  const groups = new Map(b.groups.map((g) => [g.sourceUrl, g]));
  const articles = new Map(b.articles.map((a) => [a.sourceUrl, a]));
  const structuralNodes: Array<Record<string, unknown>> = [];
  const provisions: Array<Record<string, unknown>> = [];
  const scopedSourceNotes: Array<Record<string, unknown>> = [];
  const groupKinds = {
    livre: "part",
    titre: "title",
    chapitre: "chapter",
    section: "section",
    "sous-section": "subsection",
    paragraphe: "division",
    "sous-paragraphe": "division",
  } as const;
  let displayOrder = 0;
  const visit = (
    node: Element,
    parentUrl: string | null,
    path: Array<{
      logicalId: string;
      kind: (typeof groupKinds)[keyof typeof groupKinds];
      label: string;
    }>,
  ) => {
    if (cls(node, "rg-part")) {
      const url = new URL(
        node.attributes["data-eli-content"],
        "https://www.amf-france.org",
      ).href;
      const g = groups.get(url);
      if (!g || g.parentSourceUrl !== parentUrl)
        throw new Error("AMF group hierarchy mismatch");
      const logicalId = id("structure", url);
      const segment = url.split("/").at(-3) as keyof typeof groupKinds;
      const kind = groupKinds[segment];
      if (!kind) throw new Error(`Unknown AMF group kind: ${segment}`);
      structuralNodes.push({
        ...entity(logicalId, displayOrder++, node.locator),
        kind,
        label: g.label,
        officialSourceUrl: url,
        ...(parentUrl ? { parentLogicalId: id("structure", parentUrl) } : {}),
      });
      const next = [...path, { logicalId, kind, label: g.label }];
      children(node).forEach((child, position) => {
        if (cls(child, "note-amf"))
          scopedSourceNotes.push({
            scope: "structure",
            ownerId: logicalId,
            ownerSourceUrl: url,
            position,
            sourceLocator: locator(child.locator),
            orderedUnits: [units(child, "source-note", child.locator, 0)],
            contentHash: noteHash(url, position, [
              units(child, "source-note", child.locator, 0),
            ]),
          });
        else if (cls(child, "rg-part") || cls(child, "art"))
          visit(child, url, next);
      });
    } else if (cls(node, "art")) {
      const title = children(node).find((n) => cls(n, "art-titre"));
      const anchor = title && children(title)[0];
      if (!anchor?.attributes.href)
        throw new Error("Missing AMF article identity");
      const url = new URL(anchor.attributes.href, "https://www.amf-france.org")
        .href;
      const a = articles.get(url);
      if (!a || a.groupSourceUrl !== parentUrl)
        throw new Error("AMF article hierarchy mismatch");
      let textIndex = 0;
      const orderedUnits = node.children
        .filter((n) => n !== title)
        .map((n) =>
          units(
            n,
            n.type === "element" && cls(n, "note-amf")
              ? "source-note"
              : "operative-text",
            node.locator,
            n.type === "text" ? ++textIndex : 0,
          ),
        );
      const text = contentUnitsText(orderedUnits, "operative-text");
      if (hash(text) !== a.contentSha256)
        throw new Error(`AMF article text mismatch: ${url}`);
      provisions.push({
        ...entity(id("article", url), displayOrder++, node.locator),
        kind: "article",
        numberRaw: a.label.replace(/^Article /u, ""),
        numberNormalized: a.label
          .replace(/^Article /u, "")
          .normalize("NFC")
          .trim()
          .replace(/\s+/gu, "-")
          .toLowerCase(),
        label: a.label,
        officialSourceUrl: url,
        rawHref: a.rawHref,
        parentLogicalId: id("structure", a.groupSourceUrl),
        structuralPath: path,
        text,
        contentHash: hash(text),
        contentRole: "operative-text",
        orderedUnits,
        roleHashes: Object.fromEntries(
          (["operative-text", "source-note", "toc"] as const).map((role) => [
            role,
            hash(contentUnitsText(orderedUnits, role)),
          ]),
        ),
      });
    }
  };
  const title = candidate.legalContentAst.find(
    (n): n is Element => n.type === "element" && n.tag === "h1",
  );
  const root = candidate.legalContentAst.find(
    (n): n is Element => n.type === "element" && cls(n, "rg-content"),
  );
  if (!title || !root) throw new Error("AMF candidate missing legal root");
  for (const node of candidate.legalContentAst)
    if (node.type === "element" && cls(node, "note-amf")) {
      const note = b.notes.find((n) => n.scope === "document");
      if (!note) throw new Error("Missing document note");
      scopedSourceNotes.push({
        scope: "document",
        ownerId: source.documentId,
        ownerSourceUrl: source.versionUrl,
        position: note.position,
        sourceLocator: locator(node.locator),
        orderedUnits: [units(node, "source-note", node.locator, 0)],
        contentHash: noteHash(source.versionUrl, note.position, [
          units(node, "source-note", node.locator, 0),
        ]),
      });
    }
  for (const group of children(root)) visit(group, null, []);
  if (
    structuralNodes.length !== q.groups ||
    provisions.length !== q.articles ||
    scopedSourceNotes.length !== q.documentNotes + q.groupNotes
  )
    throw new Error("AMF canonical coverage mismatch");
  const document = validateCanonicalDocument({
    ...entity(source.documentId, 0, title.locator),
    schemaVersion: "1.5.0",
    jurisdiction: "FR",
    language: "fr",
    documentType: "regulation",
    identifiers: { localId: source.localId, eli: source.contentUrl },
    familyIds: [source.familyId],
    shortName: source.shortName,
    officialTitle: source.officialTitle,
    publicationDate: null,
    publicationDateBasis: "aggregate-with-multiple-component-publications",
    source: {
      id: snapshot.snapshotId,
      provenance: "official",
      sourceSystem: "amf",
      retrievedAt: null,
      importedAt: snapshot.importedAt,
      capturedOn: snapshot.capturedOn,
      captureDateBasis: snapshot.captureDateBasis,
      retrievalTimestampBasis: snapshot.retrievalTimestampBasis,
      canonicalUrl: snapshot.canonicalUrl,
      contentUrl: snapshot.contentUrl,
      mediaType: "text/html",
      sha256: snapshot.content.sha256,
      bytes: snapshot.content.bytes,
      sourceVersion: version,
      sourceStatus: {
        basis: "consolidated",
        checkedAt: source.checkedAt,
        textAsOf: version,
        currentVersionUrl: source.contentUrl,
        authorityNote:
          "Editorial source status: the publisher version date identifies this consolidation; it does not establish currency, applicability, or entry into force.",
        sourceNotes: [
          "Editorial source status: the aggregate publication date is unknown because component Books have different publication dates.",
          ...source.componentPublications.map(
            (item) =>
              `Editorial publication evidence: ${item.component}, ${item.date}, ${item.url}`,
          ),
          `Editorial capture evidence: ${snapshot.capturedOn} is derived from the archived probe directory; the retrieval time was not recorded and remains unknown.`,
        ],
        corrections: [],
        textAuthorityStatus: "publisher-consolidation",
        textAsOfBasis: "publisher-version-date",
      },
    },
    structuralNodes,
    provisions,
    scopedSourceNotes,
  });
  return {
    document,
    report: {
      warningCount: 0,
      groups: structuralNodes.length,
      articles: provisions.length,
      scopedNotes: scopedSourceNotes.length,
      parserVersion: AMF_HTML_PARSER_VERSION,
    },
  };
}
