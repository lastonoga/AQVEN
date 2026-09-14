import { defineEnum, defineId, defineType, listType } from "@wf/dsl";
import type { Fn, Id } from "@wf/dsl";
import { z } from "zod";
import type { Issue } from "@wf/std/loops";
import { issueSchema } from "./std.js";
import { idValue, schemaOf } from "./schema.js";

export type TicketId = Id<"TicketId">;

const ticketIdType = defineId<TicketId>("TicketId", {
  description: "Идентификатор задачи релиза; заметки вправе ссылаться только на задачи этого релиза",
  source: "tickets_of_release()",
  allowedSet: "dynamic",
  codeFormat: "identity",
});

const riskLevelType = defineEnum(
  "RiskLevel",
  {
    low: "Изменение обратимо и не трогает данные клиентов",
    high: "Изменение затрагивает данные или оплату: нужен раздел о рисках в заметках",
  },
  "Риск задачи релиза",
);

export type RiskLevel = (typeof riskLevelType.values)[number];
export type Ticket = { id: TicketId; title: string; risk: RiskLevel };
export type ReleaseRequest = { version: string; audience: string };
export type ReleaseTask = { version: string; audience: string; tickets: Ticket[] };
export type NotesSection = { heading: string; body: string; ticketIds: TicketId[] };
export type ReleaseNotes = { title: string; sections: NotesSection[] };
export type ReleaseDigest = { highlights: string[]; ticketIds: TicketId[] };
export type ReleaseText = { text: string };
export type VerifyFixNotes = { candidate: ReleaseNotes; issues: Issue[]; iterations: number; score: number };
export type RetryDigest = { candidate: ReleaseDigest; issues: Issue[]; attempts: number; valid: boolean };

const ticketIdSchema = schemaOf(ticketIdType);

const ticketSchema: z.ZodType<Ticket> = z.object({
  id: ticketIdSchema.describe("Идентификатор задачи в трекере"),
  title: z.string().describe("Заголовок задачи так, как он записан в трекере"),
  risk: schemaOf(riskLevelType).describe("Риск задачи: от него зависит, нужен ли раздел о рисках"),
});

const ticketExample: Ticket = {
  id: idValue<TicketId>("PAY-1842"),
  title: "Повторные списания при оплате картой Mir",
  risk: "high",
};

const ticketType = defineType("Ticket", {
  schema: ticketSchema,
  description: "Задача, попавшая в релиз",
  example: ticketExample,
});

const releaseRequestSchema: z.ZodType<ReleaseRequest> = z.object({
  version: z.string().describe("Версия релиза в формате semver"),
  audience: z.string().describe("Аудитория заметок: customers, partners или internal"),
});

const releaseRequestExample: ReleaseRequest = { version: "4.12.0", audience: "customers" };

const releaseRequestType = defineType("ReleaseRequest", {
  schema: releaseRequestSchema,
  description: "Заявка на выпуск заметок о релизе: вход воркфлоу verify_fix",
  example: releaseRequestExample,
});

const releaseTaskSchema: z.ZodType<ReleaseTask> = z.object({
  version: z.string().describe("Версия релиза в формате semver"),
  audience: z.string().describe("Аудитория заметок: от неё зависит уровень технических деталей"),
  tickets: z.array(ticketSchema).describe("Задачи релиза: разрешённое множество ссылок в заметках"),
});

const releaseTaskExample: ReleaseTask = {
  version: "4.12.0",
  audience: "customers",
  tickets: [
    ticketExample,
    { id: idValue<TicketId>("UI-903"), title: "Тёмная тема в мобильном приложении", risk: "low" },
  ],
};

const releaseTaskType = defineType("ReleaseTask", {
  schema: releaseTaskSchema,
  description: "Задание на заметки о релизе: версия, аудитория и состав задач",
  example: releaseTaskExample,
});

const notesSectionSchema: z.ZodType<NotesSection> = z.object({
  heading: z.string().describe("Заголовок раздела заметок"),
  body: z.string().describe("Текст раздела для выбранной аудитории, без внутреннего жаргона"),
  ticketIds: z.array(ticketIdSchema).describe("Задачи, о которых говорит раздел"),
});

const releaseNotesSchema: z.ZodType<ReleaseNotes> = z.object({
  title: z.string().describe("Заголовок заметок с версией релиза"),
  sections: z.array(notesSectionSchema).describe("Разделы заметок в порядке важности для клиента"),
});

const releaseNotesExample: ReleaseNotes = {
  title: "Что нового в 4.12.0",
  sections: [
    {
      heading: "Оплата картами Mir",
      body: "Исправили повторные списания при оплате картой Mir. Задвоенные платежи вернутся автоматически в течение трёх рабочих дней.",
      ticketIds: [idValue<TicketId>("PAY-1842")],
    },
    {
      heading: "Тёмная тема",
      body: "Мобильное приложение поддерживает тёмную тему и переключается вслед за системной настройкой.",
      ticketIds: [idValue<TicketId>("UI-903")],
    },
  ],
};

