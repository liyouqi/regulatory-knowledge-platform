import express from "express";
import { EarthRepository } from "../runtime/earth-repository";
import { createEarthRouter } from "./earth-router";

/** An absent or outdated Earth artifact must not prevent Platform startup. */
export function createEarthFeatureRouter(artifactPath: string) {
  try {
    return createEarthRouter(new EarthRepository(artifactPath));
  } catch {
    const router = express.Router();
    router.use((_request, response) =>
      response.status(503).json({
        error: {
          code: "earth_artifact_unavailable",
          message:
            "The compatible, verified Earth artifact is unavailable. Rebuild it with earth:build.",
        },
      }),
    );
    return router;
  }
}
