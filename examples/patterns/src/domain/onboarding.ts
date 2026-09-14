import { defineEnum, defineType } from "@wf/dsl";
import type { Fn } from "@wf/dsl";
import { z } from "zod";
import type { ChecklistItem, ChecklistItemId } from "@wf/std/loops";
import { checklistItemIdType, checklistItemSchema } from "./std.js";
import { idValue, schemaOf } from "./schema.js";

const completionType = defineEnum(
  "Completion",
  {
    done: "Все пункты чек-листа закрыты доказательствами",
    partial: "Часть пунктов осталась открытой: онбординг передаётся человеку",
  },
  "Итог работы по чек-листу онбординга",
);

export type Completion = (typeof completionType.values)[number];

export type Account = { id: string; name: string; plan: string };
export type OnboardingRequest = { accountId: string; owner: string; checklist: ChecklistItem[] };
export type OnboardingTask = { account: Account; owner: string; deadlineDays: number };
export type Artifact = { itemId: ChecklistItemId; kind: string; url: string };
export type OnboardingState = { summary: string; artifacts: Artifact[] };
export type OnboardingReport = { text: string; openItems: string[] };
export type CompletionFlag = { status: Completion; closed: number };
export type Handover = { assignee: string; note: string };
export type TaskCompletionOnboarding = {
  state: OnboardingState;
  checklist: ChecklistItem[];
  allDone: boolean;
  iterations: number;
};

const checklistItemIdSchema = schemaOf(checklistItemIdType);

const accountSchema: z.ZodType<Account> = z.object({
  id: z.string().describe("Идентификатор организации в биллинге"),
  name: z.string().describe("Название организации, как оно записано в договоре"),
  plan: z.string().describe("Тариф организации: от него зависит состав чек-листа"),
});

const accountExample: Account = { id: "acc-4821", name: 'ООО «Северный ветер»', plan: "business" };

const accountType = defineType("Account", {
  schema: accountSchema,
  description: "Организация-клиент, которую выводят на продукт",
  example: accountExample,
});

const onboardingRequestSchema: z.ZodType<OnboardingRequest> = z.object({
  accountId: z.string().describe("Организация, которую выводят на продукт"),
  owner: z.string().describe("Ответственный за онбординг со стороны клиента"),
  checklist: z.array(checklistItemSchema).describe("Чек-лист онбординга: что должно быть закрыто"),
});

const checklistExample: ChecklistItem[] = [
  {
    id: idValue<ChecklistItemId>("chk-sso"),
    title: "Подключить вход через корпоративный SSO",
    done: true,
    evidence: "Метаданные IdP загружены 12 марта, вход проверен на трёх учётных записях",
  },
  {
    id: idValue<ChecklistItemId>("chk-import"),
    title: "Перенести справочник контрагентов из прежней системы",
    done: false,
    evidence: "",
  },
];

const onboardingRequestExample: OnboardingRequest = {
  accountId: "acc-4821",
  owner: "Ирина Соколова, руководитель внедрения",
  checklist: checklistExample,
};

const onboardingRequestType = defineType("OnboardingRequest", {
  schema: onboardingRequestSchema,
  description: "Заявка на онбординг организации: вход воркфлоу task_completion",
  example: onboardingRequestExample,
});

const onboardingTaskSchema: z.ZodType<OnboardingTask> = z.object({
  account: accountSchema.describe("Организация, которую выводят на продукт"),
  owner: z.string().describe("Ответственный за онбординг со стороны клиента"),
  deadlineDays: z.int().describe("Сколько дней осталось до контрольного срока онбординга"),
});

const onboardingTaskExample: OnboardingTask = {
  account: accountExample,
  owner: "Ирина Соколова, руководитель внедрения",
  deadlineDays: 9,
};

const onboardingTaskType = defineType("OnboardingTask", {
  schema: onboardingTaskSchema,
  description: "Задание на онбординг: организация, ответственный и срок",
  example: onboardingTaskExample,
});

const artifactSchema: z.ZodType<Artifact> = z.object({
  itemId: checklistItemIdSchema.describe("Пункт чек-листа, который закрывает артефакт"),
  kind: z.string().describe("Вид артефакта: document, screenshot, config, ticket"),
  url: z.url().describe("Ссылка на артефакт во внутреннем хранилище"),
});

const onboardingStateSchema: z.ZodType<OnboardingState> = z.object({
  summary: z.string().describe("Что сделано на текущей итерации, в двух-трёх фразах"),
  artifacts: z.array(artifactSchema).describe("Артефакты, подтверждающие закрытые пункты чек-листа"),
});

