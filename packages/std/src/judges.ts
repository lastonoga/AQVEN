import type { Component, Fn, Type } from "@wf/dsl";

export type ModelFamily = "anthropic" | "openai" | "google" | "mistral" | "llama";

export type Foreign<GeneratorFamily extends ModelFamily> = Exclude<ModelFamily, GeneratorFamily>;

export type JudgeMode = "pointwise" | "pairwise" | "ranking";
export type AggregateMethod = "median" | "mean" | "majority" | "max" | "min";
export type SpreadLevel = "low" | "high";
export type PanelDecision = "accept" | "revise" | "escalate";
export type ConfidenceLevel = "sure" | "unsure";

export type Criterion = { id: string; text: string; weight: number; scale: string; hardFailBelow?: number };
export type Rubric = { criteria: Criterion[]; reasoningBeforeScore: true };

export type BiasControls = { blindLabels: boolean; shuffle: boolean; swapPositions: boolean };
export type Calibration = { dataset: string; minAgreement: number };

export type JudgeSpec<GeneratorFamily extends ModelFamily> = {
  id: string;
  modelRole: string;
  family: Foreign<GeneratorFamily>;
  temperature: number;
};

type JudgeBase<GeneratorFamily extends ModelFamily> = {
  judge: JudgeSpec<GeneratorFamily>;
  generatorFamily: GeneratorFamily;
  calibration: Calibration;
};

export type JudgeConfig<GeneratorFamily extends ModelFamily> =
  | (JudgeBase<GeneratorFamily> & { mode: "pointwise"; bias: BiasControls & { blindLabels: true } })
  | (JudgeBase<GeneratorFamily> & { mode: "pairwise"; bias: BiasControls & { blindLabels: true; swapPositions: true } })
  | (JudgeBase<GeneratorFamily> & { mode: "ranking"; bias: BiasControls & { blindLabels: true; shuffle: true } });

export type CriterionScore = { criterion: string; why: string; score: number };

export type JudgeResult<CandidateT> = {
  why: string;
  scores: CriterionScore[];
  score: number;
  best: CandidateT;
  order: number[];
  swapAgreement: number;
  hardFail: boolean;
};

export type PanelVerdict<CandidateT> = {
  why: string;
  scores: CriterionScore[];
  score: number;
  spread: number;
  level: SpreadLevel;
  decision: PanelDecision;
  best: CandidateT;
  judges: string[];
};

export type Disagreement<GeneratorFamily extends ModelFamily> =
  | { metric: "spread"; threshold: number; onExceed: "tie_break"; tieBreaker: JudgeSpec<GeneratorFamily> }
  | { metric: "spread"; threshold: number; onExceed: "human"; form: string; timeoutSeconds: number };

export type PanelConfig<GeneratorFamily extends ModelFamily> = {
  mode: JudgeMode;
  generatorFamily: GeneratorFamily;
  forbidGeneratorFamily: true;
  minDistinctFamilies: number;
  judges: JudgeSpec<GeneratorFamily>[];
  aggregate: { method: AggregateMethod; perCriterion: boolean };
  disagreement: Disagreement<GeneratorFamily>;
  bias: BiasControls;
  calibration: Calibration;
};

export type CascadeStage = { modelRole: string; family: ModelFamily; maxOutputTokens: number; usdMicrosPerCall: number };

export type CascadeConfig = {
  cheap: CascadeStage;
  strong: CascadeStage;
  escalateBelow: number;
  maxEscalatedShare: number;
};

export type Confidence = { level: ConfidenceLevel; confidence: number; why: string };

export type CascadeResult<AnswerT> = {
  answer: AnswerT;
  confidence: number;
  level: ConfidenceLevel;
  escalated: boolean;
  stage: string;
};

export type RouteSpec<Route extends string> = { route: Route; modelRole: string; description: string; examples: string[] };

export type RouterConfig<Route extends string> = {
  classifierRole: string;
  routes: RouteSpec<Route>[];
  fallback: Route;
  minConfidence: number;
};

export type Classification<Route extends string> = { route: Route; confidence: number; why: string };

export type RoutedResult<Route extends string, AnswerT> = {
  route: Route;
  confidence: number;
  why: string;
  result: AnswerT;
};

export type EscalationLevel = "auto" | "review" | "manager";

