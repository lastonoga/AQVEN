import {
  $const,
  branch,
  call,
  code,
  defineComponent,
  defineFlow,
  gate,
  llm,
  loop,
  map,
  parallel,
  race,
  root,
  tool,
} from "@wf/dsl";
import type { Node } from "@wf/dsl";
import { stdBodies } from "@wf/std";
import { loopTypes, verifyFix } from "@wf/std/loops";
import type { Issue, VerifyFixOut } from "@wf/std/loops";
import type {
  ClauseCheck,
  DealRef,
  Doc,
  FinancialTable,
  JudgeScore,
  Opinion,
  PanelDecision,
  ReviewHistory,
  ReviewIteration,
  ReviewMemo,
} from "./domain/dossier.js";
import {
  buildReviewBrief,
  checkClauseDraft,
  collectOpinions,
  draftClauseCheck,
  extractFacts,
  foldClauseChecks,
  foldPanel,
  loadDossier,
  memoRubric,
  quoteTableCached,
  recomputeTable,
  registerRisks,
  renderMemo,
  reviewIteration,
  reviseMemo,
  scoreClauseDraft,
  scoreMemo,
  tableDeltas,
  writeMemo,
  writeOpinion,
  t,
} from "./domain/dossier.js";

const strictJson = { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" };

const $numbers = root<{ table: FinancialTable; dealId: string; period: string }>("in");

const cached_quotes = tool("cached_quotes", {
  description: "Быстрый путь: таблица из кэша выгрузок, отдаётся за доли секунды",
  tool: quoteTableCached,
  effect: "read",
  ttlSeconds: 300,
  timeoutMs: 3_000,
  out: t.FinancialTable,
  in: { dealId: $numbers.dealId, period: $numbers.period },
});

const recomputed_quotes = tool("recomputed_quotes", {
  description: "Медленный путь: полный пересчёт таблицы по первичным проводкам периода",
  tool: recomputeTable,
  effect: "read",
  ttlSeconds: 0,
  timeoutMs: 20_000,
  out: t.FinancialTable,
  in: { table: $numbers.table, period: $numbers.period },
});

const quotes = race("quotes", {
  description: "Кто успеет за четыре секунды: кэш или пересчёт, источник попадает в отчёт",
  branches: { cached: cached_quotes, recomputed: recomputed_quotes },
  timeoutMs: 4_000,
  budget: { usdMicros: 5_000 },
});

const deltas = code("deltas", {
  description: "Отклонения по разделам таблицы против выгрузки досье и доля каждого раздела",
  fn: tableDeltas,
  pure: true,
  timeoutMs: 5_000,
  out: t.NumbersReport,
  in: { baseline: $numbers.table, actual: quotes.out.value, source: quotes.out.source },
});

const numbersDesk = defineComponent({
  name: "numbers_desk",
  in: { table: t.FinancialTable, dealId: t.Text, period: t.Text },
  out: { type: "NumbersReport", from: deltas.out },
  nodes: [cached_quotes, recomputed_quotes, quotes, deltas],
});

const $clause = root<{ task: Doc; feedback: Issue[] }>("in");

const clause_draft = llm("clause_draft", {
  description: "Проверка пунктов одного документа: вердикт и цитата, замечания попытки приходят слотом feedback",
  fn: draftClauseCheck,
  modelRole: "writer_qwen",
  overrides: { temperature: 0.2, maxOutputTokens: 500 },
  trustIn: "untrusted",
  allowedSets: [{ type: t.ClauseId, from: $clause.task.clauses.$all.id }],
  outputContract: strictJson,
  in: { task: $clause.task, feedback: $clause.feedback },
});

const clauseDrafter = defineComponent({
  name: "clause_drafter",
  in: { task: t.Doc, feedback: loopTypes.IssueArr },
  out: { type: "ClauseCheck", from: clause_draft.out },
  nodes: [clause_draft],
});

const $clauseCheck = root<{ candidate: ClauseCheck }>("in");

const clause_verify = code("clause_verify", {
  description: "Детерминированная проверка разбора пункта: цитата непуста, идентификатор известен",
  fn: checkClauseDraft,
  pure: true,
  timeoutMs: 3_000,
  out: loopTypes.IssueArr,
  in: { candidate: $clauseCheck.candidate },
});

const clauseVerifier = defineComponent({
  name: "clause_verifier",
  in: { candidate: t.ClauseCheck },
  out: { type: "Issue[]", from: clause_verify.out },
  nodes: [clause_verify],
});

const $clauseScore = root<{ candidate: ClauseCheck }>("in");

const clause_score = code("clause_score", {
  description: "Оценка разбора пункта для выбора лучшей попытки цикла",
  fn: scoreClauseDraft,
  pure: true,
  timeoutMs: 3_000,
  out: t.Score,
  in: { candidate: $clauseScore.candidate },
});

const clauseScorer = defineComponent({
  name: "clause_scorer",
  in: { candidate: t.ClauseCheck },
  out: { type: "Score", from: clause_score.out },
  nodes: [clause_score],
});

const $input = root<DealRef>("input");
const $history = root<ReviewHistory>("acc");

const dossier = tool("dossier", {
  description: "Досье сделки: документы, пункты договоров и финансовая таблица за период",
  tool: loadDossier,
  effect: "read",
  ttlSeconds: 900,
  timeoutMs: 20_000,
  out: t.Dossier,
  in: { dealId: $input.dealId, period: $input.period },
});

const brief = code("brief", {
  description: "Задача обзора: досье, порог качества 0.82 и лимит объёма меморандума",
  fn: buildReviewBrief,
  pure: true,
  timeoutMs: 5_000,
  out: t.ReviewBrief,
  in: { dossier: dossier.out, threshold: $const(0.82), maxWords: $const(900) },
});

const analysis = llm("analysis", {
  description: "Ветка фактов: проверяемые утверждения из документов, вход — только досье",
  fn: extractFacts,
  modelRole: "writer_openai",
  overrides: { temperature: 0.2, maxOutputTokens: 1_200 },
  trustIn: "untrusted",
  allowedSets: [{ type: t.DocId, from: dossier.out.documents.$all.id }],
  outputContract: strictJson,
  in: { documents: dossier.out.documents, brief: brief.out },
});

const risks = llm("risks", {
  description: "Ветка рисков: другой промт и другой вход — документы плюс возражения прошлых итераций",
  fn: registerRisks,
  modelRole: "writer_anthropic",
  overrides: { temperature: 0.4, maxOutputTokens: 1_200 },
  trustIn: "untrusted",
  allowedSets: [{ type: t.DocId, from: dossier.out.documents.$all.id }],
  outputContract: strictJson,
  in: { documents: dossier.out.documents, history: $history, brief: brief.out },
});

const numbers = call("numbers", {
  description: "Ветка цифр: гонка кэша и пересчёта, затем свод отклонений по таблице",
  component: numbersDesk,
  out: t.NumbersReport,
  budget: { usdMicros: 10_000 },
  in: { table: dossier.out.table, dealId: $input.dealId, period: $input.period },
});

const opinionBranch = (id: string, modelRole: string, temperature: number): Node<Opinion> =>
  llm(id, {
    description: `Мнение по сделке ролью ${modelRole}: промт один, семейство модели своё`,
    fn: writeOpinion,
    modelRole,
    overrides: { temperature, maxOutputTokens: 600 },
    trustIn: "untrusted",
    outputContract: strictJson,
    in: { brief: brief.out, documents: dossier.out.documents },
  });

const opinion_openai = opinionBranch("opinion_openai", "writer_openai", 0.9);
const opinion_anthropic = opinionBranch("opinion_anthropic", "writer_anthropic", 0.8);
const opinion_google = opinionBranch("opinion_google", "writer_google", 1.0);
const opinion_qwen = opinionBranch("opinion_qwen", "writer_qwen", 0.7);

const opinions_fan = parallel("opinions_fan", {
  description: "Однородный веер внутри разнородной ветки: четыре семейства моделей на одном промте",
  branches: {
    openai: opinion_openai,
    anthropic: opinion_anthropic,
    google: opinion_google,
    qwen: opinion_qwen,
  },
  join: "all",
  onBranchError: "default",
  branchDefault: $const<Opinion>({ stance: "hold", thesis: "ветка семейства не ответила", confidence: 0 }),
  concurrency: 4,
  budget: { usdMicros: 90_000 },
});

const opinions = code("opinions", {
  description: "Конвергенция веера: четыре мнения разных семейств сводятся в один список",
  fn: collectOpinions,
  pure: true,
  timeoutMs: 3_000,
  out: t.OpinionArr,
  in: {
    openai: opinions_fan.out.openai,
    anthropic: opinions_fan.out.anthropic,
    google: opinions_fan.out.google,
    qwen: opinions_fan.out.qwen,
  },
});

const clause_checks = map<Doc, VerifyFixOut<ClauseCheck>>("clause_checks", {
  over: dossier.out.documents,
  itemType: t.Doc,
  concurrency: 4,
  onItemError: "skip",
  maxItems: 40,
  budget: { usdMicros: 120_000 },
  do: (doc) =>
    verifyFix<Doc, ClauseCheck>("clause_pass", {
      description: "Цикл ретрая на каждом документе: черновик разбора, валидация, оценка, до двух попыток",
      generator: clauseDrafter,
      verifier: clauseVerifier,
      scorer: clauseScorer,
      control: {
        maxIter: 2,
        budget: { usdMicros: 20_000, seconds: 30 },
        carry: { history: "last_1" },
        stagnation: { window: 2, minDelta: 0.05 },
        select: "best",
        onExhausted: "best_effort",
      },
      stopWhen: (iter) => iter.clean,
      candidateType: t.ClauseCheck,
      out: t.ClauseVerifyOut,
      in: { task: doc },
    }),
});

const clauses = code("clauses", {
  description: "Свод построчных разборов: сколько пунктов проверено и сколько из них блокирующие",
  fn: foldClauseChecks,
  pure: true,
  timeoutMs: 5_000,
  out: t.ClauseReport,
  in: { checks: clause_checks.out, documents: dossier.out.documents },
});

const facets = parallel("facets", {
  description: "Пять разнородных веток обзора: свои промты, свои входы, свои типы выхода",
  branches: { analysis, risks, numbers, opinions, clauses },
  join: "all",
  onBranchError: "fail",
  concurrency: 5,
  budget: { usdMicros: 400_000 },
});

const memo = llm("memo", {
  description: "Синтезатор: пять слотов разных типов сводятся в один меморандум",
  fn: writeMemo,
  modelRole: "writer_google",
  overrides: { temperature: 0.3, maxOutputTokens: 1_600 },
  trustIn: "untrusted",
  allowedSets: [{ type: t.DocId, from: dossier.out.documents.$all.id }],
  outputContract: strictJson,
  in: {
    facts: facets.out.analysis,
    risks: facets.out.risks,
    numbers: facets.out.numbers,
    opinions: facets.out.opinions,
    clauses: facets.out.clauses,
    history: $history,
    brief: brief.out,
  },
});

const judgeBranch = (id: string, modelRole: string, family: string): Node<JudgeScore> =>
  llm(id, {
    description: `Судья панели семейства ${family}: оценка по рубрике, обоснование до баллов`,
    fn: scoreMemo,
    modelRole,
    overrides: { temperature: 0, maxOutputTokens: 700 },
    trustIn: "untrusted",
    outputContract: strictJson,
    in: { memo: memo.out, rubric: $const(memoRubric), brief: brief.out },
  });

const judge_a = judgeBranch("judge_a", "judge_a_mistral", "mistral");
const judge_b = judgeBranch("judge_b", "judge_b_cohere", "cohere");
const judge_c = judgeBranch("judge_c", "judge_c_llama", "llama");

const panel = parallel("panel", {
  description: "Панель судей: семейства mistral, cohere и llama не пересекаются с генераторами (R-J2)",
  branches: { mistral: judge_a, cohere: judge_b, llama: judge_c },
  join: "quorum",
  k: 2,
  onBranchError: "skip",
  concurrency: 3,
  budget: { usdMicros: 90_000 },
});

const verdict = code("verdict", {
  description: "Свод панели: медиана оценок, разброс и решение против порога обзора",
  fn: foldPanel,
  pure: true,
  timeoutMs: 3_000,
  out: t.PanelVerdict,
  in: { scores: panel.out, threshold: brief.out.threshold },
});

const revised = llm("revised", {
  description: "Доработка меморандума по возражениям панели перед следующей итерацией цикла",
  fn: reviseMemo,
  modelRole: "writer_anthropic",
  overrides: { temperature: 0.3, maxOutputTokens: 1_600 },
  trustIn: "untrusted",
  allowedSets: [{ type: t.DocId, from: dossier.out.documents.$all.id }],
  outputContract: strictJson,
  in: { memo: memo.out, verdict: verdict.out, documents: dossier.out.documents },
});

const committee = gate("committee", {
  description: "Эскалация человеку: инвестиционный комитет решает по спорному меморандуму, полсуток на ответ",
  waitFor: "human",
  assignee: "deal_lead",
  timeoutMs: 43_200_000,
  onTimeout: "escalate",
  role: "investment_committee",
  out: t.ReviewMemo,
  in: { memo: memo.out, verdict: verdict.out, objections: verdict.out.objections },
});

const decision = branch<PanelDecision, ReviewMemo>("decision", {
  description: "Решение панели: принять, доработать ещё итерацию или отдать человеку",
  on: verdict.out.decision,
  onType: t.PanelDecision,
  default: null,
  cases: { accept: memo.out, revise: revised, escalate: committee },
});

const iteration = code("iteration", {
  description: "Итог итерации: меморандум, оценка панели и признак взятого порога",
  fn: reviewIteration,
  pure: true,
  timeoutMs: 3_000,
  out: t.ReviewIteration,
  in: { memo: decision.out, verdict: verdict.out },
});

const review = loop<ReviewHistory, ReviewIteration>("review", {
  body: () => iteration,
  carry: $const<ReviewHistory>({ objections: [], rejectedHeadlines: [] }),
  maxIter: 3,
  select: "best",
  stopWhen: (iter) => iter.accepted,
});

const memo_document = code("memo_document", {
  description: "Готовый документ: текст меморандума, число итераций и итоговая позиция по сделке",
  fn: renderMemo,
  pure: true,
  timeoutMs: 5_000,
  out: t.MemoDocument,
  in: { iteration: review.out, dossier: dossier.out },
});

export default defineFlow({
  flow: "deep_composition",
  version: 1,
  input: "DealRef",
  output: { type: "MemoDocument", from: memo_document.out },
  context: ["date", "locale", "tenant"],
  budget: { usdMicros: 1_800_000, seconds: 900 },
  policies: {
    visibility: { divergeBranches: "isolated", judgeSeesProvenance: false, judgeSeesOtherJudges: false },
    trust: { defaultIn: "untrusted" },
    judges: { differentFamilyThanGenerator: true, minDistinctFamilies: 3, quorum: 2 },
    loops: { feedbackSeverity: "assert", repeatedIssuesStop: true },
    escalation: { role: "investment_committee" },
    pii: { maskInTraces: true, allowlistProfile: "pii_safe" },
  },
  defaults: {
    retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full", retryOn: ["timeout", "rate_limit"] },
    timeoutMs: 60_000,
  },
  components: {
    numbersDesk,
    clauseDrafter,
    clauseVerifier,
    clauseScorer,
    verifyFixBody: stdBodies.verifyFix,
  },
  nodes: [
    dossier,
    brief,
    analysis,
    risks,
    numbers,
    opinion_openai,
    opinion_anthropic,
    opinion_google,
    opinion_qwen,
    opinions_fan,
    opinions,
    clause_checks,
    clauses,
    facets,
    memo,
    judge_a,
    judge_b,
    judge_c,
    panel,
    verdict,
    revised,
    committee,
    decision,
    iteration,
    review,
    memo_document,
  ],
});
