import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { EARTH_READING_SCHEMA_VERSION } from "../contract/article-reading";
import {
  type EarthNode,
  earthMeasureTypeSchema,
  earthOfficialProvenanceSchema,
  earthRelationshipTypeSchema,
} from "../contract/earth-contract";
import { readArticleReading } from "./article-reading-query";

export const DEFAULT_EARTH_ARTIFACT_PATH = "data/artifacts/earth/earth.sqlite";

export const EARTH_CHILDREN_LIMIT_MAX = 100;
export const EARTH_BOUNDARY_LIMIT_DEFAULT = 100;
export const EARTH_BOUNDARY_LIMIT_MAX = 200;
export const EARTH_NEIGHBOURHOOD_DEPTH_MAX = 3;
export const EARTH_NEIGHBOURHOOD_NODES_MAX = 200;
export const EARTH_NEIGHBOURHOOD_EDGES_MAX = 300;

type DatabaseValue = string | number | null;

interface NodeRow {
  id: string;
  work_id: string | null;
  boundary_work_id: string | null;
  parent_id: string | null;
  entity_kind: string;
  logical_id: string;
  label: string;
  title: string | null;
  text: string | null;
  content_hash: string | null;
  source_locator: string | null;
  display_order: number;
  celex: string | null;
  work_uri: string | null;
  expression_uri: string | null;
  manifestation_uri: string | null;
  official_title: string | null;
  measure_type: string | null;
}

interface RelationshipRow {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation_type: string;
  provenance: string;
  evidence_text: string;
  evidence_locator: string;
  evidence_source_url: string;
}

export interface EarthManifest {
  schemaVersion: string;
  buildId: string;
  builtAt: string;
  compilerVersion: string;
  universe: {
    id: string;
    version: string;
    displayName: string;
  };
  sourceSnapshotIds: string[];
  [key: string]: unknown;
}

