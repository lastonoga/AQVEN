import { $const, branch, call, code, defineComponent, defineFlow, llm, root, tool } from "@wf/dsl";
import { judge, judgePanel, judgeResultType, judgeTypes, pairOf, panelVerdictType } from "@wf/std/judges";
import type { JudgeConfig, JudgeSpec, PanelConfig, Rubric, SingleJudge } from "@wf/std/judges";
import type { Answer, Ticket } from "./domain/support.js";
import {
  answerRubric,
  draftAnswer,
  reviseAnswer,
  rewriteAnswer,
  scoreAnswer,
  searchKb,
  t,
} from "./domain/support.js";

const strictJson = { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" };

const foreignJudge = (name: string, spec: JudgeSpec<"openai">): SingleJudge<Answer> => {
  const $judge = root<{ candidate: Answer; rubric: Rubric }>("in");
  const score = llm("score", {
    description: `Оценка по рубрике моделью семейства ${spec.family}: обоснование до баллов`,
    fn: scoreAnswer,
    modelRole: spec.modelRole,
    overrides: { temperature: spec.temperature, maxOutputTokens: 600 },
    trustIn: "untrusted",
    outputContract: strictJson,
    in: { candidate: $judge.candidate, rubric: $judge.rubric },
  });
  return defineComponent({
    name,
    in: { candidate: t.Answer, rubric: judgeTypes.Rubric },
    out: { type: "JudgeResult<Answer>", from: score.out },
    nodes: [score],
  });
};

const alphaSpec: JudgeSpec<"openai"> = { id: "alpha", modelRole: "judge_a", family: "anthropic", temperature: 0 };
const betaSpec: JudgeSpec<"openai"> = { id: "beta", modelRole: "judge_b", family: "google", temperature: 0 };
const gammaSpec: JudgeSpec<"openai"> = { id: "gamma", modelRole: "judge_c", family: "mistral", temperature: 0 };

export const judgeAlpha = foreignJudge("judge_alpha", alphaSpec);
export const judgeBeta = foreignJudge("judge_beta", betaSpec);
export const judgeGamma = foreignJudge("judge_gamma", gammaSpec);

const panelConfig: PanelConfig<"openai"> = {
  mode: "pointwise",
  generatorFamily: "openai",
  forbidGeneratorFamily: true,
  minDistinctFamilies: 2,
  judges: [alphaSpec, betaSpec, gammaSpec],
  aggregate: { method: "median", perCriterion: true },
  disagreement: {
    metric: "spread",
    threshold: 1.5,
    onExceed: "tie_break",
    tieBreaker: { id: "strong", modelRole: "judge_strong", family: "anthropic", temperature: 0 },
  },
  bias: { blindLabels: true, shuffle: true, swapPositions: false },
  calibration: { dataset: "support_answer_labels@v2", minAgreement: 0.8 },
};

const pairwiseConfig: JudgeConfig<"openai"> = {
  mode: "pairwise",
  generatorFamily: "openai",
  judge: { id: "strong", modelRole: "judge_strong", family: "anthropic", temperature: 0 },
  bias: { blindLabels: true, shuffle: true, swapPositions: true },
  calibration: { dataset: "support_answer_labels@v2", minAgreement: 0.8 },
};

const $input = root<Ticket>("input");

const kb = tool("kb", {
  description: "Статьи базы знаний по теме обращения",
  tool: searchKb,
  effect: "read",
  ttlSeconds: 1_800,
  timeoutMs: 8_000,
  out: t.KbDocArr,
  in: { query: $input.text, locale: $input.locale },
});

const draft = llm("draft", {
  description: "Черновик ответа генератором семейства openai",
  fn: draftAnswer,
  modelRole: "writer",
  overrides: { temperature: 0.6, maxOutputTokens: 900 },
  trustIn: "untrusted",
  allowedSets: [{ type: t.DocId, from: kb.out.$all.id }],
  outputContract: strictJson,
  in: { ticket: $input, docs: kb.out },
});

const panel = call("panel", {
  description: "Панель из трёх судей чужих семейств: медиана по критериям, тай-брейк при разбросе выше 1.5",
  component: judgePanel<Answer, "openai">(),
  typeArgs: ["Answer"],
  params: { judges: [judgeAlpha, judgeBeta, judgeGamma] },
  budget: { usdMicros: 120_000 },
  out: panelVerdictType<Answer>("Answer"),
  in: { candidate: draft.out, rubric: $const(answerRubric), config: $const(panelConfig) },
});

const revise = llm("revise", {
  description: "Правка ответа по замечаниям панели",
  fn: reviseAnswer,
  modelRole: "writer",
  overrides: { temperature: 0.3, maxOutputTokens: 900 },
  trustIn: "untrusted",
  allowedSets: [{ type: t.DocId, from: kb.out.$all.id }],
  outputContract: strictJson,
  in: { draft: draft.out, verdict: panel.out, docs: kb.out },
});

const pair = code("pair", {
  description: "Пара кандидатов для попарного сравнения",
  fn: pairOf<Answer>(),
  pure: true,
  timeoutMs: 2_000,
  out: t.AnswerArr,
  in: { first: draft.out, second: revise.out },
});

const pick = call("pick", {
  description: "Попарное сравнение черновика и правки с перестановкой позиций",
  component: judge<Answer, "openai">(),
  typeArgs: ["Answer"],
  out: judgeResultType<Answer>("Answer"),
  in: { candidates: pair.out, rubric: $const(answerRubric), config: $const(pairwiseConfig) },
});

const rewrite = llm("rewrite", {
  description: "Полное переписывание сильной моделью при вердикте escalate",
  fn: rewriteAnswer,
  modelRole: "writer_strong",
  overrides: { temperature: 0.4, maxOutputTokens: 1_200 },
  trustIn: "untrusted",
  allowedSets: [{ type: t.DocId, from: kb.out.$all.id }],
  outputContract: strictJson,
  in: { ticket: $input, docs: kb.out, verdict: panel.out },
});

const final_answer = branch("final_answer", {
  description: "Решение панели судей",
  on: panel.out.decision,
  onType: judgeTypes.PanelDecision,
  default: null,
  cases: { accept: draft.out, revise: pick.out.best, escalate: rewrite },
});

export default defineFlow({
  flow: "judge_panel",
  version: 1,
  input: "Ticket",
  output: { type: "Answer", from: final_answer.out },
  context: ["locale"],
  budget: { usdMicros: 400_000, seconds: 120 },
  policies: {
    visibility: { judgeSeesProvenance: false, judgeSeesOtherJudges: false },
    trust: { defaultIn: "untrusted" },
    escalation: { role: "support_lead" },
  },
  defaults: {
    retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full" },
    timeoutMs: 60_000,
  },
  components: { judgeAlpha, judgeBeta, judgeGamma },
  nodes: [kb, draft, panel, revise, pair, pick, rewrite, final_answer],
});
