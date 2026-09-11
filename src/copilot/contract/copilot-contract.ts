import { z } from "zod";

export const COPILOT_SCHEMA_VERSION = "0.1.0" as const;
export const COPILOT_MAX_RECENT_MESSAGES = 8;

const boundedId = z.string().trim().min(1).max(300);

export const copilotSelectionSchema = z
  .object({
    entityId: boundedId,
    textRun: z.number().int().nonnegative().max(1_000),
    start: z.number().int().nonnegative().max(1_000_000),
    end: z.number().int().positive().max(1_000_000),
    text: z.string().min(1).max(4_000),
  })
  .strict()
  .refine((selection) => selection.end > selection.start, {
    message: "Selection end must be after start",
  });

export const readingContextRefSchema = z
  .object({
    documentId: boundedId,
    provisionId: boundedId,
    entityId: boundedId.optional(),
    selection: copilotSelectionSchema.optional(),
  })
  .strict()
  .superRefine((context, refinement) => {
    if (context.selection && context.entityId !== context.selection.entityId) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selection entity must match context entity",
        path: ["selection", "entityId"],
      });
    }
  });

export const copilotRequestMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(6_000),
  })
  .strict();

export const copilotRespondRequestSchema = z
  .object({
    schemaVersion: z.literal(COPILOT_SCHEMA_VERSION),
    requestId: z.string().trim().min(1).max(100),
    mode: z.enum(["explain", "chat"]),
    context: readingContextRefSchema,
    messages: z
      .array(copilotRequestMessageSchema)
      .max(COPILOT_MAX_RECENT_MESSAGES),
    question: z.string().trim().min(1).max(4_000),
  })
  .strict();

export const copilotCitationSchema = z
  .object({
    entityId: boundedId,
    label: z.string().min(1).max(300),
    path: z.string().startsWith("/"),
    sourceUrl: z.string().url(),
  })
  .strict();

export const copilotRuntimeIdentitySchema = z
  .object({
    buildId: z.string().min(1),
    profileId: z.string().min(1),
    profileHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

export const copilotRespondResponseSchema = z
  .object({
    schemaVersion: z.literal(COPILOT_SCHEMA_VERSION),
    requestId: z.string().min(1).max(100),
    status: z.enum(["answered", "insufficient_context"]),
    answer: z.string().min(1).max(12_000),
    citations: z.array(copilotCitationSchema).max(8),
    evidenceScope: z.enum(["current_context", "current_document", "corpus"]),
    runtime: copilotRuntimeIdentitySchema,
  })
  .strict();

export const copilotErrorResponseSchema = z
  .object({
    schemaVersion: z.literal(COPILOT_SCHEMA_VERSION),
    requestId: z.string().max(100).optional(),
    error: z
      .object({
        code: z.enum([
          "invalid_request",
          "context_not_found",
          "context_mismatch",
          "provider_unavailable",
          "provider_response_invalid",
          "timeout",
        ]),
        message: z.string().min(1).max(500),
      })
      .strict(),
  })
  .strict();

export const copilotStatusResponseSchema = z
  .object({
    schemaVersion: z.literal(COPILOT_SCHEMA_VERSION),
    status: z.enum(["ready", "unavailable"]),
    capabilities: z
      .object({
        contextAnswer: z.boolean(),
        currentDocumentRetrieval: z.literal(false),
        corpusRetrieval: z.literal(false),
        serverConversationMemory: z.literal(false),
      })
      .strict(),
  })
  .strict();

export type ReadingContextRef = z.infer<typeof readingContextRefSchema>;
export type CopilotRespondRequest = z.infer<typeof copilotRespondRequestSchema>;
export type CopilotRespondResponse = z.infer<
  typeof copilotRespondResponseSchema
>;
export type CopilotCitation = z.infer<typeof copilotCitationSchema>;