export interface EarthOverview {
  universe: EarthManifest["universe"];
  build: Omit<EarthManifest, "universe">;
  works: EarthNode[];
  relationshipCount: number;
  aggregates: Array<{
    id: string;
    source: string;
    target: string;
    relationTypes: string[];
    provenances: string[];
    relationshipIds: string[];
    count: number;
  }>;
  boundary: {
    nodes: EarthNode[];
    nodeCount: number;
    matchCount: number;
    returnedCount: number;
    relationshipCount: number;
    visibleRelationshipCount: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface EarthOverviewOptions {
  boundaryLimit?: number;
  boundaryOffset?: number;
  boundaryQuery?: string;
}

const nodeSelect = `SELECT n.*,
  COALESCE(w.celex, boundary.celex) AS celex,
  COALESCE(w.work_uri, boundary.work_uri) AS work_uri,
  w.expression_uri,
  w.manifestation_uri,
  COALESCE(w.official_title, boundary.official_title) AS official_title,
  w.measure_type
  FROM nodes n
  LEFT JOIN works w ON w.id = n.work_id
  LEFT JOIN boundary_works boundary ON boundary.id = n.boundary_work_id`;

export interface EarthNeighbourhoodOptions {
  depth: number;
  nodeLimit: number;
  edgeLimit: number;
  direction: "in" | "out" | "both";
  relationTypes?: string[];
}

function manifestString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function parseManifest(raw: string): EarthManifest {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Earth artifact manifest must be an object");
  }
  const manifest = value as Record<string, unknown>;
  const universeValue = manifest.universe;
  const universe =
    universeValue &&
    typeof universeValue === "object" &&
    !Array.isArray(universeValue)
      ? (universeValue as Record<string, unknown>)
      : manifest;
  const sourceSnapshotIds = Array.isArray(manifest.sourceSnapshotIds)
    ? manifest.sourceSnapshotIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  const required = [
    "schemaVersion",
    "buildId",
    "builtAt",
    "universeId",
    "universeVersion",
    "compilerVersion",
  ];
  for (const key of required) {
    if (typeof manifest[key] !== "string" || manifest[key].length === 0) {
      throw new Error(`Earth artifact manifest is missing ${key}`);
    }
  }
  if (!Array.isArray(manifest.sourceSnapshotIds)) {
    throw new Error("Earth artifact manifest is missing sourceSnapshotIds");
  }
  return {
    ...manifest,
    schemaVersion: manifestString(manifest.schemaVersion, "unknown"),
    buildId: manifestString(manifest.buildId, "unknown"),
    builtAt: manifestString(manifest.builtAt, "unknown"),
    compilerVersion: manifestString(manifest.compilerVersion, "unknown"),
    universe: {
      id: manifestString(manifest.universeId ?? universe.id, "unknown"),
      version: manifestString(
        manifest.universeVersion ?? universe.version,
        "unknown",
      ),
      displayName: manifestString(
        universe.displayName ?? manifest.universeDisplayName ?? universe.id,
        manifestString(manifest.universeId, "Earth"),
      ),
    },
    sourceSnapshotIds,
  };
}

function asNode(row: NodeRow): EarthNode {
  if (row.entity_kind === "external-work") {
    if (!row.work_uri)
      throw new Error(`Boundary node ${row.id} has no official Work URI`);
    return {
      id: row.id,
      membership: "boundary",
      entityKind: "external-work",
      label: row.label,
      ...(row.title ? { title: row.title } : {}),
      officialIdentity: {
        ...(row.celex ? { celex: row.celex } : {}),
        workUri: row.work_uri,
        ...(row.expression_uri ? { expressionUri: row.expression_uri } : {}),
      },
      sourceUrl: row.work_uri,
    };
  }
  if (!row.work_id || !row.work_uri) {
    throw new Error(`Included Earth node ${row.id} has no Work identity`);
  }
  if (row.entity_kind === "document") {
    if (!row.measure_type) {
      throw new Error(`Work node ${row.id} has no reviewed measure type`);
    }
    return {
      id: row.id,
      membership: "included",
      entityKind: "document",
      workId: row.work_id,
      label: row.label,
      ...(row.title ? { title: row.title } : {}),
      officialIdentity: {
        ...(row.celex ? { celex: row.celex } : {}),
        workUri: row.work_uri,
        ...(row.expression_uri ? { expressionUri: row.expression_uri } : {}),
      },
      measureType: earthMeasureTypeSchema.parse(row.measure_type),
    };
  }
  if (!row.source_locator) {
    throw new Error(`Hierarchy node ${row.id} has no source locator`);
  }
  return {
    id: row.id,
    membership: "included",
    entityKind: row.entity_kind as Exclude<
      EarthNode["entityKind"],
      "document" | "external-work"
    >,
    workId: row.work_id,
    ...(row.parent_id ? { parentId: row.parent_id } : {}),
    label: row.label,
    ...(row.title ? { title: row.title } : {}),
    sourceLocator: row.source_locator,
  };
}

function asRelationship(row: RelationshipRow) {
  return {
    projection: "exact" as const,
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
    relationType: earthRelationshipTypeSchema.parse(row.relation_type),
    provenance: earthOfficialProvenanceSchema.parse(row.provenance),
    evidence: {
      text: row.evidence_text,
      locator: row.evidence_locator,
      sourceUrl: row.evidence_source_url,
    },
  };
}

/** Earth-only reader for an immutable, independently-built SQLite artifact. */
export class EarthRepository {
  private readonly database: Database.Database;
  readonly manifest: EarthManifest;

