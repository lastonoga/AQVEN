import { call, code, defineComponent, map, root } from "@wf/dsl";
import { divergeTypes, expandVary } from "../diverge.js";
import type { BranchVisibility, CallOverrides, DivergeIn, VarySpec } from "../diverge.js";
import { componentParam } from "./param.js";
import { bodyTypes, ty } from "./types.js";
import type { CandidateT, TaskT } from "./types.js";

const MAX_BRANCHES = 12;

const $in = root<DivergeIn<TaskT>>("in");

const variants = code("variants", {
  description: "Разворот источника разнообразия в список переопределений вызова, по одному на ветку",
  fn: expandVary,
  pure: true,
  timeoutMs: 2_000,
  out: divergeTypes.CallOverridesArr,
  in: { vary: $in.vary, n: $in.n },
});

const candidates = map("candidates", {
  over: variants.out,
  itemType: divergeTypes.CallOverrides,
  concurrency: MAX_BRANCHES,
  onItemError: "skip",
  maxItems: MAX_BRANCHES,
  do: (overrides) =>
    call("branch", {
      description: "Независимая ветка: генератор видит только задачу и собственные переопределения",
      component: componentParam<{ task: TaskT; overrides: CallOverrides }, CandidateT>("generator"),
      out: bodyTypes.Candidate,
      in: { task: $in.task, overrides },
    }),
});

export const divergeBody = defineComponent({
  name: "diverge",
  in: {
    task: bodyTypes.Task,
    n: bodyTypes.Int,
    vary: ty<VarySpec>("VarySpec"),
    visibility: ty<BranchVisibility>("BranchVisibility"),
  },
  out: { type: "T[]", from: candidates.out },
  nodes: [variants, candidates],
});
