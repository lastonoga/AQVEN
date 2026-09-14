import { defineFlow, defineComponent, call, code, llm, root, tool, $const } from "@wf/dsl";
import { aggregate, diverge } from "@wf/std/diverge";
import { aggregateBody, divergeBody } from "@wf/std";
import type { AggregateStrategy, BranchVisibility, CallOverrides } from "@wf/std/diverge";
import { generateIdeas, renderBoard, researchBrief, t } from "./domain/research.js";
import type { IdeaSet, ResearchBrief } from "./domain/research.js";

const $branch = root<{ task: ResearchBrief; overrides: CallOverrides }>("in");

const ideate = llm("ideate", {
  description: "Набор идей одной персоны: аналитик, маркетолог или инженер",
  fn: generateIdeas,
  modelRole: "writer",
  overrides: $branch.overrides,
  trustIn: "trusted",
  allowedSets: [{ type: t.SourceId, from: $branch.task.sources.$all.id }],
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { brief: $branch.task },
});

export const ideaSet = defineComponent({
  name: "idea_set",
  in: { task: t.ResearchBrief, overrides: "CallOverrides" },
  out: { type: "IdeaSet", from: ideate.out },
  nodes: [ideate],
});

const $input = root<{ topic: string }>("input");

const brief = tool("brief", {
  description: "Материалы по теме с идентификаторами источников",
  tool: researchBrief,
  effect: "read",
  ttlSeconds: 1800,
  timeoutMs: 15_000,
  out: t.ResearchBrief,
  in: { topic: $input.topic },
});

const drafts = call("drafts", {
  description: "Четыре набора идей, разнообразие — персона ветки",
  component: diverge<IdeaSet, ResearchBrief>(),
  typeArgs: ["IdeaSet"],
  params: { generator: ideaSet },
  budget: { usdMicros: 160_000 },
  out: t.IdeaSetArr,
  in: {
    task: brief.out,
    n: $const(4),
    vary: $const({ persona: ["analyst", "marketer", "engineer", "support_lead"] }),
    visibility: $const<BranchVisibility>("isolated"),
  },
});

const merged = call("merged", {
  description: "Слияние наборов в один с дедупликацией по slug",
  component: aggregate<IdeaSet>(),
  typeArgs: ["IdeaSet"],
  out: t.IdeaSet,
  in: {
    items: drafts.out,
    strategy: $const<AggregateStrategy>("merge"),
    dedupKey: $const("ideas[].slug"),
  },
});

const board = code("board", {
  description: "Доска идей с подстановкой названий источников",
  fn: renderBoard,
  pure: true,
  timeoutMs: 5_000,
  out: t.IdeaBoard,
  in: { merged: merged.out, brief: brief.out },
});

export default defineFlow({
  flow: "diverge_merge",
  version: 1,
  input: "TopicRef",
  output: { type: "IdeaBoard", from: board.out },
  budget: { usdMicros: 300_000, seconds: 120 },
  policies: {
    visibility: { divergeBranches: "isolated" },
    trust: { defaultIn: "trusted" },
  },
  defaults: { retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full" }, timeoutMs: 60_000 },
  components: { ideaSet, divergeBody, aggregateBody },
  nodes: [brief, drafts, merged, board],
});
