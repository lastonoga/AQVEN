import { branch, call, code, defineComponent, map, root } from "@wf/dsl";
import { dedupBy, voteTally } from "../diverge.js";
import type { AggregateIn, AggregateStrategy, Tally } from "../diverge.js";
import { mergeByKey, pickBestOf, pickByRank, pickTopVote } from "./fns.js";
import { componentParam } from "./param.js";
import { bodyTypes, ty } from "./types.js";
import type { CandidateT } from "./types.js";

const SCORE_CONCURRENCY = 8;

const $in = root<AggregateIn<CandidateT>>("in");

const deduped = code("deduped", {
  description: "Дедупликация входных результатов по ключу до любой стратегии свода",
  fn: dedupBy<CandidateT>(),
  pure: true,
  timeoutMs: 2_000,
  out: bodyTypes.CandidateArr,
  in: { items: $in.items, dedupKey: $in.dedupKey },
});

const tally = code("tally", {
  description: "Подсчёт голосов по ключу дедупликации",
  fn: voteTally<CandidateT>(),
  pure: true,
  timeoutMs: 2_000,
  out: ty<Tally<CandidateT>[]>("Tally<T>[]"),
  in: { items: deduped.out, dedupKey: $in.dedupKey },
});

const voted = code("voted", {
  description: "Стратегия vote: вариант с наибольшим числом голосов",
  fn: pickTopVote,
  pure: true,
  timeoutMs: 2_000,
  out: bodyTypes.Candidate,
  in: { tally: tally.out },
});

const ranked = code("ranked", {
  description: "Стратегия rank: свод по рангам вариантов",
  fn: pickByRank,
  pure: true,
  timeoutMs: 2_000,
  out: bodyTypes.Candidate,
  in: { tally: tally.out },
});

const merged = code("merged", {
  description: "Стратегия merge: слияние всех вариантов в один по ключу",
  fn: mergeByKey,
  pure: true,
  timeoutMs: 5_000,
  out: bodyTypes.Candidate,
  in: { items: deduped.out, dedupKey: $in.dedupKey },
});

const scores = map("scores", {
  over: deduped.out,
  itemType: bodyTypes.Candidate,
  concurrency: SCORE_CONCURRENCY,
  onItemError: "fail",
  do: (candidate) =>
    call("score", {
      description: "Оценка одного варианта скорером стратегии best_of",
      component: componentParam<{ candidate: CandidateT }, number>("score"),
      out: bodyTypes.Score,
      in: { candidate },
    }),
});

const best = code("best", {
  description: "Стратегия best_of: вариант с максимальной оценкой",
  fn: pickBestOf,
  pure: true,
  timeoutMs: 2_000,
  out: bodyTypes.Candidate,
  in: { items: deduped.out, scores: scores.out },
});

const result = branch("result", {
  description: "Стратегия свода задаётся входом, ветки взаимоисключающие",
  on: $in.strategy,
  onType: ty<AggregateStrategy>("AggregateStrategy"),
  default: null,
  cases: { vote: voted, rank: ranked, merge: merged, best_of: best },
});

export const aggregateBody = defineComponent({
  name: "aggregate",
  in: {
    items: bodyTypes.CandidateArr,
    strategy: ty<AggregateStrategy>("AggregateStrategy"),
    dedupKey: ty<string>("FieldPath"),
  },
  out: { type: "T", from: result.out },
  nodes: [deduped, tally, voted, ranked, merged, scores, best, result],
});
