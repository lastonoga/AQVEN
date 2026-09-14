import { branch, code, defineComponent, llm, root } from "@wf/dsl";
import { judgeResultType, judgeTypes } from "../judges.js";
import type { BiasControls, Calibration, JudgeMode, Rubric } from "../judges.js";
import { averagePositions, judgePairwiseSwapped, judgePointwise, judgeRanking, stripProvenance } from "./fns.js";
import { bodyTypes, ty } from "./types.js";
import type { CandidateT } from "./types.js";

const strictJson = { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" };

type JudgeSpecView = { id: string; modelRole: string; temperature: number };

type JudgeConfigView = {
  mode: JudgeMode;
  judge: JudgeSpecView;
  bias: BiasControls;
  calibration: Calibration;
};

type JudgeBodyIn = { candidates: CandidateT[]; rubric: Rubric; config: JudgeConfigView };

const $in = root<JudgeBodyIn>("in");

const blinded = code("blinded", {
  description: "Снятие меток происхождения: судья не видит, кто автор кандидата",
  fn: stripProvenance,
  pure: true,
  timeoutMs: 2_000,
  out: bodyTypes.CandidateArr,
  in: { candidates: $in.candidates },
});

const direct = llm("direct", {
  description: "Оценка по рубрике в прямом порядке позиций: обоснование до баллов",
  fn: judgePointwise,
  modelRole: "judge",
  overrides: { temperature: $in.config.judge.temperature, maxOutputTokens: 800 },
  trustIn: "untrusted",
  outputContract: strictJson,
  in: { candidates: blinded.out, rubric: $in.rubric },
});

const swapped = llm("swapped", {
  description: "Та же оценка с перестановкой позиций кандидатов",
  fn: judgePairwiseSwapped,
  modelRole: "judge",
  overrides: { temperature: $in.config.judge.temperature, maxOutputTokens: 800 },
  trustIn: "untrusted",
  outputContract: strictJson,
  in: { candidates: blinded.out, rubric: $in.rubric },
});

const averaged = code("averaged", {
  description: "Усреднение двух порядков позиций и доля совпадения вердиктов",
  fn: averagePositions,
  pure: true,
  timeoutMs: 2_000,
  out: judgeResultType<CandidateT>("T"),
  in: { direct: direct.out, swapped: swapped.out },
});

const ordered = llm("ordered", {
  description: "Ранжирование кандидатов целиком при режиме ranking",
  fn: judgeRanking,
  modelRole: "judge",
  overrides: { temperature: $in.config.judge.temperature, maxOutputTokens: 800 },
  trustIn: "untrusted",
  outputContract: strictJson,
  in: { candidates: blinded.out, rubric: $in.rubric },
});

const verdict = branch("verdict", {
  description: "Режим судьи: pointwise без перестановки, pairwise с усреднением, ranking одним вызовом",
  on: $in.config.mode,
  onType: ty<JudgeMode>("JudgeMode"),
  default: null,
  cases: { pointwise: direct.out, pairwise: averaged.out, ranking: ordered.out },
});

export const judgeBody = defineComponent({
  name: "judge",
  in: { candidates: bodyTypes.CandidateArr, rubric: judgeTypes.Rubric, config: ty<JudgeConfigView>("JudgeConfig") },
  out: { type: "JudgeResult<T>", from: verdict.out },
  nodes: [blinded, direct, swapped, averaged, ordered, verdict],
});
