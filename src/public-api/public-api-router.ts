import express from "express";
import {
  PUBLIC_API_CONTRACT_VERSION,
  PUBLIC_API_VERSION,
} from "../shared/public-api";
import type {
  PublicApiOperation,
  PublicApiService,
} from "./public-api-service";

function queryParameter(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function sendOperation(
  response: express.Response,
  operation: PublicApiOperation<unknown>,
) {
  response
    .status(operation.ok ? 200 : operation.status)
    .json(operation.response);
}

export function createPublicApiRouter(service: PublicApiService) {
  const router = express.Router();

  router.use((_request, response, next) => {
    response.setHeader("X-API-Version", PUBLIC_API_VERSION);
    response.setHeader("X-API-Contract-Version", PUBLIC_API_CONTRACT_VERSION);
    response.setHeader(
      "X-Runtime-Build-Id",
      service.discover().response.meta.runtime.buildId,
    );
    next();
  });

  router.get("/", (request, response) => {
    sendOperation(
      response,
      service.discover(queryParameter(request.query.profileId)),
    );
  });

  router.get("/laws/resolve", (request, response) => {
    sendOperation(
      response,
      service.resolveLaw(
        queryParameter(request.query.q) ?? "",
        queryParameter(request.query.profileId),
      ),
    );
  });

  router.get("/laws/:documentId/structure", (request, response) => {
    sendOperation(
      response,
      service.getLawStructure(
        request.params.documentId,
        queryParameter(request.query.profileId),
      ),
    );
  });

  router.get("/provisions/:entityId", (request, response) => {
    sendOperation(
      response,
      service.getProvision(
        request.params.entityId,
        queryParameter(request.query.profileId),
      ),
    );
  });

  router.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("Public API v1 request failed", error);
      sendOperation(response, service.internalError());
    },
  );

  return router;
}
