import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import type { EarthRepository } from "../runtime/earth-repository";
import { createEarthRouter } from "./earth-router";

// Repository fixture creation is intentionally kept in the runtime test; this adapter only needs its public reader API.
function fakeRepository() {
  return {
    manifest: { buildId: "earth-test", schemaVersion: "0.1.0" },
    listUniverses: () => [{ id: "earth", version: "1", displayName: "Earth" }],
    overview: (id: string) =>
      id === "earth"
        ? {
            universe: { id: "earth" },
            works: [],
            relationshipCount: 0,
            aggregates: [],
            boundary: {
              nodes: [],
              nodeCount: 0,
              matchCount: 0,
              returnedCount: 0,
              relationshipCount: 0,
              visibleRelationshipCount: 0,
              limit: 100,
              offset: 0,
              hasMore: false,
            },
          }
        : undefined,
    findNode: (id: string) =>
      id === "node"
        ? {
            id,
            membership: "included",
            entityKind: "document",
            workId: "work",
            label: "Law",
            officialIdentity: { workUri: "https://example.test/work" },
            measureType: "other",
          }
        : undefined,
    children: () => [],
    neighbourhood: (id: string, options: unknown) =>
      id === "node"
        ? { root: { id }, nodes: [{ id }], relationships: [], options }
        : undefined,
    relationshipDetail: () => undefined,
    articleReading: (id: string) =>
      id === "article" ? { articleId: id } : undefined,
  } as unknown as EarthRepository;
}

async function request(path: string) {
  const app = express();
  app.use("/api/earth", createEarthRouter(fakeRepository()));
  return new Promise<{ status: number }>((resolve, reject) => {
    const response = {
      statusCode: 200,
      setHeader: () => undefined,
      status(status: number) {
        this.statusCode = status;
        return this;
      },
      json() {
        resolve({ status: this.statusCode });
      },
    };
    (app as unknown as { handle: (...arguments_: unknown[]) => void }).handle(
      { method: "GET", url: path, headers: {} } as never,
      response as never,
      reject,
    );
  });
}

describe("Earth API router", () => {
  it("uses an injected reader and enforces request budgets", async () => {
    expect((await request("/api/earth/universes")).status).toBe(200);
    expect((await request("/api/earth/articles/article/reading")).status).toBe(
      200,
    );
    expect((await request("/api/earth/articles/node/reading")).status).toBe(
      404,
    );
    expect((await request("/api/earth/articles/unknown/reading")).status).toBe(
      404,
    );
    expect(
      (await request("/api/earth/nodes/node/children?limit=101")).status,
    ).toBe(400);
    expect(
      (await request("/api/earth/nodes/node/neighbourhood?depth=4")).status,
    ).toBe(400);
    expect(
      (await request("/api/earth/universes/earth/overview?boundaryLimit=201"))
        .status,
    ).toBe(400);
    expect(
      (await request("/api/earth/universes/earth/overview?boundaryOffset=-1"))
        .status,
    ).toBe(400);
    expect(
      (
        await request(
          "/api/earth/nodes/node/neighbourhood?relationTypes=INVENTED",
        )
      ).status,
    ).toBe(400);
    expect(
      (await request("/api/earth/nodes/node/neighbourhood?depth=1&edgeLimit=1"))
        .status,
    ).toBe(200);
  });
});
