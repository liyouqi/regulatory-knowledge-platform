import type { CitationContextService } from "../agent/citation-context-service";
import type { LawSearchRecord } from "../search/law-search";
import { searchLaws } from "../search/law-search";
import type {
  DocumentView,
  LawSearchResult,
  ProvisionRelationship,
  RelationshipEndpoint,
  TocNode,
} from "../shared/legal";
import {
  PUBLIC_API_CONTRACT_VERSION,
  PUBLIC_API_VERSION,
  type PublicApiDiscoveryResponse,
  type PublicApiErrorResponse,
  type PublicLawResolveFilters,
  type PublicLawResolveResponse,
  type PublicLawStructureResponse,
  type PublicProvisionRelationshipsResponse,
  type PublicProvisionResponse,
  type PublicStructureNode,
  type PublicTextBlock,
  publicApiDiscoveryResponseSchema,
  publicApiErrorResponseSchema,
  publicLawResolveFiltersSchema,
  publicLawResolveResponseSchema,
  publicLawStructureResponseSchema,
  publicProvisionRelationshipsResponseSchema,
  publicProvisionResponseSchema,
} from "../shared/public-api";

export interface PublicApiRepository {
  readonly buildId: string;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly profileDisplayName: string;
  readonly profileHash: string;
  listDocumentViews(): DocumentView[];
  findDocument(documentId: string): DocumentView | null;
}

export type PublicApiOperation<T> =
  | { ok: true; response: T }
  | {
      ok: false;
      status: 400 | 401 | 403 | 404 | 429 | 500 | 503;
      response: PublicApiErrorResponse;
    };

function documentReference(document: DocumentView) {
  if (document.provenance !== "official") {
    throw new Error(
      `Public API cannot publish fixture Document ${document.id}`,
    );
  }
  return {
    id: document.id,
    jurisdiction: document.jurisdiction,
    slug: document.slug,
    shortName: document.shortName,
    officialTitle: document.officialTitle,
    documentType: document.documentType,
    ...(document.language ? { language: document.language } : {}),
    celex: document.celex,
    localId: document.localId,
    sourceUrl: document.sourceUrl,
    ...(document.sourceStatus ? { sourceStatus: document.sourceStatus } : {}),
    asOf: document.asOf,
    ...(document.publicationDate !== undefined
      ? { publicationDate: document.publicationDate }
      : {}),
    ...(document.publicationDateBasis
      ? { publicationDateBasis: document.publicationDateBasis }
      : {}),
    provenance: document.provenance,
  };
}

function structureNode(node: TocNode): PublicStructureNode {
  return {
    id: node.id,
    kind: node.kind,
    label: node.label,
    title: node.title,
    range: node.range,
    provisionId: node.provisionId,
    children: node.children.map(structureNode),
  };
}

function textBlock(
  block: DocumentView["provisions"][number]["blocks"][number],
): PublicTextBlock {
  return {
    entityId: block.id,
    kind: block.kind,
    marker: block.marker,
    contentRole: block.contentRole,
    ...(block.contentLayout
      ? {
          contentLayout: block.contentLayout,
          orderedContent: block.orderedContent.filter(
            (entry): entry is Extract<typeof entry, { type: "text" }> =>
              entry.type === "text",
          ),
          sourceNotes: block.orderedContent.flatMap((entry, contentIndex) =>
            entry.type === "text" && entry.contentRole === "source-note"
              ? [
                  {
                    contentRole: "source-note" as const,
                    contentIndex,
                    text: entry.text,
                    sourceLocator: entry.sourceLocator ?? block.sourceLocator,
                  },
                ]
              : [],
          ),
        }
      : {}),
    text: block.text,
    sourceLocator: block.sourceLocator,
    children: block.children.map(textBlock),
  };
}

function publicRelationshipEndpoint(
  endpoint: RelationshipEndpoint,
  documentsById: Map<string, DocumentView>,
) {
  const document = documentsById.get(endpoint.documentId);
  if (!document) {
    throw new Error(
      `Public API relationship endpoint is outside the loaded Profile: ${endpoint.entityId}`,
    );
  }
  return {
    entityId: endpoint.entityId,
    documentId: endpoint.documentId,
    documentShortName: endpoint.documentShortName,
    provisionId: endpoint.provisionId,
    kind: endpoint.kind,
    label: endpoint.label,
    title: endpoint.title,
    officialUrl: document.sourceUrl,
  };
}

