import express from "express";
import { ZodError } from "zod";
import { logUserQuery } from "../../shared/user-query-log";
import {
  CopilotContextMismatchError,
  CopilotContextNotFoundError,
} from "../context/copilot-context-resolver";
import {
  COPILOT_SCHEMA_VERSION,
  copilotRespondRequestSchema,
  copilotStatusResponseSchema,
} from "../contract/copilot-contract";
import {
  CopilotProviderResponseError,
  CopilotProviderTimeoutError,
  CopilotProviderUnavailableError,
} from "../providers/copilot-answer-provider";
import type { CopilotService } from "../service/copilot-service";

type CopilotRouterOptions = {
  service: CopilotService | null;
};

function sendError(
  response: express.Response,
  status: number,
  code:
    | "invalid_request"
    | "context_not_found"
    | "context_mismatch"
    | "provider_unavailable"
    | "provider_response_invalid"
    | "timeout",
  message: string,
  requestId?: string,
) {
  response.status(status).json({
    schemaVersion: COPILOT_SCHEMA_VERSION,
    requestId,
    error: { code, message },
  });
}

export function createCopilotRouter(options: CopilotRouterOptions) {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  router.use(express.json({ limit: "64kb", strict: true }));

  router.get("/status", (_request, response) => {
    response.json(
      copilotStatusResponseSchema.parse({
        schemaVersion: COPILOT_SCHEMA_VERSION,
        status: options.service ? "ready" : "unavailable",
        capabilities: {
          contextAnswer: Boolean(options.service),
          currentDocumentRetrieval: false,
          corpusRetrieval: false,
          serverConversationMemory: false,
        },
      }),
    );
  });

  router.post("/respond", async (request, response) => {
    const parsed = copilotRespondRequestSchema.safeParse(request.body);
    const requestId =
      typeof request.body?.requestId === "string"
        ? request.body.requestId.slice(0, 100)
        : undefined;
    if (!parsed.success) {
      sendError(
        response,
        400,
        "invalid_request",
        "Copilot request is invalid",
        requestId,
      );
      return;
    }
    logUserQuery({
      surface: "reader_copilot",
      interaction:
        parsed.data.mode === "chat" ? "user_question" : "automatic_explain",
      query: parsed.data.question,
      requestId: parsed.data.requestId,
      metadata: {
        mode: parsed.data.mode,
        documentId: parsed.data.context.documentId,
        provisionId: parsed.data.context.provisionId,
        entityId: parsed.data.context.entityId,
      },
    });
    if (!options.service) {
      sendError(
        response,
        503,
        "provider_unavailable",
        "The configured answer provider is unavailable",
        parsed.data.requestId,
      );
      return;
    }

    const controller = new AbortController();
    request.on("aborted", () => controller.abort());
    response.on("close", () => {
      if (!response.writableEnded) controller.abort();
    });
    try {
      response.json(
        await options.service.respond(parsed.data, controller.signal),
      );
    } catch (caught) {
      if (caught instanceof CopilotContextNotFoundError) {
        sendError(
          response,
          404,
          "context_not_found",
          caught.message,
          parsed.data.requestId,
        );
      } else if (caught instanceof CopilotContextMismatchError) {
        sendError(
          response,
          409,
          "context_mismatch",
          caught.message,
          parsed.data.requestId,
        );
      } else if (caught instanceof CopilotProviderTimeoutError) {
        sendError(
          response,
          504,
          "timeout",
          "The configured answer provider timed out",
          parsed.data.requestId,
        );
      } else if (caught instanceof CopilotProviderResponseError) {
        sendError(
          response,
          502,
          "provider_response_invalid",
          "The configured answer provider returned an invalid grounded answer",
          parsed.data.requestId,
        );
      } else if (caught instanceof CopilotProviderUnavailableError) {
        sendError(
          response,
          503,
          "provider_unavailable",
          "The configured answer provider is unavailable",
          parsed.data.requestId,
        );
      } else if (caught instanceof ZodError) {
        sendError(
          response,
          500,
          "provider_response_invalid",
          "Copilot produced an invalid response",
          parsed.data.requestId,
        );
      } else {
        sendError(
          response,
          500,
          "provider_unavailable",
          "Copilot could not complete the request",
          parsed.data.requestId,
        );
      }
    }
  });

  router.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      if (response.headersSent) return next(error);
      sendError(
        response,
        400,
        "invalid_request",
        "Copilot request body is invalid or too large",
      );
    },
  );
  return router;
}
