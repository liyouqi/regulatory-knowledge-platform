export const EUR_LEX_CELLAR_SPARQL =
  "https://publications.europa.eu/webapi/rdf/sparql";

const PAGE_SIZE = 500;
const MAX_PAGES = 5;
const FINANCIAL_TITLE_PATTERN = [
  "bank",
  "credit institution",
  "investment firm",
  "financial service",
  "financial market",
  "insurance",
  "reinsurance",
  "pension",
  "payment service",
  "electronic money",
  "crypto.asset",
  "securities",
  "securitisation",
  "investment fund",
  "money laundering",
  "terrorist financing",
  "capital requirement",
  "own funds",
  "prudential",
  "market abuse",
  "prospectus",
  "deposit guarantee",
  "bank resolution",
  "covered bond",
  "operational resilience",
  "sustainability disclosure",
  "accounting standard",
  "statutory audit",
  "2022/2554",
  "2023/1114",
  "575/2013",
  "2013/36",
  "2014/65",
  "600/2014",
  "648/2012",
  "2015/2366",
  "2009/138",
  "2011/61",
  "2009/65",
  "2024/1620",
  "2024/1624",
].join("|");

export type EurLexCellarItem = {
  title: string;
  url: string;
  publishedAt: string;
  publicationType: string;
  reference: string;
  key: string;
};

type SparqlBinding = {
  celex?: { value?: unknown };
  date?: { value?: unknown };
  title?: { value?: unknown };
};

function publicationType(celex: string): string {
  const type = celex[5];
  if (type === "R") return "Regulation";
  if (type === "L") return "Directive";
  if (type === "D") return "Decision";
  if (type === "O") return "Guideline";
  return "Official Journal act";
}

export function buildEurLexCellarQuery(since: string, offset = 0): string {
  if (!/^20\d{2}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(since)) {
    throw new Error("EUR-Lex backfill start must use YYYY-MM or YYYY-MM-DD");
  }
  const start = since.length === 7 ? `${since}-01` : since;
  const year = Number(start.slice(0, 4));
  return [
    "PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>",
    "PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>",
    "SELECT DISTINCT ?celex ?date ?title WHERE {",
    "  ?work cdm:work_date_document ?date ; cdm:resource_legal_id_celex ?celex .",
    "  ?expression cdm:expression_belongs_to_work ?work ;",
    "    cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> ;",
    "    cdm:expression_title ?title .",
    `  FILTER(?date >= "${start}"^^xsd:date && ?date < "${year + 1}-01-01"^^xsd:date)`,
    '  FILTER(REGEX(STR(?celex), "^3[0-9]{4}[A-Z]"))',
    `  FILTER(REGEX(LCASE(STR(?title)), "${FINANCIAL_TITLE_PATTERN}"))`,
    "}",
    "ORDER BY DESC(?date) ?celex",
    `LIMIT ${PAGE_SIZE}`,
    `OFFSET ${offset}`,
  ].join("\n");
}

export function parseEurLexCellarResults(value: unknown): EurLexCellarItem[] {
  const bindings = (
    value as { results?: { bindings?: unknown } } | null | undefined
  )?.results?.bindings;
  if (!Array.isArray(bindings)) {
    throw new Error("EUR-Lex Cellar returned an invalid SPARQL result");
  }
  return bindings.flatMap((raw): EurLexCellarItem[] => {
    const binding = raw as SparqlBinding;
    const celex = binding.celex?.value;
    const publishedAt = binding.date?.value;
    const title = binding.title?.value;
    if (
      typeof celex !== "string" ||
      !/^3\d{4}[A-Z][A-Z0-9()]+$/.test(celex) ||
      typeof publishedAt !== "string" ||
      !/^20\d{2}-\d{2}-\d{2}$/.test(publishedAt) ||
      typeof title !== "string" ||
      !title.trim()
    ) {
      return [];
    }
    return [
      {
        title: title.replace(/\s+/g, " ").trim(),
        url: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}`,
        publishedAt,
        publicationType: publicationType(celex),
        reference: celex,
        key: celex,
      },
    ];
  });
}

export async function collectEurLexCellarBackfill(
  since: string,
  fetcher: typeof fetch = fetch,
): Promise<EurLexCellarItem[]> {
  const collected: EurLexCellarItem[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await fetcher(EUR_LEX_CELLAR_SPARQL, {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/sparql-query",
        "User-Agent": "Regulatory-Monitor/0.1 (+local refresh)",
      },
      body: buildEurLexCellarQuery(since, page * PAGE_SIZE),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`EUR-Lex Cellar returned HTTP ${response.status}`);
    }
    const items = parseEurLexCellarResults(await response.json());
    collected.push(...items);
    if (items.length < PAGE_SIZE) break;
  }
  return [
    ...new Map(collected.map((item) => [item.key, item] as const)).values(),
  ];
}
