import express from "express";
import { earthRelationshipTypeSchema } from "../contract/earth-contract";
import {
  EARTH_BOUNDARY_LIMIT_DEFAULT,
  EARTH_BOUNDARY_LIMIT_MAX,
  EARTH_CHILDREN_LIMIT_MAX,
  EARTH_NEIGHBOURHOOD_DEPTH_MAX,
  EARTH_NEIGHBOURHOOD_EDGES_MAX,
  EARTH_NEIGHBOURHOOD_NODES_MAX,
  type EarthNeighbourhoodOptions,
  type EarthRepository,
} from "../runtime/earth-repository";

const DEFAULT_CHILDREN_LIMIT = 50;
const DEFAULT_NEIGHBOURHOOD_OPTIONS: EarthNeighbourhoodOptions = {
  depth: 1,
  nodeLimit: 100,
  edgeLimit: 150,
  direction: "both",
};

function queryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function positiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  if (value === undefined) return fallback;
  if (!/^[1-9][0-9]*$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : undefined;
}
function nonNegativeInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  if (value === undefined) return fallback;
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : undefined;
}
function badRequest(response: express.Response, message: string) {
  response.status(400).json({ error: { code: "invalid_request", message } });
}
function notFound(response: express.Response, resource: string) {
  response.status(404).json({
    error: { code: "not_found", message: `${resource} was not found` },
  });
}

/** Bounded, read-only transport for an injected Earth artifact repository. */
export function createEarthRouter(repository: EarthRepository) {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.setHeader("X-Earth-Build-Id", repository.manifest.buildId);
    response.setHeader(
      "X-Earth-Schema-Version",
      repository.manifest.schemaVersion,
    );
    next();
  });
  router.get("/universes", (_request, response) =>
    response.json({ universes: repository.listUniverses() }),
  );
  router.get("/universes/:universeId/overview", (request, response) => {
    const boundaryLimit = positiveInteger(
      queryString(request.query.boundaryLimit),
      EARTH_BOUNDARY_LIMIT_DEFAULT,
      EARTH_BOUNDARY_LIMIT_MAX,
    );
    const boundaryOffset = nonNegativeInteger(
      queryString(request.query.boundaryOffset),
      0,
      100_000,
    );
    const boundaryQuery = queryString(request.query.boundaryQuery)?.trim();
    if (
      !boundaryLimit ||
      boundaryOffset === undefined ||
      (boundaryQuery?.length ?? 0) > 80
    ) {
      return badRequest(
        response,
        `boundaryLimit must be 1-${EARTH_BOUNDARY_LIMIT_MAX}, boundaryOffset must be 0-100000, and boundaryQuery must be at most 80 characters`,
      );
    }
    const overview = repository.overview(request.params.universeId, {
      boundaryLimit,
      boundaryOffset,
      ...(boundaryQuery ? { boundaryQuery } : {}),
    });
    if (!overview) return notFound(response, "Universe");
    return response.json(overview);
  });
  router.get("/nodes/:nodeId", (request, response) => {
    const node = repository.findNode(request.params.nodeId);
    if (!node) return notFound(response, "Node");
    return response.json({ node });
  });
  router.get("/nodes/:nodeId/children", (request, response) => {
    const limit = positiveInteger(
      queryString(request.query.limit),
      DEFAULT_CHILDREN_LIMIT,
      EARTH_CHILDREN_LIMIT_MAX,
    );
    if (!limit)
      return badRequest(
        response,
        `limit must be an integer from 1 to ${EARTH_CHILDREN_LIMIT_MAX}`,
      );
    if (!repository.findNode(request.params.nodeId))
      return notFound(response, "Node");
    return response.json({
      children: repository.children(request.params.nodeId, limit),
      limit,
    });
  });
  router.get("/nodes/:nodeId/neighbourhood", (request, response) => {
    const depth = positiveInteger(
      queryString(request.query.depth),
      DEFAULT_NEIGHBOURHOOD_OPTIONS.depth,
      EARTH_NEIGHBOURHOOD_DEPTH_MAX,
    );
    const nodeLimit = positiveInteger(
      queryString(request.query.nodeLimit),
      DEFAULT_NEIGHBOURHOOD_OPTIONS.nodeLimit,
      EARTH_NEIGHBOURHOOD_NODES_MAX,
    );
    const edgeLimit = positiveInteger(
      queryString(request.query.edgeLimit),
      DEFAULT_NEIGHBOURHOOD_OPTIONS.edgeLimit,
      EARTH_NEIGHBOURHOOD_EDGES_MAX,
    );
    const direction =
      queryString(request.query.direction) ??
      DEFAULT_NEIGHBOURHOOD_OPTIONS.direction;
    const requestedTypes = queryString(request.query.relationTypes)
      ?.split(",")
      .filter(Boolean);
    if (
      !depth ||
      !nodeLimit ||
      !edgeLimit ||
      !["in", "out", "both"].includes(direction)
    )
      return badRequest(response, "Invalid neighbourhood bounds or direction");
    if (
      requestedTypes?.some(
        (type) => !earthRelationshipTypeSchema.safeParse(type).success,
      )
    )
      return badRequest(response, "Invalid relationship type");
    const result = repository.neighbourhood(request.params.nodeId, {
      depth,
      nodeLimit,
      edgeLimit,
      direction: direction as EarthNeighbourhoodOptions["direction"],
      ...(requestedTypes?.length ? { relationTypes: requestedTypes } : {}),
    });
    if (!result) return notFound(response, "Node");
    return response.json(result);
  });
  router.get("/relationships/:edgeId", (request, response) => {
    const relationship = repository.relationshipDetail(request.params.edgeId);
    if (!relationship) return notFound(response, "Relationship");
    return response.json({ relationship });
  });
  return router;
}
