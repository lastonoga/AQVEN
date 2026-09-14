import { defineId, defineType, listType, view, viewType } from "@wf/dsl";
import type { Fn, Id } from "@wf/dsl";
import { z } from "zod";
import type { Citation, GroundingVerdict, IdCheck } from "@wf/std/extract";
import { citationSchema, groundingVerdictSchema, idCheckSchema } from "./std.js";
import { idValue, schemaOf } from "./schema.js";

export type ChunkId = Id<"ChunkId">;

export type Chunk = { id: ChunkId; docTitle: string; text: string };
export type Question = { text: string; topK: number };
export type Answer = { text: string; citations: Citation<ChunkId>[] };
export type AnswerReview = { publish: boolean; comment: string };

const chunkIdType = defineId<ChunkId>("ChunkId", {
  description: "Идентификатор фрагмента базы знаний; ответ вправе цитировать только найденные фрагменты",
  source: "search_index()",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const chunkIdSchema = schemaOf(chunkIdType);

const chunkSchema: z.ZodType<Chunk> = z.object({
  id: chunkIdSchema.describe("Идентификатор фрагмента"),
  docTitle: z.string().describe("Название документа, из которого взят фрагмент"),
  text: z.string().describe("Текст фрагмента целиком: именно из него берутся цитаты"),
});

const chunkExample: Chunk = {
  id: idValue<ChunkId>("chk-refund-policy-3"),
  docTitle: "Политика возвратов, редакция от 2025-03-01",
  text: "Возврат оформляется в течение 14 календарных дней с даты получения заказа. Товар принимается в исходной упаковке.",
};

const chunkType = defineType("Chunk", {
  schema: chunkSchema,
  description: "Фрагмент базы знаний, найденный поиском под вопрос пользователя",
  example: chunkExample,
});

const questionSchema: z.ZodType<Question> = z.object({
  text: z.string().describe("Вопрос пользователя в исходной формулировке"),
  topK: z.int().describe("Сколько фрагментов базы знаний забирать из поиска"),
});

const questionExample: Question = { text: "Сколько дней есть на возврат заказа?", topK: 5 };

const questionType = defineType("Question", {
  schema: questionSchema,
  description: "Вопрос к базе знаний: вход воркфлоу retrieve_ground_answer",
  example: questionExample,
});

const answerSchema: z.ZodType<Answer> = z.object({
  text: z.string().describe("Ответ пользователю: только то, что подтверждается цитатами"),
  citations: z
    .array(citationSchema(chunkIdSchema, "Фрагмент базы знаний, подтверждающий утверждение"))
    .describe("Цитаты из найденных фрагментов: каждое утверждение ответа опирается на одну из них"),
});

const answerExample: Answer = {
  text: "На возврат есть 14 календарных дней с даты получения заказа; товар принимают в исходной упаковке.",
  citations: [
    {
      chunkId: idValue<ChunkId>("chk-refund-policy-3"),
      quote: "Возврат оформляется в течение 14 календарных дней с даты получения заказа.",
    },
  ],
};

const answerType = defineType("Answer", {
  schema: answerSchema,
  description: "Ответ с цитатами: текст для пользователя и опора на фрагменты базы знаний",
  example: answerExample,
});

const answerCardType = viewType(answerType, view("card", ["text"] as const));

const chunkIdCheckExample: IdCheck<ChunkId> = {
  status: "unknown_ids",
  unknown: [idValue<ChunkId>("chk-refund-policy-9")],
  nearest: [
    {
      used: idValue<ChunkId>("chk-refund-policy-9"),
      candidates: [idValue<ChunkId>("chk-refund-policy-3")],
    },
  ],
};

const chunkIdCheckType = defineType("IdCheck<ChunkId>", {
  schema: idCheckSchema(chunkIdSchema, "Фрагмент базы знаний"),
  description: "Проверка идентификаторов фрагментов, на которые сослался ответ",
  example: chunkIdCheckExample,
});

const groundingVerdictExample: GroundingVerdict<ChunkId> = {
  why: "Срок возврата подтверждён цитатой, а требование к упаковке в найденных фрагментах не встречается.",
  score: 0.5,
  decision: "revise",
  unsupported: [
    {
      chunkId: idValue<ChunkId>("chk-refund-policy-3"),
      quote: "Товар принимается в исходной упаковке.",
    },
  ],
};

const groundingVerdictType = defineType("GroundingVerdict<ChunkId>", {
  schema: groundingVerdictSchema(chunkIdSchema, "Фрагмент базы знаний"),
  description: "Вердикт проверки заземления ответа на найденные фрагменты",
  example: groundingVerdictExample,
});

const answerReviewSchema: z.ZodType<AnswerReview> = z.object({
  publish: z.boolean().describe("Отправлять ли ответ пользователю"),
  comment: z.string().describe("Комментарий оператора: что исправить или почему ответ отклонён"),
});

const answerReviewExample: AnswerReview = {
  publish: false,
  comment: "Убрать фразу про упаковку — в базе знаний её нет.",
};

const answerReviewFormType = defineType<unknown>("AnswerReviewForm", {
  schema: answerReviewSchema,
  description: "Форма разбора ответа оператором: публиковать или вернуть на доработку",
  example: answerReviewExample,
});

export const t = {
  ChunkId: chunkIdType,
  Chunk: chunkType,
  ChunkArr: listType(chunkType),
  Question: questionType,
  Answer: answerType,
  AnswerCard: answerCardType,
  ChunkIdArr: listType(chunkIdType),
  ChunkIdCheck: chunkIdCheckType,
  GroundingVerdict: groundingVerdictType,
  AnswerReviewForm: answerReviewFormType,
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
