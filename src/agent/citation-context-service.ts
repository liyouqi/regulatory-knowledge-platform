import {
  type CitationContext,
  citationContextSchema,
} from "../shared/citation-context";
import type {
  BodyBlock,
  DocumentView,
  ProvisionRelationshipsResponse,
  ProvisionView,
} from "../shared/legal";
import type { DocumentRegulatoryContext } from "../shared/regulatory-context";
import { projectCitationText } from "./citation-text-projection";

export const CITATION_CONTEXT_RETRIEVER = "stable-entity-id";
export const CITATION_CONTEXT_RETRIEVER_VERSION = "1.1.0";

export interface CitationContextRepository {
  readonly buildId: string;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly profileHash: string;
  listDocumentViews(): DocumentView[];
  findProvisionRelationships(
    documentId: string,
    provisionId: string,
  ): ProvisionRelationshipsResponse | null;
  findDocumentRegulatoryContext(
    documentId: string,
    provisionId?: string,
  ): DocumentRegulatoryContext | null;
}

type ResolvedEntity = {
  document: DocumentView;
  provision: ProvisionView;
  block?: BodyBlock;
};

function indexBlock(
  index: Map<string, ResolvedEntity>,
  document: DocumentView,
  provision: ProvisionView,
  block: BodyBlock,
  seenBlocks: Set<string>,
  topLevel: boolean,
): void {
  if (seenBlocks.has(block.id))
    throw new Error(`Duplicate or cyclic citation block: ${block.id}`);
  seenBlocks.add(block.id);
  if (block.id === provision.id) {
    if (
      !topLevel ||
      provision.blocks.length !== 1 ||
      block.children.length !== 0
    ) {
      throw new Error(`Invalid citation provision self block: ${block.id}`);
    }
  } else {
    if (index.has(block.id))
      throw new Error(`Duplicate citation entity: ${block.id}`);
    index.set(block.id, { document, provision, block });
  }
  for (const child of block.children) {
    indexBlock(index, document, provision, child, seenBlocks, false);
  }
}

export class CitationContextService {
  private readonly entities = new Map<string, ResolvedEntity>();

  constructor(
    private readonly repository: CitationContextRepository,
    documents = repository.listDocumentViews(),
  ) {
    const documentIds = new Set(documents.map((document) => document.id));
    if (documentIds.size !== documents.length)
      throw new Error("Duplicate citation document ID");
    for (const document of documents) {
      for (const provision of document.provisions) {
        if (this.entities.has(provision.id))
          throw new Error(`Duplicate citation entity: ${provision.id}`);
        this.entities.set(provision.id, { document, provision });
        const seenBlocks = new Set<string>();
        for (const block of provision.blocks) {
          indexBlock(
            this.entities,
            document,
            provision,
            block,
            seenBlocks,
            true,
          );
        }
      }
    }
    for (const id of documentIds) {
      if (this.entities.has(id))
        throw new Error(`Citation entity collides with document: ${id}`);
    }
  }

  get runtimeIdentity() {
    return {
      buildId: this.repository.buildId,
      profileId: this.repository.profileId,
      profileVersion: this.repository.profileVersion,
      profileHash: this.repository.profileHash,
    };
  }

  findByEntityId(entityId: string): CitationContext | null {
    const resolved = this.entities.get(entityId);
    if (!resolved) return null;
    const { document, provision, block } = resolved;
    const role = block?.contentRole ?? provision.contentRole;
    if (role && role !== "operative-text") return null;
    const relationships = this.repository.findProvisionRelationships(
      document.id,
      provision.id,
    );
    const regulatoryContext = this.repository.findDocumentRegulatoryContext(
      document.id,
      provision.id,
    );
    if (!relationships || !regulatoryContext) {
      throw new Error(
        `Citation context missing for loaded entity: ${entityId}`,
      );
    }
    if (
      relationships.buildId !== this.repository.buildId ||
      regulatoryContext.buildId !== this.repository.buildId ||
      regulatoryContext.profileId !== this.repository.profileId
    ) {
      throw new Error("Citation context services have inconsistent identities");
    }

    const targetPath = block
      ? `${provision.path}#${block.anchor}`
      : provision.path;
    const sourceLocator = block?.sourceLocator ?? provision.sourceLocator;
    const projection = projectCitationText(block ? [block] : provision.blocks);

    return citationContextSchema.parse({
      schemaVersion: "1.1.0",
      runtime: {
        buildId: this.repository.buildId,
        profileId: this.repository.profileId,
        profileVersion: this.repository.profileVersion,
        profileHash: this.repository.profileHash,
      },
      retrieval: {
        method: CITATION_CONTEXT_RETRIEVER,
        version: CITATION_CONTEXT_RETRIEVER_VERSION,
        requestedEntityId: entityId,
        resolvedEntityId: entityId,
        matchType: "exact",
        rank: 1,
        score: 1,
        relationshipScope: "root-provision",
      },
      document: {
        id: document.id,
        jurisdiction: document.jurisdiction,
        ...(document.language ? { language: document.language } : {}),
        shortName: document.shortName,
        officialTitle: document.officialTitle,
        documentType: document.documentType,
        celex: document.celex,
        localId: document.localId,
        sourceUrl: document.sourceUrl,
        sourceSnapshotId: document.sourceSnapshotId,
        sourceVersion: document.sourceVersion,
        asOf: document.asOf,
        lastChecked: document.lastChecked,
        canonicalBuildId: document.buildId,
        sourceStatus: document.sourceStatus,
      },
      target: {
        entityId,
        rootProvisionId: provision.id,
        ...(role ? { contentRole: role } : {}),
        kind: block?.kind ?? provision.kind,
        label: block?.marker ?? provision.label,
        title: block ? null : (provision.title ?? null),
        path: targetPath,
        sourceLocator,
        provision: {
          id: provision.id,
          collectionId: provision.collectionId,
          number: provision.number,
          label: provision.label,
          title: provision.title ?? null,
          path: provision.path,
        },
      },
      ...projection,
      relationships,
      regulatoryContext,
    });
  }
}
