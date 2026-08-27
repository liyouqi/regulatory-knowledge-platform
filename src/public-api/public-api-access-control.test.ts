import { describe, expect, it } from "vitest";
import {
  PublicApiAccessController,
  loadPublicApiAccessConfig,
} from "./public-api-access-control";

const TEST_KEY = "test-public-api-key-2026";

describe("Public API access configuration", () => {
  it("fails closed when no API key is configured", () => {
    const controller = new PublicApiAccessController(
      loadPublicApiAccessConfig({}),
    );

    expect(controller.authorize(undefined, "127.0.0.1")).toEqual({
      allowed: false,
      reason: "service-not-configured",
    });
    expect(controller.snapshot()).toMatchObject({
      configured: false,
      authentication: "bearer-api-key",
      rateLimit: { scope: "process", requestLimit: 60, windowMs: 60_000 },
      counters: { totalRequests: 1, acceptedRequests: 0 },
    });
  });

  it("rejects ambiguous keys and invalid rate settings at startup", () => {
    expect(() =>
      loadPublicApiAccessConfig({ REGULATORY_PUBLIC_API_KEYS: "too-short" }),
    ).toThrow("REGULATORY_PUBLIC_API_KEYS entries must be 16-256");
    expect(() =>
      loadPublicApiAccessConfig({
        REGULATORY_PUBLIC_API_KEYS: `${TEST_KEY},${TEST_KEY}`,
      }),
    ).toThrow("entries must be unique");
    expect(() =>
      loadPublicApiAccessConfig({
        REGULATORY_PUBLIC_API_RATE_LIMIT: "0",
      }),
    ).toThrow("must be between 1 and 100000");
    expect(() =>
      loadPublicApiAccessConfig({
        REGULATORY_PUBLIC_API_RATE_WINDOW_MS: "fast",
      }),
    ).toThrow("must be an integer");
  });
});

describe("Public API access controller", () => {
  it("accepts only a valid Bearer key without exposing it in monitoring", () => {
    const controller = new PublicApiAccessController(
      loadPublicApiAccessConfig({ REGULATORY_PUBLIC_API_KEYS: TEST_KEY }),
      () => 10_000,
    );

    expect(controller.authorize(undefined, "127.0.0.1")).toMatchObject({
      allowed: false,
      reason: "authentication-required",
    });
    expect(
      controller.authorize("bearer test-public-api-key-2026", "127.0.0.1"),
    ).toMatchObject({
      allowed: false,
      reason: "authentication-required",
    });
    expect(controller.authorize(`Bearer ${TEST_KEY}`, "127.0.0.1")).toEqual({
      allowed: true,
      limit: 60,
      remaining: 59,
      resetAt: 60_000,
    });
    expect(JSON.stringify(controller.snapshot())).not.toContain(TEST_KEY);
    expect(controller.snapshot().counters).toMatchObject({
      totalRequests: 3,
      acceptedRequests: 1,
      authenticationFailures: 2,
      rateLimitedRequests: 0,
    });
  });

  it("limits valid keys and unauthorized requests in independent windows", () => {
    let now = 1_100;
    const controller = new PublicApiAccessController(
      loadPublicApiAccessConfig({
        REGULATORY_PUBLIC_API_KEYS: TEST_KEY,
        REGULATORY_PUBLIC_API_RATE_LIMIT: "2",
        REGULATORY_PUBLIC_API_RATE_WINDOW_MS: "1000",
      }),
      () => now,
    );

    expect(
      controller.authorize(`Bearer ${TEST_KEY}`, "127.0.0.1"),
    ).toMatchObject({ allowed: true, remaining: 1, resetAt: 2_000 });
    expect(
      controller.authorize(`Bearer ${TEST_KEY}`, "127.0.0.1"),
    ).toMatchObject({ allowed: true, remaining: 0 });
    expect(controller.authorize(`Bearer ${TEST_KEY}`, "127.0.0.1")).toEqual({
      allowed: false,
      reason: "rate-limit-exceeded",
      limit: 2,
      remaining: 0,
      resetAt: 2_000,
    });

    expect(controller.authorize(undefined, "10.0.0.1")).toMatchObject({
      allowed: false,
      reason: "authentication-required",
      rateLimit: { remaining: 1 },
    });
    expect(controller.authorize("Bearer wrong-key", "10.0.0.1")).toMatchObject({
      allowed: false,
      reason: "authentication-required",
      rateLimit: { remaining: 0 },
    });
    expect(controller.authorize(undefined, "10.0.0.1")).toMatchObject({
      allowed: false,
      reason: "rate-limit-exceeded",
    });

    now = 2_000;
    expect(
      controller.authorize(`Bearer ${TEST_KEY}`, "127.0.0.1"),
    ).toMatchObject({ allowed: true, remaining: 1, resetAt: 3_000 });
    controller.recordServerError();
    expect(controller.snapshot().counters).toEqual({
      totalRequests: 7,
      acceptedRequests: 3,
      authenticationFailures: 2,
      rateLimitedRequests: 2,
      serverErrors: 1,
    });
  });
});
