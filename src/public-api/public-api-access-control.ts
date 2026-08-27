import { createHash, timingSafeEqual } from "node:crypto";

const DEFAULT_REQUEST_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60_000;
const MINIMUM_API_KEY_LENGTH = 16;
const MAXIMUM_API_KEY_LENGTH = 256;
const MAXIMUM_RATE_LIMIT_BUCKETS = 10_000;

export interface PublicApiAccessConfig {
  readonly apiKeyDigests: readonly Buffer[];
  readonly requestLimit: number;
  readonly windowMs: number;
}

export interface PublicApiAccessSnapshot {
  configured: boolean;
  authentication: "bearer-api-key";
  rateLimit: {
    scope: "process";
    requestLimit: number;
    windowMs: number;
  };
  counters: {
    totalRequests: number;
    acceptedRequests: number;
    authenticationFailures: number;
    rateLimitedRequests: number;
    serverErrors: number;
  };
}

interface RateLimitState {
  limit: number;
  remaining: number;
  resetAt: number;
}

export type PublicApiAccessDecision =
  | ({ allowed: true } & RateLimitState)
  | {
      allowed: false;
      reason: "service-not-configured";
    }
  | {
      allowed: false;
      reason: "authentication-required";
      rateLimit: RateLimitState;
    }
  | ({ allowed: false; reason: "rate-limit-exceeded" } & RateLimitState);

interface RateLimitBucket {
  windowStart: number;
  count: number;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function parseBoundedInteger(
  value: string | undefined,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${name} must be an integer`);
  }
  const parsed = Number.parseInt(value, 10);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

export function loadPublicApiAccessConfig(
  environment: Record<string, string | undefined> = process.env,
): PublicApiAccessConfig {
  const rawKeys = environment.REGULATORY_PUBLIC_API_KEYS?.trim() ?? "";
  const keys =
    rawKeys === "" ? [] : rawKeys.split(",").map((key) => key.trim());

  for (const key of keys) {
    if (
      key.length < MINIMUM_API_KEY_LENGTH ||
      key.length > MAXIMUM_API_KEY_LENGTH ||
      !/^[!-~]+$/.test(key)
    ) {
      throw new Error(
        `REGULATORY_PUBLIC_API_KEYS entries must be ${MINIMUM_API_KEY_LENGTH}-${MAXIMUM_API_KEY_LENGTH} printable non-whitespace ASCII characters`,
      );
    }
  }
  if (new Set(keys).size !== keys.length) {
    throw new Error("REGULATORY_PUBLIC_API_KEYS entries must be unique");
  }

  return {
    apiKeyDigests: keys.map(digest),
    requestLimit: parseBoundedInteger(
      environment.REGULATORY_PUBLIC_API_RATE_LIMIT,
      "REGULATORY_PUBLIC_API_RATE_LIMIT",
      DEFAULT_REQUEST_LIMIT,
      1,
      100_000,
    ),
    windowMs: parseBoundedInteger(
      environment.REGULATORY_PUBLIC_API_RATE_WINDOW_MS,
      "REGULATORY_PUBLIC_API_RATE_WINDOW_MS",
      DEFAULT_WINDOW_MS,
      1_000,
      3_600_000,
    ),
  };
}

function bearerToken(authorization: string | undefined) {
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  return match?.[1];
}

export class PublicApiAccessController {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly counters = {
    totalRequests: 0,
    acceptedRequests: 0,
    authenticationFailures: 0,
    rateLimitedRequests: 0,
    serverErrors: 0,
  };

  constructor(
    private readonly config: PublicApiAccessConfig,
    private readonly now: () => number = Date.now,
  ) {}

  authorize(
    authorization: string | undefined,
    clientAddress: string,
  ): PublicApiAccessDecision {
    this.counters.totalRequests += 1;
    if (this.config.apiKeyDigests.length === 0) {
      return { allowed: false, reason: "service-not-configured" };
    }

    const token = bearerToken(authorization);
    const tokenDigest = token ? digest(token) : null;
    let matchingDigest: Buffer | null = null;
    if (tokenDigest) {
      for (const configuredDigest of this.config.apiKeyDigests) {
        if (timingSafeEqual(tokenDigest, configuredDigest)) {
          matchingDigest = configuredDigest;
        }
      }
    }

    const identity = matchingDigest
      ? `key:${matchingDigest.toString("hex")}`
      : `unauthorized:${digest(clientAddress).toString("hex")}`;
    const rateLimit = this.consume(identity);
    if (rateLimit.remaining < 0) {
      this.counters.rateLimitedRequests += 1;
      return {
        allowed: false,
        reason: "rate-limit-exceeded",
        limit: rateLimit.limit,
        remaining: 0,
        resetAt: rateLimit.resetAt,
      };
    }

    if (!matchingDigest) {
      this.counters.authenticationFailures += 1;
      return {
        allowed: false,
        reason: "authentication-required",
        rateLimit,
      };
    }

    this.counters.acceptedRequests += 1;
    return { allowed: true, ...rateLimit };
  }

  recordServerError() {
    this.counters.serverErrors += 1;
  }

  snapshot(): PublicApiAccessSnapshot {
    return {
      configured: this.config.apiKeyDigests.length > 0,
      authentication: "bearer-api-key",
      rateLimit: {
        scope: "process",
        requestLimit: this.config.requestLimit,
        windowMs: this.config.windowMs,
      },
      counters: { ...this.counters },
    };
  }

  private consume(identity: string): RateLimitState {
    const now = this.now();
    const windowStart =
      Math.floor(now / this.config.windowMs) * this.config.windowMs;
    const existing = this.buckets.get(identity);
    const bucket =
      existing?.windowStart === windowStart
        ? existing
        : { windowStart, count: 0 };
    bucket.count += 1;
    this.buckets.set(identity, bucket);
    this.pruneBuckets(windowStart);
    return {
      limit: this.config.requestLimit,
      remaining: this.config.requestLimit - bucket.count,
      resetAt: windowStart + this.config.windowMs,
    };
  }

  private pruneBuckets(currentWindowStart: number) {
    if (this.buckets.size <= MAXIMUM_RATE_LIMIT_BUCKETS) return;
    for (const [identity, bucket] of this.buckets) {
      if (bucket.windowStart < currentWindowStart)
        this.buckets.delete(identity);
    }
    while (this.buckets.size > MAXIMUM_RATE_LIMIT_BUCKETS) {
      const oldestIdentity = this.buckets.keys().next().value;
      if (oldestIdentity === undefined) break;
      this.buckets.delete(oldestIdentity);
    }
  }
}