const onboardingStateExample: OnboardingState = {
  summary: "Подключили корпоративный SSO и проверили вход на трёх учётных записях. Импорт справочника контрагентов ждёт выгрузку от клиента.",
  artifacts: [
    {
      itemId: idValue<ChecklistItemId>("chk-sso"),
      kind: "config",
      url: "https://files.internal/onboarding/acc-4821/sso-metadata.xml",
    },
  ],
};

const onboardingStateType = defineType("OnboardingState", {
  schema: onboardingStateSchema,
  description: "Состояние онбординга между итерациями: что сделано и чем подтверждено",
  example: onboardingStateExample,
});

const completionFlagSchema: z.ZodType<CompletionFlag> = z.object({
  status: schemaOf(completionType).describe("Итог работы по чек-листу"),
  closed: z.int().describe("Сколько пунктов чек-листа закрыто доказательствами"),
});

const completionFlagExample: CompletionFlag = { status: "partial", closed: 1 };

const completionFlagType = defineType("CompletionFlag", {
  schema: completionFlagSchema,
  description: "Флаг завершённости онбординга: статус и число закрытых пунктов",
  example: completionFlagExample,
});

const onboardingReportSchema: z.ZodType<OnboardingReport> = z.object({
  text: z.string().describe("Отчёт об онбординге для клиента и менеджера"),
  openItems: z.array(z.string()).describe("Пункты, оставшиеся открытыми, с причиной"),
});

const onboardingReportExample: OnboardingReport = {
  text: "Онбординг «Северного ветра» закрыт на 1 из 2 пунктов. SSO подключён и проверен. Импорт справочника контрагентов не начат: клиент не прислал выгрузку.",
  openItems: ["Перенести справочник контрагентов: ждём выгрузку от клиента до 21 марта"],
};

const onboardingReportType = defineType("OnboardingReport", {
  schema: onboardingReportSchema,
  description: "Отчёт об онбординге: выход воркфлоу task_completion",
  example: onboardingReportExample,
});

const taskCompletionSchema: z.ZodType<TaskCompletionOnboarding> = z.object({
  state: onboardingStateSchema.describe("Состояние онбординга после последней итерации"),
  checklist: z.array(checklistItemSchema).describe("Чек-лист с отметками по итогам последней проверки"),
  allDone: z.boolean().describe("Закрыты ли все пункты чек-листа"),
  iterations: z.int().describe("Сколько итераций работы потрачено"),
});

const taskCompletionExample: TaskCompletionOnboarding = {
  state: onboardingStateExample,
  checklist: checklistExample,
  allDone: false,
  iterations: 3,
};

const taskCompletionType = defineType("TaskCompletion<OnboardingState>", {
  schema: taskCompletionSchema,
  description: "Итог цикла закрытия чек-листа онбординга",
  example: taskCompletionExample,
});

const handoverSchema: z.ZodType<Handover> = z.object({
  assignee: z.string().describe("Кому передаётся незакрытый онбординг"),
  note: z.string().describe("Что осталось сделать и какой контекст нужен принимающему"),
});

const handoverExample: Handover = {
  assignee: "internal_implementation_team",
  note: "Импорт справочника контрагентов: у клиента нет выгрузки из прежней системы, нужен инженер на созвон.",
};

const handoverFormType = defineType<unknown>("HandoverForm", {
  schema: handoverSchema,
  description: "Форма передачи незакрытого онбординга человеку",
  example: handoverExample,
});

export const t = {
  Account: accountType,
  OnboardingRequest: onboardingRequestType,
  OnboardingTask: onboardingTaskType,
  OnboardingState: onboardingStateType,
  Completion: completionType,
  CompletionFlag: completionFlagType,
  OnboardingReport: onboardingReportType,
  HandoverForm: handoverFormType,
  TaskCompletionOnboarding: taskCompletionType,
};

export const accountById: Fn<{ accountId: string }, Account> = { name: "account_by_id" };
export const buildOnboardingTask: Fn<{ account: Account; owner: string; deadlineDays: number }, OnboardingTask> = {
  name: "build_onboarding_task",
};
export const workOnChecklist: Fn<
  { task: OnboardingTask; state: OnboardingState; checklist: ChecklistItem[] },
  OnboardingState
> = { name: "work_on_checklist" };
export const checkChecklist: Fn<{ state: OnboardingState; checklist: ChecklistItem[] }, ChecklistItem[]> = {
  name: "check_checklist",
};
export const completionFlag: Fn<{ checklist: ChecklistItem[]; allDone: boolean }, CompletionFlag> = {
  name: "completion_flag",
};
export const renderOnboarding: Fn<
  { state: OnboardingState; checklist: ChecklistItem[]; iterations: number },
  OnboardingReport
> = { name: "render_onboarding" };
