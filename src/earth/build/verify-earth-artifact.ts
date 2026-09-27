import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import {
  earthOfficialProvenanceSchema,
  earthRelationshipTypeSchema,
} from "../contract/earth-contract";
import {
  type EarthArtifactManifest,
  earthArtifactManifestSchema,
} from "./earth-compiler";
import { verifyArticleReadings } from "./verify-article-readings";

export interface EarthArtifactVerification {
  artifactPath: string;
  manifest: EarthArtifactManifest;
  works: number;
  boundaryWorks: number;
  nodes: number;
  articles: number;
  relationships: number;
  bytes: number;
}

/** Opens and validates an Earth artifact without consulting Platform runtime data. */
export function verifyEarthArtifact(
  providedPath: string,
): EarthArtifactVerification {
  const artifactPath = resolve(process.cwd(), providedPath);
  const database = new Database(artifactPath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    database.pragma("foreign_keys = ON");
    const integrity = database.pragma("integrity_check", { simple: true });
    if (integrity !== "ok")
      throw new Error(`Earth artifact integrity check failed: ${integrity}`);
    const foreignKeys = database.pragma("foreign_key_check") as unknown[];
    if (foreignKeys.length > 0)
      throw new Error("Earth artifact foreign key check failed");
    const row = database
      .prepare("SELECT value FROM build_manifest WHERE key = 'manifest_json'")
      .get() as { value?: string } | undefined;
    if (!row?.value) throw new Error("Earth artifact manifest is missing");
    const manifest = earthArtifactManifestSchema.parse(JSON.parse(row.value));
    verifyArticleReadings(database, manifest.counts);
    const count = (table: string, condition = "") =>
      (
        database
          .prepare(`SELECT COUNT(*) AS count FROM ${table} ${condition}`)
          .get() as { count: number }
      ).count;
    const works = count("works");
    if (works !== manifest.sourceSnapshotIds.length) {
      throw new Error(
        "Earth artifact work count does not match source snapshots",
      );
    }
    const snapshotIds = (
      database
        .prepare(
          "SELECT snapshot_id FROM source_snapshots ORDER BY snapshot_id",
        )
        .all() as Array<{ snapshot_id: string }>
    ).map(({ snapshot_id }) => snapshot_id);
    if (
      JSON.stringify(snapshotIds) !==
      JSON.stringify([...manifest.sourceSnapshotIds].sort())
    ) {
      throw new Error("Earth artifact snapshots do not match its manifest");
    }
    const relationSnapshotIds = (
      database
        .prepare(
          "SELECT snapshot_id FROM relation_snapshots ORDER BY snapshot_id",
        )
        .all() as Array<{ snapshot_id: string }>
    ).map(({ snapshot_id }) => snapshot_id);
    if (
      JSON.stringify(relationSnapshotIds) !==
      JSON.stringify([...manifest.relationSnapshotIds].sort())
    ) {
      throw new Error(
        "Earth artifact relation snapshots do not match its manifest",
      );
    }
    const nodes = count("nodes");
    const boundaryWorks = count("boundary_works");
    const relationships = count("official_relationships");
    if (
      works !== manifest.counts.works ||
      boundaryWorks !== manifest.counts.boundaryWorks ||
      nodes !== manifest.counts.nodes ||
      relationships !== manifest.counts.relationships
    ) {
      throw new Error("Earth artifact counts do not match its manifest");
    }
    const assertWorkIds = (table: "works" | "boundary_works") => {
      const rows = database
        .prepare(`SELECT id, celex FROM ${table}`)
        .all() as Array<{
        id: string;
        celex: string;
      }>;
      for (const row of rows) {
        if (row.id !== `earth:work:${row.celex}`) {
          throw new Error(`Unstable Earth Work ID in ${table}: ${row.id}`);
        }
      }
    };
    assertWorkIds("works");
    assertWorkIds("boundary_works");
    const relationshipRows = database
      .prepare(
        `SELECT id, source_node_id, target_node_id, relation_type, provenance,
          evidence_locator, evidence_source_url FROM official_relationships`,
      )
      .all() as Array<{
      id: string;
      source_node_id: string;
      target_node_id: string;
      relation_type: string;
      provenance: string;
      evidence_locator: string;
      evidence_source_url: string;
    }>;
    for (const relationship of relationshipRows) {
      earthRelationshipTypeSchema.parse(relationship.relation_type);
      earthOfficialProvenanceSchema.parse(relationship.provenance);
      const expectedId = `relationship:${createHash("sha256")
        .update(
          [
            relationship.source_node_id,
            relationship.relation_type,
            relationship.target_node_id,
            relationship.evidence_locator,
          ].join("\n"),
        )
        .digest("hex")}`;
      if (relationship.id !== expectedId) {
        throw new Error(`Unstable Earth relationship ID: ${relationship.id}`);
      }
      if (new URL(relationship.evidence_source_url).protocol !== "https:") {
        throw new Error(
          `Invalid Earth relationship evidence URL: ${relationship.id}`,
        );
      }
    }
    return {
      artifactPath,
      manifest,
      works,
      boundaryWorks,
      nodes,
      articles: count("nodes", "WHERE entity_kind = 'article'"),
      relationships,
      bytes: statSync(artifactPath).size,
    };
  } finally {
    database.close();
  }
}
