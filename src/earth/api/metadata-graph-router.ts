import { existsSync, readFileSync } from "node:fs";
import express from "express";
import { metadataGraphSchema } from "../contract/metadata-graph";

/** Local read-only prepared graph; requests never contact CELLAR. */
export function createMetadataGraphRouter(
  path = "data/artifacts/earth/graph.json",
) {
  const router = express.Router();
  router.get("/graph", (_request, response) => {
    if (!existsSync(path))
      return response
        .status(503)
        .json({ error: "Earth metadata graph is not installed." });
    const graph = metadataGraphSchema.parse(
      JSON.parse(readFileSync(path, "utf8")),
    );
    response.setHeader("X-Earth-Graph-Snapshot", graph.source.snapshotHash);
    return response.json(graph);
  });
  return router;
}
