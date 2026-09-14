import { $const, branch, call, code, defineFlow, human, llm, root, tool } from "@wf/dsl";
import { escalationOf, judge, judgeResultType, judgeTypes, singletonOf } from "@wf/std/judges";
import type { JudgeConfig } from "@wf/std/judges";
import type { Answer, Ticket } from "./domain/support.js";
import { answerRubric, autoAnswer, loadPolicy, t } from "./domain/support.js";

const strictJson = { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" };

const pointwiseConfig: JudgeConfig<"openai"> = {
  mode: "pointwise",
  generatorFamily: "openai",
  judge: { id: "gate", modelRole: "judge_strong", family: "anthropic", temperature: 0 },
  bias: { blindLabels: true, shuffle: false, swapPositions: false },
  calibration: { dataset: "support_answer_labels@v2", minAgreement: 0.8 },
};

const $input = root<Ticket>("input");

const policy = tool("policy", {
  description: "Пороги эскалации и сроки ответа по тарифу клиента",
  tool: loadPolicy,
  effect: "read",
  ttlSeconds: 900,
  timeoutMs: 5_000,
  out: judgeTypes.EscalationPolicy,
  in: { tier: $input.tier },
});

const auto = llm("auto", {
  description: "Автоматический ответ в рамках политики",
  fn: autoAnswer,
  modelRole: "writer",
  overrides: { temperature: 0.4, maxOutputTokens: 800 },
  trustIn: "untrusted",
  outputContract: strictJson,
  in: { ticket: $input, policy: policy.out },
});

const candidate = code("candidate", {
  description: "Кандидат списком для судьи",
  fn: singletonOf<Answer>(),
  pure: true,
  timeoutMs: 2_000,
  out: t.AnswerArr,
  in: { item: auto.out },
});

const quality = call("quality", {
  description: "Оценка ответа судьёй чужого семейства",
  component: judge<Answer, "openai">(),
  typeArgs: ["Answer"],
  out: judgeResultType<Answer>("Answer"),
  budget: { usdMicros: 40_000 },
  in: { candidates: candidate.out, rubric: $const(answerRubric), config: $const(pointwiseConfig) },
});

const gate = code("gate", {
  description: "Уровень эскалации по оценке судьи и порогам тарифа",
  fn: escalationOf<Answer>(),
  pure: true,
  timeoutMs: 2_000,
  out: judgeTypes.Escalation,
  in: { verdict: quality.out, policy: policy.out },
});

const review = human("review", {
  description: "Проверка ответа оператором, четыре часа на решение",
  form: t.AnswerReviewForm,
  timeoutSeconds: 14_400,
  onTimeout: "escalate",
  out: t.Answer,
  in: { ticket: $input, answer: auto.out, verdict: quality.out },
});

const manager = human("manager", {
  description: "Решение руководителя смены, сутки на решение",
  form: t.ManagerDecisionForm,
  timeoutSeconds: 86_400,
  onTimeout: "fail",
  out: t.Answer,
  in: { ticket: $input, answer: auto.out, escalation: gate.out },
});

const final_answer = branch("final_answer", {
  description: "Автоответ или эскалация человеку по порогу",
  on: gate.out.level,
  onType: judgeTypes.EscalationLevel,
  default: null,
  cases: { auto: auto.out, review, manager },
});

export default defineFlow({
  flow: "human_escalation",
  version: 1,
  input: "Ticket",
  output: { type: "Answer", from: final_answer.out },
  context: ["locale", "date"],
  budget: { usdMicros: 150_000, seconds: 90 },
  policies: {
    trust: { defaultIn: "untrusted" },
    escalation: { role: "support_lead", managerRole: "shift_manager" },
  },
  defaults: {
    retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full" },
    timeoutMs: 60_000,
  },
  nodes: [policy, auto, candidate, quality, gate, review, manager, final_answer],
});
