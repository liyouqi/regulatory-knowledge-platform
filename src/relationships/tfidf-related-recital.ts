import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { BodyBlock, DocumentView, ProvisionView } from "../shared/legal";
import { type RelationshipRecord, relationshipId } from "./contract";

export const TFIDF_RELATED_RECITAL_BUILDER = "tfidf-related-recital";
export const TFIDF_RELATED_RECITAL_BUILDER_VERSION = "1.0.0";
export const DEFAULT_RELATED_RECITAL_BENCHMARK_PATH = resolve(
  process.cwd(),
  "data/benchmarks/related-recitals.json",
);

const benchmarkCaseSchema = z.object({
  id: z.string().regex(/^related-recital:[a-z0-9:-]+$/),
  documentId: z.string().regex(/^eu:3[0-9]{4}[A-Z][0-9]{4}$/),
  articleId: z.string().regex(/^eu:3[0-9]{4}[A-Z][0-9]{4}:article:[a-z0-9]+$/),
  expectedRecitalIds: z
    .array(z.string().regex(/^eu:3[0-9]{4}[A-Z][0-9]{4}:recital:[a-z0-9]+$/))
    .min(1),
});

export const relatedRecitalBenchmarkSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  checkedAt: z.string().date(),
  topN: z.number().int().min(1).max(10),
  minimumScore: z.number().min(0).max(1),
  minimumHitRate: z.number().min(0).max(1),
  cases: z.array(benchmarkCaseSchema).min(1),
});

export type RelatedRecitalBenchmark = z.infer<
  typeof relatedRecitalBenchmarkSchema
>;

export interface RelatedRecitalEvaluationCase {
  id: string;
  articleId: string;
  expectedRecitalIds: string[];
  topRecitalIds: string[];
  matchedRecitalIds: string[];
  passed: boolean;
}

export interface RelatedRecitalEvaluation {
  caseCount: number;
  passedCaseCount: number;
  hitRate: number;
  minimumHitRate: number;
  passed: boolean;
  cases: RelatedRecitalEvaluationCase[];
}

export interface TfidfRelatedRecitalBuild {
  relationships: RelationshipRecord[];
  evaluation: RelatedRecitalEvaluation;
  benchmark: RelatedRecitalBenchmark;
}

interface RankedRecital {
  recitalId: string;
  score: number;
}

const STOP_WORDS = new Set(
  "a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves also shall may must regulation article paragraph union member states thereof".split(
    /\s+/u,
  ),
);

function parseBenchmark(raw: unknown): RelatedRecitalBenchmark {
  const benchmark = relatedRecitalBenchmarkSchema.parse(raw);
  const caseIds = new Set<string>();
  const articleIds = new Set<string>();
  for (const item of benchmark.cases) {
    if (caseIds.has(item.id))
      throw new Error(`Duplicate benchmark ID: ${item.id}`);
    if (articleIds.has(item.articleId)) {
      throw new Error(`Duplicate benchmark Article: ${item.articleId}`);
    }
    if (!item.articleId.startsWith(`${item.documentId}:`)) {
      throw new Error(`Benchmark Article document mismatch: ${item.id}`);
    }
    if (
      item.expectedRecitalIds.some(
        (recitalId) => !recitalId.startsWith(`${item.documentId}:`),
      )
    ) {
      throw new Error(`Benchmark Recital document mismatch: ${item.id}`);
    }
    caseIds.add(item.id);
    articleIds.add(item.articleId);
  }
  return benchmark;
}

export function loadRelatedRecitalBenchmark(
  benchmarkPath = DEFAULT_RELATED_RECITAL_BENCHMARK_PATH,
): RelatedRecitalBenchmark {
  return parseBenchmark(JSON.parse(readFileSync(benchmarkPath, "utf8")));
}

function completeBlockText(block: BodyBlock): string {
  const children = new Map(block.children.map((child) => [child.id, child]));
  return [
    block.marker,
    ...block.orderedContent.map((item) => {
      if (item.type === "text") return item.text;
      const child = children.get(item.childId);
      if (!child) {
        throw new Error(
          `Body block ${block.id} references missing child ${item.childId}`,
        );
      }
      return completeBlockText(child);
    }),
  ]
    .filter(Boolean)
    .join(" ");
}

function provisionText(provision: ProvisionView): string {
  return [
    provision.label,
    provision.title,
    ...provision.blocks.map(completeBlockText),
  ]
    .filter(Boolean)
    .join(" ");
}

