import { describe, expect, it, vi } from "vitest";
import {
  EUR_LEX_CELLAR_SPARQL,
  buildEurLexCellarQuery,
  collectEurLexCellarBackfill,
  parseEurLexCellarResults,
} from "./eurlex-cellar";

const response = {
  results: {
    bindings: [
      {
        celex: { value: "32026R0773" },
        date: { value: "2026-03-04" },
        title: {
          value:
            "Commission Delegated Regulation (EU) 2026/773 on the EU Growth issuance prospectus",
        },
      },
      {
        celex: { value: "invalid" },
        date: { value: "not-a-date" },
        title: { value: "Ignored" },
      },
    ],
  },
};

describe("EUR-Lex Cellar current-year backfill", () => {
  it("builds a bounded public query for financial Official Journal acts", () => {
    const query = buildEurLexCellarQuery("2026-03", 500);
    expect(query).toContain('"2026-03-01"^^xsd:date');
    expect(query).toContain('"2027-01-01"^^xsd:date');
    expect(query).toContain("operational resilience");
    expect(query).toContain("2022/2554");
    expect(query).toContain("LIMIT 500");
    expect(query).toContain("OFFSET 500");
  });

  it("maps validated bindings to stable official EUR-Lex links", () => {
    expect(parseEurLexCellarResults(response)).toEqual([
      {
        title:
          "Commission Delegated Regulation (EU) 2026/773 on the EU Growth issuance prospectus",
        url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R0773",
        publishedAt: "2026-03-04",
        publicationType: "Regulation",
        reference: "32026R0773",
        key: "32026R0773",
      },
    ]);
  });

  it("uses the no-login SPARQL endpoint without a credential", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(response, { status: 200 }),
    );
    const items = await collectEurLexCellarBackfill("2026-01", fetcher);
    expect(items).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, request] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(EUR_LEX_CELLAR_SPARQL);
    expect(request?.method).toBe("POST");
    expect(request?.headers).not.toHaveProperty("Authorization");
  });
});
