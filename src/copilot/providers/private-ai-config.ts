import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const privateAiConfigSchema = z
  .object({
    apiKey: z.string().min(1),
    baseUrl: z.string().url(),
    model: z.string().min(1),
    timeoutSeconds: z.number().positive().max(300),
    authHeader: z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/),
    authScheme: z.string(),
    thinkingMode: z.enum(["enabled", "disabled"]).optional(),
  })
  .strict()
  .superRefine((config, refinement) => {
    const protocol = new URL(config.baseUrl).protocol;
    if (protocol !== "http:" && protocol !== "https:") {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Private AI base URL must use HTTP(S)",
        path: ["baseUrl"],
      });
    }
  });

export type PrivateAiConfig = z.infer<typeof privateAiConfigSchema> & {
  chatCompletionsUrl: string;
};

export type PrivateAiConfigResult =
  | { available: true; config: PrivateAiConfig }
  | { available: false; reason: string };

function maybeLoadLocalEnvironment(environment: NodeJS.ProcessEnv) {
  if (environment !== process.env) return;
  const missing = [
    "PRIVATE_AI_API_KEY",
    "PRIVATE_AI_BASE_URL",
    "PRIVATE_AI_MODEL",
  ].some((name) => !environment[name]?.trim());
  const path = resolve(process.cwd(), ".env");
  if (missing && existsSync(path)) process.loadEnvFile(path);
}

export function loadPrivateAiConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PrivateAiConfigResult {
  maybeLoadLocalEnvironment(environment);
  const required = [
    "PRIVATE_AI_API_KEY",
    "PRIVATE_AI_BASE_URL",
    "PRIVATE_AI_MODEL",
  ].filter((name) => !environment[name]?.trim());
  if (required.length > 0) {
    return {
      available: false,
      reason: `Missing private AI configuration: ${required.join(", ")}`,
    };
  }

  const timeout = Number(environment.PRIVATE_AI_TIMEOUT_SECONDS ?? "60");
  const parsed = privateAiConfigSchema.safeParse({
    apiKey: environment.PRIVATE_AI_API_KEY,
    baseUrl: environment.PRIVATE_AI_BASE_URL?.trim().replace(/\/$/u, ""),
    model: environment.PRIVATE_AI_MODEL,
    timeoutSeconds: timeout,
    authHeader: environment.PRIVATE_AI_AUTH_HEADER ?? "Authorization",
    authScheme: environment.PRIVATE_AI_AUTH_SCHEME ?? "Bearer",
    thinkingMode: environment.PRIVATE_AI_THINKING_MODE || undefined,
  });
  if (!parsed.success) {
    return {
      available: false,
      reason: "Private AI configuration is invalid",
    };
  }
  const base = parsed.data.baseUrl;
  return {
    available: true,
    config: {
      ...parsed.data,
      chatCompletionsUrl: base.endsWith("/chat/completions")
        ? base
        : `${base}/chat/completions`,
    },
  };
}
