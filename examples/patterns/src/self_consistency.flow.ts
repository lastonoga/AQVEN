import { branch, call, code, defineFlow, human, idType, llm, map, root, $const } from "@wf/dsl";
import type { Fn, Id, IdType, Type } from "@wf/dsl";
import { aggregate, agreementOf, divergeTypes, expandVary, voteTally } from "@wf/std/diverge";
import type { AggregateStrategy, Tally } from "@wf/std/diverge";
import { extractTypes } from "@wf/std/extract";

type OptionId = Id<"OptionId">;
type Option = { id: OptionId; text: string };
type Problem = { id: string; statement: string; options: Option[] };
type Answer = { option_id: OptionId; reasoning: string };

const ty = <T>(name: string): Type<T> => ({ name });
const optionId: IdType<OptionId> = idType<OptionId>("OptionId");

const t = {
  OptionId: optionId,
  Answer: ty<Answer>("Answer"),
  AnswerArr: ty<Answer[]>("Answer[]"),
  AnswerTallyArr: ty<Tally<Answer>[]>("Tally<Answer>[]"),
  AnswerReviewForm: ty<unknown>("AnswerReviewForm"),
};

const solveProblem: Fn<{ problem: Problem }, Answer> = { name: "solve_problem" };

const $input = root<Problem>("input");

const variants = code("variants", {
  description: "Разворот vary в пять переопределений вызова: разнообразие — seed",
  fn: expandVary,
  pure: true,
  timeoutMs: 5_000,
  out: divergeTypes.CallOverridesArr,
  in: { vary: $const({ seed: [11, 22, 33, 44, 55] }), n: $const(5) },
});

const solutions = map("solutions", {
  over: variants.out,
  itemType: divergeTypes.CallOverrides,
  concurrency: 5,
  onItemError: "skip",
  maxItems: 5,
  budget: { usdMicros: 60_000 },
  do: (overrides) =>
    llm("solve", {
      description: "Независимое решение задачи со своим seed",
      fn: solveProblem,
      modelRole: "small_fast",
      overrides,
      trustIn: "trusted",
      allowedSets: [{ type: t.OptionId, from: $input.options.$all.id }],
      outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
      in: { problem: $input },
    }),
});

const tally = code("tally", {
  description: "Подсчёт голосов по выбранному варианту",
  fn: voteTally<Answer>(),
  pure: true,
  timeoutMs: 5_000,
  out: t.AnswerTallyArr,
  in: { items: solutions.out, dedupKey: $const("option_id") },
});

const agreement = code("agreement", {
  description: "Уровень согласия против порога 0.6",
  fn: agreementOf<Answer>(),
  pure: true,
  timeoutMs: 5_000,
  out: divergeTypes.VoteAgreement,
  in: { tally: tally.out, threshold: $const(0.6) },
});

const voted = call("voted", {
  description: "Голосование большинством по пяти решениям",
  component: aggregate<Answer>(),
  typeArgs: ["Answer"],
  out: t.Answer,
  in: { items: solutions.out, strategy: $const<AggregateStrategy>("vote"), dedupKey: $const("option_id") },
});

const review = human("review", {
  description: "Разбор разброса ответов человеком",
  form: t.AnswerReviewForm,
  timeoutSeconds: 43_200,
  onTimeout: "escalate",
  out: t.Answer,
  in: { problem: $input, tally: tally.out },
});

const final_answer = branch("final_answer", {
  description: "Большинство принимается только при достаточном согласии, конфликт уходит человеку",
  on: agreement.out.level,
  onType: extractTypes.AgreementLevel,
  default: null,
  cases: { unanimous: voted.out, majority: voted.out, conflict: review },
});

export default defineFlow({
  flow: "self_consistency",
  version: 1,
  input: "Problem",
  output: { type: "Answer", from: final_answer.out },
  budget: { usdMicros: 150_000, seconds: 90 },
  policies: {
    visibility: { divergeBranches: "isolated" },
    trust: { defaultIn: "trusted" },
    escalation: { role: "analyst" },
  },
  defaults: { retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full" }, timeoutMs: 30_000 },
  nodes: [variants, solutions, tally, agreement, voted, review, final_answer],
});
