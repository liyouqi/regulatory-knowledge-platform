import type { BodyBlock, DocumentView, ProvisionView } from "../shared/legal";
import { explorerPath } from "../shared/reader-route";
import { type RelationshipRecord, relationshipId } from "./contract";

export const EXPLICIT_REFERENCE_BUILDER = "explicit-reference";
export const EXPLICIT_REFERENCE_BUILDER_VERSION = "1.0.0";

export type LegalEntityKind =
  | "document"
  | "article"
  | "recital"
  | "annex"
  | BodyBlock["kind"];

export interface LegalEntityRecord {
  id: string;
  documentId: string;
  parentEntityId: string | null;
  rootProvisionId: string | null;
  kind: LegalEntityKind;
  label: string;
  title: string | null;
  path: string;
}

export interface ExplicitRelationshipRecord extends RelationshipRecord {
  relationType: "REFERENCES";
  provenance: "LEGAL_TEXT";
  builderMethod: typeof EXPLICIT_REFERENCE_BUILDER;
  builderVersion: typeof EXPLICIT_REFERENCE_BUILDER_VERSION;
}

export interface ExplicitReferenceBuild {
  entities: LegalEntityRecord[];
  relationships: ExplicitRelationshipRecord[];
  unresolvedCount: number;
}

interface TextSource {
  document: DocumentView;
  entity: LegalEntityRecord;
  rootProvision: ProvisionView;
  text: string;
}

interface MatchSpan {
  start: number;
  end: number;
}

interface CandidateReference extends MatchSpan {
  targetEntityId?: string;
}

const CROSS_PROVISION_PATTERN =
  /\b(Article|Annex)\s+([0-9]+[a-z]?|[ivxlcdm]+)(?:\s*\([^)]{1,16}\))?(?:\s*,\s*point\s*\([^)]{1,16}\))?\s*,?\s+of\s+(Regulation|Directive)\s+\(EU\)\s*(No\s+)?([0-9]{1,4})\/([0-9]{1,4})/giu;
const CROSS_DOCUMENT_PATTERN =
  /\b(Regulation|Directive)\s+\(EU\)\s*(No\s+)?([0-9]{1,4})\/([0-9]{1,4})/giu;
const INTERNAL_PROVISION_PATTERN =
  /\b(Article|Annex)\s+([0-9]+[a-z]?|[ivxlcdm]+)(?:\s*\([^)]{1,16}\))?/giu;

function overlaps(span: MatchSpan, spans: MatchSpan[]): boolean {
  return spans.some(
    (reserved) => span.start < reserved.end && span.end > reserved.start,
  );
}

function celexForCitation(
  documentType: string,
  hasNo: boolean,
  first: string,
  second: string,
): string | null {
  const [year, number] = hasNo ? [second, first] : [first, second];
  if (!/^(?:19|20)[0-9]{2}$/u.test(year)) return null;
  const typeCode = documentType.toLowerCase() === "regulation" ? "R" : "L";
  return `3${year}${typeCode}${number.padStart(4, "0")}`;
}

function addBodyEntities(
  entities: LegalEntityRecord[],
  textSources: TextSource[],
  document: DocumentView,
  rootProvision: ProvisionView,
  blocks: BodyBlock[],
  parentEntityId: string,
) {
  for (const block of blocks) {
    const entity =
      block.id === rootProvision.id
        ? entities.find((candidate) => candidate.id === rootProvision.id)
        : {
            id: block.id,
            documentId: document.id,
            parentEntityId,
            rootProvisionId: rootProvision.id,
            kind: block.kind,
            label: block.marker ?? rootProvision.label,
            title: null,
            path: `${rootProvision.path}#${block.anchor}`,
          };
    if (!entity) throw new Error(`Missing root entity ${rootProvision.id}`);
    if (block.id !== rootProvision.id) entities.push(entity);
    if (block.text.trim()) {
      textSources.push({ document, entity, rootProvision, text: block.text });
    }
    addBodyEntities(
      entities,
      textSources,
      document,
      rootProvision,
      block.children,
      entity.id,
    );
  }
}

function buildEntities(documents: DocumentView[]) {
  const entities: LegalEntityRecord[] = [];
  const textSources: TextSource[] = [];
  for (const document of documents) {
    entities.push({
      id: document.id,
      documentId: document.id,
      parentEntityId: null,
      rootProvisionId: null,
      kind: "document",
      label: document.shortName,
      title: document.officialTitle,
      path: explorerPath(document.slug),
    });
    for (const provision of document.provisions) {
      entities.push({
        id: provision.id,
        documentId: document.id,
        parentEntityId: document.id,
        rootProvisionId: null,
        kind: provision.kind,
        label: provision.label,
        title: provision.title ?? null,
        path: provision.path,
      });
      addBodyEntities(
        entities,
        textSources,
        document,
        provision,
        provision.blocks,
        provision.id,
      );
    }
  }
  return { entities, textSources };
}

