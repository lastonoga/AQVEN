import { defineId, defineType, listType } from "@wf/dsl";
import type { Fn, Id } from "@wf/dsl";
import { z } from "zod";
import type { Tally } from "@wf/std/diverge";
import { tallySchema } from "./std.js";
import { idValue, schemaOf } from "./schema.js";

export type OptionId = Id<"OptionId">;

export type Option = { id: OptionId; text: string };
export type Problem = { id: string; statement: string; options: Option[] };
export type Answer = { option_id: OptionId; reasoning: string };
export type AnswerReview = { optionId: string; comment: string };

const optionIdType = defineId<OptionId>("OptionId", {
  description: "Идентификатор варианта ответа; решатель обязан выбрать один из вариантов задачи",
  source: "problem.options[].id",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const optionIdSchema = schemaOf(optionIdType);

const optionSchema: z.ZodType<Option> = z.object({
  id: optionIdSchema.describe("Идентификатор варианта"),
  text: z.string().describe("Формулировка варианта ответа"),
});

const optionExample: Option = { id: idValue<OptionId>("opt-b"), text: "14 календарных дней" };

const optionType = defineType("Option", {
  schema: optionSchema,
  description: "Вариант ответа на задачу с выбором",
  example: optionExample,
});

const problemSchema: z.ZodType<Problem> = z.object({
  id: z.string().describe("Идентификатор задачи в банке задач"),
  statement: z.string().describe("Условие задачи целиком"),
  options: z.array(optionSchema).describe("Варианты ответа: разрешённое множество для решателя"),
});

const problemExample: Problem = {
  id: "task-refund-window",
  statement: "Клиент получил заказ 3 марта и заявил о браке 15 марта. Договор даёт 14 календарных дней на возврат по браку. Какой срок возврата действует для этого заказа?",
  options: [
    { id: idValue<OptionId>("opt-a"), text: "7 календарных дней" },
    optionExample,
    { id: idValue<OptionId>("opt-c"), text: "30 календарных дней" },
  ],
};

const problemType = defineType("Problem", {
  schema: problemSchema,
  description: "Задача с выбором варианта: вход воркфлоу self_consistency",
  example: problemExample,
});

const answerSchema: z.ZodType<Answer> = z.object({
  option_id: optionIdSchema.describe("Выбранный вариант ответа: только из вариантов задачи"),
  reasoning: z.string().describe("Рассуждение до выбора варианта, а не после него"),
});

const answerExample: Answer = {
  option_id: idValue<OptionId>("opt-b"),
  reasoning: "Договор считает срок от даты получения заказа, то есть от 3 марта. Четырнадцать календарных дней истекают 17 марта, заявление от 15 марта укладывается в срок.",
};

const answerType = defineType("Answer", {
  schema: answerSchema,
  description: "Решение задачи: выбранный вариант и рассуждение",
  example: answerExample,
});

const answerTallyExample: Tally<Answer> = { value: answerExample, votes: 4, share: 0.8 };

const answerTallyType = defineType("Tally<Answer>", {
  schema: tallySchema(answerSchema, "Решение, за которое отданы голоса"),
  description: "Голоса независимых прогонов за одно решение",
  example: answerTallyExample,
});

const answerReviewSchema: z.ZodType<AnswerReview> = z.object({
  optionId: z.string().describe("Вариант, который аналитик считает верным"),
  comment: z.string().describe("Почему прогоны разошлись и что считать правильным ответом"),
});

const answerReviewExample: AnswerReview = {
  optionId: "opt-b",
  comment: "Три прогона считали срок от даты заказа, а не от даты получения. Верен вариант «14 календарных дней».",
};

const answerReviewFormType = defineType<unknown>("AnswerReviewForm", {
  schema: answerReviewSchema,
  description: "Форма разбора разброса ответов аналитиком",
  example: answerReviewExample,
});

export const t = {
  OptionId: optionIdType,
  Option: optionType,
  Problem: problemType,
  Answer: answerType,
  AnswerArr: listType(answerType),
  AnswerTally: answerTallyType,
  AnswerTallyArr: listType(answerTallyType),
  AnswerReviewForm: answerReviewFormType,
};

export const solveProblem: Fn<{ problem: Problem }, Answer> = { name: "solve_problem" };
