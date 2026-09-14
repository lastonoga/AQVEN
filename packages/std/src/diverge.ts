import type { Component, Fn, Type } from "@wf/dsl";
import type { AgreementLevel } from "./extract.js";

export { consensusExtractor as consensus } from "./extract.js";

export type CallOverrides = { temperature?: number; model?: string; persona?: string; seed?: number };

export type VarySpec =
  | { temperature: readonly number[] }
  | { model: readonly string[] }
  | { persona: readonly string[] }
  | { seed: readonly number[] };

export type BranchVisibility = "isolated";

export type DivergeIn<TaskT> = { task: TaskT; n: number; vary: VarySpec; visibility: BranchVisibility };

export type AggregateStrategy = "vote" | "rank" | "merge" | "best_of";

export type AggregateIn<T> = { items: T[]; strategy: AggregateStrategy; dedupKey: string };

export type Tally<T> = { value: T; votes: number; share: number };

export type VoteAgreement = { level: AgreementLevel; share: number; distinct: number };

const ty = <T>(name: string): Type<T> => ({ name });

export const divergeTypes = {
  CallOverrides: ty<CallOverrides>("CallOverrides"),
  CallOverridesArr: ty<CallOverrides[]>("CallOverrides[]"),
  VoteAgreement: ty<VoteAgreement>("VoteAgreement"),
};

export const diverge = <T, TaskT>(): Component<DivergeIn<TaskT>, T[]> => ({ name: "diverge" });

export const aggregate = <T>(): Component<AggregateIn<T>, T> => ({ name: "aggregate" });

export const expandVary: Fn<{ vary: VarySpec; n: number }, CallOverrides[]> = { name: "expand_vary_spec" };

export const voteTally = <T>(): Fn<{ items: T[]; dedupKey: string }, Tally<T>[]> => ({ name: "vote_tally" });

export const agreementOf = <T>(): Fn<{ tally: Tally<T>[]; threshold: number }, VoteAgreement> => ({
  name: "vote_agreement",
});

export const dedupBy = <T>(): Fn<{ items: T[]; dedupKey: string }, T[]> => ({ name: "dedup_by" });

export const foldCounts = <E, A>(): Fn<{ items: E[]; groupBy: string }, A> => ({ name: "fold_counts" });
