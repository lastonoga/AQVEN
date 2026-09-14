import { defineFlow, tool, llm, code, human, branch, root, $const } from "@wf/dsl";
import { collectIds, checkIds, extractTypes } from "@wf/std/extract";
import { t, searchIndex, answerWithCitations, judgeGrounding, reviseAnswer } from "./domain/knowledge.js";
import type { Answer, ChunkId, Question } from "./domain/knowledge.js";

const $input = root<Question>("input");

const retrieve = tool("retrieve", {
  description: "Top-k фрагментов базы знаний по вопросу",
  tool: searchIndex, effect: "read", ttlSeconds: 300, timeoutMs: 8_000,
  out: t.ChunkArr, in: { question: $input, topK: $input.topK },
});

const answer = llm("answer", {
  description: "Ответ с цитатами: цитировать можно только найденные фрагменты",
  fn: answerWithCitations, modelRole: "writer", trustIn: "untrusted",
  overrides: { temperature: 0.2, maxOutputTokens: 1_000 },
  allowedSets: [{ type: t.ChunkId, from: retrieve.out.$all.id }],
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { question: $input, chunks: retrieve.out },
});

const cited = code("cited", {
  description: "Идентификаторы процитированных фрагментов",
  fn: collectIds<Answer, ChunkId>(), pure: true, timeoutMs: 2_000, out: t.ChunkIdArr,
  in: { value: answer.out, path: $const("citations[*].chunkId") },
});

const check_citations = code("check_citations", {
  description: "Цитаты против выдачи ретривера",
  fn: checkIds<ChunkId>(), pure: true, timeoutMs: 2_000, out: t.ChunkIdCheck,
  in: { used: cited.out, allowed: retrieve.out.$all.id },
});

const grounding = llm("grounding", {
  description: "Опора ответа на источник: обоснование раньше решения",
  fn: judgeGrounding, modelRole: "judge_strong", trustIn: "trusted",
  overrides: { temperature: 0, maxOutputTokens: 600 },
  allowedSets: [{ type: t.ChunkId, from: retrieve.out.$all.id }],
  outputContract: { mode: "strict", maxRepairs: 0, onTruncated: "fail", onRefusal: "fail" },
  in: { answer: answer.out, chunks: retrieve.out, threshold: $const(0.8) },
});

const revise = llm("revise", {
  description: "Правка ответа по неподтверждённым цитатам",
  fn: reviseAnswer, modelRole: "writer", trustIn: "untrusted",
  overrides: { temperature: 0, maxOutputTokens: 1_000 },
  allowedSets: [{ type: t.ChunkId, from: retrieve.out.$all.id }],
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { draft: answer.out, chunks: retrieve.out, verdict: grounding.out },
});

const review = human("review", {
  description: "Ручная проверка ответа без опоры на источник",
  form: t.AnswerReviewForm, timeoutSeconds: 43_200, onTimeout: "escalate", out: t.Answer,
  in: { draft: answer.out, verdict: grounding.out, check: check_citations.out },
});

const final_answer = branch("final_answer", {
  description: "Решение проверки опоры",
  on: grounding.out.decision, onType: extractTypes.GroundingDecision, default: null,
  cases: { grounded: answer.out, revise, escalate: review },
});

export default defineFlow({
  flow: "retrieve_ground_answer", version: 1, input: "Question",
  output: { type: "Answer", from: final_answer.out },
  context: ["date", "locale"],
  budget: { usdMicros: 150_000, seconds: 90, tokens: null },
  policies: { visibility: { judgeSeesProvenance: false }, trust: { defaultIn: "untrusted" },
    escalation: { role: "support_lead" } },
  defaults: { retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full",
      retryOn: ["timeout", "rate_limit", "server_error"] }, timeoutMs: 30_000 },
  nodes: [retrieve, answer, cited, check_citations, grounding, revise, review, final_answer],
});
