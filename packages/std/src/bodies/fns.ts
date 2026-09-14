import type { Fn } from "@wf/dsl";
import type { Tally } from "../diverge.js";
import type { JudgeResult, Rubric } from "../judges.js";
import type { Issue, VerifyFixIter, VerifyFixOut } from "../loops.js";
import type { CandidateT } from "./types.js";

export const stripProvenance: Fn<{ candidates: CandidateT[] }, CandidateT[]> = {
  name: "strip_provenance_labels",
};

export const judgePointwise: Fn<{ candidates: CandidateT[]; rubric: Rubric }, JudgeResult<CandidateT>> = {
  name: "judge_pointwise",
};

export const judgePairwiseSwapped: Fn<{ candidates: CandidateT[]; rubric: Rubric }, JudgeResult<CandidateT>> = {
  name: "judge_pairwise_swapped",
};

export const judgeRanking: Fn<{ candidates: CandidateT[]; rubric: Rubric }, JudgeResult<CandidateT>> = {
  name: "judge_ranking",
};

export const averagePositions: Fn<
  { direct: JudgeResult<CandidateT>; swapped: JudgeResult<CandidateT> },
  JudgeResult<CandidateT>
> = { name: "average_positions" };

export const pickTopVote: Fn<{ tally: Tally<CandidateT>[] }, CandidateT> = { name: "pick_top_vote" };

export const pickByRank: Fn<{ tally: Tally<CandidateT>[] }, CandidateT> = { name: "pick_by_rank" };

export const mergeByKey: Fn<{ items: CandidateT[]; dedupKey: string }, CandidateT> = { name: "merge_by_key" };

export const pickBestOf: Fn<{ items: CandidateT[]; scores: number[] }, CandidateT> = { name: "pick_best_of" };

export const verifyFixIteration: Fn<
  { candidate: CandidateT; issues: Issue[]; score: number },
  VerifyFixIter<CandidateT>
> = { name: "verify_fix_iteration" };

export const verifyFixResult: Fn<{ best: VerifyFixIter<CandidateT> }, VerifyFixOut<CandidateT>> = {
  name: "verify_fix_result",
};
