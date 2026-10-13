import { normalizeSearchText } from "./current-document-search";

export const QUESTION_QUERY_VERSION = "question-lexical@1.0.0";

const STOP_WORDS = new Set(
  "a an the what which who when where why how do does did is are was were be been being can could should would will shall must may might have has had need needs put place in into on at to for of by with and or as its their it they we you our your under from remain use".split(
    " ",
  ),
);

// Search vocabulary only: not official legal translations, answers or mappings.
const CHINESE_CONCEPTS: Array<[string, string[]]> = [
  ["利益冲突", ["conflict", "interest"]],
  ["内部审计", ["internal", "audit"]],
  ["审计计划", ["audit", "plan"]],
  ["内部控制", ["internal", "control"]],
  ["内控", ["internal", "control"]],
  ["合规", ["compliance"]],
  ["风险", ["risk"]],
  ["独立性", ["independence"]],
  ["薪酬", ["remuneration"]],
  ["治理", ["governance"]],
  ["董事会", ["management", "body"]],
  ["会议记录", ["minutes"]],
];

function prefix(term: string): string {
  if (term.length > 5 && term.endsWith("ies")) return term.slice(0, -3);
  if (term.length > 5 && term.endsWith("ing")) return term.slice(0, -3);
  if (term.length > 5 && term.endsWith("ed")) return term.slice(0, -2);
  if (term.length > 4 && term.endsWith("s") && !term.endsWith("ss"))
    return term.slice(0, -1);
  if (term.length > 5 && (term.endsWith("y") || term.endsWith("e")))
    return term.slice(0, -1);
  return term;
}

export interface QuestionQuery {
  normalizedQuery: string;
  matchExpression: string;
  terms: string[];
  language: "en" | "zh-vocabulary";
}

export function parseQuestionQuery(rawQuery: string): QuestionQuery | null {
  const query = rawQuery.trim().slice(0, 200);
  // Explicit phrases, identifiers/numbers, negation and keyword searches keep
  // their existing strict AND behaviour. Never execute user FTS syntax.
  if (
    /["0-9]/u.test(query) ||
    /\b(?:not|never|without|except|exclude)\b/iu.test(query) ||
    /不|非|除外/gu.test(query)
  )
    return null;
  let terms: string[];
  let language: QuestionQuery["language"];
  if (/\p{Script=Han}/u.test(query)) {
    if (!/如何|怎么|什么|哪些|谁|是否|应|需要/u.test(query)) return null;
    terms = CHINESE_CONCEPTS.filter(([label]) => query.includes(label)).flatMap(
      ([, words]) => words,
    );
    language = "zh-vocabulary";
  } else {
    const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
    if (
      tokens.length < 5 ||
      !/^(?:who|what|which|when|where|why|how|do|does|is|are|can|should|must)\b/iu.test(
        query,
      )
    )
      return null;
    terms = tokens.filter((term) => term.length >= 3 && !STOP_WORDS.has(term));
    language = "en";
  }
  terms = [...new Set(terms.map(prefix))].slice(0, 8);
  if (terms.length < 2) return null;
  return {
    terms,
    language,
    normalizedQuery: terms.join(" "),
    matchExpression: terms.map((term) => `"${term}"*`).join(" OR "),
  };
}

export function questionTermCoverage(
  query: QuestionQuery,
  heading: string,
  body: string,
): number {
  const words = normalizeSearchText(`${heading} ${body}`).split(" ");
  return query.terms.filter((term) =>
    words.some((word) => word.startsWith(term)),
  ).length;
}
