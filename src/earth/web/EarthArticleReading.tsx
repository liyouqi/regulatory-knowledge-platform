import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type EarthReadingBlock,
  type EarthArticleReading as Reading,
  earthArticleReadingSchema,
} from "../contract/article-reading";

function ReadingBlock({
  block,
  blocks,
}: { block: EarthReadingBlock; blocks: Map<string, EarthReadingBlock> }) {
  return (
    <div className={`earth-reading-block ${block.kind}`} id={block.id}>
      {block.marker ? (
        <span className="earth-reading-marker">
          {block.marker === "dash" ? "—" : block.marker}
        </span>
      ) : null}
      <div className="earth-reading-content">
        {block.content.map((entry, index) =>
          entry.type === "text" ? (
            <p key={`${block.id}:${index}`}>{entry.text}</p>
          ) : (
            <ReadingBlock
              key={entry.childId}
              block={blocks.get(entry.childId) as EarthReadingBlock}
              blocks={blocks}
            />
          ),
        )}
        <details className="earth-reading-location">
          <summary>Source location</summary>
          <code>{block.sourcePath}</code>
          <small>SHA-256: {block.contentHash.slice(7)}</small>
        </details>
      </div>
    </div>
  );
}

/** One bounded Article request; navigation cancels stale responses. */
export function EarthArticleReading({ articleId }: { articleId: string }) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setReading(null);
    setError("");
    void (async () => {
      try {
        const response = await fetch(
          `/api/earth/articles/${encodeURIComponent(articleId)}/reading`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(
            `Article reading is unavailable (${response.status}).`,
          );
        const result = earthArticleReadingSchema.parse(await response.json());
        if (result.articleId !== articleId)
          throw new Error("Article reading identity mismatch.");
        if (!controller.signal.aborted) setReading(result);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Article reading is unavailable.",
          );
      }
    })();
    return () => controller.abort();
  }, [articleId]);
  if (error)
    return (
      <section className="earth-reading" role="alert">
        {error}
      </section>
    );
  if (!reading || reading.articleId !== articleId)
    return (
      <output className="earth-reading">Loading official Article body…</output>
    );
  const blocks = new Map(reading.blocks.map((block) => [block.id, block]));
  return (
    <section className="earth-reading" aria-label="Official Article reading">
      <h3>Official Article body</h3>
      <p className="earth-reading-scope">
        Selected English expression · normalized body. Footnotes and original
        formatting are not reproduced. This is not a latest-consolidated-version
        claim.
      </p>
      <div className="earth-reading-sources">
        <a
          href={reading.source.officialSourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Read on EUR-Lex <ExternalLink size={12} aria-hidden="true" />
        </a>
        <a href={reading.source.expressionUri} target="_blank" rel="noreferrer">
          Selected official Expression{" "}
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
      <details className="earth-reading-provenance">
        <summary>Snapshot and evidence location</summary>
        <dl>
          <dt>CELEX / language</dt>
          <dd>
            {reading.source.celex} / {reading.source.language}
          </dd>
          <dt>Retrieved</dt>
          <dd>{reading.source.retrievedAt}</dd>
          <dt>ACT XML member</dt>
          <dd>{reading.source.xmlMember}</dd>
          <dt>Article XPath</dt>
          <dd>
            <code>{reading.sourcePath}</code>
          </dd>
          <dt>Source snapshot</dt>
          <dd>{reading.source.snapshotId}</dd>
          <dt>Source hash</dt>
          <dd>{reading.source.contentHash}</dd>
        </dl>
        <a href={reading.source.contentUrl} target="_blank" rel="noreferrer">
          Official source content
        </a>
        <a
          href={reading.source.manifestationUri}
          target="_blank"
          rel="noreferrer"
        >
          Official Manifestation
        </a>
      </details>
      <div className="earth-reading-body">
        {reading.blocks
          .filter((block) => block.parentId === null)
          .map((block) => (
            <ReadingBlock key={block.id} block={block} blocks={blocks} />
          ))}
      </div>
    </section>
  );
}
