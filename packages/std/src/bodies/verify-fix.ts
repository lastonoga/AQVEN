import { $const, call, code, defineComponent, loop, root } from "@wf/dsl";
import { loopTypes } from "../loops.js";
import type {
  CarrySpec,
  Issue,
  OnExhausted,
  SelectStrategy,
  Stagnation,
  VerifyFixIter,
  VerifyFixOut,
} from "../loops.js";
import { verifyFixIteration, verifyFixResult } from "./fns.js";
import { componentParam } from "./param.js";
import { bodyTypes, ty } from "./types.js";
import type { CandidateT, TaskT } from "./types.js";

const MAX_ITER = 10;

type VerifyFixBodyIn = {
  task: TaskT;
  maxIter: number;
  carry: CarrySpec;
  stagnation: Stagnation;
  select: SelectStrategy;
  onExhausted: OnExhausted;
  stopWhen: boolean;
};

const iterType = ty<VerifyFixIter<CandidateT>>("VerifyFixIter<T>");

const $in = root<VerifyFixBodyIn>("in");
const $feedback = root<Issue[]>("acc");

const candidate = call("candidate", {
  description: "Генерация кандидата по задаче и типизированным замечаниям прошлой итерации",
  component: componentParam<{ task: TaskT; feedback: Issue[] }, CandidateT>("generator"),
  out: bodyTypes.Candidate,
  in: { task: $in.task, feedback: $feedback },
});

const issues = call("issues", {
  description: "Проверка кандидата: список Issue, а не текст исключения (R-L2)",
  component: componentParam<{ candidate: CandidateT }, Issue[]>("verifier"),
  out: loopTypes.IssueArr,
  in: { candidate: candidate.out },
});

const score = call("score", {
  description: "Оценка кандидата для выбора лучшего варианта (R-L6)",
  component: componentParam<{ candidate: CandidateT }, number>("scorer"),
  out: bodyTypes.Score,
  in: { candidate: candidate.out },
});

const iteration = code("iteration", {
  description: "Итог одной итерации: кандидат, замечания, оценка и признак чистого прогона",
  fn: verifyFixIteration,
  pure: true,
  timeoutMs: 2_000,
  out: iterType,
  in: { candidate: candidate.out, issues: issues.out, score: score.out },
});

const fix = loop("fix", {
  body: () => iteration,
  carry: $const<Issue[]>([]),
  maxIter: MAX_ITER,
  select: "best",
  stopWhen: (iter) => iter.clean,
});

const result = code("result", {
  description: "Лучший кандидат цикла, его замечания и число итераций",
  fn: verifyFixResult,
  pure: true,
  timeoutMs: 2_000,
  out: ty<VerifyFixOut<CandidateT>>("VerifyFixOut<T>"),
  in: { best: fix.out },
});

export const verifyFixBody = defineComponent({
  name: "verify_fix",
  in: {
    task: bodyTypes.Task,
    maxIter: bodyTypes.Int,
    carry: ty<CarrySpec>("CarrySpec"),
    stagnation: ty<Stagnation>("Stagnation"),
    select: ty<SelectStrategy>("SelectStrategy"),
    onExhausted: ty<OnExhausted>("OnExhausted"),
    stopWhen: ty<boolean>("Bool"),
  },
  out: { type: "VerifyFixOut<T>", from: result.out },
  nodes: [candidate, issues, score, iteration, fix, result],
});
