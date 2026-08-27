import express from "express";
import {
  PUBLIC_API_CONTRACT_VERSION,
  PUBLIC_API_VERSION,
} from "../shared/public-api";
import {
  publicApiOpenApiDocument,
  renderSwaggerUiHtml,
  swaggerUiAssetPath,
} from "./public-api-openapi";

function setDocumentationHeaders(
  response: express.Response,
  runtimeBuildId: string,
) {
  response.setHeader("X-API-Version", PUBLIC_API_VERSION);
  response.setHeader("X-API-Contract-Version", PUBLIC_API_CONTRACT_VERSION);
  response.setHeader("X-Runtime-Build-Id", runtimeBuildId);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

export function createPublicApiDocumentationRouter(runtimeBuildId: string) {
  const router = express.Router();

  router.get("/v1/openapi.json", (_request, response) => {
    setDocumentationHeaders(response, runtimeBuildId);
    response.setHeader("Cache-Control", "public, max-age=300");
    response.json(publicApiOpenApiDocument);
  });

  router.use(
    "/docs/assets",
    express.static(swaggerUiAssetPath, {
      fallthrough: false,
      index: false,
      maxAge: "1d",
      setHeaders(response) {
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
      },
    }),
  );

  router.get(["/docs", "/docs/"], (_request, response) => {
    setDocumentationHeaders(response, runtimeBuildId);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
    );
    response.type("html").send(renderSwaggerUiHtml());
  });

  return router;
}