function publicRelationship(
  relationship: ProvisionRelationship,
  documentsById: Map<string, DocumentView>,
) {
  return {
    id: relationship.id,
    relationType: relationship.relationType,
    provenance: relationship.provenance,
    source: publicRelationshipEndpoint(relationship.source, documentsById),
    target: publicRelationshipEndpoint(relationship.target, documentsById),
    evidence: relationship.evidence,
    builder: relationship.builder,
    score: relationship.score,
    resolutionStatus: relationship.resolutionStatus,
  };
}

export class PublicApiService {
  private readonly documentsById: Map<string, DocumentView>;

  constructor(
    private readonly repository: PublicApiRepository,
    private readonly lawSearchRecords: LawSearchRecord[],
    private readonly citationContext: CitationContextService,
  ) {
    this.documentsById = new Map(
      repository.listDocumentViews().map((document) => [document.id, document]),
    );
  }

  private meta() {
    return {
      apiVersion: PUBLIC_API_VERSION,
      contractVersion: PUBLIC_API_CONTRACT_VERSION,
      profilePolicy: "deployment-fixed" as const,
      runtime: {
        buildId: this.repository.buildId,
        profileId: this.repository.profileId,
        profileVersion: this.repository.profileVersion,
        profileDisplayName: this.repository.profileDisplayName,
        profileHash: this.repository.profileHash,
      },
    };
  }

  private error(
    status: 400 | 401 | 403 | 404 | 429 | 500 | 503,
    code: PublicApiErrorResponse["error"]["code"],
    message: string,
    parameter?: string,
  ): PublicApiOperation<never> {
    return {
      ok: false,
      status,
      response: publicApiErrorResponseSchema.parse({
        meta: this.meta(),
        error: { code, message, parameter },
      }),
    };
  }

  private profileError(profileId?: string): PublicApiOperation<never> | null {
    if (profileId && profileId.length > 100) {
      return this.error(
        400,
        "INVALID_REQUEST",
        "Query parameter profileId exceeds 100 characters",
        "profileId",
      );
    }
    return profileId && profileId !== this.repository.profileId
      ? this.error(
          403,
          "PROFILE_NOT_AVAILABLE",
          `Profile ${profileId} is not available from this deployment`,
          "profileId",
        )
      : null;
  }

  internalError(): PublicApiOperation<never> {
    return this.error(
      500,
      "INTERNAL_ERROR",
      "The Public API could not complete the request",
    );
  }

  serviceNotConfigured(): PublicApiOperation<never> {
    return this.error(
      503,
      "SERVICE_NOT_CONFIGURED",
      "The Public API is not configured for authenticated access",
    );
  }

  authenticationRequired(): PublicApiOperation<never> {
    return this.error(
      401,
      "AUTHENTICATION_REQUIRED",
      "A valid Bearer API key is required",
    );
  }

  rateLimitExceeded(): PublicApiOperation<never> {
    return this.error(
      429,
      "RATE_LIMIT_EXCEEDED",
      "The Public API request limit was exceeded",
    );
  }

  discover(profileId?: string): PublicApiOperation<PublicApiDiscoveryResponse> {
    const profileError = this.profileError(profileId);
    if (profileError) return profileError;
    return {
      ok: true,
      response: publicApiDiscoveryResponseSchema.parse({
        meta: this.meta(),
        data: {
          name: "Regulatory Knowledge Platform Public API",
          status: "active",
          capabilities: [
            {
              id: "resolve-law",
              method: "GET",
              pathTemplate:
                "/api/v1/laws/resolve{?q,profileId,jurisdiction,documentType,regulatoryLevel,measureType}",
            },
            {
              id: "law-structure",
              method: "GET",
              pathTemplate: "/api/v1/laws/{documentId}/structure{?profileId}",
            },
            {
              id: "get-provision",
              method: "GET",
              pathTemplate: "/api/v1/provisions/{entityId}{?profileId}",
            },
            {
              id: "get-relationships",
              method: "GET",
              pathTemplate:
                "/api/v1/provisions/{entityId}/relationships{?profileId}",
            },
          ],
        },
      }),
    };
  }

