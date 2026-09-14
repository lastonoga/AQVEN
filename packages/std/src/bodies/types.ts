import type { Type } from "@wf/dsl";

export type TaskT = { readonly __param: "Task" };
export type CandidateT = { readonly __param: "T" };

export const ty = <T>(name: string): Type<T> => ({ name });

export const bodyTypes = {
  Task: ty<TaskT>("Task"),
  Candidate: ty<CandidateT>("T"),
  CandidateArr: ty<CandidateT[]>("T[]"),
  Int: ty<number>("Int"),
  Score: ty<number>("Score"),
  ScoreArr: ty<number[]>("Score[]"),
};
