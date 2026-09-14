import { idType } from "@wf/dsl";
import type { Fn, Id, Type } from "@wf/dsl";
import type { Citation, GroundingVerdict, IdCheck } from "@wf/std/extract";

export type ChunkId = Id<"ChunkId">;

export type Chunk = { id: ChunkId; docTitle: string; text: string };
export type Question = { text: string; topK: number };
export type Answer = { text: string; citations: Citation<ChunkId>[] };

const ty = <T>(name: string): Type<T> => ({ name });

export const t = {
  ChunkId: idType<ChunkId>("ChunkId"),
  ChunkArr: ty<Chunk[]>("Chunk[]"),
  Answer: ty<Answer>("Answer"),
  ChunkIdArr: ty<ChunkId[]>("ChunkId[]"),
  ChunkIdCheck: ty<IdCheck<ChunkId>>("IdCheck<ChunkId>"),
  GroundingVerdict: ty<GroundingVerdict<ChunkId>>("GroundingVerdict<ChunkId>"),
  AnswerReviewForm: ty<unknown>("AnswerReviewForm"),
};

export const searchIndex: Fn<{ question: Question; topK: number }, Chunk[]> = { name: "search_index" };
export const answerWithCitations: Fn<{ question: Question; chunks: Chunk[] }, Answer> = {
  name: "answer_with_citations",
};
export const judgeGrounding: Fn<{ answer: Answer; chunks: Chunk[]; threshold: number }, GroundingVerdict<ChunkId>> = {
  name: "judge_grounding",
};
export const reviseAnswer: Fn<
  { draft: Answer; chunks: Chunk[]; verdict: GroundingVerdict<ChunkId> },
  Answer
> = { name: "revise_answer" };