  constructor(databasePath = DEFAULT_EARTH_ARTIFACT_PATH) {
    const artifactPath = resolve(databasePath);
    if (!existsSync(artifactPath)) {
      throw new Error(`Earth artifact does not exist: ${artifactPath}`);
    }
    this.database = new Database(artifactPath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      this.database.pragma("query_only = ON");
      const row = this.database
        .prepare("SELECT value FROM build_manifest WHERE key = ?")
        .get("manifest_json") as { value?: DatabaseValue } | undefined;
      if (!row || typeof row.value !== "string") {
        throw new Error("Earth artifact has no build manifest");
      }
      this.manifest = parseManifest(row.value);
      if (this.manifest.schemaVersion !== EARTH_READING_SCHEMA_VERSION)
        throw new Error(
          "Earth artifact schema is incompatible; rebuild it with earth:build",
        );
      this.database
        .prepare(
          "SELECT article_node_id, source_path, xml_member, block_count FROM article_readings LIMIT 0",
        )
        .all();
      this.database
        .prepare(
          "SELECT id, parent_id, block_json FROM article_reading_blocks LIMIT 0",
        )
        .all();
      this.database
        .prepare("SELECT language FROM source_snapshots LIMIT 0")
        .all();
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  articleReading(articleId: string) {
    return readArticleReading(this.database, articleId);
  }

  close() {
    this.database.close();
  }

  listUniverses() {
    return [this.manifest.universe];
  }

  overview(
    universeId: string,
    options: EarthOverviewOptions = {},
  ): EarthOverview | undefined {
    if (universeId !== this.manifest.universe.id) return undefined;
    const boundaryLimit = Math.min(
      Math.max(options.boundaryLimit ?? EARTH_BOUNDARY_LIMIT_DEFAULT, 1),
      EARTH_BOUNDARY_LIMIT_MAX,
    );
    const boundaryOffset = Math.max(options.boundaryOffset ?? 0, 0);
    const boundaryQuery = options.boundaryQuery?.trim() ?? "";
    const escapedQuery = `%${boundaryQuery.replaceAll(/[%_\\]/gu, "\\$&")}%`;
    const workRows = this.database
      .prepare(
        `${nodeSelect}
         WHERE n.entity_kind = 'document' ORDER BY n.display_order, n.id`,
      )
      .all() as NodeRow[];
    const boundaryWhere = boundaryQuery
      ? `n.entity_kind = 'external-work'
         AND (boundary.celex LIKE ? ESCAPE '\\' COLLATE NOCASE
           OR boundary.official_title LIKE ? ESCAPE '\\' COLLATE NOCASE)`
      : "n.entity_kind = 'external-work'";
    const boundaryParameters = boundaryQuery
      ? [escapedQuery, escapedQuery]
      : [];
    const boundaryRows = this.database
      .prepare(
        `${nodeSelect}
         WHERE ${boundaryWhere}
         ORDER BY n.id LIMIT ? OFFSET ?`,
      )
      .all(...boundaryParameters, boundaryLimit, boundaryOffset) as NodeRow[];
    const boundaryNodeCount = this.database
      .prepare("SELECT COUNT(*) AS count FROM boundary_works")
      .get() as { count: number };
    const boundaryMatchCount = this.database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM nodes n
         LEFT JOIN boundary_works boundary ON boundary.id = n.boundary_work_id
         WHERE ${boundaryWhere}`,
      )
      .get(...boundaryParameters) as { count: number };
    const allRelationshipWorkRows = this.database
      .prepare(
        `SELECT r.*,
          COALESCE(source.work_id, source.boundary_work_id) AS source_work_id,
          COALESCE(target.work_id, target.boundary_work_id) AS target_work_id
         FROM official_relationships r
         JOIN nodes source ON source.id = r.source_node_id
         JOIN nodes target ON target.id = r.target_node_id
         WHERE COALESCE(source.work_id, source.boundary_work_id)
           != COALESCE(target.work_id, target.boundary_work_id)
         ORDER BY r.id`,
      )
      .all() as Array<
      RelationshipRow & { source_work_id: string; target_work_id: string }
    >;
    const visibleWorkIds = new Set([
      ...workRows.flatMap((row) => (row.work_id ? [row.work_id] : [])),
      ...boundaryRows.flatMap((row) =>
        row.boundary_work_id ? [row.boundary_work_id] : [],
      ),
    ]);
    const relationshipWorkRows = allRelationshipWorkRows.filter(
      (row) =>
        visibleWorkIds.has(row.source_work_id) &&
        visibleWorkIds.has(row.target_work_id),
    );
    const aggregates = new Map<string, EarthOverview["aggregates"][number]>();
    for (const row of relationshipWorkRows) {
      const key = `${row.source_work_id}\u0000${row.target_work_id}`;
      const current = aggregates.get(key) ?? {
        id: `earth-aggregate:${encodeURIComponent(row.source_work_id)}:${encodeURIComponent(row.target_work_id)}`,
        source: row.source_work_id,
        target: row.target_work_id,
        relationTypes: [],
        provenances: [],
        relationshipIds: [],
        count: 0,
      };
      if (!current.relationTypes.includes(row.relation_type))
        current.relationTypes.push(row.relation_type);
      if (!current.provenances.includes(row.provenance))
        current.provenances.push(row.provenance);
      current.relationshipIds.push(row.id);
      current.count += 1;
      aggregates.set(key, current);
    }
    const boundaryRelationshipCount = this.database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM official_relationships relationship
         JOIN nodes source ON source.id = relationship.source_node_id
         JOIN nodes target ON target.id = relationship.target_node_id
         WHERE source.entity_kind = 'external-work'
            OR target.entity_kind = 'external-work'`,
      )
      .get() as { count: number };
    const { universe, ...build } = this.manifest;
    return {
      universe,
      build,
      works: workRows.map(asNode),
      relationshipCount: allRelationshipWorkRows.length,
      aggregates: [...aggregates.values()],
      boundary: {
        nodes: boundaryRows.map(asNode),
        nodeCount: boundaryNodeCount.count,
        matchCount: boundaryMatchCount.count,
        returnedCount: boundaryRows.length,
        relationshipCount: boundaryRelationshipCount.count,
        visibleRelationshipCount: relationshipWorkRows.length,
        limit: boundaryLimit,
        offset: boundaryOffset,
        hasMore:
          boundaryOffset + boundaryRows.length < boundaryMatchCount.count,
      },
    };
  }

  findNode(nodeId: string): EarthNode | undefined {
    const row = this.database
      .prepare(`${nodeSelect} WHERE n.id = ?`)
      .get(nodeId) as NodeRow | undefined;
    return row ? asNode(row) : undefined;
  }

  children(nodeId: string, limit: number): EarthNode[] {
    return (
      this.database
        .prepare(
          `${nodeSelect}
         WHERE n.parent_id = ? ORDER BY n.display_order, n.id LIMIT ?`,
        )
        .all(nodeId, limit) as NodeRow[]
    ).map(asNode);
  }

  neighbourhood(nodeId: string, options: EarthNeighbourhoodOptions) {
    const root = this.findNode(nodeId);
    if (!root) return undefined;
    const nodeIds = new Set([nodeId]);
    const relationships: ReturnType<typeof asRelationship>[] = [];
    let frontier = [nodeId];
    for (
      let currentDepth = 0;
      currentDepth < options.depth && frontier.length > 0;
      currentDepth += 1
    ) {
      const next = new Set<string>();
      for (const current of frontier) {
        if (
          relationships.length >= options.edgeLimit ||
          nodeIds.size >= options.nodeLimit
        )
          break;
        if (this.findNode(current)?.membership === "boundary") continue;
        const clauses: string[] = [];
        const parameters: string[] = [];
        if (options.direction === "out" || options.direction === "both") {
          clauses.push("source_node_id = ?");
          parameters.push(current);
        }
        if (options.direction === "in" || options.direction === "both") {
          clauses.push("target_node_id = ?");
          parameters.push(current);
        }
        const typeClause = options.relationTypes?.length
          ? ` AND relation_type IN (${options.relationTypes.map(() => "?").join(", ")})`
          : "";
        const rows = this.database
          .prepare(
            `SELECT * FROM official_relationships WHERE (${clauses.join(" OR ")})${typeClause} ORDER BY id LIMIT ?`,
          )
          .all(
            ...parameters,
            ...(options.relationTypes ?? []),
            options.edgeLimit - relationships.length,
          ) as RelationshipRow[];
        for (const row of rows) {
          if (relationships.some((relationship) => relationship.id === row.id))
            continue;
          const other =
            row.source_node_id === current
              ? row.target_node_id
              : row.source_node_id;
          if (!nodeIds.has(other) && nodeIds.size >= options.nodeLimit)
            continue;
          relationships.push(asRelationship(row));
          nodeIds.add(row.source_node_id);
          nodeIds.add(row.target_node_id);
          next.add(other);
          if (relationships.length >= options.edgeLimit) break;
        }
      }
      frontier = [...next];
    }
    return {
      root,
      nodes: [...nodeIds]
        .map((id) => this.findNode(id))
        .filter((node): node is EarthNode => Boolean(node)),
      relationships,
      options,
    };
  }

  relationshipDetail(relationshipId: string) {
    const row = this.database
      .prepare("SELECT * FROM official_relationships WHERE id = ?")
      .get(relationshipId) as RelationshipRow | undefined;
    return row ? asRelationship(row) : undefined;
  }
}
