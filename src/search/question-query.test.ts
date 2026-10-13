import { describe, expect, it } from "vitest";
import { parseQuestionQuery, questionTermCoverage } from "./question-query";

describe("bounded question lexical planning", () => {
  it("removes grammatical noise before selecting up to eight content prefixes", () => {
    const question = parseQuestionQuery(
      "Who approves and periodically reviews a bank's risk strategy?",
    );
    expect(question?.terms).toEqual([
      "approve",
      "periodicall",
      "review",
      "bank",
      "risk",
      "strateg",
    ]);
    expect(question?.matchExpression).not.toContain("who");
    if (!question) throw new Error("Question fixture did not parse");
    expect(
      questionTermCoverage(
        question,
        "Treatment of risks",
        "The management body approves and periodically reviews strategies.",
      ),
    ).toBe(5);
    expect(
      parseQuestionQuery(
        "What alpha bravo charlie delta echo foxtrot golf hotel india juliet mean?",
      )?.terms,
    ).toHaveLength(8);
  });
  it("keeps explicit phrases, identifiers, negation and ordinary keyword search strict", () => {
    for (const query of [
      'What does "management body" mean?',
      "What does Article 74 require?",
      "What controls are not required?",
      "How are risks managed without an audit?",
      "risk management",
      "OR *** operational",
      "银行不需要合规吗？",
    ])
      expect(parseQuestionQuery(query)).toBeNull();
  });
  it("uses only bounded Chinese concept vocabulary, not a general translation model", () => {
    expect(parseQuestionQuery("银行应该如何管理利益冲突？")).toMatchObject({
      language: "zh-vocabulary",
      terms: ["conflict", "interest"],
    });
    expect(parseQuestionQuery("内部审计计划应按什么风险安排？")?.terms).toEqual(
      ["internal", "audit", "plan", "risk"],
    );
    expect(parseQuestionQuery("银行是什么？")).toBeNull();
    expect(parseQuestionQuery("利益冲突")).toBeNull();
  });
  it("never copies raw FTS operators or metacharacters into a query expression", () => {
    const question = parseQuestionQuery(
      "How do controls work? OR NEAR(*) x; DROP TABLE documents;",
    );
    expect(question?.matchExpression).not.toContain(";");
    expect(question?.matchExpression).not.toContain("NEAR(");
    expect(question?.terms.every((term) => /^[a-z]+$/u.test(term))).toBe(true);
  });
});
