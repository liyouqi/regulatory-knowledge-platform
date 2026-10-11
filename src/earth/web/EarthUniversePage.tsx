import {
  ArrowLeft,
  ExternalLink,
  Globe2,
  ListTree,
  Orbit,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { HelpMenu } from "../../contact/web/HelpMenu";
import type { EarthNode } from "../contract/earth-contract";
import {
  CDM,
  type MetadataGraph,
  type MetadataGraphNode,
  graphPredicateLabels,
} from "../contract/metadata-graph";
import { EarthGraphView } from "./EarthGraphView";
import {
  type EarthDisplay,
  earthFamilies,
  earthSectors,
  earthWorkTags,
} from "./display-tags";
import type { EarthInstitutionNode, EarthRenderModel } from "./render-model";

function colorFor(node: MetadataGraphNode) {
  const families: Record<string, { label: string; color: string }> =
    earthFamilies;
  const base =
    node.kind === "institution"
      ? "#f1dfaf"
      : (earthWorkTags[node.celex ?? ""]?.color ??
        families[node.families[0]]?.color ??
        (node.sectors.includes("insurance")
          ? "#b2a7d2"
          : node.sectors.includes("securities")
            ? "#89bdaf"
            : "#83afc8"));
  if (node.types.some((type) => /\/(REG_DEL|REG_IMPL)$/u.test(type)))
    return `#${base
      .slice(1)
      .match(/.{2}/g)
      ?.map((channel) =>
        Math.min(255, Math.round(Number.parseInt(channel, 16) * 0.95 + 8))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  return base;
}

/** Display abbreviation only; the official title and source identity stay intact. */
function nodeLabel(node: MetadataGraphNode) {
  if (node.label !== node.celex) return node.label;
  const reference = node.celex?.match(/^3(\d{4})[RL](\d{4})$/u);
  if (!reference) return node.label;
  const number = `${reference[1]}/${Number(reference[2])}`;
  if (/regulatory technical standards/iu.test(node.title))
    return `RTS · ${number}`;
  if (/implementing technical standards/iu.test(node.title))
    return `ITS · ${number}`;
  if (node.types.some((type) => type.endsWith("/REG_DEL")))
    return `Delegated · ${number}`;
  if (node.types.some((type) => type.endsWith("/REG_IMPL")))
    return `Implementing · ${number}`;
  return node.label;
}

export function EarthUniversePage({ graph }: { graph: MetadataGraph }) {
  const [sector, setSector] = useState("");
  const [family, setFamily] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [structured, setStructured] = useState(false);
  const [listLimit, setListLimit] = useState(50);
  const [relationLimit, setRelationLimit] = useState(100);
  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph],
  );
  const selected = nodeById.get(selectedId);
  const familyNodes = useMemo(
    () =>
      graph.nodes.filter(
        (node) =>
          node.kind === "work" &&
          node.families.some(
            (id) => selected?.families.includes(id) || id === family,
          ),
      ),
    [graph, selected, family],
  );
  const detailIds = useMemo(
    () => new Set(familyNodes.map((node) => node.id)),
    [familyNodes],
  );
  const familyParents = useMemo(() => {
    const parents = new Map<string, string>();
    for (const edge of graph.edges) {
      if (
        ![
          `${CDM}resource_legal_based_on_resource_legal`,
          `${CDM}resource_legal_completes_resource_legal`,
        ].includes(edge.predicate)
      )
        continue;
      const child = nodeById.get(edge.source);
      const parent = nodeById.get(edge.target);
      if (
        !child ||
        child.included ||
        !parent?.included ||
        !child.families.some((id) => parent.families.includes(id))
      )
        continue;
      const previous = parents.get(child.id);
      if (!previous || parent.id < previous) parents.set(child.id, parent.id);
    }
    return parents;
  }, [graph, nodeById]);
  const selectedEdge = graph.edges.find((edge) => edge.id === selectedEdgeId);
  const connected = useMemo(
    () =>
      graph.edges.filter(
        (edge) => edge.source === selectedId || edge.target === selectedId,
      ),
    [graph, selectedId],
  );
  const filtered = Boolean(sector || family || search);
  const matched = useMemo(
    () =>
      new Set(
        graph.nodes
          .filter(
            (node) =>
              (!sector || node.sectors.includes(sector)) &&
              (!family || node.families.includes(family)) &&
              (!search ||
                `${node.label} ${node.title} ${node.celex ?? ""}`
                  .toLowerCase()
                  .includes(search.toLowerCase())),
          )
          .map((node) => node.id),
      ),
    [graph, sector, family, search],
  );
  const display: EarthDisplay = useMemo(
    () => ({
      filtered,
      nodes: new Map(
        graph.nodes.map((node) => [
          node.id,
          { color: colorFor(node), matched: matched.has(node.id) },
        ]),
      ),
    }),
    [graph, filtered, matched],
  );
  const visibleNodes = useMemo(() => {
    const selectedNeighbours = new Set(
      connected.flatMap((edge) => [edge.source, edge.target]),
    );
    return graph.nodes.filter(
      (node) =>
        node.included ||
        selectedNeighbours.has(node.id) ||
        (selectedId && detailIds.has(node.id)) ||
        (family && node.families.includes(family)),
    );
  }, [graph, connected, family, selectedId, detailIds]);
  const renderModel: EarthRenderModel = useMemo(() => {
    const ids = new Set(visibleNodes.map((node) => node.id));
    const edges = graph.edges.filter((edge) => {
      if (!ids.has(edge.source) || !ids.has(edge.target)) return false;
      if (selectedId)
        return edge.source === selectedId || edge.target === selectedId;
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      const sourceAnchor = source && !source.label.startsWith("3");
      if (edge.predicate === `${CDM}work_created_by_agent`)
        return Boolean(sourceAnchor);
      if (edge.predicate === `${CDM}work_cites_work`)
        return Boolean(sourceAnchor && target && !target.label.startsWith("3"));
      return true;
    });
    const groups = new Map<string, typeof edges>();
    for (const edge of edges) {
      const key = [edge.source, edge.target].sort().join("|");
      const group = groups.get(key) ?? [];
      group.push(edge);
      groups.set(key, group);
    }
    return {
      nodes: visibleNodes.map((node) => {
        const source: EarthNode | EarthInstitutionNode =
          node.kind === "institution"
            ? {
                id: node.id,
                label: node.label,
                title: node.title,
                membership: "included",
                entityKind: "institution",
                workId: node.id,
                officialIdentity: { workUri: node.uri },
              }
            : node.included
              ? {
                  id: node.id,
                  label: node.label,
                  title: node.title,
                  membership: "included",
                  entityKind: "document",
                  workId: node.id,
                  officialIdentity: { workUri: node.uri, celex: node.celex },
                  measureType: "other",
                }
              : {
                  id: node.id,
                  label: node.label,
                  title: node.title,
                  membership: "boundary",
                  entityKind: "external-work",
                  officialIdentity: { workUri: node.uri, celex: node.celex },
                  sourceUrl: node.uri.replace("http:", "https:"),
                };
        return {
          id: node.id,
          label: nodeLabel(node),
          subLabel: node.kind,
          membership: source.membership,
          source,
          group:
            node.kind === "institution"
              ? "institutions"
              : (node.families[0] ?? node.sectors[0] ?? "other"),
          anchor: node.kind === "institution" || !node.label.startsWith("3"),
          detail: detailIds.has(node.id),
          satelliteOf: familyParents.get(node.id),
        };
      }),
      edges: [...groups.values()].map((group) => {
        const first = group[0];
        const aggregate = {
          id: `bundle:${[first.source, first.target].sort().join("|")}`,
          source: first.source,
          target: first.target,
          relationTypes: [
            ...new Set(
              group.map(
                (edge) =>
                  graphPredicateLabels[edge.predicate] ?? edge.predicate,
              ),
            ),
          ],
          provenances: ["CELLAR_METADATA"],
          relationshipIds: group.map((edge) => edge.id),
          count: group.length,
        };
        return {
          id: aggregate.id,
          source: aggregate.source,
          target: aggregate.target,
          label: aggregate.relationTypes.join(" · "),
          relationshipIds: aggregate.relationshipIds,
          count: aggregate.count,
          sourceProjection: aggregate,
        };
      }),
    };
  }, [graph, visibleNodes, selectedId, nodeById, detailIds, familyParents]);
  const laws = visibleNodes.filter((node) => node.kind === "work");
  const list = laws.filter((node) => matched.has(node.id));
  const structuredNodes = [...visibleNodes].sort(
    (a, b) => Number(matched.has(b.id)) - Number(matched.has(a.id)),
  );
  const selectedEvidence = selectedEdge
    ? {
        source: nodeById.get(selectedEdge.source),
        target: nodeById.get(selectedEdge.target),
      }
    : null;
  const sectors = { ...earthSectors, securities: "Securities" };
  function select(id: string) {
    setSelectedId(id);
    setSelectedEdgeId("");
    setRelationLimit(100);
  }
  function selectEdge(id: string) {
    const edge = renderModel.edges.find((edge) => edge.id === id);
    if (!edge) return;
    setSelectedEdgeId(edge.relationshipIds[0]);
    if (!selectedId) setSelectedId(edge.source);
  }
  return (
    <main
      className={`earth-shell earth-metadata-universe${selected ? " has-selection" : ""}`}
    >
      <header className="earth-header">
        <a className="earth-back" href="/law/dora/articles/1">
          <ArrowLeft size={15} /> Reader
        </a>
        <div className="earth-mark">
          <Globe2 size={18} />
          <span>Galaxy</span>
        </div>
        <div className="earth-view-switch" aria-label="Galaxy view">
          <button
            type="button"
            aria-pressed={!structured}
            onClick={() => setStructured(false)}
          >
            <Orbit size={14} /> Universe
          </button>
          <button
            type="button"
            aria-pressed={structured}
            onClick={() => setStructured(true)}
          >
            <ListTree size={14} /> Structured
          </button>
        </div>
        <HelpMenu
          context={selected ? selected.label : undefined}
          surface="galaxy"
          tone="space"
        />
      </header>
      <section className="earth-hero">
        <div>
          <p className="earth-kicker">English · EU financial collection</p>
          <h1>A European legal universe.</h1>
          <p>Explore the laws. Follow their connections.</p>
        </div>
        <dl className="earth-metrics">
          <div>
            <dt>Included files</dt>
            <dd>{graph.report.scopeWorks}</dd>
          </div>
          <div>
            <dt>Metadata relations</dt>
            <dd>{graph.edges.length}</dd>
          </div>
          <div>
            <dt>Institutions</dt>
            <dd>{graph.report.institutions}</dd>
          </div>
        </dl>
      </section>
      <section className="earth-filters" aria-label="Universe filters">
        <div>
          <label>
            <span>Sector</span>
            <select
              aria-label="Sector"
              value={sector}
              onChange={(event) => {
                setSector(event.target.value);
                setListLimit(50);
              }}
            >
              <option value="">All sectors</option>
              {Object.entries(sectors).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Regs</span>
            <select
              aria-label="Regs"
              value={family}
              onChange={(event) => {
                setFamily(event.target.value);
                setListLimit(50);
              }}
            >
              <option value="">All families</option>
              {Object.entries(earthFamilies).map(([id, item]) => (
                <option key={id} value={id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {filtered ? (
            <button
              type="button"
              onClick={() => {
                setSector("");
                setFamily("");
                setSearch("");
              }}
            >
              Reset
            </button>
          ) : null}
        </div>
        <input
          className="earth-law-search"
          type="search"
          aria-label="Find a law"
          placeholder="Find a law or CELEX"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setListLimit(50);
          }}
        />
        <output>
          {list.length} / {laws.length} visible files highlighted · grey keeps
          context
        </output>
        {search && !structured ? (
          <div className="earth-search-results">
            {graph.nodes
              .filter((node) => matched.has(node.id))
              .slice(0, 5)
              .map((node) => (
                <button
                  type="button"
                  key={node.id}
                  onClick={() => select(node.id)}
                >
                  {nodeLabel(node)}
                </button>
              ))}
          </div>
        ) : null}
      </section>
      <section className="earth-workspace" aria-label="Galaxy explorer">
        <div className="earth-map">
          {!structured ? (
            <div
              className="earth-graph-stage"
              data-earth-node-count={renderModel.nodes.length}
              data-earth-matched-count={list.length}
              data-earth-filtered={filtered}
              aria-label="Interactive European legal nebula"
            >
              <EarthGraphView
                model={renderModel}
                display={display}
                selectedNodeId={selectedId || undefined}
                selectedEdgeId={
                  renderModel.edges.find((edge) =>
                    edge.relationshipIds.includes(selectedEdgeId),
                  )?.id
                }
                onSelectNode={select}
                onSelectEdge={selectEdge}
                onUnavailable={() => setStructured(true)}
              />
            </div>
          ) : (
            <div className="earth-structured">
              <div className="earth-law-grid" aria-label="Included laws">
                {structuredNodes.slice(0, listLimit).map((node) => (
                  <button
                    className={`earth-law${matched.has(node.id) ? "" : " filtered-out"}`}
                    style={{
                      borderColor: matched.has(node.id)
                        ? colorFor(node)
                        : undefined,
                    }}
                    type="button"
                    key={node.id}
                    onClick={() => select(node.id)}
                  >
                    <strong>
                      {node.kind === "institution" ? "✦ " : ""}
                      {nodeLabel(node)}
                    </strong>
                    <small>{node.title}</small>
                  </button>
                ))}
              </div>
              {structuredNodes.length > listLimit ? (
                <button
                  className="earth-show-more"
                  type="button"
                  onClick={() => setListLimit((value) => value + 100)}
                >
                  Show more · {listLimit} / {structuredNodes.length}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>
      {selected ? (
        <aside className="earth-inspector" aria-label="Selected law details">
          <button
            className="earth-close"
            type="button"
            aria-label="Close law details"
            onClick={() => {
              setSelectedId("");
              setSelectedEdgeId("");
            }}
          >
            <X size={17} />
          </button>
          <p className="earth-node-kind">
            {selected.kind === "institution"
              ? "Institution · official metadata"
              : selected.included
                ? "Included file · metadata only"
                : "Related file · outside directory collection"}
          </p>
          <h2>{nodeLabel(selected)}</h2>
          <p className="earth-node-title">{selected.title}</p>
          <div className="earth-identity">
            <a
              href={
                selected.celex
                  ? `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${selected.celex}`
                  : selected.uri.replace("http:", "https:")
              }
              target="_blank"
              rel="noreferrer"
            >
              Official source <ExternalLink size={13} />
            </a>
          </div>
          {selectedEvidence && selectedEdge ? (
            <section className="earth-evidence">
              <p>{graphPredicateLabels[selectedEdge.predicate]}</p>
              <strong>
                {selectedEvidence.source?.label} →{" "}
                {selectedEvidence.target?.label}
              </strong>
              <details className="earth-reading-location">
                <summary>Official metadata predicate</summary>
                <code>{selectedEdge.predicate}</code>
                <p>{selectedEvidence.source?.uri}</p>
                <p>{selectedEvidence.target?.uri}</p>
                <p>Snapshot {graph.source.snapshotHash}</p>
              </details>
            </section>
          ) : null}
          {familyNodes.length > 1 ? (
            <details className="earth-children" open>
              <summary className="earth-children-heading">
                Family files · {familyNodes.length}
              </summary>
              {familyNodes
                .filter((node) => node.id !== selected.id)
                .slice(0, relationLimit)
                .map((node) => (
                  <button
                    type="button"
                    key={node.id}
                    title={node.title}
                    onClick={() => select(node.id)}
                  >
                    <span>
                      <strong>{nodeLabel(node)}</strong>
                      <small>
                        {node.celex} ·{" "}
                        {node.included
                          ? "Collection file"
                          : "Related family file"}
                      </small>
                    </span>
                    <span>→</span>
                  </button>
                ))}
              {familyNodes.length - 1 > relationLimit ? (
                <button
                  type="button"
                  onClick={() => setRelationLimit((value) => value + 100)}
                >
                  Show more family files
                </button>
              ) : null}
            </details>
          ) : null}
          <details className="earth-relations" open>
            <summary className="earth-children-heading">
              Connected files / institutions · {connected.length}
            </summary>
            {connected.slice(0, relationLimit).map((edge) => {
              const other = nodeById.get(
                edge.source === selected.id ? edge.target : edge.source,
              );
              return (
                <div className="earth-relation-row" key={edge.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedEdgeId(edge.id)}
                  >
                    <span>
                      <strong>{graphPredicateLabels[edge.predicate]}</strong>
                      <small>
                        {edge.source === selected.id ? "outgoing" : "incoming"}{" "}
                        · {other ? nodeLabel(other) : ""}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Focus ${other ? nodeLabel(other) : ""}`}
                    onClick={() => select(other?.id ?? "")}
                  >
                    →
                  </button>
                </div>
              );
            })}
            {connected.length > relationLimit ? (
              <button
                className="earth-show-more"
                type="button"
                onClick={() => setRelationLimit((value) => value + 100)}
              >
                Show more · {relationLimit} / {connected.length}
              </button>
            ) : null}
          </details>
          {selected.kind === "work" ? (
            <a className="earth-back" href="/earth?view=reading">
              Existing article explorer
            </a>
          ) : null}
        </aside>
      ) : null}
      <footer className="earth-footnote">
        <div className="earth-graph-legend">
          <span>Family colors</span>
          <span>✦ Institutions</span>
          <span>Grey · outside filter</span>
        </div>
        <span>
          {selected
            ? `${renderModel.edges.length} relationship bundles shown`
            : `${renderModel.edges.length} key bundles · select a node for references`}
        </span>
        <span className="earth-coordinate-note">
          Configured EU scope · metadata only · positions illustrative
        </span>
      </footer>
    </main>
  );
}
