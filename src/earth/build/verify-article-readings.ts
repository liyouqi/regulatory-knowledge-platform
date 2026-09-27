import type Database from "better-sqlite3";
import { readArticleReading } from "../runtime/article-reading-query";
import { validateReadingHashes } from "./article-source-audit";

export function verifyArticleReadings(
  database: Database.Database,
  counts: { articlesWithReading: number; readingBlocks: number },
): void {
  const articles = database
    .prepare("SELECT id FROM nodes WHERE entity_kind = 'article' ORDER BY id")
    .all() as { id: string }[];
  const headers = database
    .prepare("SELECT article_node_id, block_count FROM article_readings")
    .all() as { article_node_id: string; block_count: number }[];
  const blockCount = (
    database
      .prepare("SELECT COUNT(*) AS count FROM article_reading_blocks")
      .get() as { count: number }
  ).count;
  if (
    articles.length !== headers.length ||
    headers.length !== counts.articlesWithReading ||
    blockCount !== counts.readingBlocks
  )
    throw new Error(
      "Earth reading coverage does not match Article count or manifest",
    );
  for (const article of articles) {
    const reading = readArticleReading(database, article.id);
    const header = headers.find(
      (header) => header.article_node_id === article.id,
    );
    if (!reading || !header || header.block_count !== reading.blocks.length)
      throw new Error(`Incomplete Earth Article reading: ${article.id}`);
    validateReadingHashes(reading.blocks);
    const rows = database
      .prepare(
        "SELECT id, parent_id FROM article_reading_blocks WHERE article_node_id = ?",
      )
      .all(article.id) as { id: string; parent_id: string | null }[];
    if (
      rows.some(
        (row) =>
          !reading.blocks.some(
            (block) => block.id === row.id && block.parentId === row.parent_id,
          ),
      )
    )
      throw new Error(`Earth reading column identity drift: ${article.id}`);
    const paths = [
      reading.sourcePath,
      ...reading.blocks.map((block) => block.sourcePath),
    ];
    if (
      new Set(paths).size !== paths.length ||
      paths.some(
        (path) =>
          path !== reading.sourcePath &&
          !path.startsWith(`${reading.sourcePath}/`),
      )
    )
      throw new Error(`Earth reading source ownership drift: ${article.id}`);
  }
  const badSources = database
    .prepare(`SELECT COUNT(*) AS count FROM works w JOIN source_snapshots s ON s.snapshot_id = w.snapshot_id
    WHERE w.celex != s.celex OR w.work_uri != s.work_uri OR w.expression_uri != s.expression_uri OR w.manifestation_uri != s.manifestation_uri`)
    .get() as { count: number };
  if (badSources.count) throw new Error("Earth reading source identity drift");
}
