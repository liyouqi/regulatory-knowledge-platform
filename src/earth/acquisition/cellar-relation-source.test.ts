import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EarthUniverse } from "../universe/earth-universe";
import {
  acquireEarthCellarRelations,
  buildEarthCellarRelationQuery,
  parseEarthCellarRelationResults,
  readVerifiedEarthRelationSnapshot,
} from "./cellar-relation-source";

const amendsPredicate =
  "http://publications.europa.eu/ontology/cdm#resource_legal_amends_resource_legal";

const universe: EarthUniverse = {
  schemaVersion: "0.1.0",
  id: "earth-relation-test",
  version: "0.1.0",
  displayName: "Earth relation test",
  description: "Test-only Earth relation scope.",
  provenance: "EDITORIAL",
  language: "ENG",
  expressionPolicy: "english-celex-expression",
  relationshipPolicy: { includeOfficialOneHopBoundary: true },
  members: [{ celex: "39999R9999", label: "Test regulation" }],
};

function rawResult() {
  return {
    results: {
      bindings: [
        {
          source: {
            type: "uri",
            value: "http://publications.europa.eu/resource/cellar/source-test",
          },
          sourceCelexUri: {
            type: "uri",
            value: "http://publications.europa.eu/resource/celex/39999R9999",
          },
          sourceTitle: { type: "literal", value: "Test-only source title" },
          predicate: { type: "uri", value: amendsPredicate },
          target: {
            type: "uri",
            value: "http://publications.europa.eu/resource/cellar/target-test",
          },
          targetCelexUri: {
            type: "uri",
            value: "http://publications.europa.eu/resource/celex/39998R9998",
          },
          targetTitle: { type: "literal", value: "Test-only target title" },
        },
      ],
    },
  };
}

function response(value: unknown): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return {
    ok: true,
    status: 200,
    url: "https://publications.europa.eu/webapi/rdf/sparql",
    headers: new Headers({
      "content-type": "application/sparql-results+json",
      "content-length": String(bytes.byteLength),
    }),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

describe("Earth CELLAR relation acquisition", () => {
  it("builds a deterministic one-hop query with only reviewed predicates", () => {
    const query = buildEarthCellarRelationQuery([
      "39999R9999",
      "39998R9998",
      "39999R9999",
    ]);
    expect(query).toContain("resource_legal_amends_resource_legal");
    expect(query).toContain("resource_legal_corrects_resource_legal");
    expect(query).toContain("expression_title");
    expect(query).toContain("OPTIONAL {");
    expect(query).not.toContain("work_cites_work");
    expect(buildEarthCellarRelationQuery(["39998R9998", "39999R9999"])).toBe(
      query,
    );
  });

  it("retains official relations when CELLAR has no English Expression title", () => {
    const value = rawResult();
    const binding = value.results.bindings[0] as {
      sourceTitle?: { type: string; value: string };
    };
    binding.sourceTitle = undefined;
    expect(parseEarthCellarRelationResults(value, ["39999R9999"])).toEqual([
      expect.objectContaining({
        sourceCelex: "39999R9999",
        targetCelex: "39998R9998",
      }),
    ]);
    expect(
      parseEarthCellarRelationResults(value, ["39999R9999"])[0],
    ).not.toHaveProperty("sourceTitle");
  });

  it("normalizes and verifies an immutable official relation snapshot", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "earth-relations-"));
    try {
      const result = await acquireEarthCellarRelations(universe, {
        outputRoot,
        fetchImplementation: async (_input, init) => {
          expect(init?.method).toBe("POST");
          expect(init?.body).toBe(
            buildEarthCellarRelationQuery(["39999R9999"]),
          );
          return response(rawResult());
        },
        now: () => new Date("2026-09-10T12:00:00.000Z"),
      });
      expect(result.records).toEqual([
        expect.objectContaining({
          sourceCelex: "39999R9999",
          sourceWorkUri:
            "https://publications.europa.eu/resource/cellar/source-test",
          targetCelex: "39998R9998",
        }),
      ]);
      await expect(
        readVerifiedEarthRelationSnapshot(result.directory),
      ).resolves.toMatchObject({
        snapshot: { recordCount: 1, seedCelexes: ["39999R9999"] },
      });
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it("fails closed for off-neighbourhood records and modified normalized data", async () => {
    expect(() =>
      parseEarthCellarRelationResults(rawResult(), ["39997R9997"]),
    ).toThrow("outside the seed neighbourhood");
    const outputRoot = await mkdtemp(join(tmpdir(), "earth-relations-"));
    try {
      const result = await acquireEarthCellarRelations(universe, {
        outputRoot,
        fetchImplementation: async () => response(rawResult()),
      });
      await writeFile(join(result.directory, "normalized.json"), "[]\n");
      await expect(
        readVerifiedEarthRelationSnapshot(result.directory),
      ).rejects.toThrow("normalized relations");
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});
