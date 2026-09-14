import { defineFlow, defineComponent, call, code, llm, root, tool, $const } from "@wf/dsl";
import { diverge } from "@wf/std/diverge";
import type { BranchVisibility, CallOverrides } from "@wf/std/diverge";
import { caseBrief, draftReply, judgeReplies, renderReply, rubric, t } from "./domain/replies.js";
import type { CaseBrief, JudgeMode, Reply } from "./domain/replies.js";

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