function candidatesForText(
  source: TextSource,
  documentsByCelex: Map<string, DocumentView>,
  provisionTargets: Map<string, string>,
): { candidates: CandidateReference[]; unresolvedCount: number } {
  const candidates: CandidateReference[] = [];
  const reserved: MatchSpan[] = [];
  let unresolvedCount = 0;

  for (const match of source.text.matchAll(CROSS_PROVISION_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    reserved.push({ start, end });
    const celex = celexForCitation(
      match[3] ?? "",
      Boolean(match[4]),
      match[5] ?? "",
      match[6] ?? "",
    );
    const document = celex ? documentsByCelex.get(celex) : undefined;
    const kind = match[1]?.toLowerCase() === "annex" ? "annex" : "article";
    const number = match[2]?.toLowerCase();
    const targetEntityId =
      document && number
        ? provisionTargets.get(`${document.id}:${kind}:${number}`)
        : undefined;
    if (targetEntityId) candidates.push({ start, end, targetEntityId });
    else unresolvedCount += 1;
  }

  for (const match of source.text.matchAll(CROSS_DOCUMENT_PATTERN)) {
    const span = { start: match.index, end: match.index + match[0].length };
    if (overlaps(span, reserved)) continue;
    reserved.push(span);
    const celex = celexForCitation(
      match[1] ?? "",
      Boolean(match[2]),
      match[3] ?? "",
      match[4] ?? "",
    );
    const target = celex ? documentsByCelex.get(celex) : undefined;
    if (target && target.id !== source.document.id) {
      candidates.push({ ...span, targetEntityId: target.id });
    } else if (!target) {
      unresolvedCount += 1;
    }
  }

  for (const match of source.text.matchAll(INTERNAL_PROVISION_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    const span = { start, end };
    if (overlaps(span, reserved)) continue;
    const suffix = source.text.slice(end, end + 100);
    if (
      /^\s*(?:,\s*points?\s*\([^)]{1,16}\))?\s*,?\s+of\s+(?:(?:that|the)\s+)?(?:Regulation|Directive)\b/iu.test(
        suffix,
      )
    ) {
      unresolvedCount += 1;
      continue;
    }
    const kind = match[1]?.toLowerCase() === "annex" ? "annex" : "article";
    const number = match[2]?.toLowerCase();
    const targetEntityId = number
      ? provisionTargets.get(`${source.document.id}:${kind}:${number}`)
      : undefined;
    if (targetEntityId && targetEntityId !== source.rootProvision.id) {
      candidates.push({ start, end, targetEntityId });
    } else if (!targetEntityId) {
      unresolvedCount += 1;
    }
  }

  return { candidates, unresolvedCount };
}

export function buildExplicitReferences(
  documents: DocumentView[],
): ExplicitReferenceBuild {
  const { entities, textSources } = buildEntities(documents);
  const documentsByCelex = new Map(
    documents.flatMap((document) =>
      document.celex ? [[document.celex, document] as const] : [],
    ),
  );
  const provisionTargets = new Map<string, string>();
  for (const document of documents) {
    for (const provision of document.provisions) {
      provisionTargets.set(
        `${document.id}:${provision.kind}:${provision.number.toLowerCase()}`,
        provision.id,
      );
    }
  }

  const relationships: ExplicitRelationshipRecord[] = [];
  let unresolvedCount = 0;
  for (const source of textSources) {
    const resolved = candidatesForText(
      source,
      documentsByCelex,
      provisionTargets,
    );
    unresolvedCount += resolved.unresolvedCount;
    const seenTargets = new Set<string>();
    for (const candidate of resolved.candidates) {
      if (
        !candidate.targetEntityId ||
        seenTargets.has(candidate.targetEntityId)
      ) {
        continue;
      }
      seenTargets.add(candidate.targetEntityId);
      const evidenceLocator = `${source.entity.id}:text:${candidate.start}-${candidate.end}`;
      relationships.push({
        id: relationshipId(
          source.entity.id,
          "REFERENCES",
          candidate.targetEntityId,
          "LEGAL_TEXT",
          evidenceLocator,
        ),
        sourceEntityId: source.entity.id,
        relationType: "REFERENCES",
        targetEntityId: candidate.targetEntityId,
        provenance: "LEGAL_TEXT",
        evidenceText: source.text.slice(candidate.start, candidate.end),
        evidenceLocator,
        sourceRef: source.document.sourceUrl,
        builderMethod: EXPLICIT_REFERENCE_BUILDER,
        builderVersion: EXPLICIT_REFERENCE_BUILDER_VERSION,
        resolutionStatus: "resolved",
      });
    }
  }

  relationships.sort((left, right) => left.id.localeCompare(right.id));
  return { entities, relationships, unresolvedCount };
}
