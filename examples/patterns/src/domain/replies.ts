import { defineEnum, defineId, defineType, listType } from "@wf/dsl";
import type { Component, Fn, Id } from "@wf/dsl";
import { z } from "zod";
import { idValue, schemaOf } from "./schema.js";

export type FactId = Id<"FactId">;

const judgeModeType = defineEnum(
  "JudgeMode",
  {
    pointwise: "Каждый кандидат оценивается отдельно по рубрике",
    pairwise: "Кандидаты сравниваются попарно с перестановкой позиций",
    ranking: "Кандидаты выстраиваются в один порядок за один проход",
  },
  "Режим работы судьи",
);

const replyDecisionType = defineEnum(
  "ReplyDecision",
  {
    accept: "Ответ уходит клиенту как есть",
    revise: "Ответ требует правки: есть утверждение без опоры на факты заявки",
  },
  "Решение судьи по лучшему черновику ответа",
);

export type JudgeMode = (typeof judgeModeType.values)[number];
export type ReplyDecision = (typeof replyDecisionType.values)[number];

export type Fact = { id: FactId; text: string };
export type SupportCase = { id: string; text: string; locale: string };
export type CaseRef = { caseId: string };
export type CaseBrief = { case: SupportCase; facts: Fact[] };
export type Reply = { text: string; used_facts: FactId[] };
export type ReplyText = { text: string };
export type Criterion = { id: string; text: string; weight: number };
export type Rubric = { criteria: Criterion[] };
export type ReplyVerdict = { decision: ReplyDecision; best: Reply; why: string };

const factIdType = defineId<FactId>("FactId", {
  description: "Идентификатор проверенного факта по заявке; ответ вправе ссылаться только на факты заявки",
  source: "brief.facts[].id",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const factIdSchema = schemaOf(factIdType);

const factSchema: z.ZodType<Fact> = z.object({
  id: factIdSchema.describe("Идентификатор факта"),
  text: z.string().describe("Формулировка факта: подставляется в ответ при рендере"),
});

const factExample: Fact = {
  id: idValue<FactId>("fact-delivery-window"),
  text: "Заказ передан курьеру 14 марта, доставка обещана 16 марта до 18:00",
};

const factType = defineType("Fact", {
  schema: factSchema,
  description: "Проверенный факт по заявке клиента",
  example: factExample,
});

const supportCaseSchema: z.ZodType<SupportCase> = z.object({
  id: z.string().describe("Номер заявки в системе поддержки"),
  text: z.string().describe("Текст заявки клиента без правок"),
  locale: z.string().describe("Язык заявки, код BCP 47"),
});

const supportCaseExample: SupportCase = {
  id: "CASE-71204",
  text: "Обещали доставку 16 марта, сегодня 18-е, статус не менялся. Что с заказом?",
  locale: "ru",
};

const supportCaseType = defineType("SupportCase", {
  schema: supportCaseSchema,
  description: "Заявка клиента в поддержку",
  example: supportCaseExample,
});

const caseRefSchema: z.ZodType<CaseRef> = z.object({
  caseId: z.string().describe("Номер заявки, по которой готовится ответ"),
});

const caseRefExample: CaseRef = { caseId: "CASE-71204" };

const caseRefType = defineType("CaseRef", {
  schema: caseRefSchema,
  description: "Ссылка на заявку: вход воркфлоу diverge_judge_select",
  example: caseRefExample,
});

const caseBriefSchema: z.ZodType<CaseBrief> = z.object({
  case: supportCaseSchema.describe("Заявка клиента"),
  facts: z.array(factSchema).describe("Проверенные факты по заявке: единственная опора ответа"),
});

const caseBriefExample: CaseBrief = {
  case: supportCaseExample,
  facts: [
    factExample,
    {
      id: idValue<FactId>("fact-courier-delay"),
      text: "Курьерская служба сообщила о задержке рейса из сортировочного центра на двое суток",
    },
  ],
};

const caseBriefType = defineType("CaseBrief", {
  schema: caseBriefSchema,
  description: "Бриф по заявке: обращение клиента и проверенные факты",
  example: caseBriefExample,
});

const replySchema: z.ZodType<Reply> = z.object({
  text: z.string().describe("Ответ клиенту: только утверждения, подтверждённые фактами заявки"),
  used_facts: z.array(factIdSchema).describe("Факты, на которые опирается ответ"),
});

const replyExample: Reply = {
  text: "Заказ передан курьеру 14 марта с доставкой до 18:00 16 марта. Рейс из сортировочного центра задержан на двое суток, поэтому посылка идёт с опозданием. Вернёмся с новой датой в течение суток.",
  used_facts: [idValue<FactId>("fact-delivery-window"), idValue<FactId>("fact-courier-delay")],
};

const replyType = defineType("Reply", {
  schema: replySchema,
  description: "Черновик ответа клиенту со ссылками на факты заявки",
  example: replyExample,
});

const replyTextSchema: z.ZodType<ReplyText> = z.object({
  text: z.string().describe("Готовый ответ клиенту: факты уже подставлены по FactId"),
});

const replyTextExample: ReplyText = { text: replyExample.text };

const replyTextType = defineType("ReplyText", {
  schema: replyTextSchema,
  description: "Отрендеренный ответ клиенту: выход воркфлоу diverge_judge_select",
  example: replyTextExample,
});

const replyVerdictSchema: z.ZodType<ReplyVerdict> = z.object({
  decision: schemaOf(replyDecisionType).describe("Решение судьи по лучшему черновику"),
  best: replySchema.describe("Черновик, победивший в попарном сравнении"),
  why: z.string().describe("Обоснование выбора: чем победитель лучше остальных"),
});

const replyVerdictExample: ReplyVerdict = {
  decision: "accept",
  best: replyExample,
  why: "Единственный черновик, который называет обе причины задержки и не обещает точную дату, которой нет в фактах.",
};

const replyVerdictType = defineType("ReplyVerdict", {
  schema: replyVerdictSchema,
  description: "Вердикт судьи по черновикам ответа",
  example: replyVerdictExample,
});

export const t = {
  FactId: factIdType,
  Fact: factType,
  SupportCase: supportCaseType,
  CaseRef: caseRefType,
  CaseBrief: caseBriefType,
  Reply: replyType,
  ReplyArr: listType(replyType),
  ReplyText: replyTextType,
  ReplyVerdict: replyVerdictType,
  JudgeMode: judgeModeType,
  ReplyDecision: replyDecisionType,
};

export const rubric: Rubric = {
  criteria: [
    { id: "accuracy", text: "Ответ опирается только на факты заявки", weight: 0.5 },
    { id: "tone", text: "Тон спокойный, без обвинений", weight: 0.2 },
    { id: "actionability", text: "Есть следующий шаг для клиента", weight: 0.3 },
  ],
};

export const caseBrief: Fn<{ caseId: string }, CaseBrief> = { name: "support_case_brief" };
export const draftReply: Fn<{ brief: CaseBrief }, Reply> = { name: "draft_reply" };
export const renderReply: Fn<{ reply: Reply; facts: Fact[] }, ReplyText> = { name: "render_reply" };

export const judgeReplies: Component<
  { candidates: Reply[]; rubric: Rubric; mode: JudgeMode; swapPositions: boolean; modelRole: string },
  ReplyVerdict
> = { name: "judge" };
