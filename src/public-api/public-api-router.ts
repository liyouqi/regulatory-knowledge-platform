import express from "express";
import {
  PUBLIC_API_CONTRACT_VERSION,
  PUBLIC_API_VERSION,
} from "../shared/public-api";
import type { PublicApiAccessController } from "./public-api-access-control";
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

function setRateLimitHeaders(
  response: express.Response,
  rateLimit: { limit: number; remaining: number; resetAt: number },
) {
  response.setHeader("RateLimit-Limit", rateLimit.limit);
  response.setHeader("RateLimit-Remaining", Math.max(0, rateLimit.remaining));
  response.setHeader("RateLimit-Reset", Math.ceil(rateLimit.resetAt / 1_000));
}

export function createPublicApiRouter(
  service: PublicApiService,
  accessController: PublicApiAccessController,
) {
  const router = express.Router();

  router.use((request, response, next) => {
    response.setHeader("X-API-Version", PUBLIC_API_VERSION);
    response.setHeader("X-API-Contract-Version", PUBLIC_API_CONTRACT_VERSION);
    response.setHeader(
      "X-Runtime-Build-Id",
      service.discover().response.meta.runtime.buildId,
    );
    const decision = accessController.authorize(
      request.header("authorization"),
      request.ip || request.socket.remoteAddress || "unknown",
    );
    if (decision.allowed) {
      setRateLimitHeaders(response, decision);
      next();
      return;
    }
    if (decision.reason === "service-not-configured") {
      sendOperation(response, service.serviceNotConfigured());
      return;
    }
    if (decision.reason === "authentication-required") {
      if (decision.rateLimit) setRateLimitHeaders(response, decision.rateLimit);
      response.setHeader("WWW-Authenticate", 'Bearer realm="public-api-v1"');
      sendOperation(response, service.authenticationRequired());
      return;
    }
    setRateLimitHeaders(response, decision);
    response.setHeader(
      "Retry-After",
      Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1_000)),
    );
    sendOperation(response, service.rateLimitExceeded());
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
        {
          jurisdiction: queryParameter(request.query.jurisdiction),
          documentType: queryParameter(request.query.documentType),
          regulatoryLevel: queryParameter(request.query.regulatoryLevel),
          measureType: queryParameter(request.query.measureType),
        },
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

  router.get("/provisions/:entityId/relationships", (request, response) => {
    sendOperation(
      response,
      service.getProvisionRelationships(
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
      accessController.recordServerError();
      sendOperation(response, service.internalError());
    },
  );

  return router;
}