export type EscalationPolicy = {
  reviewBelow: number;
  managerBelow: number;
  form: string;
  timeoutSeconds: number;
  onTimeout: "escalate" | "fail";
};

export type Escalation = { level: EscalationLevel; score: number; why: string };

export type JudgeIn<CandidateT, GeneratorFamily extends ModelFamily> = {
  candidates: CandidateT[];
  rubric: Rubric;
  config: JudgeConfig<GeneratorFamily>;
};

export type PanelIn<CandidateT, GeneratorFamily extends ModelFamily> = {
  candidate: CandidateT;
  rubric: Rubric;
  config: PanelConfig<GeneratorFamily>;
};

export type CascadeIn<TaskT> = { task: TaskT; config: CascadeConfig };

export type RouterIn<TaskT, Route extends string> = { task: TaskT; config: RouterConfig<Route> };

export type SingleJudge<CandidateT> = Component<{ candidate: CandidateT; rubric: Rubric }, JudgeResult<CandidateT>>;

const ty = <T>(name: string): Type<T> => ({ name });

export const judgeTypes = {
  Rubric: ty<Rubric>("Rubric"),
  CriterionScore: ty<CriterionScore>("CriterionScore"),
  SpreadLevel: ty<SpreadLevel>("SpreadLevel"),
  PanelDecision: ty<PanelDecision>("PanelDecision"),
  Confidence: ty<Confidence>("Confidence"),
  ConfidenceLevel: ty<ConfidenceLevel>("ConfidenceLevel"),
  Escalation: ty<Escalation>("Escalation"),
  EscalationPolicy: ty<EscalationPolicy>("EscalationPolicy"),
  EscalationLevel: ty<EscalationLevel>("EscalationLevel"),
};

export const judgeResultType = <CandidateT>(candidate: string): Type<JudgeResult<CandidateT>> =>
  ty<JudgeResult<CandidateT>>(`JudgeResult<${candidate}>`);

export const panelVerdictType = <CandidateT>(candidate: string): Type<PanelVerdict<CandidateT>> =>
  ty<PanelVerdict<CandidateT>>(`PanelVerdict<${candidate}>`);

export const cascadeResultType = <AnswerT>(answer: string): Type<CascadeResult<AnswerT>> =>
  ty<CascadeResult<AnswerT>>(`CascadeResult<${answer}>`);

export const classificationType = <Route extends string>(route: string): Type<Classification<Route>> =>
  ty<Classification<Route>>(`Classification<${route}>`);

export const routedResultType = <Route extends string, AnswerT>(
  route: string,
  answer: string,
): Type<RoutedResult<Route, AnswerT>> => ty<RoutedResult<Route, AnswerT>>(`RoutedResult<${route}, ${answer}>`);

export const judge = <CandidateT, GeneratorFamily extends ModelFamily>(): Component<
  JudgeIn<CandidateT, GeneratorFamily>,
  JudgeResult<CandidateT>
> => ({ name: "judge" });

export const judgePanel = <CandidateT, GeneratorFamily extends ModelFamily>(): Component<
  PanelIn<CandidateT, GeneratorFamily>,
  PanelVerdict<CandidateT>
> => ({ name: "judge_panel" });

export const cascade = <TaskT, AnswerT>(): Component<CascadeIn<TaskT>, CascadeResult<AnswerT>> => ({ name: "cascade" });

export const routerExperts = <TaskT, Route extends string, AnswerT>(): Component<
  RouterIn<TaskT, Route>,
  RoutedResult<Route, AnswerT>
> => ({ name: "router_experts" });

export const spreadOf = <CandidateT>(): Fn<
  { verdicts: JudgeResult<CandidateT>[]; method: AggregateMethod; threshold: number },
  PanelVerdict<CandidateT>
> => ({ name: "panel_spread" });

export const confidenceOf = <AnswerT>(): Fn<{ answer: AnswerT; config: CascadeConfig }, Confidence> => ({
  name: "confidence_of",
});

export const escalationOf = <CandidateT>(): Fn<
  { verdict: JudgeResult<CandidateT>; policy: EscalationPolicy },
  Escalation
> => ({ name: "escalation_of" });

export const pairOf = <CandidateT>(): Fn<{ first: CandidateT; second: CandidateT }, CandidateT[]> => ({
  name: "pair_of",
});

export const singletonOf = <CandidateT>(): Fn<{ item: CandidateT }, CandidateT[]> => ({ name: "singleton_of" });
