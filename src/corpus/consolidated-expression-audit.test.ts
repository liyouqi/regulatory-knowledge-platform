import { describe, expect, it } from "vitest";
import { sourceDefinitionSchema } from "../ingestion/source-registry";
import {
  auditConsolidatedExpressions,
  parseConsolidatedExpressionCandidatesFromTreeNotice,
} from "./consolidated-expression-audit";

const source = sourceDefinitionSchema.parse({
  familyId: "family:test",
  shortName: "Test Act",
  aliases: ["Test Regulation"],
  celex: "32020R0001",
  expressionCelex: "02020R0001-20250101",
  language: "ENG",
  documentType: "regulation",
  regulatoryLevel: "level-1",
  measureType: "primary-act",
  publicationDate: "2020-01-01",
  eliUrl: "https://eur-lex.europa.eu/eli/reg/2020/1/2025-01-01/eng",
  sourceStatus: {
    basis: "consolidated",
    textAsOf: "2025-01-01",
    checkedAt: "2025-01-02T00:00:00Z",
    currentVersionUrl: "https://eur-lex.europa.eu/eli/reg/2020/1",
    corrections: [],
  },
});

describe("consolidated-expression audit", () => {
  it("extracts only the base act's consolidated expressions from its official tree notice", () => {
    const candidates = parseConsolidatedExpressionCandidatesFromTreeNotice(
      `<NOTICE>
        <VALUE>02020R0001-20250101</VALUE>
        <VALUE>http://publications.europa.eu/resource/celex/02020R0001-20260101.ENG.fmx4</VALUE>
        <VALUE>02020R0999-20250101</VALUE>
      </NOTICE>`,
      source.celex,
    );

    expect(candidates.map((candidate) => candidate.expressionCelex)).toEqual([
      "02020R0001-20250101",
      "02020R0001-20260101",
    ]);
  });

  it("reports the latest effective expression without selecting a future one", () => {
    const candidates = parseConsolidatedExpressionCandidatesFromTreeNotice(
      "02020R0001-20250101 02020R0001-20260101 02020R0001-20270101",
      source.celex,
    );

    expect(
      auditConsolidatedExpressions([source], candidates, "2026-09-28"),
    ).toEqual([
      {
        celex: "32020R0001",
        selectedExpressionCelex: "02020R0001-20250101",
        latestEffectiveExpressionCelex: "02020R0001-20260101",
        latestEffectiveDate: "2026-01-01",
        status: "review-required",
        futureExpressionCount: 1,
      },
    ]);
  });

  it("distinguishes a current pin from an act with no consolidated expression", () => {
    const current = {
      ...source,
      expressionCelex: "02020R0001-20260101",
    };
    const original = sourceDefinitionSchema.parse({
      ...source,
      celex: "32024R0002",
      expressionCelex: undefined,
      sourceStatus: undefined,
      eliUrl: "https://eur-lex.europa.eu/eli/reg/2024/2/oj/eng",
    });
    const candidates = [
      {
        celex: source.celex,
        expressionCelex: "02020R0001-20260101",
        effectiveDate: "2026-01-01",
      },
    ];

    expect(
      auditConsolidatedExpressions(
        [current, original],
        candidates,
        "2026-09-28",
      ).map(({ celex, status }) => ({ celex, status })),
    ).toEqual([
      { celex: "32020R0001", status: "current" },
      { celex: "32024R0002", status: "no-consolidated-expression" },
    ]);
  });
});
