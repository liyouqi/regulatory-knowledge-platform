import { describe, expect, it } from "vitest";
import {
  earthUniverseSchema,
  findEarthUniverseMember,
  loadEarthUniverse,
} from "./earth-universe";

describe("Earth universe", () => {
  it("loads the isolated EU Banking 10 scope", async () => {
    const universe = await loadEarthUniverse(
      "data/earth/universes/eu-banking-10.json",
    );

    expect(universe.members).toHaveLength(10);
    expect(findEarthUniverseMember(universe, "32022r2554")?.label).toBe("DORA");
  });

  it("rejects duplicate official identifiers", () => {
    const duplicate = {
      schemaVersion: "0.1.0",
      id: "duplicate",
      version: "0.1.0",
      displayName: "Duplicate",
      description: "Invalid duplicate test fixture.",
      provenance: "EDITORIAL",
      language: "ENG",
      expressionPolicy: "english-celex-expression",
      relationshipPolicy: { includeOfficialOneHopBoundary: true },
      members: [
        { celex: "32022R2554", label: "DORA" },
        { celex: "32022R2554", label: "DORA again" },
      ],
    };

    expect(earthUniverseSchema.safeParse(duplicate).success).toBe(false);
  });
});
