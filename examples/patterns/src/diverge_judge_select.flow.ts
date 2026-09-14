import { defineFlow, defineComponent, call, code, idType, llm, root, tool, $const } from "@wf/dsl";
import type { Component, Fn, Id, IdType, Type } from "@wf/dsl";
import { diverge } from "@wf/std/diverge";
import type { BranchVisibility, CallOverrides } from "@wf/std/diverge";

type FactId = Id<"FactId">;
type Fact = { id: FactId; text: string };
type SupportCase = { id: string; text: string; locale: string };
type CaseBrief = { case: SupportCase; facts: Fact[] };
type Reply = { text: string; used_facts: FactId[] };
type ReplyText = { text: string };
type Criterion = { id: string; text: string; weight: number };
type Rubric = { criteria: Criterion[] };
type JudgeMode = "pointwise" | "pairwise" | "ranking";
type ReplyVerdict = { decision: "accept" | "revise"; best: Reply; why: string };

const ty = <T>(name: string): Type<T> => ({ name });
const factId: IdType<FactId> = idType<FactId>("FactId");

const t = {
  FactId: factId,
  CaseBrief: ty<CaseBrief>("CaseBrief"),
  Reply: ty<Reply>("Reply"),
  ReplyArr: ty<Reply[]>("Reply[]"),
  ReplyText: ty<ReplyText>("ReplyText"),
  ReplyVerdict: ty<ReplyVerdict>("ReplyVerdict"),
};

const caseBrief: Fn<{ caseId: string }, CaseBrief> = { name: "support_case_brief" };
const draftReply: Fn<{ brief: CaseBrief }, Reply> = { name: "draft_reply" };
const renderReply: Fn<{ reply: Reply; facts: Fact[] }, ReplyText> = { name: "render_reply" };

const judgeReplies: Component<
  { candidates: Reply[]; rubric: Rubric; mode: JudgeMode; swapPositions: boolean; modelRole: string },
  ReplyVerdict
> = { name: "judge" };

const rubric: Rubric = {
  criteria: [
    { id: "accuracy", text: "Ответ опирается только на факты заявки", weight: 0.5 },
    { id: "tone", text: "Тон спокойный, без обвинений", weight: 0.2 },
    { id: "actionability", text: "Есть следующий шаг для клиента", weight: 0.3 },
  ],
};

const $branch = root<{ task: CaseBrief; overrides: CallOverrides }>("in");

const draft = llm("draft", {
  description: "Черновик ответа: ветка видит только заявку и свои переопределения",
  fn: draftReply,
  modelRole: "writer",
  overrides: $branch.overrides,
  trustIn: "untrusted",
  allowedSets: [{ type: t.FactId, from: $branch.task.facts.$all.id }],
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { brief: $branch.task },
});

export const replyDraft = defineComponent({
  name: "reply_draft",
  in: { task: t.CaseBrief, overrides: "CallOverrides" },
  out: { type: "Reply", from: draft.out },
  nodes: [draft],
});

const $input = root<{ caseId: string }>("input");

const brief = tool("brief", {
  description: "Заявка и проверенные факты по ней",
  tool: caseBrief,
  effect: "read",
  ttlSeconds: 300,
  timeoutMs: 10_000,
  out: t.CaseBrief,
  in: { caseId: $input.caseId },
});

const candidates = call("candidates", {
  description: "Три независимых черновика, разнообразие — температура 0.3 / 0.7 / 1.1",
  component: diverge<Reply, CaseBrief>(),
  typeArgs: ["Reply"],
  params: { generator: replyDraft },
  budget: { usdMicros: 120_000 },
  out: t.ReplyArr,
  in: {
    task: brief.out,
    n: $const(3),
    vary: $const({ temperature: [0.3, 0.7, 1.1] }),
    visibility: $const<BranchVisibility>("isolated"),
  },
});

const pick = call("pick", {
  description: "Судья другого семейства, попарно и с перестановкой позиций",
  component: judgeReplies,
  typeArgs: ["Reply"],
  out: t.ReplyVerdict,
  in: {
    candidates: candidates.out,
    rubric: $const(rubric),
    mode: $const<JudgeMode>("pairwise"),
    swapPositions: $const(true),
    modelRole: $const("judge_strong"),
  },
});

const render = code("render", {
  description: "Подстановка текстов фактов по FactId",
  fn: renderReply,
  pure: true,
  timeoutMs: 5_000,
  out: t.ReplyText,
  in: { reply: pick.out.best, facts: brief.out.facts },
});

export default defineFlow({
  flow: "diverge_judge_select",
  version: 1,
  input: "CaseRef",
  output: { type: "ReplyText", from: render.out },
  context: ["locale"],
  budget: { usdMicros: 250_000, seconds: 90 },
  policies: {
    visibility: { divergeBranches: "isolated", judgeSeesProvenance: false },
    trust: { defaultIn: "untrusted" },
  },
  defaults: { retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full" }, timeoutMs: 60_000 },
  components: { replyDraft },
  nodes: [brief, candidates, pick, render],
});
