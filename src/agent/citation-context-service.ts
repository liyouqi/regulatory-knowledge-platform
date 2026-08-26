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

export const CITATION_CONTEXT_RETRIEVER = "stable-entity-id";
export const CITATION_CONTEXT_RETRIEVER_VERSION = "1.0.0";

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
): void {
  index.set(block.id, { document, provision, block });
  for (const child of block.children) {
    indexBlock(index, document, provision, child);
  }
}

function flattenBlocks(blocks: BodyBlock[]): BodyBlock[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);
}

export class CitationContextService {
  private readonly entities = new Map<string, ResolvedEntity>();

  constructor(
    private readonly repository: CitationContextRepository,
    documents = repository.listDocumentViews(),
  ) {
    for (const document of documents) {
      for (const provision of document.provisions) {
        this.entities.set(provision.id, { document, provision });
        for (const block of provision.blocks) {
          indexBlock(this.entities, document, provision, block);
        }
      }
    }
  }

  findByEntityId(entityId: string): CitationContext | null {
    const resolved = this.entities.get(entityId);
    if (!resolved) return null;
    const { document, provision, block } = resolved;
    const relationships = this.repository.findProvisionRelationships(
      document.id,
      provision.id,
    );
    const regulatoryContext = this.repository.findDocumentRegulatoryContext(
      document.id,
      provision.id,
    );
    if (!relationships || !regulatoryContext) return null;
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
    const segments = flattenBlocks(block ? [block] : provision.blocks);

    return citationContextSchema.parse({
      schemaVersion: "1.0.0",
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
      textSegments: segments.map((segment) => ({
        entityId: segment.id,
        kind: segment.kind,
        marker: segment.marker,
        text: segment.text,
        anchor: segment.anchor,
        sourceLocator: segment.sourceLocator,
      })),
      relationships,
      regulatoryContext,
    });
  }
}
