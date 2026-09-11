import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Globe2,
  Layers3,
  ListTree,
  Network,
  Orbit,
} from "lucide-react";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import {
  type EarthEdge,
  type EarthNode,
  earthEdgeSchema,
  earthNodeSchema,
  earthOfficialProvenanceSchema,
  earthRelationshipTypeSchema,
} from "../contract/earth-contract";
import { EarthGraphView } from "./EarthGraphView";
import {
  type EarthRenderModel,
  projectEarthExactNeighbourhood,
  projectEarthOverview,
} from "./render-model";
import "./earth.css";

const universeSchema = z
  .object({
    id: z.string(),
    version: z.string(),
    displayName: z.string(),
  })
  .strict();

const universeListSchema = z.object({ universes: z.array(universeSchema) });

const overviewSchema = z.object({
  universe: universeSchema,
  build: z
    .object({
      buildId: z.string(),
      builtAt: z.string(),
      sourceSnapshotIds: z.array(z.string()),
    })
    .passthrough(),
  works: z.array(earthNodeSchema),
  relationshipCount: z.number().int().nonnegative(),
  aggregates: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      relationTypes: z.array(earthRelationshipTypeSchema),
      provenances: z.array(earthOfficialProvenanceSchema),
      relationshipIds: z.array(z.string()),
      count: z.number().int().positive(),
    }),
  ),
  boundary: z.object({
    nodes: z.array(earthNodeSchema),
    nodeCount: z.number().int().nonnegative(),
    matchCount: z.number().int().nonnegative(),
    returnedCount: z.number().int().nonnegative(),
    relationshipCount: z.number().int().nonnegative(),
    visibleRelationshipCount: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
});

const childrenSchema = z.object({ children: z.array(earthNodeSchema) });
const relationshipResponseSchema = z.object({ relationship: earthEdgeSchema });
const neighbourhoodSchema = z.object({
  root: earthNodeSchema,
  nodes: z.array(earthNodeSchema),
  relationships: z.array(earthEdgeSchema),
  options: z.object({
    depth: z.number().int().positive(),
    nodeLimit: z.number().int().positive(),
    edgeLimit: z.number().int().positive(),
    direction: z.enum(["in", "out", "both"]),
  }),
});

type Universe = z.infer<typeof universeSchema>;
type Overview = z.infer<typeof overviewSchema>;

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      response.status === 503
        ? "The verified Earth artifact is not installed in this deployment."
        : `Earth data could not be loaded (${response.status}).`,
    );
  }
  return response.json();
}

function kindLabel(node: EarthNode): string {
  return node.entityKind.replaceAll("-", " ");
}

