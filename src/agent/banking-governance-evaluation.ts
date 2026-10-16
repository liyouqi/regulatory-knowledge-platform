import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { DocumentView } from "../shared/legal";
import { parseReaderPath } from "../shared/reader-route";
import type { RegulatoryTopicResponse } from "../shared/regulatory-topic";
import { sourceLocatorSchema } from "../shared/source-locator";
import type { CitationContextService } from "./citation-context-service";
import type { CitationRetrievalService } from "./citation-retrieval-service";

const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
export const bankingGovernanceTasksSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: z.literal("banking-governance-tasks"),
    version: z.string().min(1),
    reviewedAt: z.string().datetime(),
    questionOrigin: z.literal("editorial-scenarios-not-user-observations"),
    topicSlug: z.literal("banking-governance-internal-control"),
    topN: z.number().int().min(1).max(10),
    sources: z
      .array(
        z
          .object({
            documentId: z.string().min(1),
            sourceSnapshotId: z.string().min(1),
            sourceVersion: z.string().min(1),
            sourceUrl: z.string().url(),
            textAsOf: z.string().date(),
          })
          .strict(),
      )
      .min(1),
    cases: z
      .array(
        z
          .object({
            id: z.string().startsWith("banking-governance:"),
            query: z.string().min(1),
            questionZh: z.string().min(1),
            documentId: z.string().min(1),
            expectedEvidence: z
              .object({
                entityId: z.string().min(1),
                sourceLocator: sourceLocatorSchema,
                textSha256: hashSchema,
              })
              .strict(),
            navigationSubject: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((dataset, context) => {
    for (const [label, values] of [
      ["case IDs", dataset.cases.map((item) => item.id)],
      ["source Documents", dataset.sources.map((item) => item.documentId)],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", message: `Duplicate ${label}` });
      }
    }
    for (const item of dataset.cases) {
      if (
        !dataset.sources.some((source) => source.documentId === item.documentId)
      ) {
        context.addIssue({
          code: "custom",
          message: `Missing source for ${item.id}`,
        });
      }
    }
  });

export type BankingGovernanceTasks = z.infer<
  typeof bankingGovernanceTasksSchema
>;

export function loadBankingGovernanceTasks(
  inputPath = "data/benchmarks/banking-governance-tasks-crd-20260711.json",
): BankingGovernanceTasks {
  return bankingGovernanceTasksSchema.parse(
    JSON.parse(readFileSync(resolve(process.cwd(), inputPath), "utf8")),
  );
}

export function evaluateBankingGovernance(
  services: {
    context: Pick<CitationContextService, "findByEntityId" | "runtimeIdentity">;
    retrieval: Pick<CitationRetrievalService, "search">;
    topic: RegulatoryTopicResponse | null;
    documents: DocumentView[];
  },
  dataset = loadBankingGovernanceTasks(),
) {
  const { context, retrieval, topic, documents } = services;
  if (
    topic &&
    (topic.runtime.buildId !== context.runtimeIdentity.buildId ||
      topic.runtime.profileHash !== context.runtimeIdentity.profileHash ||
      topic.runtime.profileId !== context.runtimeIdentity.profileId)
  ) {
    throw new Error("Topic and citation evaluation identities differ");
  }
  const cases = dataset.cases.map((item) => {
    const evidence = context.findByEntityId(item.expectedEvidence.entityId);
    const source = dataset.sources.find(
      (candidate) => candidate.documentId === item.documentId,
    );
    const evidencePassed =
      !!evidence &&
      evidence.document.id === item.documentId &&
      evidence.target.rootProvisionId === item.expectedEvidence.entityId &&
      evidence.document.sourceSnapshotId === source?.sourceSnapshotId &&
      evidence.document.sourceVersion === source?.sourceVersion &&
      evidence.document.sourceUrl === source?.sourceUrl &&
      evidence.target.sourceLocator.kind ===
        item.expectedEvidence.sourceLocator.kind &&
      evidence.target.sourceLocator.value ===
        item.expectedEvidence.sourceLocator.value &&
      `sha256:${createHash("sha256")
        .update(evidence.textSegments.map((segment) => segment.text).join("\n"))
        .digest("hex")}` === item.expectedEvidence.textSha256;
    const assignment = topic?.documents
      .flatMap((document) => document.assignments)
      .find(
        (candidate) =>
          candidate.targetDocumentId === item.documentId &&
          candidate.targetEntityId === item.expectedEvidence.entityId &&
          candidate.targetKind === "provision" &&
          candidate.provenance === "EDITORIAL",
      );
    const selection = assignment
      ? parseReaderPath(assignment.targetPath)
      : null;
    const routeMatches = selection
      ? documents
          .filter(
            (document) =>
              document.id === item.documentId &&
              document.slug === selection.slug,
          )
          .flatMap((document) => document.provisions)
          .filter(
            (provision) =>
              provision.collectionId === selection.collectionId &&
              provision.number.toLowerCase() === selection.number,
          )
      : [];
    const navigationPassed =
      evidencePassed &&
      !!topic &&
      topic.topic.slug === dataset.topicSlug &&
      topic.scope.classificationProvenance === "EDITORIAL" &&
      topic.scope.applicabilityConclusion === false &&
      routeMatches.length === 1 &&
      routeMatches[0]?.id === item.expectedEvidence.entityId;
    const search = (documentId?: string) => {
      const response = retrieval.search(item.query, {
        documentId,
        limit: dataset.topN,
      });
      if (
        response.runtime.buildId !== context.runtimeIdentity.buildId ||
        response.runtime.profileId !== context.runtimeIdentity.profileId ||
        response.runtime.profileHash !== context.runtimeIdentity.profileHash
      ) {
        throw new Error("Search and citation evaluation identities differ");
      }
      const results = response.results.map((result) => ({
        entityId: result.resolvedEntityId,
        documentId: result.context.document.id,
        rootProvisionId: result.context.target.rootProvisionId,
      }));
      const rank = results.findIndex(
        (result) =>
          result.documentId === item.documentId &&
          result.rootProvisionId === item.expectedEvidence.entityId,
      );
      return {
        hit: evidencePassed && rank >= 0,
        rank: rank >= 0 ? rank + 1 : null,
        results,
      };
    };
    const globalSearch = search();
    const documentSearch = search(item.documentId);
    return {
      id: item.id,
      query: item.query,
      questionZh: item.questionZh,
      expectedEntityId: item.expectedEvidence.entityId,
      sourceTextAsOf: source?.textAsOf,
      evidencePassed,
      navigationPassed,
      targetPath: assignment?.targetPath ?? null,
      globalSearch,
      documentSearch,
      gaps: [
        ...(!evidencePassed ? ["source-or-evidence-drift"] : []),
        ...(evidencePassed && !navigationPassed ? ["topic-navigation"] : []),
        ...(evidencePassed && !globalSearch.hit ? ["global-retrieval"] : []),
        ...(evidencePassed && !documentSearch.hit
          ? ["document-retrieval"]
          : []),
      ],
    };
  });
  const count = (predicate: (item: (typeof cases)[number]) => boolean) =>
    cases.filter(predicate).length;
  return {
    schemaVersion: "1.0.0",
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    datasetSha256: `sha256:${createHash("sha256").update(JSON.stringify(dataset)).digest("hex")}`,
    questionOrigin: dataset.questionOrigin,
    runtime: context.runtimeIdentity,
    method: {
      topN: dataset.topN,
      queryRewriting: false,
      match: "exact-root-provision-or-descendant",
      retrievalIsDiagnosticOnly: true,
      legalAdvice: false,
      answerQualityEvaluated: false,
    },
    summary: {
      caseCount: cases.length,
      evidencePassed: count((item) => item.evidencePassed),
      navigationPassed: count((item) => item.navigationPassed),
      globalSearchHits: count((item) => item.globalSearch.hit),
      documentSearchHits: count((item) => item.documentSearch.hit),
      evidenceAndNavigationPassed: cases.every(
        (item) => item.evidencePassed && item.navigationPassed,
      ),
    },
    cases,
  };
}
