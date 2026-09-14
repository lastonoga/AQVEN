import { branch, code, defineComponent, defineFlow, human, llm, root, tool, $const } from "@wf/dsl";
import type { Fn, Type } from "@wf/dsl";
import { criticRevise } from "@wf/std/loops";
import type { Critique } from "@wf/std/loops";

type Lead = { company: string; industry: string; painPoints: string[] };
type OutreachRequest = { company: string; offer: string };
type OutreachTask = { lead: Lead; offer: string; maxWords: number };
type Email = { subject: string; body: string };
type EmailDecision = "ship" | "escalate";
type EmailGate = { decision: EmailDecision; reason: string };
type EmailText = { text: string };

const ty = <T>(name: string): Type<T> => ({ name });

const t = {
  Lead: ty<Lead>("Lead"),
  OutreachTask: ty<OutreachTask>("OutreachTask"),
  Email: ty<Email>("Email"),
  EmailText: ty<EmailText>("EmailText"),
  EmailGate: ty<EmailGate>("EmailGate"),
  EmailDecision: ty<EmailDecision>("EmailDecision"),
  EmailReviewForm: ty<unknown>("EmailReviewForm"),
  CriticReviseEmail: ty<{ candidate: Email; score: number; critique: Critique; iterations: number }>(
    "CriticRevise<Email>",
  ),
};

const leadByCompany: Fn<{ company: string }, Lead> = { name: "lead_by_company" };
const buildOutreachTask: Fn<{ lead: Lead; offer: string; maxWords: number }, OutreachTask> = {
  name: "build_outreach_task",
};
const writeEmail: Fn<{ task: OutreachTask }, Email> = { name: "write_email" };
const criticizeEmail: Fn<{ task: OutreachTask; candidate: Email }, Critique> = { name: "criticize_email" };
const reviseEmail: Fn<{ task: OutreachTask; candidate: Email; critique: Critique }, Email> = {
  name: "revise_email",
};
const gateEmail: Fn<{ score: number; threshold: number; iterations: number }, EmailGate> = { name: "gate_email" };
const renderEmail: Fn<{ email: Email; critique: Critique }, EmailText> = { name: "render_email" };

const $generate = root<{ task: OutreachTask }>("in");

const write = llm("write", {
  description: "Первый вариант письма, роль writer",
  fn: writeEmail,
  modelRole: "writer",
  overrides: { temperature: 0.8, maxOutputTokens: 600 },
  trustIn: "trusted",
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { task: $generate.task },
});

const emailGenerator = defineComponent({
  name: "email_generator",
  in: { task: "OutreachTask" },
  out: { type: "Email", from: write.out },
  nodes: [write],
});

const $criticize = root<{ task: OutreachTask; candidate: Email }>("in");

const criticize = llm("criticize", {
  description: "Критика по рубрике, роль judge_strong: другое семейство моделей, чем у генератора",
  fn: criticizeEmail,
  modelRole: "judge_strong",
  overrides: { temperature: 0, maxOutputTokens: 500 },
  trustIn: "trusted",
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { task: $criticize.task, candidate: $criticize.candidate },
});

const emailCritic = defineComponent({
  name: "email_critic",
  in: { task: "OutreachTask", candidate: "Email" },
  out: { type: "Critique", from: criticize.out },
  nodes: [criticize],
});

const $revise = root<{ task: OutreachTask; candidate: Email; critique: Critique }>("in");

const rewrite = llm("rewrite", {
  description: "Ревизия письма по списку проблем критика, роль writer",
  fn: reviseEmail,
  modelRole: "writer",
  overrides: { temperature: 0.5, maxOutputTokens: 600 },
  trustIn: "trusted",
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { task: $revise.task, candidate: $revise.candidate, critique: $revise.critique },
});

const emailReviser = defineComponent({
  name: "email_reviser",
  in: { task: "OutreachTask", candidate: "Email", critique: "Critique" },
  out: { type: "Email", from: rewrite.out },
  nodes: [rewrite],
});

const $input = root<OutreachRequest>("input");

const load_lead = tool("load_lead", {
  description: "Карточка компании из CRM",
  tool: leadByCompany,
  effect: "read",
  ttlSeconds: 1800,
  timeoutMs: 10_000,
  out: t.Lead,
  in: { company: $input.company },
});

const outreach_task = code("outreach_task", {
  description: "Сборка задачи цикла: лид, оффер, лимит длины",
  fn: buildOutreachTask,
  pure: true,
  timeoutMs: 5_000,
  out: t.OutreachTask,
  in: { lead: load_lead.out, offer: $input.offer, maxWords: $const(140) },
});

const polish = criticRevise<OutreachTask, Email>("polish", {
  description: "Цикл критики: порог 0.8, лимит 2 итерации, между итерациями переносится последняя критика",
  generator: emailGenerator,
  critic: emailCritic,
  reviser: emailReviser,
  threshold: 0.8,
  control: {
    maxIter: 2,
    budget: { usdMicros: 90_000, seconds: 60 },
    carry: { history: "last_1" },
    stagnation: { window: 2, minDelta: 0.05 },
    onExhausted: "escalate_human",
  },
  stopWhen: (iter) => iter.critique.meetsThreshold,
  candidateType: t.Email,
  out: t.CriticReviseEmail,
  in: { task: outreach_task.out },
});

const gate = code("gate", {
  description: "Решение по итогу цикла: оценка против порога 0.8",
  fn: gateEmail,
  pure: true,
  timeoutMs: 5_000,
  out: t.EmailGate,
  in: { score: polish.out.score, threshold: $const(0.8), iterations: polish.out.iterations },
});

const review = human("review", {
  description: "Ручная правка письма, если порог не взят за две итерации",
  form: t.EmailReviewForm,
  timeoutSeconds: 43_200,
  onTimeout: "escalate",
  out: t.Email,
  in: { candidate: polish.out.candidate, critique: polish.out.critique },
});

const final_email = branch("final_email", {
  description: "Ветка по решению гейта",
  on: gate.out.decision,
  onType: t.EmailDecision,
  default: null,
  cases: { ship: polish.out.candidate, escalate: review },
});

const render = code("render", {
  description: "Текст письма для отправки",
  fn: renderEmail,
  pure: true,
  timeoutMs: 5_000,
  out: t.EmailText,
  in: { email: final_email.out, critique: polish.out.critique },
});

export default defineFlow({
  flow: "critic_revise",
  version: 1,
  input: "OutreachRequest",
  output: { type: "EmailText", from: render.out },
  context: ["date", "locale"],
  budget: { usdMicros: 150_000, seconds: 120, tokens: null },
  policies: {
    trust: { defaultIn: "trusted" },
    judges: { seesProvenance: false, differentFamilyThanGenerator: true },
    escalation: { role: "sales_lead" },
  },
  defaults: {
    retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full", retryOn: ["timeout", "rate_limit"] },
    timeoutMs: 30_000,
  },
  components: { emailGenerator, emailCritic, emailReviser },
  nodes: [load_lead, outreach_task, polish, gate, review, final_email, render],
});