export function EarthPage() {
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<EarthNode | null>(null);
  const [trail, setTrail] = useState<EarthNode[]>([]);
  const [children, setChildren] = useState<EarthNode[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [selectedRelationship, setSelectedRelationship] =
    useState<EarthEdge | null>(null);
  const [viewMode, setViewMode] = useState<"graph" | "structured">("graph");
  const [relationMode, setRelationMode] = useState<"aggregate" | "exact">(
    "aggregate",
  );
  const [exactModel, setExactModel] = useState<EarthRenderModel | null>(null);
  const [loadingExact, setLoadingExact] = useState(false);
  const [boundaryDraft, setBoundaryDraft] = useState("");
  const [boundaryQuery, setBoundaryQuery] = useState("");
  const [loadingBoundary, setLoadingBoundary] = useState(false);
  const [error, setError] = useState("");
  const childRequest = useRef(0);
  const overviewRequest = useRef(0);
  const exactRequest = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    void getJson("/api/earth/universes", controller.signal)
      .then((value) => universeListSchema.parse(value).universes)
      .then((items) => {
        setUniverses(items);
        const first = items[0];
        if (!first) throw new Error("No reviewed Earth Universe is available.");
        return getJson(
          `/api/earth/universes/${encodeURIComponent(first.id)}/overview?boundaryLimit=100`,
          controller.signal,
        );
      })
      .then((value) => setOverview(overviewSchema.parse(value)))
      .catch((caught: unknown) => {
        if ((caught as DOMException).name !== "AbortError") {
          setError(
            caught instanceof Error ? caught.message : "Earth is unavailable.",
          );
        }
      });
    return () => controller.abort();
  }, []);

  const exactRelationCount = overview?.relationshipCount ?? 0;
  const renderModel = useMemo(
    () =>
      overview
        ? projectEarthOverview({
            works: overview.works,
            boundaryNodes: overview.boundary.nodes,
            aggregates: overview.aggregates,
          })
        : { nodes: [], edges: [] },
    [overview],
  );
  const activeRenderModel =
    relationMode === "exact" && exactModel ? exactModel : renderModel;
  const connectedEdges = useMemo(
    () =>
      selected
        ? activeRenderModel.edges.filter(
            (edge) =>
              edge.source === selected.id || edge.target === selected.id,
          )
        : [],
    [activeRenderModel, selected],
  );

  async function enterNode(
    node: EarthNode,
    nextTrail: EarthNode[],
    preserveExact = false,
  ) {
    const request = childRequest.current + 1;
    childRequest.current = request;
    setSelected(node);
    setTrail(nextTrail);
    setChildren([]);
    setSelectedRelationship(null);
    if (!preserveExact) {
      exactRequest.current += 1;
      setRelationMode("aggregate");
      setExactModel(null);
    }
    if (node.membership === "boundary") {
      setLoadingChildren(false);
      return;
    }
    setLoadingChildren(true);
    setError("");
    try {
      const value = await getJson(
        `/api/earth/nodes/${encodeURIComponent(node.id)}/children?limit=100`,
      );
      if (childRequest.current === request) {
        setChildren(childrenSchema.parse(value).children);
      }
    } catch (caught) {
      if (childRequest.current === request) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Structure is unavailable.",
        );
      }
    } finally {
      if (childRequest.current === request) setLoadingChildren(false);
    }
  }

  async function inspectRelationship(relationshipId: string) {
    setError("");
    try {
      const value = relationshipResponseSchema.parse(
        await getJson(
          `/api/earth/relationships/${encodeURIComponent(relationshipId)}`,
        ),
      ).relationship;
      if (value.projection !== "exact") {
        throw new Error("Earth relationship detail must be exact.");
      }
      setSelectedRelationship(value);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Relationship evidence is unavailable.",
      );
    }
  }

  async function showExactNeighbourhood(node: EarthNode) {
    if (node.membership !== "included") return;
    const request = exactRequest.current + 1;
    exactRequest.current = request;
    setLoadingExact(true);
    setError("");
    try {
      const value = neighbourhoodSchema.parse(
        await getJson(
          `/api/earth/nodes/${encodeURIComponent(node.id)}/neighbourhood?depth=1&nodeLimit=100&edgeLimit=150&direction=both`,
        ),
      );
      const model = projectEarthExactNeighbourhood({
        nodes: value.nodes,
        relationships: value.relationships,
      });
      if (exactRequest.current !== request) return;
      setExactModel(model);
      setRelationMode("exact");
      setViewMode("graph");
      setSelectedRelationship(null);
    } catch (caught) {
      if (exactRequest.current === request) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Exact neighbourhood could not be loaded.",
        );
      }
    } finally {
      if (exactRequest.current === request) setLoadingExact(false);
    }
  }

  function showAggregateOverview() {
    exactRequest.current += 1;
    setExactModel(null);
    setRelationMode("aggregate");
    setSelectedRelationship(null);
  }

  async function loadBoundaryPage(offset: number, query: string) {
    const universeId = overview?.universe.id ?? universes[0]?.id;
    if (!universeId) return;
    const request = overviewRequest.current + 1;
    overviewRequest.current = request;
    setLoadingBoundary(true);
    setError("");
    try {
      const parameters = new URLSearchParams({
        boundaryLimit: "100",
        boundaryOffset: String(offset),
        ...(query ? { boundaryQuery: query } : {}),
      });
      const next = overviewSchema.parse(
        await getJson(
          `/api/earth/universes/${encodeURIComponent(universeId)}/overview?${parameters}`,
        ),
      );
      if (overviewRequest.current !== request) return;
      setOverview(next);
      setBoundaryQuery(query);
      showAggregateOverview();
      if (
        selected?.membership === "boundary" &&
        !next.boundary.nodes.some(({ id }) => id === selected.id)
      ) {
        setSelected(null);
        setTrail([]);
        setSelectedRelationship(null);
      }
    } catch (caught) {
      if (overviewRequest.current === request) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Boundary Works could not be loaded.",
        );
      }
    } finally {
      if (overviewRequest.current === request) setLoadingBoundary(false);
    }
  }

  function selectRenderedNode(nodeId: string) {
    const node = activeRenderModel.nodes.find(
      ({ id }) => id === nodeId,
    )?.source;
    if (node) void enterNode(node, [node], relationMode === "exact");
  }

  function selectRenderedEdge(edgeId: string) {
    const relationshipId = activeRenderModel.edges.find(
      ({ id }) => id === edgeId,
    )?.relationshipIds[0];
    if (relationshipId) void inspectRelationship(relationshipId);
  }

  function stepBack() {
    const nextTrail = trail.slice(0, -1);
    const parent = trail.at(-2) ?? null;
    if (parent) void enterNode(parent, nextTrail);
    else {
      childRequest.current += 1;
      setSelected(null);
      setTrail([]);
      setChildren([]);
      showAggregateOverview();
    }
  }

  return (
    <main className="earth-shell">
      <header className="earth-header">
        <Link className="earth-back" to="/law/dora/articles/1">
          <ArrowLeft aria-hidden="true" size={15} /> Reader
        </Link>
        <div className="earth-mark">
          <Globe2 aria-hidden="true" size={18} />
          <span>Official EU Regulatory Earth</span>
        </div>
        <span className="earth-status">Official sources · read only</span>
      </header>

      <section className="earth-hero">
        <div>
          <p className="earth-kicker">A bounded regulatory universe</p>
          <h1>{overview?.universe.displayName ?? "Regulatory Earth"}</h1>
          <p>
            Start with laws. Enter one only when you need its official
            structure. No generated links, hidden applicability claims, or
            global reveal.
          </p>
        </div>
        <dl className="earth-metrics">
          <div>
            <dt>Works</dt>
            <dd>{overview?.works.length ?? "—"}</dd>
          </div>
          <div>
            <dt>Exact relations</dt>
            <dd>{overview ? exactRelationCount : "—"}</dd>
          </div>
          <div>
            <dt>Boundary works</dt>
            <dd>{overview?.boundary.nodeCount ?? "—"}</dd>
          </div>
        </dl>
      </section>

      {error ? (
        <p className="earth-alert" role="alert">
          {error}
        </p>
      ) : null}

      <section className="earth-workspace" aria-label="Earth explorer">
        <div className="earth-map">
          <div className="earth-orbit" aria-hidden="true">
            <span />
          </div>
          <div className="earth-map-heading">
            <span>
              {relationMode === "exact"
                ? "Exact loaded neighbourhood"
                : "Universe overview"}
            </span>
            <div className="earth-view-switch" aria-label="Earth view">
              <button
                aria-pressed={viewMode === "graph"}
                onClick={() => setViewMode("graph")}
                type="button"
              >
                <Orbit aria-hidden="true" size={13} /> Graph
              </button>
              <button
                aria-pressed={viewMode === "structured"}
                onClick={() => setViewMode("structured")}
                type="button"
              >
                <ListTree aria-hidden="true" size={13} /> Structured
              </button>
            </div>
          </div>
          {viewMode === "graph" && overview ? (
            <div
              className="earth-graph-stage"
              data-earth-node-count={activeRenderModel.nodes.length}
              data-earth-relation-mode={relationMode}
              aria-label="Interactive law graph"
            >
              <EarthGraphView
                model={activeRenderModel}
                onSelectEdge={selectRenderedEdge}
                onSelectNode={selectRenderedNode}
                selectedNodeId={selected?.id}
              />
              <div className="earth-graph-legend" aria-hidden="true">
                <span>
                  <i /> Included
                </span>
                <span>
                  <i /> Boundary
                </span>
              </div>
            </div>
          ) : viewMode === "structured" ? (
            <>
              <div className="earth-law-grid" aria-label="Included laws">
                {overview?.works.map((work, index) => (
                  <button
                    className={
                      selected?.id === work.id
                        ? "earth-law active"
                        : "earth-law"
                    }
                    key={work.id}
                    onClick={() => void enterNode(work, [work])}
                    style={{ "--earth-index": index } as CSSProperties}
                    type="button"
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{work.label}</strong>
                    <small>
                      {"officialIdentity" in work
                        ? (work.officialIdentity.celex ?? "Official Work")
                        : "Official Work"}
                    </small>
                  </button>
                ))}
              </div>
              {overview?.boundary.nodes.length ? (
                <div className="earth-boundary-list" aria-label="Boundary laws">
                  <span>Connected outside this Universe</span>
                  {overview.boundary.nodes.map((work) => (
                    <button
                      key={work.id}
                      onClick={() => void enterNode(work, [work])}
                      type="button"
                    >
                      {work.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {overview ? (
            <form
              className="earth-boundary-controls"
              onSubmit={(event) => {
                event.preventDefault();
                void loadBoundaryPage(0, boundaryDraft.trim());
              }}
            >
              <label>
                <span>Find boundary Work</span>
                <input
                  aria-label="Find boundary Work by CELEX or official title"
                  maxLength={80}
                  onChange={(event) => setBoundaryDraft(event.target.value)}
                  placeholder="Filter boundary Works"
                  type="search"
                  value={boundaryDraft}
                />
              </label>
              <button disabled={loadingBoundary} type="submit">
                {loadingBoundary ? "Loading…" : "Find"}
              </button>
              <small>
                {overview.boundary.returnedCount
                  ? `${overview.boundary.offset + 1}–${overview.boundary.offset + overview.boundary.returnedCount}`
                  : "0"}{" "}
                of {overview.boundary.matchCount}
                {boundaryQuery
                  ? ` matches (${overview.boundary.nodeCount} total)`
                  : ""}
              </small>
              <div>
                <button
                  disabled={loadingBoundary || overview.boundary.offset === 0}
                  onClick={() =>
                    void loadBoundaryPage(
                      Math.max(
                        0,
                        overview.boundary.offset - overview.boundary.limit,
                      ),
                      boundaryQuery,
                    )
                  }
                  type="button"
                >
                  Previous
                </button>
                <button
                  disabled={loadingBoundary || !overview.boundary.hasMore}
                  onClick={() =>
                    void loadBoundaryPage(
                      overview.boundary.offset + overview.boundary.limit,
                      boundaryQuery,
                    )
                  }
                  type="button"
                >
                  Next
                </button>
              </div>
            </form>
          ) : null}
          {!overview && !error ? (
            <p className="earth-loading">Opening verified Earth artifact…</p>
          ) : null}
        </div>

        <aside className="earth-inspector" aria-live="polite">
          {selected ? (
            <>
              <button
                className="earth-level-back"
                onClick={stepBack}
                type="button"
              >
                <ArrowLeft aria-hidden="true" size={14} />
                {trail.length > 1 ? "Parent level" : "All laws"}
              </button>
              <p className="earth-node-kind">{kindLabel(selected)}</p>
              <h2>{selected.label}</h2>
              {selected.title ? (
                <p className="earth-node-title">{selected.title}</p>
              ) : null}
              {selected.entityKind === "document" &&
              selected.officialIdentity ? (
                <div className="earth-identity">
                  <span>CELEX {selected.officialIdentity.celex ?? "—"}</span>
                  <span>English expression selected</span>
                  <a
                    href={selected.officialIdentity.workUri}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Official Work record
                    <ExternalLink aria-hidden="true" size={13} />
                  </a>
                </div>
              ) : selected.membership === "boundary" ? (
                <div className="earth-identity">
                  <span>CELEX {selected.officialIdentity.celex ?? "—"}</span>
                  <span>One-hop official boundary · not expandable</span>
                  <a href={selected.sourceUrl} rel="noreferrer" target="_blank">
                    Official Work record
                    <ExternalLink aria-hidden="true" size={13} />
                  </a>
                </div>
              ) : "sourceLocator" in selected ? (
                <div className="earth-identity">
                  <span>{selected.sourceLocator}</span>
                </div>
              ) : null}

              {selected.membership === "included" ? (
                <div className="earth-relation-mode">
                  {relationMode === "exact" && exactModel ? (
                    <>
                      <span>
                        {exactModel.nodes.length} nodes ·{" "}
                        {exactModel.edges.length} exact relations
                      </span>
                      <button onClick={showAggregateOverview} type="button">
                        Return to aggregate overview
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={loadingExact}
                      onClick={() => void showExactNeighbourhood(selected)}
                      type="button"
                    >
                      {loadingExact
                        ? "Loading bounded relations…"
                        : "Show exact loaded neighbourhood"}
                    </button>
                  )}
                </div>
              ) : null}

              {connectedEdges.length ? (
                <div className="earth-relations">
                  <div className="earth-children-heading">
                    <span>
                      <Network aria-hidden="true" size={15} /> Official
                      {relationMode === "exact" ? "Exact" : "Loaded official"}
                      {" relations"}
                    </span>
                    <small>{connectedEdges.length}</small>
                  </div>
                  {connectedEdges.map((edge) => {
                    const otherNodeId =
                      edge.source === selected.id ? edge.target : edge.source;
                    const otherLabel =
                      activeRenderModel.nodes.find(
                        ({ id }) => id === otherNodeId,
                      )?.label ?? otherNodeId;
                    return (
                      <button
                        key={edge.id}
                        onClick={() =>
                          void inspectRelationship(edge.relationshipIds[0])
                        }
                        type="button"
                      >
                        <span>
                          <strong>{edge.label}</strong>
                          <small>
                            {edge.source === selected.id
                              ? "outgoing"
                              : "incoming"}
                            {" · "}
                            {otherLabel}
                            {" · "}
                            {edge.count} exact
                          </small>
                        </span>
                        <ChevronRight aria-hidden="true" size={15} />
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {selectedRelationship?.projection === "exact" ? (
                <section className="earth-evidence">
                  <p>{selectedRelationship.relationType}</p>
                  <strong>{selectedRelationship.provenance}</strong>
                  <dl>
                    <div>
                      <dt>Source</dt>
                      <dd>{selectedRelationship.source}</dd>
                    </div>
                    <div>
                      <dt>Target</dt>
                      <dd>{selectedRelationship.target}</dd>
                    </div>
                    <div>
                      <dt>Official predicate</dt>
                      <dd>{selectedRelationship.evidence.text}</dd>
                    </div>
                  </dl>
                  <a
                    href={selectedRelationship.evidence.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open evidence source
                    <ExternalLink aria-hidden="true" size={13} />
                  </a>
                </section>
              ) : null}

              {selected.membership === "included" ? (
                <>
                  <div className="earth-children-heading">
                    <span>
                      <Layers3 aria-hidden="true" size={15} /> Next level
                    </span>
                    <small>
                      {loadingChildren ? "Loading…" : children.length}
                    </small>
                  </div>
                  <div className="earth-children">
                    {children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => void enterNode(child, [...trail, child])}
                        type="button"
                      >
                        <span>
                          <small>{kindLabel(child)}</small>
                          <strong>{child.label}</strong>
                        </span>
                        <ChevronRight aria-hidden="true" size={15} />
                      </button>
                    ))}
                    {!loadingChildren && children.length === 0 ? (
                      <p>This is the deepest published level for this node.</p>
                    ) : null}
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <div className="earth-empty-selection">
              <Network aria-hidden="true" size={28} />
              <h2>Select a law</h2>
              <p>
                Its hierarchy is requested one level at a time and remains tied
                to the verified official Expression.
              </p>
            </div>
          )}
        </aside>
      </section>

      {overview ? (
        <footer className="earth-build-note">
          <span>Artifact {overview.build.buildId.slice(0, 24)}…</span>
          <span>
            {`${overview.build.sourceSnapshotIds.length} verified source snapshot${overview.build.sourceSnapshotIds.length === 1 ? "" : "s"}`}
          </span>
        </footer>
      ) : null}
    </main>
  );
}
