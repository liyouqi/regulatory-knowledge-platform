import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { SearchService } from "../search/full-text-search";
import { RegulatoryTopicService } from "../topics/regulatory-topic-service";
import {
  evaluateBankingGovernance,
  loadBankingGovernanceTasks,
} from "./banking-governance-evaluation";
import { evaluateBankingWorkflows } from "./banking-workflows";
import { CitationContextService } from "./citation-context-service";
import { CitationRetrievalService } from "./citation-retrieval-service";

const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const fileName = z.string().regex(/^[a-z0-9.-]+\.(pdf|xml|html)$/u);
const reviewSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  checkedOn: z.string().date(),
  scope: z.string(),
  rawEvidenceDirectory: z
    .string()
    .regex(/^data\/raw\/currency-audit\/\d{4}-\d{2}-\d{2}$/u),
  sources: z
    .array(
      z
        .object({
          documentId: z.string(),
          loadedSnapshotId: z.string(),
          status: z.string(),
          officialUrl: z.string().url(),
          nextAction: z.string(),
          evidenceFile: fileName,
          evidenceSha256: hash,
          metadataEvidenceFile: fileName.optional(),
          metadataEvidenceSha256: hash.optional(),
        })
        .passthrough(),
    )
    .min(1),
});
const repository = new SqliteRuntimeRepository();
const search = new SearchService();
try {
  const dataset = loadBankingGovernanceTasks();
  const review = reviewSchema.parse(
    JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "data/editorial/banking-governance-currency-review-20261016.json",
        ),
        "utf8",
      ),
    ),
  );
  const documents = repository.listDocumentViews();
  const context = new CitationContextService(repository, documents);
  const report = evaluateBankingGovernance(
    {
      context,
      retrieval: new CitationRetrievalService(search, context),
      documents,
      topic: new RegulatoryTopicService(repository).findBySlug(
        dataset.topicSlug,
      ),
    },
    dataset,
  );
  const receiptChecks = review.sources
    .flatMap((source) => [
      { file: source.evidenceFile, sha256: source.evidenceSha256 },
      ...(source.metadataEvidenceFile && source.metadataEvidenceSha256
        ? [
            {
              file: source.metadataEvidenceFile,
              sha256: source.metadataEvidenceSha256,
            },
          ]
        : []),
    ])
    .map((receipt) => {
      const path = resolve(
        process.cwd(),
        review.rawEvidenceDirectory,
        receipt.file,
      );
      const available = existsSync(path);
      const matches =
        available &&
        `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}` ===
          receipt.sha256;
      return { ...receipt, available, matches };
    });
  if (receiptChecks.some((receipt) => receipt.available && !receipt.matches))
    throw new Error("Currency audit evidence checksum mismatch");
  for (const source of dataset.sources) {
    if (
      review.sources.find((item) => item.documentId === source.documentId)
        ?.loadedSnapshotId !== source.sourceSnapshotId
    )
      throw new Error("Currency review does not match the task source pins");
  }
  const result = evaluateBankingWorkflows(report, review.sources);
  const outputDirectory = resolve(
    process.cwd(),
    "data/artifacts/evaluations/banking-workflows",
  );
  mkdirSync(outputDirectory, { recursive: true });
  const outputPath = resolve(
    outputDirectory,
    `${Date.now()}-${repository.buildId}.json`,
  );
  const evidencePacks = result.workflows.map((workflow) => ({
    workflowId: workflow.id,
    evidence: workflow.cases.map((item) =>
      context.findByEntityId(item.expectedEntityId),
    ),
  }));
  writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        currencyReviewCheckedOn: review.checkedOn,
        receiptChecks,
        ...result,
        evidencePacks,
      },
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      {
        outputPath,
        runtime: result.runtime,
        currencyReviewCheckedOn: review.checkedOn,
        receiptChecks,
        userValueVerified: false,
        workflows: result.workflows.map(
          ({ cases, sourceReviewActions, ...item }) => item,
        ),
      },
      null,
      2,
    ),
  );
  if (
    !report.summary.evidenceAndNavigationPassed ||
    result.workflows.some((workflow) => !workflow.technicalWalkthroughPassed)
  )
    process.exitCode = 1;
} finally {
  search.close();
  repository.close();
}
