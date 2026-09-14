import { call, idType, root, $const } from "@wf/dsl";
import type { Component, Id, In, Ref, Slots, Type } from "@wf/dsl";

const ty = <T>(name: string): Type<T> => ({ name });

export type Severity = "assert" | "check";

export type Issue = {
  path: (string | number)[];
  code: string;
  message: string;
  severity: Severity;
  expected?: string;
  observed?: unknown;
  repairHint?: string;
};

export type History = "none" | "last_1" | "last_2" | "last_3" | "summary";
export type CarrySpec = { history: History };
export type Stagnation = { window: number; minDelta: number };
export type SelectStrategy = "best" | "last";
export type OnExhausted = "fail" | "best_effort" | "escalate_human";
export type LoopBudget = { usdMicros: number; seconds?: number };

export type LoopControl = {
  maxIter: number;
  budget: LoopBudget;
  carry: CarrySpec;
  stagnation: Stagnation;
  select: SelectStrategy;
  onExhausted: OnExhausted;
};

export type BestOfControl = Omit<LoopControl, "select">;
export type LastOfControl = Omit<LoopControl, "select" | "stagnation">;

type Control = {
  maxIter: number;
  carry: CarrySpec;
  stagnation: Stagnation;
  select: SelectStrategy;
  onExhausted: OnExhausted;
  stopWhen: boolean;
};

const iteration = <T>(): Ref<T> => root<T>("iter");

const component = <I, O>(name: string): Component<I, O> => ({ name });

const noStagnation: Stagnation = { window: 0, minDelta: 0 };

const controlSlots = (
  c: Omit<LoopControl, "budget">,
  stopWhen: Ref<boolean>,
): Slots<Control> => ({
  maxIter: $const(c.maxIter),
  carry: $const(c.carry),
  stagnation: $const(c.stagnation),
  select: $const(c.select),
  onExhausted: $const(c.onExhausted),
  stopWhen,
});

export type VerifyFixIter<T> = { candidate: T; issues: Issue[]; clean: boolean; score: number };
export type VerifyFixOut<T> = { candidate: T; issues: Issue[]; iterations: number; score: number };
type VerifyFixIn<Task> = Control & { task: Task };

export const verifyFix = <Task, T>(
  id: string,
  s: {
    description?: string;
    generator: Component<{ task: Task; feedback: Issue[] }, T>;
    verifier: Component<{ candidate: T }, Issue[]>;
    scorer: Component<{ candidate: T }, number>;
    control: LoopControl;
    stopWhen: (iter: Ref<VerifyFixIter<T>>) => Ref<boolean>;
    candidateType: Type<T>;
    out: Type<VerifyFixOut<T>>;
    in: { task: In<Task> };
  },
) =>
  call<VerifyFixIn<Task>, VerifyFixOut<T>>(id, {
    component: component<VerifyFixIn<Task>, VerifyFixOut<T>>("verify_fix"),
    description: s.description,
    out: s.out,
    typeArgs: [s.candidateType.name],
    budget: s.control.budget,
    params: { generator: s.generator, verifier: s.verifier, scorer: s.scorer },
    in: { ...controlSlots(s.control, s.stopWhen(iteration<VerifyFixIter<T>>())), task: s.in.task },
  });

export type Critique = { score: number; meetsThreshold: boolean; issues: Issue[]; summary: string };
export type CriticReviseIter<T> = { candidate: T; critique: Critique };
export type CriticReviseOut<T> = { candidate: T; score: number; critique: Critique; iterations: number };
type CriticReviseIn<Task> = Control & { task: Task; threshold: number };

