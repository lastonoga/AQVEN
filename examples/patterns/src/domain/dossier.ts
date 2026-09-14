import { defineEnum, defineId, defineType, listType, view, viewType } from "@wf/dsl";
import type { Fn, Id } from "@wf/dsl";
import { z } from "zod";
import type { Issue, VerifyFixOut } from "@wf/std/loops";
import { verifyFixOutSchema } from "./std.js";
import { idValue, schemaOf } from "./schema.js";

export type DocId = Id<"DocId">;
export type ClauseId = Id<"ClauseId">;
export type SectionId = Id<"SectionId">;

const docIdType = defineId<DocId>("DocId", {
  description: "Идентификатор документа досье; утверждения меморандума ссылаются только на эти документы",
  source: "dossier.documents[].id",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const clauseIdType = defineId<ClauseId>("ClauseId", {
  description: "Идентификатор пункта договора внутри документа досье",
  source: "dossier.documents[].clauses[].id",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const sectionIdType = defineId<SectionId>("SectionId", {
  description: "Идентификатор раздела финансовой таблицы",
  source: "table.sections[].id",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const quoteSourceType = defineEnum(
  "QuoteSource",
  {
    cached: "Таблица взята из кэша котировок: цифры не пересчитывались в этом прогоне",
    recomputed: "Таблица пересчитана на текущем периоде: кэш оказался устаревшим",
  },
  "Откуда взяты цифры финансовой таблицы",
);

const stanceType = defineEnum(
  "Stance",
  {
    buy: "Входить в сделку на обсуждаемых условиях",
    hold: "Держать паузу: условия приемлемы, но не хватает данных для решения",
    pass: "Отказаться от сделки: риски перевешивают выгоду",
  },
  "Позиция по сделке",
);

const panelDecisionType = defineEnum(
  "PanelDecision",
  {
    accept: "Меморандум принят панелью судей и уходит инвесткомитету",
    revise: "Меморандум по сути верен, но требует правки перед комитетом",
    escalate: "Судьи разошлись слишком сильно: решение принимает человек",
  },
  "Решение панели судей по меморандуму",
);

export type QuoteSource = (typeof quoteSourceType.values)[number];
export type Stance = (typeof stanceType.values)[number];
export type PanelDecision = (typeof panelDecisionType.values)[number];

export type Clause = { id: ClauseId; title: string; text: string };
export type Doc = { id: DocId; title: string; text: string; clauses: Clause[] };
export type TableSection = { id: SectionId; title: string; amountMinor: number };
export type FinancialTable = { currency: string; asOf: string; sections: TableSection[] };
export type Dossier = { dealId: string; period: string; documents: Doc[]; table: FinancialTable };

export type DealRef = { dealId: string; period: string };
export type ReviewBrief = { dossier: Dossier; threshold: number; maxWords: number };
export type ReviewHistory = { objections: string[]; rejectedHeadlines: string[] };

export type FactSheet = { claims: string[]; sources: DocId[] };
export type Risk = { title: string; severity: number; evidence: DocId[] };
export type RiskRegister = { risks: Risk[]; summary: string };

export type SectionDelta = { section: SectionId; deltaMinor: number; share: number };
export type NumbersReport = { currency: string; source: QuoteSource; deltas: SectionDelta[] };

export type Opinion = { stance: Stance; thesis: string; confidence: number };

export type ClauseCheck = { clauseId: ClauseId; verdict: string; blocking: boolean; quote: string };
export type ClauseReport = { checked: number; blocking: number; notes: string[] };

export type MemoCriterion = { id: string; text: string; weight: number; scale: string };
export type MemoRubric = { criteria: MemoCriterion[]; reasoningBeforeScore: true };
export type ReviewMemo = { headline: string; body: string; stance: Stance; citations: DocId[] };

export type JudgeScore = { judge: string; family: string; score: number; why: string; hardFail: boolean };
export type PanelVerdict = { decision: PanelDecision; score: number; spread: number; objections: string[] };

export type ReviewIteration = { memo: ReviewMemo; score: number; accepted: boolean };
export type MemoDocument = { text: string; iterations: number; stance: Stance };

const docIdSchema = schemaOf(docIdType);
const clauseIdSchema = schemaOf(clauseIdType);
const sectionIdSchema = schemaOf(sectionIdType);
const stanceSchema = schemaOf(stanceType);

const clauseSchema: z.ZodType<Clause> = z.object({
  id: clauseIdSchema.describe("Идентификатор пункта договора"),
  title: z.string().describe("Заголовок пункта, как он назван в договоре"),
  text: z.string().describe("Текст пункта целиком: из него берутся цитаты проверки"),
});

const clauseExample: Clause = {
  id: idValue<ClauseId>("cl-7-2"),
  title: "7.2. Ответственность за просрочку поставки",
  text: "При просрочке поставки более чем на 15 календарных дней покупатель вправе расторгнуть договор в одностороннем порядке и требовать неустойку 0,1% от суммы договора за каждый день просрочки.",
};

const clauseType = defineType("Clause", {
  schema: clauseSchema,
  description: "Пункт договора из документа досье",
  example: clauseExample,
});

const docSchema: z.ZodType<Doc> = z.object({
  id: docIdSchema.describe("Идентификатор документа досье"),
  title: z.string().describe("Название документа с датой редакции"),
  text: z.string().describe("Текст документа целиком"),
  clauses: z.array(clauseSchema).describe("Пункты договора, выделенные из документа"),
});

const docExample: Doc = {
  id: idValue<DocId>("doc-supply-agreement"),
  title: "Договор поставки № 44-П от 18.01.2025",
  text: "Договор поставки оборудования между ООО «Ветра» и АО «Кронос». Срок поставки — 60 календарных дней с даты предоплаты.",
  clauses: [clauseExample],
};

const docType = defineType("Doc", {
  schema: docSchema,
  description: "Документ досье сделки: договор, приложение или протокол",
  example: docExample,
});

const tableSectionSchema: z.ZodType<TableSection> = z.object({
  id: sectionIdSchema.describe("Идентификатор раздела таблицы"),
  title: z.string().describe("Название статьи финансовой таблицы"),
  amountMinor: z.int().describe("Сумма статьи в копейках валюты таблицы"),
});

const financialTableSchema: z.ZodType<FinancialTable> = z.object({
  currency: z.string().describe("Валюта таблицы, код ISO 4217"),
  asOf: z.iso.date().describe("Дата, на которую собраны цифры, в формате ГГГГ-ММ-ДД"),
  sections: z.array(tableSectionSchema).describe("Статьи таблицы в порядке их подачи инвесткомитету"),
});

const financialTableExample: FinancialTable = {
  currency: "RUB",
  asOf: "2025-03-31",
  sections: [
    { id: idValue<SectionId>("sec-revenue"), title: "Выручка за период", amountMinor: 412_800_000 },
    { id: idValue<SectionId>("sec-ebitda"), title: "EBITDA за период", amountMinor: 58_300_000 },
  ],
};

const financialTableType = defineType("FinancialTable", {
  schema: financialTableSchema,
  description: "Финансовая таблица сделки на дату: статьи и суммы",
  example: financialTableExample,
});

const dossierSchema: z.ZodType<Dossier> = z.object({
  dealId: z.string().describe("Идентификатор сделки в CRM"),
  period: z.string().describe("Отчётный период досье, например 2025-Q1"),
  documents: z.array(docSchema).describe("Документы сделки: единственный источник фактов меморандума"),
  table: financialTableSchema.describe("Финансовая таблица сделки"),
});

const dossierExample: Dossier = {
  dealId: "DEAL-2025-0117",
  period: "2025-Q1",
  documents: [docExample],
  table: financialTableExample,
};

const dossierType = defineType("Dossier", {
  schema: dossierSchema,
  description: "Досье сделки: документы и финансовая таблица за отчётный период",
  example: dossierExample,
});

const dossierBriefType = viewType(dossierType, view("brief", ["dealId", "period"] as const));

const dealRefSchema: z.ZodType<DealRef> = z.object({
  dealId: z.string().describe("Идентификатор сделки в CRM"),
  period: z.string().describe("Отчётный период разбора, например 2025-Q1"),
});

const dealRefExample: DealRef = { dealId: "DEAL-2025-0117", period: "2025-Q1" };

const dealRefType = defineType("DealRef", {
  schema: dealRefSchema,
  description: "Ссылка на сделку и период: вход воркфлоу deep_composition",
  example: dealRefExample,
});

const reviewBriefSchema: z.ZodType<ReviewBrief> = z.object({
  dossier: dossierSchema.describe("Досье сделки целиком"),
  threshold: z.number().describe("Порог оценки, ниже которого меморандум уходит на доработку, от 0 до 1"),
  maxWords: z.int().describe("Предельная длина меморандума в словах"),
});

const reviewBriefExample: ReviewBrief = { dossier: dossierExample, threshold: 0.8, maxWords: 600 };

const reviewBriefType = defineType("ReviewBrief", {
  schema: reviewBriefSchema,
  description: "Задание на разбор сделки: досье, порог качества и ограничение длины",
  example: reviewBriefExample,
});

const reviewHistorySchema: z.ZodType<ReviewHistory> = z.object({
  objections: z.array(z.string()).describe("Возражения, которые комитет уже высказывал по этой сделке"),
  rejectedHeadlines: z.array(z.string()).describe("Заголовки прошлых меморандумов, которые комитет отклонил"),
});

const reviewHistoryExample: ReviewHistory = {
  objections: [
    "Прошлый меморандум не объяснил разрыв между выручкой и EBITDA",
    "Не был назван риск односторонего расторжения по пункту 7.2",
  ],
  rejectedHeadlines: ["Сделка без рисков: берём"],
};

const reviewHistoryType = defineType("ReviewHistory", {
  schema: reviewHistorySchema,
  description: "История разборов сделки: что комитет уже возражал и что отклонял",
  example: reviewHistoryExample,
});

const factSheetSchema: z.ZodType<FactSheet> = z.object({
  claims: z.array(z.string()).describe("Утверждения, извлечённые из документов, по одному в строке"),
  sources: z.array(docIdSchema).describe("Документы, из которых взяты утверждения"),
});

const factSheetExample: FactSheet = {
  claims: [
    "Срок поставки — 60 календарных дней с даты предоплаты",
    "Неустойка за просрочку — 0,1% от суммы договора в день",
  ],
  sources: [idValue<DocId>("doc-supply-agreement")],
};

const factSheetType = defineType("FactSheet", {
  schema: factSheetSchema,
  description: "Выжимка фактов из документов досье со ссылками на источники",
  example: factSheetExample,
});

const riskSchema: z.ZodType<Risk> = z.object({
  title: z.string().describe("Риск одной фразой, без смягчений"),
  severity: z.number().describe("Тяжесть риска от 0 до 1, где 1 — блокирует сделку"),
  evidence: z.array(docIdSchema).describe("Документы, из которых виден риск"),
});

const riskRegisterSchema: z.ZodType<RiskRegister> = z.object({
  risks: z.array(riskSchema).describe("Риски сделки в порядке убывания тяжести"),
  summary: z.string().describe("Сводка по рискам в двух-трёх фразах"),
});

const riskRegisterExample: RiskRegister = {
  risks: [
    {
      title: "Покупатель вправе расторгнуть договор в одностороннем порядке при просрочке свыше 15 дней",
      severity: 0.7,
      evidence: [idValue<DocId>("doc-supply-agreement")],
    },
  ],
  summary: "Главный риск — односторонее расторжение по пункту 7.2 при типичной для поставщика просрочке.",
};

const riskRegisterType = defineType("RiskRegister", {
  schema: riskRegisterSchema,
  description: "Реестр рисков сделки: что именно и насколько тяжело",
  example: riskRegisterExample,
});

const sectionDeltaSchema: z.ZodType<SectionDelta> = z.object({
  section: sectionIdSchema.describe("Раздел финансовой таблицы"),
  deltaMinor: z.int().describe("Расхождение с базовой таблицей в копейках; отрицательное — падение"),
  share: z.number().describe("Расхождение в долях от базового значения, от -1 до 1"),
});

const numbersReportSchema: z.ZodType<NumbersReport> = z.object({
  currency: z.string().describe("Валюта расхождений, код ISO 4217"),
  source: schemaOf(quoteSourceType).describe("Откуда взяты цифры: кэш или пересчёт"),
  deltas: z.array(sectionDeltaSchema).describe("Расхождения по разделам таблицы"),
});

const numbersReportExample: NumbersReport = {
  currency: "RUB",
  source: "recomputed",
  deltas: [{ section: idValue<SectionId>("sec-ebitda"), deltaMinor: -4_100_000, share: -0.07 }],
};

const numbersReportType = defineType("NumbersReport", {
  schema: numbersReportSchema,
  description: "Отчёт о расхождениях цифр меморандума с финансовой таблицей",
  example: numbersReportExample,
});

const opinionSchema: z.ZodType<Opinion> = z.object({
  stance: stanceSchema.describe("Позиция по сделке"),
  thesis: z.string().describe("Тезис позиции: одна фраза, по которой позицию можно оспорить"),
  confidence: z.number().describe("Уверенность в позиции от 0 до 1"),
});

const opinionExample: Opinion = {
  stance: "hold",
  thesis: "Условия поставки приемлемы, но пункт 7.2 даёт покупателю выход из договора при обычной для поставщика просрочке.",
  confidence: 0.62,
};

const opinionType = defineType("Opinion", {
  schema: opinionSchema,
  description: "Позиция одной модели по сделке: что делать и почему",
  example: opinionExample,
});

const clauseCheckSchema: z.ZodType<ClauseCheck> = z.object({
  clauseId: clauseIdSchema.describe("Пункт договора, который проверяется"),
  verdict: z.string().describe("Вывод по пункту: чем он опасен или почему приемлем"),
  blocking: z.boolean().describe("Блокирует ли пункт сделку без правки договора"),
  quote: z.string().describe("Дословная цитата из пункта, подтверждающая вывод"),
});

const clauseCheckExample: ClauseCheck = {
  clauseId: idValue<ClauseId>("cl-7-2"),
  verdict: "Пункт даёт покупателю односторонний выход при просрочке свыше 15 дней; для нашего цикла поставки это реальный сценарий.",
  blocking: true,
  quote: "покупатель вправе расторгнуть договор в одностороннем порядке",
};

const clauseCheckType = defineType("ClauseCheck", {
  schema: clauseCheckSchema,
  description: "Проверка одного пункта договора: вывод, блокирующий ли он сделку, и цитата",
  example: clauseCheckExample,
});

const clauseVerifyExample: VerifyFixOut<ClauseCheck> = {
  candidate: clauseCheckExample,
  issues: [],
  iterations: 2,
  score: 0.91,
};

const clauseVerifyType = defineType("VerifyFixOut<ClauseCheck>", {
  schema: verifyFixOutSchema(clauseCheckSchema, "Проверка пункта договора после починки"),
  description: "Итог цикла проверки и починки разбора пункта договора",
  example: clauseVerifyExample,
});

const clauseReportSchema: z.ZodType<ClauseReport> = z.object({
  checked: z.int().describe("Сколько пунктов договора проверено"),
  blocking: z.int().describe("Сколько из них признаны блокирующими"),
  notes: z.array(z.string()).describe("Замечания по пунктам для юриста сделки"),
});

const clauseReportExample: ClauseReport = {
  checked: 12,
  blocking: 1,
  notes: ["Пункт 7.2: просить симметричную неустойку или поднять порог просрочки до 30 дней"],
};

const clauseReportType = defineType("ClauseReport", {
  schema: clauseReportSchema,
  description: "Сводка проверки договора по пунктам",
  example: clauseReportExample,
});

const reviewMemoSchema: z.ZodType<ReviewMemo> = z.object({
  headline: z.string().describe("Заголовок меморандума: позиция читается с первой строки"),
  body: z.string().describe("Текст меморандума: каждое утверждение опирается на документ досье"),
  stance: stanceSchema.describe("Итоговая позиция по сделке"),
  citations: z.array(docIdSchema).describe("Документы досье, на которые опирается меморандум"),
});

const reviewMemoExample: ReviewMemo = {
  headline: "DEAL-2025-0117: держим паузу до правки пункта 7.2",
  body: "Выручка за квартал 4,128 млн руб., EBITDA 583 тыс. руб. — пересчёт дал минус 7% к базовой таблице. Договор допускает односторонее расторжение покупателем при просрочке свыше 15 дней, что для нашего цикла поставки типично. До правки пункта 7.2 входить в сделку не рекомендуем.",
  stance: "hold",
  citations: [idValue<DocId>("doc-supply-agreement")],
};

const reviewMemoType = defineType("ReviewMemo", {
  schema: reviewMemoSchema,
  description: "Меморандум по сделке для инвесткомитета",
  example: reviewMemoExample,
});

const judgeScoreSchema: z.ZodType<JudgeScore> = z.object({
  judge: z.string().describe("Идентификатор судьи в панели"),
  family: z.string().describe("Семейство модели судьи: оно обязано отличаться от семейства автора"),
  score: z.number().describe("Оценка меморандума от 0 до 1"),
  why: z.string().describe("Обоснование оценки по критериям рубрики"),
  hardFail: z.boolean().describe("Сработал ли жёсткий отказ по критерию с порогом"),
});

const judgeScoreExample: JudgeScore = {
  judge: "judge_numbers",
  family: "anthropic",
  score: 0.78,
  why: "Цифры сходятся с таблицей, риск назван прямо, но заголовок не отражает расхождение по EBITDA.",
  hardFail: false,
};

const judgeScoreType = defineType("JudgeScore", {
  schema: judgeScoreSchema,
  description: "Оценка меморандума одним судьёй панели",
  example: judgeScoreExample,
});

const panelVerdictSchema: z.ZodType<PanelVerdict> = z.object({
  decision: schemaOf(panelDecisionType).describe("Решение панели по меморандуму"),
  score: z.number().describe("Сводная оценка панели от 0 до 1"),
  spread: z.number().describe("Разброс оценок судей: большой разброс — повод для эскалации"),
  objections: z.array(z.string()).describe("Возражения судей, которые автору нужно закрыть"),
});

const panelVerdictExample: PanelVerdict = {
  decision: "revise",
  score: 0.76,
  spread: 0.12,
  objections: ["Заголовок не называет расхождение по EBITDA", "Не указан срок, к которому нужна правка пункта 7.2"],
};

const panelVerdictType = defineType("PanelVerdict", {
  schema: panelVerdictSchema,
  description: "Вердикт панели судей по меморандуму: решение, оценка, разброс и возражения",
  example: panelVerdictExample,
});

const reviewIterationSchema: z.ZodType<ReviewIteration> = z.object({
  memo: reviewMemoSchema.describe("Меморандум на этой итерации"),
  score: z.number().describe("Сводная оценка панели на этой итерации, от 0 до 1"),
  accepted: z.boolean().describe("Принят ли меморандум панелью"),
});

const reviewIterationExample: ReviewIteration = { memo: reviewMemoExample, score: 0.76, accepted: false };

const reviewIterationType = defineType("ReviewIteration", {
  schema: reviewIterationSchema,
  description: "Одна итерация разбора: меморандум и решение панели по нему",
  example: reviewIterationExample,
});

const memoDocumentSchema: z.ZodType<MemoDocument> = z.object({
  text: z.string().describe("Готовый текст меморандума для инвесткомитета"),
  iterations: z.int().describe("Сколько итераций критики потребовалось"),
  stance: stanceSchema.describe("Итоговая позиция по сделке"),
});

const memoDocumentExample: MemoDocument = {
  text: "DEAL-2025-0117: держим паузу до правки пункта 7.2\n\nВыручка за квартал 4,128 млн руб., EBITDA 583 тыс. руб. Пересчёт дал минус 7% к базовой таблице. Договор допускает односторонее расторжение покупателем при просрочке свыше 15 дней.",
  iterations: 2,
  stance: "hold",
};

const memoDocumentType = defineType("MemoDocument", {
  schema: memoDocumentSchema,
  description: "Готовый меморандум: выход воркфлоу deep_composition",
  example: memoDocumentExample,
});

const textType = defineType("Text", {
  schema: z.string().describe("Произвольный текст"),
  description: "Произвольный текст",
  example: "Меморандум по сделке DEAL-2025-0117",
  kind: "value",
});

const scoreType = defineType("Score", {
  schema: z.number().describe("Оценка от 0 до 1, где 1 — полное соответствие рубрике"),
  description: "Оценка от 0 до 1, где 1 — полное соответствие рубрике",
  example: 0.78,
  kind: "value",
});

export const t = {
  DocId: docIdType,
  ClauseId: clauseIdType,
  SectionId: sectionIdType,
  Text: textType,
  Clause: clauseType,
  Doc: docType,
  DocArr: listType(docType),
  FinancialTable: financialTableType,
  Dossier: dossierType,
  DossierBrief: dossierBriefType,
  DealRef: dealRefType,
  ReviewBrief: reviewBriefType,
  ReviewHistory: reviewHistoryType,
  FactSheet: factSheetType,
  RiskRegister: riskRegisterType,
  NumbersReport: numbersReportType,
  QuoteSource: quoteSourceType,
  Stance: stanceType,
  Opinion: opinionType,
  OpinionArr: listType(opinionType),
  ClauseCheck: clauseCheckType,
  ClauseVerifyOut: clauseVerifyType,
  ClauseReport: clauseReportType,
  ReviewMemo: reviewMemoType,
  JudgeScore: judgeScoreType,
  PanelDecision: panelDecisionType,
  PanelVerdict: panelVerdictType,
  ReviewIteration: reviewIterationType,
  MemoDocument: memoDocumentType,
  Score: scoreType,
};

export const memoRubric: MemoRubric = {
  reasoningBeforeScore: true,
  criteria: [
    { id: "evidence", text: "Каждое утверждение опирается на документ досье", weight: 0.4, scale: "1-5" },
    { id: "numbers", text: "Цифры меморандума сходятся с финансовой таблицей", weight: 0.3, scale: "1-5" },
    { id: "risks", text: "Блокирующие риски названы прямо, без смягчения", weight: 0.2, scale: "1-5" },
    { id: "brevity", text: "Позиция читается с первого абзаца", weight: 0.1, scale: "1-5" },
  ],
};

export const loadDossier: Fn<{ dealId: string; period: string }, Dossier> = { name: "load_deal_dossier" };
export const quoteTableCached: Fn<{ dealId: string; period: string }, FinancialTable> = {
  name: "quote_table_cached",
};
export const recomputeTable: Fn<{ table: FinancialTable; period: string }, FinancialTable> = {
  name: "recompute_table",
};

export const buildReviewBrief: Fn<{ dossier: Dossier; threshold: number; maxWords: number }, ReviewBrief> = {
  name: "build_review_brief",
};
export const tableDeltas: Fn<
  { baseline: FinancialTable; actual: FinancialTable; source: QuoteSource },
  NumbersReport
> = { name: "table_deltas" };
export const collectOpinions: Fn<
  { openai: Opinion; anthropic: Opinion; google: Opinion; qwen: Opinion },
  Opinion[]
> = { name: "collect_opinions" };
export const foldClauseChecks: Fn<
  { checks: VerifyFixOut<ClauseCheck>[]; documents: Doc[] },
  ClauseReport
> = { name: "fold_clause_checks" };
export const foldPanel: Fn<{ scores: JudgeScore[]; threshold: number }, PanelVerdict> = { name: "fold_panel" };
export const reviewIteration: Fn<{ memo: ReviewMemo; verdict: PanelVerdict }, ReviewIteration> = {
  name: "review_iteration",
};
export const renderMemo: Fn<{ iteration: ReviewIteration; dossier: Dossier }, MemoDocument> = {
  name: "render_memo",
};
export const checkClauseDraft: Fn<{ candidate: ClauseCheck }, Issue[]> = { name: "check_clause_draft" };
export const scoreClauseDraft: Fn<{ candidate: ClauseCheck }, number> = { name: "score_clause_draft" };

export const extractFacts: Fn<{ documents: Doc[]; brief: ReviewBrief }, FactSheet> = { name: "extract_facts" };
export const registerRisks: Fn<
  { documents: Doc[]; history: ReviewHistory; brief: ReviewBrief },
  RiskRegister
> = { name: "register_risks" };
export const writeOpinion: Fn<{ brief: ReviewBrief; documents: Doc[] }, Opinion> = { name: "write_opinion" };
export const draftClauseCheck: Fn<{ task: Doc; feedback: Issue[] }, ClauseCheck> = { name: "draft_clause_check" };
export const writeMemo: Fn<
  {
    facts: FactSheet;
    risks: RiskRegister;
    numbers: NumbersReport;
    opinions: Opinion[];
    clauses: ClauseReport;
    history: ReviewHistory;
    brief: ReviewBrief;
  },
  ReviewMemo
> = { name: "write_memo" };
export const scoreMemo: Fn<{ memo: ReviewMemo; rubric: MemoRubric; brief: ReviewBrief }, JudgeScore> = {
  name: "score_memo",
};
export const reviseMemo: Fn<{ memo: ReviewMemo; verdict: PanelVerdict; documents: Doc[] }, ReviewMemo> = {
  name: "revise_memo",
};
