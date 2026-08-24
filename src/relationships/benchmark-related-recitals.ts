import { loadDocumentViews } from "../data/document-repository";
import {
  TFIDF_RELATED_RECITAL_BUILDER,
  TFIDF_RELATED_RECITAL_BUILDER_VERSION,
  buildTfidfRelatedRecitals,
} from "./tfidf-related-recital";

const result = buildTfidfRelatedRecitals(loadDocumentViews());
console.log(
  JSON.stringify(
    {
      builder: `${TFIDF_RELATED_RECITAL_BUILDER}@${TFIDF_RELATED_RECITAL_BUILDER_VERSION}`,
      topN: result.benchmark.topN,
      minimumScore: result.benchmark.minimumScore,
      publishedRelationshipCount: result.relationships.length,
      evaluation: result.evaluation,
    },
    null,
    2,
  ),
);
if (!result.evaluation.passed) process.exitCode = 1;