export const criticRevise = <Task, T>(
  id: string,
  s: {
    description?: string;
    generator: Component<{ task: Task }, T>;
    critic: Component<{ task: Task; candidate: T }, Critique>;
    reviser: Component<{ task: Task; candidate: T; critique: Critique }, T>;
    threshold: number;
    control: BestOfControl;
    stopWhen: (iter: Ref<CriticReviseIter<T>>) => Ref<boolean>;
    candidateType: Type<T>;
    out: Type<CriticReviseOut<T>>;
    in: { task: In<Task> };
  },
) =>
  call<CriticReviseIn<Task>, CriticReviseOut<T>>(id, {
    component: component<CriticReviseIn<Task>, CriticReviseOut<T>>("critic_revise"),
    description: s.description,
    out: s.out,
    typeArgs: [s.candidateType.name],
    budget: s.control.budget,
    params: { generator: s.generator, critic: s.critic, reviser: s.reviser },
    in: {
      ...controlSlots({ ...s.control, select: "best" }, s.stopWhen(iteration<CriticReviseIter<T>>())),
      task: s.in.task,
      threshold: $const(s.threshold),
    },
  });

export type RetryIter<T> = { candidate: T; issues: Issue[]; valid: boolean };
export type RetryOut<T> = { candidate: T; issues: Issue[]; attempts: number; valid: boolean };
type RetryIn<Task> = Control & { task: Task };

export const retryWithFeedback = <Task, T>(
  id: string,
  s: {
    description?: string;
    caller: Component<{ task: Task; feedback: Issue[] }, T>;
    validator: Component<{ candidate: T }, Issue[]>;
    attempts: number;
    control: LastOfControl;
    stopWhen: (iter: Ref<RetryIter<T>>) => Ref<boolean>;
    candidateType: Type<T>;
    out: Type<RetryOut<T>>;
    in: { task: In<Task> };
  },
) =>
  call<RetryIn<Task>, RetryOut<T>>(id, {
    component: component<RetryIn<Task>, RetryOut<T>>("retry_with_feedback"),
    description: s.description,
    out: s.out,
    typeArgs: [s.candidateType.name],
    budget: s.control.budget,
    params: { caller: s.caller, validator: s.validator },
    in: {
      ...controlSlots(
        { ...s.control, maxIter: s.attempts, select: "last", stagnation: noStagnation },
        s.stopWhen(iteration<RetryIter<T>>()),
      ),
      task: s.in.task,
    },
  });

export type ChecklistItemId = Id<"ChecklistItemId">;
export type ChecklistItem = { id: ChecklistItemId; title: string; done: boolean; evidence: string };
export type TaskCompletionIter<S> = { state: S; checklist: ChecklistItem[]; allDone: boolean; closed: number };
export type TaskCompletionOut<S> = { state: S; checklist: ChecklistItem[]; allDone: boolean; iterations: number };
type TaskCompletionIn<Task, S> = Control & { task: Task; checklist: ChecklistItem[]; state: S };

export const taskCompletion = <Task, S>(
  id: string,
  s: {
    description?: string;
    worker: Component<{ task: Task; state: S; checklist: ChecklistItem[] }, S>;
    checker: Component<{ state: S; checklist: ChecklistItem[] }, ChecklistItem[]>;
    control: LastOfControl;
    stopWhen: (iter: Ref<TaskCompletionIter<S>>) => Ref<boolean>;
    stateType: Type<S>;
    out: Type<TaskCompletionOut<S>>;
    in: { task: In<Task>; checklist: In<ChecklistItem[]>; state: In<S> };
  },
) =>
  call<TaskCompletionIn<Task, S>, TaskCompletionOut<S>>(id, {
    component: component<TaskCompletionIn<Task, S>, TaskCompletionOut<S>>("task_completion"),
    description: s.description,
    out: s.out,
    typeArgs: [s.stateType.name],
    budget: s.control.budget,
    params: { worker: s.worker, checker: s.checker },
    in: {
      ...controlSlots(
        { ...s.control, select: "last", stagnation: noStagnation },
        s.stopWhen(iteration<TaskCompletionIter<S>>()),
      ),
      task: s.in.task,
      checklist: s.in.checklist,
      state: s.in.state,
    },
  });

export const loopTypes = {
  Issue: ty<Issue>("Issue"),
  IssueArr: ty<Issue[]>("Issue[]"),
  Critique: ty<Critique>("Critique"),
  Score: ty<number>("Score"),
  ChecklistItemId: idType<ChecklistItemId>("ChecklistItemId"),
  ChecklistItem: ty<ChecklistItem>("ChecklistItem"),
  ChecklistItemArr: ty<ChecklistItem[]>("ChecklistItem[]"),
};
