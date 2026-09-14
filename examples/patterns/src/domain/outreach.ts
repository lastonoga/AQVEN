import { defineEnum, defineType } from "@wf/dsl";
import type { Fn } from "@wf/dsl";
import { z } from "zod";
import type { Critique } from "@wf/std/loops";
import { critiqueSchema } from "./std.js";
import { schemaOf } from "./schema.js";

const emailDecisionType = defineEnum(
  "EmailDecision",
  {
    ship: "Письмо уходит клиенту без участия человека: оценка выше порога",
    escalate: "Письмо уходит менеджеру: критик не довёл текст до порога за отведённые итерации",
  },
  "Решение по итогу цикла критики письма",
);

export type EmailDecision = (typeof emailDecisionType.values)[number];

export type Lead = { company: string; industry: string; painPoints: string[] };
export type OutreachRequest = { company: string; offer: string };
export type OutreachTask = { lead: Lead; offer: string; maxWords: number };
export type Email = { subject: string; body: string };
export type EmailGate = { decision: EmailDecision; reason: string };
export type EmailText = { text: string };
export type EmailReview = { send: boolean; comment: string };
export type CriticReviseEmail = { candidate: Email; score: number; critique: Critique; iterations: number };

const leadSchema: z.ZodType<Lead> = z.object({
  company: z.string().describe("Название компании, которой пишем"),
  industry: z.string().describe("Отрасль компании: от неё зависит язык письма"),
  painPoints: z.array(z.string()).describe("Известные боли компании: только они дают право на конкретику в письме"),
});

const leadExample: Lead = {
  company: 'Сеть пекарен «Батон»',
  industry: "Розничная торговля продуктами",
  painPoints: [
    "Списания непроданной выпечки доходят до 12% выручки точки",
    "Заказ сырья считают вручную в таблице, прогноз спроса не ведётся",
  ],
};

const leadType = defineType("Lead", {
  schema: leadSchema,
  description: "Карточка компании-получателя: факты, на которые опирается письмо",
  example: leadExample,
});

const outreachRequestSchema: z.ZodType<OutreachRequest> = z.object({
  company: z.string().describe("Компания, которой готовим письмо"),
  offer: z.string().describe("Предложение, которое нужно донести"),
});

const outreachRequestExample: OutreachRequest = {
  company: 'Сеть пекарен «Батон»',
  offer: "Прогноз спроса по точкам на две недели вперёд",
};

const outreachRequestType = defineType("OutreachRequest", {
  schema: outreachRequestSchema,
  description: "Заявка на холодное письмо: вход воркфлоу critic_revise",
  example: outreachRequestExample,
});

const outreachTaskSchema: z.ZodType<OutreachTask> = z.object({
  lead: leadSchema.describe("Карточка компании со списком болей"),
  offer: z.string().describe("Предложение, которое письмо обязано донести"),
  maxWords: z.int().describe("Предельная длина письма в словах"),
});

const outreachTaskExample: OutreachTask = {
  lead: leadExample,
  offer: "Прогноз спроса по точкам на две недели вперёд",
  maxWords: 120,
};

const outreachTaskType = defineType("OutreachTask", {
  schema: outreachTaskSchema,
  description: "Задание на письмо: кому, что предлагаем и в скольких словах",
  example: outreachTaskExample,
});

const emailSchema: z.ZodType<Email> = z.object({
  subject: z.string().describe("Тема письма: до восьми слов, без заглавных слов целиком"),
  body: z.string().describe("Текст письма: конкретика только из болей компании, один вопрос в конце"),
});

const emailExample: Email = {
  subject: "Списания выпечки в «Батоне»",
  body: "Здравствуйте! Вы считаете заказ сырья вручную, и до 12% выручки точки уходит в списания непроданной выпечки. Мы строим прогноз спроса по каждой точке на две недели вперёд и пересчитываем его каждую ночь. Готовы показать прогноз на данных двух ваших точек — с какой начнём?",
};

const emailType = defineType("Email", {
  schema: emailSchema,
  description: "Холодное письмо компании: тема и текст",
  example: emailExample,
});

const emailGateSchema: z.ZodType<EmailGate> = z.object({
  decision: schemaOf(emailDecisionType).describe("Решение по письму после цикла критики"),
  reason: z.string().describe("Почему принято такое решение: оценка, порог и число итераций"),
});

