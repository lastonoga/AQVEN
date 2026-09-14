import { branch, call, code, defineComponent, map, root } from "@wf/dsl";
import { judgeResultType, judgeTypes, panelVerdictType, spreadOf } from "../judges.js";
import type {
  AggregateMethod,
  BiasControls,
  Calibration,
  JudgeMode,
  JudgeResult,
  JudgeSpec,
  ModelFamily,
  PanelVerdict,
  Rubric,
  SingleJudge,
} from "../judges.js";
import { componentParam } from "./param.js";
import { bodyTypes, ty } from "./types.js";
import type { CandidateT } from "./types.js";

const PANEL_CONCURRENCY = 8;

type PanelConfigView = {
  mode: JudgeMode;
  minDistinctFamilies: number;
  judges: JudgeSpec<ModelFamily>[];
  aggregate: { method: AggregateMethod; perCriterion: boolean };
  disagreement: { metric: string; threshold: number };
  bias: BiasControls;
  calibration: Calibration;
};

type PanelBodyIn = { candidate: CandidateT; rubric: Rubric; config: PanelConfigView };

type Verdicts = { verdicts: JudgeResult<CandidateT>[] };

const $in = root<PanelBodyIn>("in");
const $judges = root<SingleJudge<CandidateT>[]>("judges");

const verdicts = map("verdicts", {
  over: $judges,
  itemType: ty<SingleJudge<CandidateT>>("Judge"),
  concurrency: PANEL_CONCURRENCY,
  onItemError: "skip",
  maxItems: PANEL_CONCURRENCY,
  do: () =>
    call("verdict", {
      description: "Один судья панели: видит только кандидата и рубрику, других судей не видит",
      component: componentParam<{ candidate: CandidateT; rubric: Rubric }, JudgeResult<CandidateT>>("item"),
      out: judgeResultType<CandidateT>("T"),
      in: { candidate: $in.candidate, rubric: $in.rubric },
    }),
});

const spread = code("spread", {
  description: "Разброс оценок судей и его уровень относительно порога разногласий",
  fn: spreadOf<CandidateT>(),
  pure: true,
  timeoutMs: 2_000,
  out: panelVerdictType<CandidateT>("T"),
  in: {
    verdicts: verdicts.out,
    method: $in.config.aggregate.method,
    threshold: $in.config.disagreement.threshold,
  },
});

const agreed = call("agreed", {
  description: "Разброс в норме: свод вердиктов агрегатором панели",
  component: componentParam<Verdicts, PanelVerdict<CandidateT>>("aggregate"),
  out: panelVerdictType<CandidateT>("T"),
  in: { verdicts: verdicts.out },
});

const escalated = call("escalated", {
  description: "Разброс выше порога: политика разногласий, тай-брейк или человек",
  component: componentParam<Verdicts, PanelVerdict<CandidateT>>("onDisagreement"),
  out: panelVerdictType<CandidateT>("T"),
  in: { verdicts: verdicts.out },
});

const result = branch("result", {
  description: "Уровень разброса решает, кто выносит итоговый вердикт",
  on: spread.out.level,
  onType: judgeTypes.SpreadLevel,
  default: null,
  cases: { low: agreed, high: escalated },
});

export const judgePanelBody = defineComponent({
  name: "judge_panel",
  in: {
    candidate: bodyTypes.Candidate,
    rubric: judgeTypes.Rubric,
    config: ty<PanelConfigView>("PanelConfig"),
  },
  out: { type: "PanelVerdict<T>", from: result.out },
  nodes: [verdicts, spread, agreed, escalated, result],
});
