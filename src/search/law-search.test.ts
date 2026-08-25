import { describe, expect, it } from "vitest";
import type { LawSearchRecord } from "./law-search";
import { normalizeLawQuery, searchLaws } from "./law-search";

const base = {
  officialTitle: "Official title",
  publicationDate: "2022-01-01",
  documentType: "regulation" as const,
  regulatoryLevel: "level-1" as const,
  measureType: "primary-act" as const,
  readerPath: "/read/example/articles/1",
  explorerPath: "/explore/example",
  provenance: "official" as const,
  provisions: [
    {
      kind: "article" as const,
      number: "3",
      label: "Article 3",
      title: "Definitions",
      path: "/read/example/articles/3",
    },
  ],
};

const records: LawSearchRecord[] = [
  {
    ...base,
    id: "eu:32022R2554",
    familyId: "family:dora",
    slug: "dora",
    shortName: "DORA",
    officialTitle: "Regulation on digital operational resilience",
    celex: "32022R2554",
    aliases: ["Digital Operational Resilience Act"],
    provisions: [
      {
        kind: "article",
        number: "3",
        label: "Article 3",
        title: "Definitions",
        path: "/read/dora/articles/3",
      },
    ],
  },
  {
    ...base,
    id: "eu:32022L2555",
    familyId: "family:nis2",
    slug: "nis2",
    shortName: "NIS2",
    documentType: "directive",
    officialTitle: "Directive on network and information systems",
    celex: "32022L2555",
    aliases: ["NIS 2"],
    provisions: [
      {
        kind: "recital",
        number: "79",
        label: "Recital 79",
        path: "/read/nis2/recitals/79",
      },
    ],
  },
  {
    ...base,
    id: "eu:32024R1689",
    familyId: "family:ai-act",
    slug: "ai-act",
    shortName: "AI Act",
    officialTitle:
      "Regulation laying down harmonised rules on artificial intelligence and amending Regulation 2022/868",
    celex: "32024R1689",
    aliases: ["Artificial Intelligence Act"],
    provisions: [
      {
        kind: "annex",
        number: "vii",
        label: "Annex VII",
        title: "Conformity assessment",
        path: "/read/ai-act/annexes/vii",
      },
    ],
  },
];

const cssfRecord: LawSearchRecord = {
  ...base,
  id: "lu:cssf:communication-2025-04-09-ict-risk-updates",
  familyId: "family:cssf",
  regulatoryLevel: "level-3",
  measureType: "other",
  slug: "cssf-ict-risk-updates-2025",
  shortName: "CSSF ICT Risk Updates 2025",
  officialTitle:
    "Update of several CSSF circulars related to ICT risk management",
  documentType: "other",
  localId: "communication-2025-04-09-ict-risk-updates",
  aliases: ["CSSF DORA ICT circular updates"],
  readerPath: "/read/cssf-ict-risk-updates-2025/provisions/introduction",
  explorerPath: "/explore/cssf-ict-risk-updates-2025",
  provisions: [
    {
      kind: "other",
      number: "introduction",
      label: "Introduction",
      path: "/read/cssf-ict-risk-updates-2025/provisions/introduction",
    },
  ],
};

describe("Find Laws deterministic ranking", () => {
  it("normalizes punctuation and case without changing legal tokens", () => {
    expect(normalizeLawQuery(" Regulation (EU) 2022/2554 ")).toBe(
      "regulation eu 2022 2554",
    );
  });

  it.each([
    ["32022r2554", "exact-celex"],
    ["DORA", "exact-alias"],
    ["digital operational resilience act", "exact-alias"],
    ["2022/2554", "exact-citation"],
    ["Regulation (EU) 2022/2554", "exact-citation"],
  ])("ranks %s as a deterministic DORA match", (query, reason) => {
    const response = searchLaws(records, query);
    expect(response.bestMatch).toMatchObject({
      slug: "dora",
      matchReason: reason,
    });
  });

  it("keeps directive and regulation citations distinct", () => {
    expect(searchLaws(records, "Directive 2022/2555").bestMatch).toMatchObject({
      slug: "nis2",
      matchReason: "exact-citation",
    });
    expect(searchLaws(records, "Regulation 2022/2555").results).toHaveLength(0);
  });

  it.each(["doora", "doraa"])(
    "suggests DORA for the one-character typo %s",
    (query) => {
      expect(searchLaws(records, query).bestMatch).toMatchObject({
        slug: "dora",
        matchReason: "typo-alias",
      });
    },
  );

  it("matches a CSSF local ID without manufacturing a CELEX identifier", () => {
    const result = searchLaws(
      [...records, cssfRecord],
      cssfRecord.localId ?? "",
    ).bestMatch;
    expect(result).toMatchObject({
      id: cssfRecord.id,
      localId: cssfRecord.localId,
      matchReason: "exact-local-id",
    });
    expect(result).not.toHaveProperty("celex");
  });

  it("does not treat substrings inside words and numbers as term matches", () => {
    expect(
      searchLaws(records, "NIS 2").results.map((result) => result.slug),
    ).toEqual(["nis2"]);
  });

  it.each([
    ["DORA article 3", "article", "/read/dora/articles/3"],
    ["DORA art. 3", "article", "/read/dora/articles/3"],
    ["NIS 2 recital 79", "recital", "/read/nis2/recitals/79"],
    ["AI Act annex VII", "annex", "/read/ai-act/annexes/vii"],
  ])("resolves %s to an existing stable provision", (query, kind, path) => {
    const response = searchLaws(records, query);
    expect(response.bestMatch?.target).toMatchObject({ kind, path });
    expect(response.bestMatch).not.toHaveProperty("provisions");
  });

  it("keeps a known law anchor when extra descriptive words precede a locator", () => {
    expect(searchLaws(records, "dora risk article 3").bestMatch).toMatchObject({
      slug: "dora",
      matchReason: "law-anchor",
      target: { path: "/read/dora/articles/3" },
    });
  });

  it("resolves a one-character law-name typo before an existing locator", () => {
    expect(searchLaws(records, "doora article 3").bestMatch).toMatchObject({
      slug: "dora",
      matchReason: "typo-alias",
      target: { path: "/read/dora/articles/3" },
    });
  });

  it("keeps the law result visible while a provision citation is incomplete", () => {
    const response = searchLaws(records, "DORA article");

    expect(response.bestMatch).toMatchObject({ slug: "dora" });
    expect(response.bestMatch?.target).toBeUndefined();
  });

  it("fails closed when a compound query names no existing provision", () => {
    expect(searchLaws(records, "DORA article 999").results).toHaveLength(0);
    expect(searchLaws(records, "article 3").results).toHaveLength(0);
  });

  it("returns the available catalog for an empty query", () => {
    expect(
      searchLaws(records, "").results.map((result) => result.slug),
    ).toEqual(["ai-act", "dora", "nis2"]);
  });
});