function tokenize(text: string): string[] {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  ).filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function termCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function tfidfVectors(
  provisions: ProvisionView[],
): Map<string, Map<string, number>> {
  const counts = new Map(
    provisions.map((provision) => [
      provision.id,
      termCounts(provisionText(provision)),
    ]),
  );
  const documentFrequency = new Map<string, number>();
  for (const item of counts.values()) {
    for (const term of item.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const itemCount = counts.size;
  return new Map(
    [...counts.entries()].map(([id, item]) => [
      id,
      new Map(
        [...item.entries()].map(([term, count]) => {
          const idf =
            Math.log(
              (itemCount + 1) / ((documentFrequency.get(term) ?? 0) + 1),
            ) + 1;
          return [term, (1 + Math.log(count)) * idf];
        }),
      ),
    ]),
  );
}

function cosineSimilarity(
  left: Map<string, number>,
  right: Map<string, number>,
): number {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (const value of left.values()) leftMagnitude += value * value;
  for (const value of right.values()) rightMagnitude += value * value;
  const [smaller, larger] =
    left.size <= right.size ? [left, right] : [right, left];
  for (const [term, value] of smaller) {
    dotProduct += value * (larger.get(term) ?? 0);
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dotProduct / Math.sqrt(leftMagnitude * rightMagnitude);
}

function rankDocumentRecitals(
  document: DocumentView,
  topN: number,
  minimumScore: number,
): Map<string, RankedRecital[]> {
  const articles = document.provisions.filter(
    (provision) => provision.kind === "article",
  );
  const recitals = document.provisions.filter(
    (provision) => provision.kind === "recital",
  );
  const vectors = tfidfVectors([...articles, ...recitals]);
  return new Map(
    articles.map((article) => {
      const articleVector = vectors.get(article.id) ?? new Map();
      const ranked = recitals
        .map((recital) => ({
          recitalId: recital.id,
          score: cosineSimilarity(
            articleVector,
            vectors.get(recital.id) ?? new Map(),
          ),
        }))
        .filter((item) => item.score >= minimumScore)
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.recitalId.localeCompare(right.recitalId),
        )
        .slice(0, topN)
        .map((item) => ({
          ...item,
          score: Number(item.score.toFixed(12)),
        }));
      return [article.id, ranked];
    }),
  );
}

function evaluateBenchmark(
  benchmark: RelatedRecitalBenchmark,
  rankings: Map<string, RankedRecital[]>,
): RelatedRecitalEvaluation {
  const cases = benchmark.cases.map((item) => {
    const topRecitalIds = (rankings.get(item.articleId) ?? []).map(
      (ranked) => ranked.recitalId,
    );
    const matchedRecitalIds = item.expectedRecitalIds.filter((recitalId) =>
      topRecitalIds.includes(recitalId),
    );
    return {
      id: item.id,
      articleId: item.articleId,
      expectedRecitalIds: item.expectedRecitalIds,
      topRecitalIds,
      matchedRecitalIds,
      passed: matchedRecitalIds.length > 0,
    };
  });
  const passedCaseCount = cases.filter((item) => item.passed).length;
  const hitRate = cases.length === 0 ? 0 : passedCaseCount / cases.length;
  return {
    caseCount: cases.length,
    passedCaseCount,
    hitRate,
    minimumHitRate: benchmark.minimumHitRate,
    passed: hitRate >= benchmark.minimumHitRate,
    cases,
  };
}

export function buildTfidfRelatedRecitals(
  documents: DocumentView[],
  benchmark = loadRelatedRecitalBenchmark(),
): TfidfRelatedRecitalBuild {
  const documentsById = new Map(
    documents.map((document) => [document.id, document]),
  );
  const benchmarkDocumentIds = new Set(
    benchmark.cases.map((item) => item.documentId),
  );
  const rankings = new Map<string, RankedRecital[]>();
  for (const documentId of [...benchmarkDocumentIds].sort()) {
    const document = documentsById.get(documentId);
    if (!document)
      throw new Error(`Benchmark document is not loaded: ${documentId}`);
    for (const [articleId, ranked] of rankDocumentRecitals(
      document,
      benchmark.topN,
      benchmark.minimumScore,
    )) {
      rankings.set(articleId, ranked);
    }
  }
  for (const item of benchmark.cases) {
    const document = documentsById.get(item.documentId);
    if (
      !document?.provisions.some((provision) => provision.id === item.articleId)
    ) {
      throw new Error(`Benchmark Article is not loaded: ${item.articleId}`);
    }
    for (const recitalId of item.expectedRecitalIds) {
      if (
        !document.provisions.some((provision) => provision.id === recitalId)
      ) {
        throw new Error(`Benchmark Recital is not loaded: ${recitalId}`);
      }
    }
  }
  const evaluation = evaluateBenchmark(benchmark, rankings);
  const relationships = evaluation.passed
    ? [...rankings.entries()].flatMap(([articleId, ranked]) => {
        const document = documentsById.get(
          articleId.split(":article:")[0] ?? "",
        );
        if (!document)
          throw new Error(`Missing Article document: ${articleId}`);
        return ranked.map((item) => {
          const evidenceLocator = `${TFIDF_RELATED_RECITAL_BUILDER}:${articleId}:${item.recitalId}`;
          return {
            id: relationshipId(
              articleId,
              "RELATED_RECITAL",
              item.recitalId,
              "TFIDF",
              evidenceLocator,
            ),
            sourceEntityId: articleId,
            relationType: "RELATED_RECITAL" as const,
            targetEntityId: item.recitalId,
            provenance: "TFIDF" as const,
            evidenceText:
              "TF-IDF cosine similarity within the same official document",
            evidenceLocator,
            score: item.score,
            sourceRef: document.sourceUrl,
            builderMethod: TFIDF_RELATED_RECITAL_BUILDER,
            builderVersion: TFIDF_RELATED_RECITAL_BUILDER_VERSION,
            resolutionStatus: "resolved" as const,
          };
        });
      })
    : [];
  relationships.sort((left, right) => left.id.localeCompare(right.id));
  return { relationships, evaluation, benchmark };
}
