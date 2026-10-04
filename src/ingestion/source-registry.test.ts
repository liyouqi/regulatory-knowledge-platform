import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadQueuedSourcesSync,
  loadSourceCatalog,
  loadSourceRegistry,
} from "./source-registry";

describe("EU source registry", () => {
  it("contains reviewed Level 1 acts and registered Level 2 measures", async () => {
    const sources = await loadSourceRegistry();

    expect(sources).toHaveLength(55);
    expect(new Set(sources.map((source) => source.celex)).size).toBe(55);
    expect(sources.slice(0, 10).map((source) => source.shortName)).toEqual([
      "DORA",
      "GDPR",
      "AI Act",
      "MiCA",
      "NIS2",
      "Data Act",
      "CRD IV",
      "CRR",
      "CRR III",
      "CRD VI",
    ]);
    expect(sources.slice(10, 14).map((source) => source.shortName)).toEqual([
      "BRRD",
      "SRMR",
      "DGSD",
      "PSD2",
    ]);
    expect(sources.every((source) => source.quality !== undefined)).toBe(true);
    expect(sources.every((source) => source.status === "active")).toBe(true);
    expect(
      sources.filter((source) => source.familyId === "family:dora"),
    ).toHaveLength(14);
    expect(
      sources.filter((source) => source.familyId === "family:mica"),
    ).toHaveLength(2);
    expect(
      sources
        .filter((source) => source.familyId === "family:aml")
        .map((source) => source.celex),
    ).toEqual([
      "32015L0849",
      "32016R1675",
      "32023R1113",
      "32024R1624",
      "32024L1640",
      "32024R1620",
    ]);
    expect(sources.every((source) => source.aliases.length > 0)).toBe(true);

    expect(
      sources.filter((source) => source.familyId === "family:ai-act"),
    ).toHaveLength(3);
    expect(
      sources.filter((source) => source.batch === "banking-core-8"),
    ).toMatchObject([
      {
        celex: "32012R0648",
        expressionCelex: "02012R0648-20250117",
        quality: { articleCount: 137, annexCount: 4, maximumWarnings: 0 },
        sourceStatus: { basis: "consolidated", textAsOf: "2025-01-17" },
      },
      {
        celex: "32014R0909",
        expressionCelex: "02014R0909-20260117",
        quality: { articleCount: 83, annexCount: 1, maximumWarnings: 0 },
        sourceStatus: { basis: "consolidated", textAsOf: "2026-01-17" },
      },
      {
        celex: "32025R0454",
        familyId: "family:ai-act",
        regulatoryLevel: "level-2",
        measureType: "other",
        quality: { articleCount: 20, recitalCount: 13, maximumWarnings: 0 },
        sourceStatus: { basis: "original-oj", textAsOf: "2025-03-10" },
      },
      {
        celex: "32026R1755",
        familyId: "family:ai-act",
        regulatoryLevel: "level-2",
        measureType: "other",
        quality: {
          articleCount: 15,
          recitalCount: 6,
          annexCount: 1,
          maximumWarnings: 0,
        },
        sourceStatus: { basis: "original-oj", textAsOf: "2026-07-21" },
      },
    ]);

    expect(
      sources.filter((source) => source.batch === "banking-core-7"),
    ).toMatchObject([
      {
        celex: "32014L0065",
        expressionCelex: "02014L0065-20260606",
        quality: { articleCount: 103, annexCount: 4, maximumWarnings: 0 },
        sourceStatus: { basis: "consolidated", textAsOf: "2026-06-06" },
      },
      {
        celex: "32014R0600",
        expressionCelex: "02014R0600-20251123",
        quality: { articleCount: 95, annexCount: 0, maximumWarnings: 0 },
        sourceStatus: { basis: "consolidated", textAsOf: "2025-11-23" },
      },
    ]);
    expect(
      sources.filter((source) => source.batch === "banking-core-6"),
    ).toMatchObject([
      {
        celex: "32010R1093",
        expressionCelex: "02010R1093-20251231",
        quality: { articleCount: 100, recitalCount: 0, maximumWarnings: 0 },
        sourceStatus: { basis: "consolidated", textAsOf: "2025-12-31" },
      },
      {
        celex: "32001L0024",
        expressionCelex: "02001L0024-20140702",
        quality: { articleCount: 36, recitalCount: 32, maximumWarnings: 0 },
        sourceStatus: { basis: "consolidated", textAsOf: "2014-07-02" },
      },
    ]);
    expect(
      sources.filter((source) => source.batch === "banking-core-5"),
    ).toMatchObject([
      {
        celex: "32013R1024",
        quality: { articleCount: 34, recitalCount: 87, maximumWarnings: 0 },
        sourceStatus: { basis: "original-oj", textAsOf: "2013-10-29" },
      },
      {
        celex: "32015R0751",
        quality: { articleCount: 18, recitalCount: 44, maximumWarnings: 0 },
        sourceStatus: { basis: "original-oj", textAsOf: "2015-05-19" },
      },
    ]);
    expect(
      sources.filter((source) => source.batch === "banking-core-4"),
    ).toMatchObject([
      {
        celex: "32002L0047",
        expressionCelex: "02002L0047-20220812",
        quality: { articleCount: 14, maximumWarnings: 0 },
        sourceStatus: { basis: "consolidated", textAsOf: "2022-08-12" },
      },
      {
        celex: "31998L0026",
        expressionCelex: "01998L0026-20240408",
        quality: { articleCount: 16, maximumWarnings: 0 },
        sourceStatus: { basis: "consolidated", textAsOf: "2024-04-08" },
      },
    ]);
    expect(
      sources.filter((source) => source.batch === "banking-core-3"),
    ).toMatchObject([
      {
        celex: "32009L0110",
        expressionCelex: "02009L0110-20180113",
        quality: { articleCount: 24, maximumWarnings: 0 },
      },
      {
        celex: "32017R2402",
        expressionCelex: "02017R2402-20210409",
        quality: { articleCount: 55, maximumWarnings: 0 },
      },
      {
        celex: "32019L2162",
        expressionCelex: "02019L2162-20240109",
        quality: { articleCount: 35, maximumWarnings: 0 },
      },
      {
        celex: "32019R2160",
        quality: { articleCount: 2, recitalCount: 15, maximumWarnings: 0 },
        sourceStatus: { basis: "original-oj" },
      },
    ]);
    expect(
      sources.find((source) => source.celex === "32024R2956")?.sourceStatus,
    ).toMatchObject({
      basis: "consolidated",
      textAsOf: "2024-12-02",
      checkedAt: "2026-09-29T00:00:00Z",
      corrections: [{ date: "2025-09-19" }],
    });
    expect(
      sources.find((source) => source.celex === "32013L0036"),
    ).toMatchObject({
      familyId: "family:crd",
      expressionCelex: "02013L0036-20250117",
      quality: {
        articleCount: 178,
        annexCount: 2,
        maximumWarnings: 0,
      },
      sourceStatus: {
        basis: "consolidated",
        textAsOf: "2025-01-17",
        corrections: [{ date: "2013-08-02" }, { date: "2017-01-25" }],
      },
    });
    expect(
      sources.find((source) => source.celex === "32013R0575"),
    ).toMatchObject({
      familyId: "family:crr",
      expressionCelex: "02013R0575-20260626",
      quality: {
        articleCount: 786,
        annexCount: 4,
        maximumWarnings: 46,
      },
      sourceStatus: {
        basis: "consolidated",
        textAsOf: "2026-06-26",
        currentVersionUrl: "https://eur-lex.europa.eu/eli/reg/2013/575",
      },
    });
    expect(
      sources.find((source) => source.celex === "32024R1623"),
    ).toMatchObject({
      familyId: "family:crr",
      quality: {
        articleCount: 2,
        annexCount: 1,
        pointCount: 1822,
        maximumWarnings: 0,
      },
      sourceStatus: {
        basis: "original-oj",
        corrections: [{ date: "2025-04-16" }],
      },
    });
    expect(
      sources.find((source) => source.celex === "32024L1619"),
    ).toMatchObject({
      familyId: "family:crd",
      quality: {
        articleCount: 4,
        pointCount: 517,
        maximumWarnings: 0,
      },
      sourceStatus: { basis: "original-oj", corrections: [] },
    });
    expect(
      sources.find((source) => source.celex === "32015L0849"),
    ).toMatchObject({
      familyId: "family:aml",
      expressionCelex: "02015L0849-20241230",
      quality: { articleCount: 81, annexCount: 4, maximumWarnings: 0 },
      sourceStatus: {
        basis: "consolidated",
        textAsOf: "2024-12-30",
        currentVersionUrl: "https://eur-lex.europa.eu/eli/dir/2015/849",
      },
    });
    expect(
      sources
        .filter(
          (source) =>
            source.familyId === "family:dora" &&
            ["32025R0301", "32025R0302"].includes(source.celex),
        )
        .map((source) => [source.celex, source.measureType]),
    ).toEqual([
      ["32025R0301", "rts"],
      ["32025R0302", "its"],
    ]);
    expect(
      new Set(
        sources.flatMap((source) =>
          [source.shortName, ...source.aliases].map((alias) =>
            alias.toLowerCase(),
          ),
        ),
      ).size,
    ).toBe(
      sources.reduce((count, source) => count + source.aliases.length + 1, 0),
    );
  });

  it("keeps planned and queued entries out of the active corpus", async () => {
    const directory = await mkdtemp(join(tmpdir(), "source-catalog-"));
    const registryPath = join(directory, "source-registry.json");
    try {
      const active = (await loadSourceRegistry())[0];
      await writeFile(
        registryPath,
        JSON.stringify([
          active,
          {
            status: "queued",
            batch: "banking-core-2",
            familyId: "family:test-queued",
            shortName: "Queued Test Act",
            aliases: ["Queued Test Regulation"],
            celex: "32030R0002",
            language: "ENG",
            documentType: "regulation",
            regulatoryLevel: "level-1",
            measureType: "primary-act",
            publicationDate: "2030-01-02",
            eliUrl: "https://eur-lex.europa.eu/eli/reg/2030/2/oj/eng",
          },
          {
            status: "planned",
            batch: "banking-core-3",
            familyId: "family:test-planned",
            shortName: "Planned Test Act",
            celex: "32030L0003",
          },
        ]),
        "utf8",
      );

      await expect(loadSourceRegistry(registryPath)).resolves.toHaveLength(1);
      await expect(loadSourceCatalog(registryPath)).resolves.toHaveLength(3);
      expect(loadQueuedSourcesSync(registryPath)).toMatchObject([
        {
          celex: "32030R0002",
          status: "queued",
          batch: "banking-core-2",
        },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
