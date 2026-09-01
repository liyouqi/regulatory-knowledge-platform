import { createHash } from "node:crypto";
import {
  type EbaQaCatalogItem,
  type EbaQaDetail,
  ebaQaCatalogItemSchema,
  ebaQaDetailSchema,
} from "../shared/eba-qa";

const EBA_QA_BASE_URL =
  "https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId";

function decodeEntity(entity: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  };
  if (entity.startsWith("#x")) {
    return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
  }
  if (entity.startsWith("#")) {
    return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
  }
  return named[entity] ?? `&${entity};`;
}

export function htmlToSourceText(html: string): string {
  let text = html
    .replaceAll(/<script\b[\s\S]*?<\/script>/giu, "")
    .replaceAll(/<style\b[\s\S]*?<\/style>/giu, "")
    .replaceAll(/<br\s*\/?>/giu, "\n")
    .replaceAll(/<\/(?:p|li|tr|div|h[1-6]|table)>/giu, "\n")
    .replaceAll(/<[^>]+>/gu, "");
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = text.replaceAll(
      /&(#x[0-9a-f]+|#\d+|[a-z]+);/giu,
      (match, entity: string) => decodeEntity(entity.toLowerCase()),
    );
    if (decoded === text) break;
    text = decoded;
  }
  return text
    .replaceAll("\u00a0", " ")
    .split("\n")
    .map((line) => line.replaceAll(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function requiredMatch(
  value: string,
  expression: RegExp,
  label: string,
): string {
  const match = expression.exec(value)?.[1];
  if (!match) throw new Error(`EBA Q&A parser could not find ${label}`);
  return match;
}

function labelledListValue(html: string, label: string): string {
  for (const match of html.matchAll(
    /<li[^>]*>[\s\S]*?<b>([\s\S]*?)<\/b>([\s\S]*?)<\/li>/gu,
  )) {
    if (htmlToSourceText(match[1]) === label) {
      return htmlToSourceText(match[2]);
    }
  }
  throw new Error(`EBA Q&A parser could not find ${label}`);
}

function optionalLabelledListValue(html: string, label: string): string | null {
  try {
    return labelledListValue(html, label);
  } catch {
    return null;
  }
}

function europeanDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value.trim());
  if (!match) throw new Error(`Invalid EBA Q&A date: ${value}`);
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function parseEbaQaCatalogPage(html: string): EbaQaCatalogItem[] {
  const articles = [
    ...html.matchAll(/<article class="teaser-qa">([\s\S]*?)<\/article>/gu),
  ];
  return articles.map((articleMatch) => {
    const article = articleMatch[1];
    const linkMatch =
      /<h3[^>]*teaser-qa__subject[^>]*>\s*<a href="\/single-rule-book-qa\/qna\/view\/publicId\/(\d{4}_\d+)"[^>]*>([\s\S]*?)<\/a>/u.exec(
        article,
      );
    if (!linkMatch) {
      throw new Error("EBA Q&A catalogue item has no public ID/title link");
    }
    const publicId = linkMatch[1];
    const question = htmlToSourceText(
      requiredMatch(
        article,
        /<p class="teaser-qa__question">([\s\S]*?)<\/p>/u,
        `${publicId} question`,
      ),
    );
    const publishedAt = optionalLabelledListValue(
      article,
      "Published as final Q&A:",
    );
    return ebaQaCatalogItemSchema.parse({
      id: `qa:eba:${publicId}`,
      publicId,
      title: htmlToSourceText(linkMatch[2]),
      question,
      legalActLabel: labelledListValue(article, "Legal act:"),
      associatedMeasureLabel: labelledListValue(
        article,
        "COM Delegated or Implementing Acts/RTS/ITS/GLs:",
      ),
      topicLabel: labelledListValue(article, "Topic:"),
      submittedAt: europeanDate(
        labelledListValue(article, "Date of submission:"),
      ),
      publishedAt: publishedAt ? europeanDate(publishedAt) : null,
      officialUrl: `${EBA_QA_BASE_URL}/${publicId}`,
      statusAtImport: "Final",
      detailAvailable: false,
    });
  });
}

function detailFields(html: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const match of html.matchAll(
    /<dt class="metadata__term">([\s\S]*?)<\/dt>\s*<dd class="metadata__definition">([\s\S]*?)<\/dd>/gu,
  )) {
    fields.set(htmlToSourceText(match[1]), htmlToSourceText(match[2]));
  }
  return fields;
}

function nullableField(
  fields: Map<string, string>,
  label: string,
): string | null {
  const value = fields.get(label)?.trim();
  return value ? value : null;
}

export function parseEbaQaDetailPage(html: string): EbaQaDetail {
  const fields = detailFields(html);
  const publicId = fields.get("Question ID");
  if (!publicId) throw new Error("EBA Q&A detail has no Question ID");
  const disclaimer = htmlToSourceText(
    requiredMatch(
      html,
      /<div class="alert alert-info">[\s\S]*?<h3[^>]*>Disclaimer<\/h3>([\s\S]*?)<\/div>/u,
      `${publicId} disclaimer`,
    ),
  );
  const finalAnswer = fields.get("Final answer");
  const answerPreparedBy = fields.get("Answer prepared by") ?? null;
  const finalStatusLabel = fields.get("Status");
  if (!finalAnswer || !finalStatusLabel) {
    throw new Error(`EBA Q&A detail ${publicId} is incomplete`);
  }
  const hashInput = JSON.stringify({
    publicId,
    question: fields.get("Question"),
    background: fields.get("Background on the question"),
    finalAnswer,
    answerPreparedBy,
    finalStatusLabel,
    disclaimer,
  });
  return ebaQaDetailSchema.parse({
    id: `qa:eba:${publicId}`,
    publicId,
    articleLabel: nullableField(fields, "Article"),
    paragraphLabel: nullableField(fields, "Paragraph"),
    subparagraphLabel: nullableField(fields, "Subparagraph"),
    associatedMeasureArticleLabel: nullableField(fields, "Article/Paragraph"),
    background: fields.get("Background on the question") ?? "",
    finalAnswer,
    answerPreparedBy,
    finalStatusLabel,
    nonBindingNotice: disclaimer,
    contentHash: `sha256:${createHash("sha256").update(hashInput).digest("hex")}`,
  });
}

export function lastCatalogPage(html: string): number {
  const matches = [
    ...html.matchAll(/\?page=(\d+)[^>]*title="Go to last page"/gu),
  ];
  if (matches.length === 0) return 0;
  return Number.parseInt(matches.at(-1)?.[1] ?? "0", 10);
}