  resolveLaw(
    query: string,
    profileId?: string,
    filterInput: unknown = {},
  ): PublicApiOperation<PublicLawResolveResponse> {
    const profileError = this.profileError(profileId);
    if (profileError) return profileError;
    const parsedFilters = publicLawResolveFiltersSchema.safeParse(filterInput);
    if (!parsedFilters.success) {
      const parameter = parsedFilters.error.issues[0]?.path[0];
      return this.error(
        400,
        "INVALID_REQUEST",
        "One or more resolve filters are invalid",
        typeof parameter === "string" ? parameter : "filters",
      );
    }
    const filters = Object.fromEntries(
      Object.entries(parsedFilters.data).filter(
        ([, value]) => value !== undefined,
      ),
    ) as PublicLawResolveFilters;
    if (!query.trim()) {
      return this.error(
        400,
        "INVALID_REQUEST",
        "Query parameter q is required",
        "q",
      );
    }
    if (query.length > 200) {
      return this.error(
        400,
        "INVALID_REQUEST",
        "Query parameter q exceeds 200 characters",
        "q",
      );
    }
    const filteredRecords = this.lawSearchRecords.filter((record) => {
      const document = this.documentsById.get(record.id);
      if (!document) {
        throw new Error(`Public API could not resolve Document ${record.id}`);
      }
      return (
        (!filters.jurisdiction ||
          document.jurisdiction === filters.jurisdiction) &&
        (!filters.documentType ||
          record.documentType === filters.documentType) &&
        (!filters.regulatoryLevel ||
          record.regulatoryLevel === filters.regulatoryLevel) &&
        (!filters.measureType || record.measureType === filters.measureType)
      );
    });
    const result = searchLaws(filteredRecords, query);
    const toPublicResult = (item: LawSearchResult) => {
      const document = this.documentsById.get(item.id);
      if (!document) {
        throw new Error(`Public API could not resolve Document ${item.id}`);
      }
      const target = item.target
        ? document.provisions.find(
            (provision) =>
              provision.kind === item.target?.kind &&
              provision.number === item.target.number &&
              provision.path === item.target.path,
          )
        : undefined;
      if (item.target && !target) {
        throw new Error(
          `Public API could not resolve provision target for ${item.id}`,
        );
      }
      return {
        document: documentReference(document),
        familyId: item.familyId,
        regulatoryLevel: item.regulatoryLevel,
        measureType: item.measureType,
        aliases: item.aliases,
        match: { reason: item.matchReason, score: item.score },
        target: target
          ? {
              entityId: target.id,
              kind: target.kind,
              number: target.number,
              label: target.label,
              title: target.title ?? null,
            }
          : null,
      };
    };
    const results = result.results.slice(0, 10).map(toPublicResult);
    return {
      ok: true,
      response: publicLawResolveResponseSchema.parse({
        meta: this.meta(),
        data: {
          query: result.query,
          normalizedQuery: result.normalizedQuery,
          filters,
          resultCount: results.length,
          bestMatch: results[0] ?? null,
          results,
        },
      }),
    };
  }

  getLawStructure(
    documentId: string,
    profileId?: string,
  ): PublicApiOperation<PublicLawStructureResponse> {
    const profileError = this.profileError(profileId);
    if (profileError) return profileError;
    if (!documentId || documentId.length > 180) {
      return this.error(
        400,
        "INVALID_REQUEST",
        "Path parameter documentId must contain 1 to 180 characters",
        "documentId",
      );
    }
    const document = this.repository.findDocument(documentId);
    if (!document) {
      return this.error(
        404,
        "LAW_NOT_FOUND",
        `Law ${documentId} was not found in the current Profile`,
        "documentId",
      );
    }
    return {
      ok: true,
      response: publicLawStructureResponseSchema.parse({
        meta: this.meta(),
        data: {
          document: {
            ...documentReference(document),
            sourceSnapshotId: document.sourceSnapshotId,
            sourceVersion: document.sourceVersion,
            lastChecked: document.lastChecked,
            canonicalBuildId: document.buildId,
          },
          ...(document.scopedSourceNotes
            ? { scopedSourceNotes: document.scopedSourceNotes }
            : {}),
          collections: document.collections.map((collection) => ({
            id: collection.id,
            label: collection.label,
            count: collection.count,
            roots: collection.roots.map(structureNode),
          })),
        },
      }),
    };
  }

