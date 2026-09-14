import { code, defineComponent, defineFlow, llm, root, tool, $const } from "@wf/dsl";
import { loopTypes, retryWithFeedback, verifyFix } from "@wf/std/loops";
import type { Issue } from "@wf/std/loops";
import {
  buildReleaseTask,
  checkReleaseNotes,
  digestReleaseNotes,
  draftReleaseNotes,
  renderRelease,
  scoreReleaseNotes,
  t,
  ticketsOfRelease,
  validateReleaseDigest,
} from "./domain/release.js";
import type { ReleaseDigest, ReleaseNotes, ReleaseRequest, ReleaseTask } from "./domain/release.js";

const $draft = root<{ task: ReleaseTask; feedback: Issue[] }>("in");

const draft = llm("draft", {
  description: "Черновик заметок: проблемы прошлой итерации приходят слотом feedback",
  fn: draftReleaseNotes,
  modelRole: "writer",
  overrides: { maxOutputTokens: 1600 },
  trustIn: "trusted",
  allowedSets: [{ type: t.TicketId, from: $draft.task.tickets.$all.id }],
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { task: $draft.task, feedback: $draft.feedback },
});

const notesGenerator = defineComponent({
  name: "notes_generator",
  in: { task: "ReleaseTask", feedback: "Issue[]" },
  out: { type: "ReleaseNotes", from: draft.out },
  nodes: [draft],
});

const $verify = root<{ candidate: ReleaseNotes }>("in");

const verify = code("verify", {
  description: "Детерминированная проверка: ссылки на тикеты, пустые секции, дубли заголовков",
  fn: checkReleaseNotes,
  pure: true,
  timeoutMs: 5_000,
  out: loopTypes.IssueArr,
  in: { candidate: $verify.candidate },
});

const notesVerifier = defineComponent({
  name: "notes_verifier",
  in: { candidate: "ReleaseNotes" },
  out: { type: "Issue[]", from: verify.out },
  nodes: [verify],
});

const $score = root<{ candidate: ReleaseNotes }>("in");

const score = code("score", {
  description: "Оценка кандидата для select: best — покрытие тикетов и длина секций",
  fn: scoreReleaseNotes,
  pure: true,
  timeoutMs: 5_000,
  out: loopTypes.Score,
  in: { candidate: $score.candidate },
});

const notesScorer = defineComponent({
  name: "notes_scorer",
  in: { candidate: "ReleaseNotes" },
  out: { type: "Score", from: score.out },
  nodes: [score],
});

const $digest = root<{ task: ReleaseNotes; feedback: Issue[] }>("in");

const digest_call = llm("digest_call", {
  description: "Выжимка из заметок: текст ошибок валидации возвращается слотом feedback",
  fn: digestReleaseNotes,
  modelRole: "small_fast",
  overrides: { maxOutputTokens: 400 },
  trustIn: "trusted",
  allowedSets: [{ type: t.TicketId, from: $digest.task.sections.$all.ticketIds }],
  outputContract: { mode: "strict", maxRepairs: 0, onTruncated: "fail", onRefusal: "fail" },
  in: { task: $digest.task, feedback: $digest.feedback },
});

const digestCaller = defineComponent({
  name: "digest_caller",
  in: { task: "ReleaseNotes", feedback: "Issue[]" },
  out: { type: "ReleaseDigest", from: digest_call.out },
  nodes: [digest_call],
});

const $validate = root<{ candidate: ReleaseDigest }>("in");

const validate = code("validate", {
  description: "Валидация выжимки: схема, длина списка, существование ticketIds",
  fn: validateReleaseDigest,
  pure: true,
  timeoutMs: 5_000,
  out: loopTypes.IssueArr,
  in: { candidate: $validate.candidate },
});

const digestValidator = defineComponent({
  name: "digest_validator",
  in: { candidate: "ReleaseDigest" },
  out: { type: "Issue[]", from: validate.out },
  nodes: [validate],
});

const $input = root<ReleaseRequest>("input");

const load_tickets = tool("load_tickets", {
  description: "Тикеты, вошедшие в релиз",
  tool: ticketsOfRelease,
  effect: "read",
  ttlSeconds: 600,
  timeoutMs: 10_000,
  out: t.TicketArr,
  in: { version: $input.version },
});

const release_task = code("release_task", {
  description: "Сборка задачи цикла из версии, аудитории и тикетов",
  fn: buildReleaseTask,
  pure: true,
  timeoutMs: 5_000,
  out: t.ReleaseTask,
  in: { version: $input.version, audience: $input.audience, tickets: load_tickets.out },
});

const fix = verifyFix<ReleaseTask, ReleaseNotes>("fix", {
  description: "Цикл доработки: лимит 3 итерации, выход по $iter.clean, берём лучший кандидат",
  generator: notesGenerator,
  verifier: notesVerifier,
  scorer: notesScorer,
  control: {
    maxIter: 3,
    budget: { usdMicros: 120_000, seconds: 90 },
    carry: { history: "last_2" },
    stagnation: { window: 2, minDelta: 0 },
    select: "best",
    onExhausted: "best_effort",
  },
  stopWhen: (iter) => iter.clean,
  candidateType: t.ReleaseNotes,
  out: t.VerifyFixNotes,
  in: { task: release_task.out },
});

const digest = retryWithFeedback<ReleaseNotes, ReleaseDigest>("digest", {
  description: "Выжимка с ретраем по ошибкам валидации: 2 попытки, берём последнюю валидную",
  caller: digestCaller,
  validator: digestValidator,
  attempts: 2,
  control: {
    budget: { usdMicros: 30_000, seconds: 30 },
    carry: { history: "last_1" },
    maxIter: 2,
    onExhausted: "fail",
  },
  stopWhen: (iter) => iter.valid,
  candidateType: t.ReleaseDigest,
  out: t.RetryDigest,
  in: { task: fix.out.candidate },
});

const render = code("render", {
  description: "Финальный текст релиза из лучшего кандидата и выжимки",
  fn: renderRelease,
  pure: true,
  timeoutMs: 5_000,
  out: t.ReleaseText,
  in: { notes: fix.out.candidate, digest: digest.out.candidate, issues: fix.out.issues },
});

export default defineFlow({
  flow: "verify_fix",
  version: 1,
  input: "ReleaseRequest",
  output: { type: "ReleaseText", from: render.out },
  context: ["date", "locale"],
  budget: { usdMicros: 200_000, seconds: 150, tokens: null },
  policies: {
    trust: { defaultIn: "trusted" },
    loops: { feedbackSeverity: "assert", repeatedIssuesStop: true },
    escalation: { role: "release_manager" },
  },
  defaults: {
    retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full", retryOn: ["timeout", "rate_limit"] },
    timeoutMs: 45_000,
  },
  components: { notesGenerator, notesVerifier, notesScorer, digestCaller, digestValidator },
  nodes: [load_tickets, release_task, fix, digest, render],
});