const emailGateExample: EmailGate = {
  decision: "escalate",
  reason: "После двух итераций оценка 0,74 при пороге 0,8: критик держится за отсутствие ссылки на источник цифры о списаниях.",
};

const emailGateType = defineType("EmailGate", {
  schema: emailGateSchema,
  description: "Ворота перед отправкой письма: отправляем сами или отдаём менеджеру",
  example: emailGateExample,
});

const emailTextSchema: z.ZodType<EmailText> = z.object({
  text: z.string().describe("Готовое письмо целиком: выход воркфлоу critic_revise"),
});

const emailTextExample: EmailText = {
  text: "Тема: Списания выпечки в «Батоне»\n\nЗдравствуйте! Вы считаете заказ сырья вручную, и до 12% выручки точки уходит в списания. Мы строим прогноз спроса по каждой точке на две недели вперёд. Готовы показать прогноз на данных двух ваших точек — с какой начнём?",
};

const emailTextType = defineType("EmailText", {
  schema: emailTextSchema,
  description: "Отрендеренное письмо для отправки",
  example: emailTextExample,
});

const criticReviseEmailSchema: z.ZodType<CriticReviseEmail> = z.object({
  candidate: emailSchema.describe("Письмо на последней итерации"),
  score: z.number().describe("Оценка письма критиком, от 0 до 1"),
  critique: critiqueSchema.describe("Критика последней итерации с замечаниями"),
  iterations: z.int().describe("Сколько итераций критики и правки потрачено"),
});

const criticReviseEmailExample: CriticReviseEmail = {
  candidate: emailExample,
  score: 0.74,
  critique: {
    score: 0.74,
    meetsThreshold: false,
    issues: [
      {
        path: ["body"],
        code: "unsourced_number",
        message: "Цифра о списаниях подана как факт компании, но в карточке она названа оценкой",
        severity: "check",
        repairHint: "Сослаться на боль из карточки словами «по вашей оценке»",
      },
    ],
    summary: "Письмо конкретное и короткое, но одна цифра подана жёстче, чем позволяет карточка компании.",
  },
  iterations: 2,
};

const criticReviseEmailType = defineType("CriticRevise<Email>", {
  schema: criticReviseEmailSchema,
  description: "Итог цикла критики и правки письма: кандидат, оценка и последняя критика",
  example: criticReviseEmailExample,
});

const emailReviewSchema: z.ZodType<EmailReview> = z.object({
  send: z.boolean().describe("Отправлять ли письмо клиенту"),
  comment: z.string().describe("Комментарий менеджера: что поправить перед отправкой"),
});

const emailReviewExample: EmailReview = {
  send: false,
  comment: "Смягчить цифру о списаниях: в карточке это оценка, а не факт компании.",
};

const emailReviewFormType = defineType<unknown>("EmailReviewForm", {
  schema: emailReviewSchema,
  description: "Форма разбора письма менеджером: отправлять или вернуть на правку",
  example: emailReviewExample,
});

export const t = {
  Lead: leadType,
  OutreachRequest: outreachRequestType,
  OutreachTask: outreachTaskType,
  Email: emailType,
  EmailText: emailTextType,
  EmailGate: emailGateType,
  EmailDecision: emailDecisionType,
  EmailReviewForm: emailReviewFormType,
  CriticReviseEmail: criticReviseEmailType,
};

export const leadByCompany: Fn<{ company: string }, Lead> = { name: "lead_by_company" };
export const buildOutreachTask: Fn<{ lead: Lead; offer: string; maxWords: number }, OutreachTask> = {
  name: "build_outreach_task",
};
export const writeEmail: Fn<{ task: OutreachTask }, Email> = { name: "write_email" };
export const criticizeEmail: Fn<{ task: OutreachTask; candidate: Email }, Critique> = { name: "criticize_email" };
export const reviseEmail: Fn<{ task: OutreachTask; candidate: Email; critique: Critique }, Email> = {
  name: "revise_email",
};
export const gateEmail: Fn<{ score: number; threshold: number; iterations: number }, EmailGate> = { name: "gate_email" };
export const renderEmail: Fn<{ email: Email; critique: Critique }, EmailText> = { name: "render_email" };