const releaseNotesType = defineType("ReleaseNotes", {
  schema: releaseNotesSchema,
  description: "Заметки о релизе по разделам со ссылками на задачи",
  example: releaseNotesExample,
});

const releaseDigestSchema: z.ZodType<ReleaseDigest> = z.object({
  highlights: z.array(z.string()).describe("Короткие пункты для письма и баннера, по одному на изменение"),
  ticketIds: z.array(ticketIdSchema).describe("Задачи, попавшие в выжимку"),
});

const releaseDigestExample: ReleaseDigest = {
  highlights: [
    "Повторные списания по картам Mir больше не происходят",
    "Тёмная тема в мобильном приложении",
  ],
  ticketIds: [idValue<TicketId>("PAY-1842"), idValue<TicketId>("UI-903")],
};

const releaseDigestType = defineType("ReleaseDigest", {
  schema: releaseDigestSchema,
  description: "Выжимка заметок о релизе для письма и баннера",
  example: releaseDigestExample,
});

const releaseTextSchema: z.ZodType<ReleaseText> = z.object({
  text: z.string().describe("Готовый текст заметок: выход воркфлоу verify_fix"),
});

const releaseTextExample: ReleaseText = {
  text: "Что нового в 4.12.0\n\nОплата картами Mir. Исправили повторные списания; задвоенные платежи вернутся автоматически в течение трёх рабочих дней.\n\nТёмная тема. Мобильное приложение переключается вслед за системной настройкой.",
};

const releaseTextType = defineType("ReleaseText", {
  schema: releaseTextSchema,
  description: "Отрендеренные заметки о релизе",
  example: releaseTextExample,
});

const verifyFixNotesSchema: z.ZodType<VerifyFixNotes> = z.object({
  candidate: releaseNotesSchema.describe("Заметки после последней починки"),
  issues: z.array(issueSchema).describe("Замечания верификатора, оставшиеся незакрытыми"),
  iterations: z.int().describe("Сколько итераций проверки и починки потрачено"),
  score: z.number().describe("Оценка заметок от 0 до 1"),
});

const verifyFixNotesExample: VerifyFixNotes = {
  candidate: releaseNotesExample,
  issues: [],
  iterations: 2,
  score: 0.88,
};

const verifyFixNotesType = defineType("VerifyFix<ReleaseNotes>", {
  schema: verifyFixNotesSchema,
  description: "Итог цикла проверки и починки заметок о релизе",
  example: verifyFixNotesExample,
});

const retryDigestSchema: z.ZodType<RetryDigest> = z.object({
  candidate: releaseDigestSchema.describe("Выжимка после последней попытки"),
  issues: z.array(issueSchema).describe("Замечания валидатора по последней попытке"),
  attempts: z.int().describe("Сколько попыток потрачено"),
  valid: z.boolean().describe("Прошла ли выжимка валидацию"),
});

const retryDigestExample: RetryDigest = {
  candidate: releaseDigestExample,
  issues: [],
  attempts: 1,
  valid: true,
};

const retryDigestType = defineType("Retry<ReleaseDigest>", {
  schema: retryDigestSchema,
  description: "Итог цикла повторов с обратной связью для выжимки релиза",
  example: retryDigestExample,
});

export const t = {
  TicketId: ticketIdType,
  RiskLevel: riskLevelType,
  Ticket: ticketType,
  TicketArr: listType(ticketType),
  ReleaseRequest: releaseRequestType,
  ReleaseTask: releaseTaskType,
  ReleaseNotes: releaseNotesType,
  ReleaseDigest: releaseDigestType,
  ReleaseText: releaseTextType,
  VerifyFixNotes: verifyFixNotesType,
  RetryDigest: retryDigestType,
};

export const ticketsOfRelease: Fn<{ version: string }, Ticket[]> = { name: "tickets_of_release" };
export const buildReleaseTask: Fn<{ version: string; audience: string; tickets: Ticket[] }, ReleaseTask> = {
  name: "build_release_task",
};
export const draftReleaseNotes: Fn<{ task: ReleaseTask; feedback: Issue[] }, ReleaseNotes> = {
  name: "draft_release_notes",
};
export const checkReleaseNotes: Fn<{ candidate: ReleaseNotes }, Issue[]> = { name: "check_release_notes" };
export const scoreReleaseNotes: Fn<{ candidate: ReleaseNotes }, number> = { name: "score_release_notes" };
export const digestReleaseNotes: Fn<{ task: ReleaseNotes; feedback: Issue[] }, ReleaseDigest> = {
  name: "digest_release_notes",
};
export const validateReleaseDigest: Fn<{ candidate: ReleaseDigest }, Issue[]> = { name: "validate_release_digest" };
export const renderRelease: Fn<{ notes: ReleaseNotes; digest: ReleaseDigest; issues: Issue[] }, ReleaseText> = {
  name: "render_release",
};
