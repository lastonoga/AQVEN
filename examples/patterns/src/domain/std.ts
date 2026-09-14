import { defineEnum, defineId, defineType, listType } from "@wf/dsl";
import { z } from "zod";
import type { Tally } from "@wf/std/diverge";
import type { Agreement, Citation, Consensus, FieldAgreement, IdCheck, NearestId, ValidationIssue } from "@wf/std/extract";
import type { GroundingVerdict } from "@wf/std/extract";
import type { ChecklistItem, ChecklistItemId, Critique, Issue, VerifyFixOut } from "@wf/std/loops";
import { idValue, schemaOf } from "./schema.js";

export const checklistItemIdType = defineId<ChecklistItemId>("ChecklistItemId", {
  description: "Идентификатор пункта чек-листа: по нему исполнитель прикладывает доказательство",
  source: "checklist[].id",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

export const severityType = defineEnum(
  "Severity",
  {
    assert: "Нарушение блокирует выдачу: результат нельзя отдавать дальше",
    check: "Замечание: результат годен, но качество ниже ожидаемого",
  },
  "Строгость замечания верификатора",
);

export const agreementLevelType = defineEnum(
  "AgreementLevel",
  {
    unanimous: "Все независимые извлечения дали одно и то же значение",
    majority: "Большинство сошлось, но есть расхождения",
    conflict: "Извлечения противоречат друг другу, значение доверять нельзя",
  },
  "Уровень согласия независимых извлечений",
);

export const issueSeverityType = defineEnum(
  "IssueSeverity",
  {
    error: "Ошибка: документ нельзя проводить, пока правило не выполнено",
    warning: "Предупреждение: документ проводится, но требует внимания оператора",
  },
  "Строгость нарушения правила валидации",
);

export const idCheckStatusType = defineEnum(
  "IdCheckStatus",
  {
    ok: "Все идентификаторы взяты из разрешённого множества",
    unknown_ids: "Модель сослалась на идентификаторы, которых нет во входных данных",
  },
  "Итог проверки идентификаторов, использованных моделью",
);

export const groundingDecisionType = defineEnum(
  "GroundingDecision",
  {
    grounded: "Каждое утверждение ответа подтверждено цитатой из источника",
    revise: "Есть утверждения без опоры на источник, ответ нужно переписать",
    escalate: "Источников не хватает, чтобы ответить: нужен человек",
  },
  "Решение проверки заземления ответа на источники",
);

export const issueSchema: z.ZodType<Issue> = z.object({
  path: z.array(z.union([z.string(), z.int()])).describe("Путь до поля результата, к которому относится замечание"),
  code: z.string().describe("Код нарушенного правила"),
  message: z.string().describe("Что именно не так, одной фразой для модели"),
  severity: schemaOf(severityType).describe("Строгость замечания"),
  expected: z.string().describe("Что ожидалось по правилу").optional(),
  observed: z.unknown().describe("Что пришло на самом деле").optional(),
  repairHint: z.string().describe("Подсказка, как починить, без переписывания всего результата").optional(),
});

export const issueExample: Issue = {
  path: ["sections", 0, "ticketIds"],
  code: "unknown_ticket_id",
  message: "Раздел ссылается на задачу, которой нет в релизе",
  severity: "assert",
  expected: "Идентификатор из списка задач релиза",
  observed: "TCK-9001",
  repairHint: "Убрать ссылку или заменить её на задачу из входных данных",
};

export const critiqueSchema: z.ZodType<Critique> = z.object({
  score: z.number().describe("Оценка кандидата от 0 до 1"),
  meetsThreshold: z.boolean().describe("Достигнут ли порог качества, заданный вызовом"),
  issues: z.array(issueSchema).describe("Замечания, которые нужно устранить в следующей итерации"),
  summary: z.string().describe("Сводка критики в двух-трёх фразах"),
});

export const critiqueExample: Critique = {
  score: 0.74,
  meetsThreshold: false,
  issues: [issueExample],
  summary: "Текст по сути верен, но одна ссылка ведёт на задачу вне релиза.",
};

export const critiqueType = defineType("Critique", {
  schema: critiqueSchema,
  description: "Критика кандидата: оценка, достигнут ли порог, и список замечаний",
  example: critiqueExample,
});

export const checklistItemSchema: z.ZodType<ChecklistItem> = z.object({
  id: schemaOf(checklistItemIdType).describe("Идентификатор пункта чек-листа"),
  title: z.string().describe("Формулировка пункта: что должно быть сделано"),
  done: z.boolean().describe("Закрыт ли пункт на текущей итерации"),
  evidence: z.string().describe("Доказательство закрытия: ссылка, номер документа или цитата"),
});

export const checklistItemExample: ChecklistItem = {
  id: idValue<ChecklistItemId>("chk-sso"),
  title: "Подключить вход через корпоративный SSO",
  done: true,
  evidence: "Метаданные IdP загружены 12 марта, вход проверен на трёх учётных записях",
};

export const checklistItemType = defineType("ChecklistItem", {
  schema: checklistItemSchema,
  description: "Пункт чек-листа с отметкой о закрытии и доказательством",
  example: checklistItemExample,
});

export const checklistItemArrType = listType(checklistItemType);

export const fieldAgreementSchema: z.ZodType<FieldAgreement> = z.object({
  field: z.string().describe("Путь до поля, по которому считалось согласие"),
  level: schemaOf(agreementLevelType).describe("Уровень согласия по этому полю"),
  share: z.number().describe("Доля извлечений, давших одно значение, от 0 до 1"),
});

export const agreementSchema: z.ZodType<Agreement> = z.object({
  level: schemaOf(agreementLevelType).describe("Уровень согласия по документу целиком"),
  share: z.number().describe("Доля совпавших извлечений, от 0 до 1"),
  fields: z.array(fieldAgreementSchema).describe("Согласие по каждому критичному полю"),
});

export const validationIssueSchema: z.ZodType<ValidationIssue> = z.object({
  field: z.string().describe("Путь до поля, которое нарушает правило"),
  severity: schemaOf(issueSeverityType).describe("Строгость нарушения"),
  rule: z.string().describe("Код правила: арифметика, формат, обязательность"),
  hint: z.string().describe("Что сделать оператору, чтобы закрыть замечание"),
});

export const consensusSchema = <T>(value: z.ZodType<T>, description: string): z.ZodType<Consensus<T>> =>
  z.object({
    value: value.describe(description),
    agreement: agreementSchema.describe("Согласие независимых извлечений по документу и по полям"),
  });

export const citationSchema = <TId>(id: z.ZodType<TId>, description: string): z.ZodType<Citation<TId>> =>
  z.object({
    chunkId: id.describe(description),
    quote: z.string().describe("Дословная цитата из источника, подтверждающая утверждение"),
  });

export const nearestIdSchema = <TId>(id: z.ZodType<TId>, description: string): z.ZodType<NearestId<TId>> =>
  z.object({
    used: id.describe(`Идентификатор, который использовала модель. ${description}`),
    candidates: z.array(id).describe("Ближайшие допустимые идентификаторы, из которых можно выбрать замену"),
  });

export const idCheckSchema = <TId>(id: z.ZodType<TId>, description: string): z.ZodType<IdCheck<TId>> =>
  z.object({
    status: schemaOf(idCheckStatusType).describe("Итог проверки идентификаторов"),
    unknown: z.array(id).describe(`Идентификаторы вне разрешённого множества. ${description}`),
    nearest: z.array(nearestIdSchema(id, description)).describe("Подсказки замены для каждого неизвестного идентификатора"),
  });

export const groundingVerdictSchema = <TId>(id: z.ZodType<TId>, description: string): z.ZodType<GroundingVerdict<TId>> =>
  z.object({
    why: z.string().describe("Обоснование решения: какие утверждения остались без опоры"),
    score: z.number().describe("Доля подтверждённых утверждений, от 0 до 1"),
    decision: schemaOf(groundingDecisionType).describe("Решение проверки заземления"),
    unsupported: z.array(citationSchema(id, description)).describe("Цитаты, которые не подтверждаются источником"),
  });

export const tallySchema = <T>(value: z.ZodType<T>, description: string): z.ZodType<Tally<T>> =>
  z.object({
    value: value.describe(description),
    votes: z.int().describe("Сколько независимых прогонов дали это значение"),
    share: z.number().describe("Доля прогонов с этим значением, от 0 до 1"),
  });

export const verifyFixOutSchema = <T>(candidate: z.ZodType<T>, description: string): z.ZodType<VerifyFixOut<T>> =>
  z.object({
    candidate: candidate.describe(description),
    issues: z.array(issueSchema).describe("Замечания, оставшиеся после последней починки"),
    iterations: z.int().describe("Сколько итераций починки было потрачено"),
    score: z.number().describe("Оценка итогового кандидата, от 0 до 1"),
  });
