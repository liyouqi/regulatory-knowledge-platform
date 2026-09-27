import type Database from "better-sqlite3";
import {
  EARTH_READING_BYTE_LIMIT,
  type EarthArticleReading,
  earthArticleReadingSchema,
} from "../contract/article-reading";

/** Reads already-audited source material only. Never fetches or parses legal XML. */
export function readArticleReading(
  database: Database.Database,
  articleId: string,
): EarthArticleReading | undefined {
  const row = database
    .prepare(`SELECT n.label, n.title, r.source_path, r.xml_member, r.block_count,
    w.celex, w.work_uri, w.expression_uri, w.manifestation_uri, w.metadata_source_url,
    s.snapshot_id, s.content_sha256, s.content_url, s.retrieved_at, s.language
    FROM article_readings r JOIN nodes n ON n.id = r.article_node_id
    JOIN works w ON w.id = n.work_id JOIN source_snapshots s ON s.snapshot_id = w.snapshot_id
    WHERE r.article_node_id = ? AND n.entity_kind = 'article'`)
    .get(articleId) as Record<string, string | null> | undefined;
  if (!row) {
    const article = database
      .prepare("SELECT id FROM nodes WHERE id = ? AND entity_kind = 'article'")
      .get(articleId);
    if (article) throw new Error("Incomplete Earth Article reading");
    return undefined;
  }
  const expectedCount = Number(row.block_count);
  const rows = database
    .prepare(
      "SELECT id, parent_id, block_json FROM article_reading_blocks WHERE article_node_id = ? ORDER BY json_extract(block_json, '$.displayOrder') LIMIT 501",
    )
    .all(articleId) as {
    id: string;
    parent_id: string | null;
    block_json: string;
  }[];
  if (
    !Number.isInteger(expectedCount) ||
    expectedCount < 1 ||
    expectedCount > 500 ||
    rows.length !== expectedCount
  )
    throw new Error("Incomplete Earth Article reading");
  const reading = earthArticleReadingSchema.parse({
    articleId,
    label: row.label,
    title: row.title,
    sourcePath: row.source_path,
    source: {
      xmlMember: row.xml_member,
      celex: row.celex,
      language: row.language,
      workUri: row.work_uri,
      expressionUri: row.expression_uri,
      manifestationUri: row.manifestation_uri,
      snapshotId: row.snapshot_id,
      contentHash: row.content_sha256,
      contentUrl: row.content_url,
      retrievedAt: row.retrieved_at,
      officialSourceUrl: row.metadata_source_url,
    },
    scope: "normalized-article-body-without-notes",
    blocks: rows.map((row) => JSON.parse(row.block_json)),
  });
  if (
    rows.some(
      (row, index) =>
        row.id !== reading.blocks[index]?.id ||
        row.parent_id !== reading.blocks[index]?.parentId,
    )
  )
    throw new Error("Earth reading block identity drift");
  if (Buffer.byteLength(JSON.stringify(reading)) > EARTH_READING_BYTE_LIMIT)
    throw new Error("Earth Article reading exceeds payload budget");
  return reading;
}