  getProvision(
    entityId: string,
    profileId?: string,
  ): PublicApiOperation<PublicProvisionResponse> {
    const profileError = this.profileError(profileId);
    if (profileError) return profileError;
    if (!entityId || entityId.length > 260) {
      return this.error(
        400,
        "INVALID_REQUEST",
        "Path parameter entityId must contain 1 to 260 characters",
        "entityId",
      );
    }
    const context = this.citationContext.findByEntityId(entityId);
    if (!context || context.target.rootProvisionId !== entityId) {
      return this.error(
        404,
        "PROVISION_NOT_FOUND",
        `Provision ${entityId} was not found in the current Profile`,
        "entityId",
      );
    }
    const document = this.documentsById.get(context.document.id);
    const provision = document?.provisions.find(
      (candidate) => candidate.id === entityId,
    );
    if (!document || !provision) {
      throw new Error(`Public API provision index drift for ${entityId}`);
    }
    return {
      ok: true,
      response: publicProvisionResponseSchema.parse({
        meta: this.meta(),
        data: {
          document: documentReference(document),
          provision: {
            entityId: provision.id,
            kind: provision.kind,
            contentRole: provision.contentRole,
            collectionId: provision.collectionId,
            number: provision.number,
            label: provision.label,
            title: provision.title ?? null,
            breadcrumbs: provision.breadcrumbs,
            previousEntityId: provision.previousId ?? null,
            nextEntityId: provision.nextId ?? null,
            sourceLocator: provision.sourceLocator,
            officialSourceUrl: provision.officialSourceUrl,
            blocks: provision.blocks.map(textBlock),
          },
          source: {
            officialUrl: provision.officialSourceUrl ?? document.sourceUrl,
            sourceSnapshotId: document.sourceSnapshotId,
            sourceVersion: document.sourceVersion,
            asOf: document.asOf,
            lastChecked: document.lastChecked,
            canonicalBuildId: document.buildId,
          },
        },
      }),
    };
  }

  getProvisionRelationships(
    entityId: string,
    profileId?: string,
  ): PublicApiOperation<PublicProvisionRelationshipsResponse> {
    const profileError = this.profileError(profileId);
    if (profileError) return profileError;
    if (!entityId || entityId.length > 260) {
      return this.error(
        400,
        "INVALID_REQUEST",
        "Path parameter entityId must contain 1 to 260 characters",
        "entityId",
      );
    }
    const context = this.citationContext.findByEntityId(entityId);
    if (!context || context.target.rootProvisionId !== entityId) {
      return this.error(
        404,
        "PROVISION_NOT_FOUND",
        `Provision ${entityId} was not found in the current Profile`,
        "entityId",
      );
    }
    const relationships = context.relationships;
    const mapGroup = (group: ProvisionRelationship[]) =>
      group.map((relationship) =>
        publicRelationship(relationship, this.documentsById),
      );
    const groups = {
      references: mapGroup(relationships.references),
      citedBy: mapGroup(relationships.citedBy),
      mandates: mapGroup(relationships.mandates),
      adoptedUnder: mapGroup(relationships.adoptedUnder),
      supplements: mapGroup(relationships.supplements),
      implements: mapGroup(relationships.implements),
      relatedDocuments: mapGroup(relationships.relatedDocuments),
      relatedRecitals: mapGroup(relationships.relatedRecitals),
    };
    const relationshipCount = Object.values(groups).reduce(
      (total, group) => total + group.length,
      0,
    );
    return {
      ok: true,
      response: publicProvisionRelationshipsResponseSchema.parse({
        meta: this.meta(),
        data: {
          provision: {
            entityId,
            documentId: context.document.id,
            documentShortName: context.document.shortName,
            kind: context.target.kind,
            contentRole: context.target.contentRole,
            label: context.target.label,
            title: context.target.title,
          },
          relationshipCount,
          groups,
        },
      }),
    };
  }
}
