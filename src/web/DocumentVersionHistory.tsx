import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type DocumentVersionChain,
  documentVersionChainSchema,
} from "../shared/document-version-chain";

export function DocumentVersionHistory({
  documentId,
}: {
  documentId: string;
}) {
  const [chain, setChain] = useState<DocumentVersionChain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setChain(null);
    setLoading(true);
    setError("");
    void fetch(
      `/api/documents/${encodeURIComponent(documentId)}/version-chain`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load version history");
        return documentVersionChainSchema.parse(await response.json());
      })
      .then(setChain)
      .catch((caught: unknown) => {
        if ((caught as DOMException).name !== "AbortError") {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load version history",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [documentId]);

  return (
    <section aria-label="Document version history" className="version-history">
      <p className="eyebrow">VERSION HISTORY</p>
      {loading ? <p className="version-history-status">Loading…</p> : null}
      {error ? <p className="version-history-status">{error}</p> : null}
      {chain ? (
        <>
          <ol>
            {chain.nodes.map((node) => (
              <li key={node.id}>
                <span aria-hidden="true" className="version-history-marker" />
                <div>
                  <strong>{node.label}</strong>
                  <span>
                    {node.date ? `${node.date} · ` : ""}
                    {node.availability === "loaded" ? "Loaded" : "External"}
                  </span>
                  {node.availability === "external" ? (
                    <a href={node.sourceUrl} rel="noreferrer" target="_blank">
                      Open official record
                      <ArrowUpRight aria-hidden="true" size={13} />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="version-history-coverage">
            Verified source status only. External records are not the text
            loaded in this Reader; amending acts are not yet mapped.
          </p>
          {chain.checkedAt ? (
            <p className="version-history-checked">
              Status checked {chain.checkedAt.slice(0, 10)}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
