import { defineEnum, defineId, defineType, listType } from "@wf/dsl";
import type { Fn, Id } from "@wf/dsl";
import { z } from "zod";
import type {
  Classification,
  EscalationPolicy,
  JudgeResult,
  PanelVerdict,
  RouteSpec,
  RoutedResult,
  Rubric,
} from "@wf/std/judges";
import { idValue, schemaOf } from "./schema.js";

export type DocId = Id<"DocId">;

const docIdType = defineId<DocId>("DocId", {
  description: "Идентификатор статьи базы знаний; ответ вправе ссылаться только на поданные статьи",
  source: "search_kb()",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const routeKindType = defineEnum(
  "RouteKind",
  {
    billing: "Деньги: счета, списания, возвраты, тарифы и акты",
    technical: "Техника: ошибки продукта, интеграции, доступность сервиса",
    legal: "Право: договор, персональные данные, претензия или запрос регулятора",
    account: "Аккаунт: доступы, роли, смена владельца, удаление организации",
  },
  "Направление, в которое уходит обращение после классификации",
);

const techRouteType = defineEnum(
  "TechRoute",
  {
    api: "Ошибка публичного API или интеграции по токену",
    mobile: "Сбой мобильного приложения на устройстве клиента",
    infra: "Недоступность сервиса целиком: платформа, а не один клиент",
  },
  "Подраздел технического направления",
);

export type RouteKind = (typeof routeKindType.values)[number];
export type TechRoute = (typeof techRouteType.values)[number];

export type KbDoc = { id: DocId; title: string; text: string };
export type Ticket = { id: string; text: string; locale: string; tier: string };
export type Queue = { name: string; locale: string };
export type Answer = { text: string; citations: DocId[]; tone: string };
export type Digest = { text: string; escalated: number };
export type RoutedAnswer = RoutedResult<RouteKind, Answer>;
export type AnswerReview = { publish: boolean; comment: string };
export type ManagerDecision = { escalate: boolean; assignee: string; deadlineHours: number };

const docIdSchema = schemaOf(docIdType);

const kbDocSchema: z.ZodType<KbDoc> = z.object({
  id: docIdSchema.describe("Идентификатор статьи базы знаний"),
  title: z.string().describe("Заголовок статьи"),
  text: z.string().describe("Текст статьи целиком: единственный источник фактов для ответа"),
});

const kbDocExample: KbDoc = {
  id: idValue<DocId>("kb-billing-refund-01"),
  title: "Возврат средств за неиспользованный период подписки",
  text: "Остаток оплаченного периода возвращается пропорционально числу неиспользованных дней. Возврат уходит на карту, с которой была оплата, в течение пяти рабочих дней.",
};

const kbDocType = defineType("KbDoc", {
  schema: kbDocSchema,
  description: "Статья базы знаний, найденная под обращение клиента",
  example: kbDocExample,
});

const ticketSchema: z.ZodType<Ticket> = z.object({
  id: z.string().describe("Номер обращения в системе поддержки"),
  text: z.string().describe("Текст обращения клиента без правок"),
  locale: z.string().describe("Язык обращения, код BCP 47: ru, en, de"),
  tier: z.string().describe("Тариф клиента: от него зависит порог эскалации"),
});

const ticketExample: Ticket = {
  id: "SUP-48219",
  text: "Списали за годовую подписку, хотя я отключил продление в июне. Прошу вернуть деньги на ту же карту.",
  locale: "ru",
  tier: "business",
};

const ticketType = defineType("Ticket", {
  schema: ticketSchema,
  description: "Обращение клиента в поддержку: вход воркфлоу маршрутизации и ответа",
  example: ticketExample,
});

const queueSchema: z.ZodType<Queue> = z.object({
  name: z.string().describe("Имя очереди обращений: billing, technical, onboarding"),
  locale: z.string().describe("Язык очереди, код BCP 47"),
});

const queueExample: Queue = { name: "billing", locale: "ru" };

const queueType = defineType("Queue", {
  schema: queueSchema,
  description: "Очередь обращений: вход воркфлоу cascade",
  example: queueExample,
});

const answerSchema: z.ZodType<Answer> = z.object({
  text: z.string().describe("Ответ клиенту: только факты из поданных статей базы знаний"),
  citations: z.array(docIdSchema).describe("Статьи, на которых держится ответ"),
  tone: z.string().describe("Тон ответа: neutral, apologetic, formal"),
});

const answerExample: Answer = {
  text: "Продление действительно было отключено, поэтому списание за год возвращаем полностью. Деньги уйдут на карту, с которой была оплата, в течение пяти рабочих дней.",
  citations: [idValue<DocId>("kb-billing-refund-01")],
  tone: "apologetic",
};

const answerType = defineType("Answer", {
  schema: answerSchema,
  description: "Ответ поддержки клиенту вместе со ссылками на статьи базы знаний",
  example: answerExample,
});

const digestSchema: z.ZodType<Digest> = z.object({
  text: z.string().describe("Сводка по очереди обращений для дежурного менеджера"),
  escalated: z.int().describe("Сколько обращений ушло на эскалацию из разобранной очереди"),
});

const digestExample: Digest = {
  text: "Разобрано 42 обращения. Основной поток — списания после отключённого продления. Три случая требуют решения менеджера: клиент требует компенсацию сверх возврата.",
  escalated: 3,
};

const digestType = defineType("Digest", {
  schema: digestSchema,
  description: "Сводка по разобранной очереди обращений",
  example: digestExample,
});

const answerReviewSchema: z.ZodType<AnswerReview> = z.object({
  publish: z.boolean().describe("Отправлять ли ответ клиенту"),
  comment: z.string().describe("Комментарий оператора: что исправить перед отправкой"),
});

const answerReviewExample: AnswerReview = {
  publish: false,
  comment: "Добавить срок зачисления и убрать обещание компенсации сверх возврата.",
};

const answerReviewFormType = defineType<unknown>("AnswerReviewForm", {
  schema: answerReviewSchema,
  description: "Форма разбора ответа оператором: публиковать или вернуть на доработку",
  example: answerReviewExample,
});

const managerDecisionSchema: z.ZodType<ManagerDecision> = z.object({
  escalate: z.boolean().describe("Передавать ли обращение менеджеру более высокого уровня"),
  assignee: z.string().describe("Кому передаётся обращение: роль или логин"),
  deadlineHours: z.int().describe("Срок решения в часах с момента передачи"),
});

const managerDecisionExample: ManagerDecision = {
  escalate: true,
  assignee: "billing_lead",
  deadlineHours: 24,
};

const managerDecisionFormType = defineType<unknown>("ManagerDecisionForm", {
  schema: managerDecisionSchema,
  description: "Форма решения менеджера по эскалированному обращению",
  example: managerDecisionExample,
});

export const t = {
  DocId: docIdType,
  KbDoc: kbDocType,
  KbDocArr: listType(kbDocType),
  Ticket: ticketType,
  Queue: queueType,
  TicketArr: listType(ticketType),
  Answer: answerType,
  AnswerArr: listType(answerType),
  Digest: digestType,
  RouteKind: routeKindType,
  TechRoute: techRouteType,
  AnswerReviewForm: answerReviewFormType,
  ManagerDecisionForm: managerDecisionFormType,
};

export const answerRubric: Rubric = {
  reasoningBeforeScore: true,
  criteria: [
    { id: "factual_consistency", text: "Ответ опирается только на статьи базы знаний", weight: 0.4, scale: "1-5", hardFailBelow: 3 },
    { id: "fit_to_request", text: "Ответ решает вопрос обращения целиком", weight: 0.4, scale: "1-5" },
    { id: "tone", text: "Тон спокойный, без обвинений и жаргона", weight: 0.2, scale: "1-5" },
  ],
};

export const searchKb: Fn<{ query: string; locale: string }, KbDoc[]> = { name: "search_kb" };
export const loadQueue: Fn<{ queue: string; locale: string }, Ticket[]> = { name: "load_queue" };
export const loadPolicy: Fn<{ tier: string }, EscalationPolicy> = { name: "load_escalation_policy" };

export const draftAnswer: Fn<{ ticket: Ticket; docs: KbDoc[] }, Answer> = { name: "draft_answer" };
export const scoreAnswer: Fn<{ candidate: Answer; rubric: Rubric }, JudgeResult<Answer>> = { name: "score_answer" };
export const reviseAnswer: Fn<{ draft: Answer; verdict: PanelVerdict<Answer>; docs: KbDoc[] }, Answer> = {
  name: "revise_answer",
};
export const rewriteAnswer: Fn<{ ticket: Ticket; docs: KbDoc[]; verdict: PanelVerdict<Answer> }, Answer> = {
  name: "rewrite_answer",
};

export const answerCheap: Fn<{ ticket: Ticket }, Answer> = { name: "answer_cheap" };
export const answerStrong: Fn<{ ticket: Ticket; draft: Answer }, Answer> = { name: "answer_strong" };
export const pickEscalated: Fn<{ answers: Answer[]; tickets: Ticket[] }, Answer[]> = { name: "pick_escalated" };

export const classifyTicket: Fn<{ ticket: Ticket; routes: RouteSpec<RouteKind>[] }, Classification<RouteKind>> = {
  name: "classify_ticket",
};
export const replyAsExpert: Fn<{ ticket: Ticket }, Answer> = { name: "reply_as_expert" };
export const stampRoute: Fn<{ route: Classification<RouteKind>; answer: Answer }, RoutedAnswer> = {
  name: "stamp_route",
};

export const autoAnswer: Fn<{ ticket: Ticket; policy: EscalationPolicy }, Answer> = { name: "auto_answer" };
