import { defineId, defineType, listType } from "@wf/dsl";
import type { Fn, Id } from "@wf/dsl";
import { z } from "zod";
import { idValue, schemaOf } from "./schema.js";

export type SourceId = Id<"SourceId">;

export type Source = { id: SourceId; title: string };
export type TopicRef = { topic: string };
export type ResearchBrief = { topic: string; sources: Source[] };
export type Idea = { slug: string; title: string; rationale: string; source_ids: SourceId[] };
export type IdeaSet = { ideas: Idea[] };
export type IdeaBoard = { topic: string; ideas: Idea[] };

const sourceIdType = defineId<SourceId>("SourceId", {
  description: "Идентификатор источника из брифа; идея вправе ссылаться только на источники брифа",
  source: "brief.sources[].id",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const sourceIdSchema = schemaOf(sourceIdType);

const sourceSchema: z.ZodType<Source> = z.object({
  id: sourceIdSchema.describe("Идентификатор источника"),
  title: z.string().describe("Название источника с датой: его увидит читатель доски идей"),
});

const sourceExample: Source = {
  id: idValue<SourceId>("src-nielsen-2025-q1"),
  title: "Nielsen, «Рынок готовой еды», отчёт за I квартал 2025",
};

const sourceType = defineType("Source", {
  schema: sourceSchema,
  description: "Источник, поданный на вход генерации идей",
  example: sourceExample,
});

const topicRefSchema: z.ZodType<TopicRef> = z.object({
  topic: z.string().describe("Тема, по которой собирается бриф и генерируются идеи"),
});

const topicRefExample: TopicRef = { topic: "Запуск линейки готовых завтраков для доставки" };

const topicRefType = defineType("TopicRef", {
  schema: topicRefSchema,
  description: "Тема исследования: вход воркфлоу diverge_merge",
  example: topicRefExample,
});

const researchBriefSchema: z.ZodType<ResearchBrief> = z.object({
  topic: z.string().describe("Тема исследования в той формулировке, с которой пришёл заказчик"),
  sources: z
    .array(sourceSchema)
    .describe("Материалы по теме: единственное, на что разрешено ссылаться в идеях"),
});

const researchBriefExample: ResearchBrief = {
  topic: "Запуск линейки готовых завтраков для доставки",
  sources: [
    sourceExample,
    {
      id: idValue<SourceId>("src-interviews-2025-03"),
      title: "Расшифровки 12 интервью с покупателями готовой еды, март 2025",
    },
  ],
};

const researchBriefType = defineType("ResearchBrief", {
  schema: researchBriefSchema,
  description: "Бриф по теме: формулировка задачи и проверенные источники под генерацию идей",
  example: researchBriefExample,
});

const ideaSchema: z.ZodType<Idea> = z.object({
  slug: z.string().describe("Короткий машинный ключ идеи: по нему идут дедупликация и слияние наборов"),
  title: z.string().describe("Название идеи одной строкой"),
  rationale: z.string().describe("Почему идея сработает: опора только на источники брифа"),
  source_ids: z.array(sourceIdSchema).describe("Источники, подтверждающие обоснование идеи"),
});

const ideaExample: Idea = {
  slug: "breakfast-subscription",
  title: "Подписка на завтраки с доставкой к 8 утра",
  rationale: "В интервью покупатели называют утро самым дефицитным временем, а отчёт Nielsen показывает рост сегмента готовых завтраков на 18% за квартал.",
  source_ids: [idValue<SourceId>("src-nielsen-2025-q1"), idValue<SourceId>("src-interviews-2025-03")],
};

const ideaType = defineType("Idea", {
  schema: ideaSchema,
  description: "Идея с обоснованием и ссылками на источники брифа",
  example: ideaExample,
});

const ideaSetSchema: z.ZodType<IdeaSet> = z.object({
  ideas: z.array(ideaSchema).describe("Идеи одной персоны: аналитика, маркетолога или инженера"),
});

const ideaSetExample: IdeaSet = { ideas: [ideaExample] };

const ideaSetType = defineType("IdeaSet", {
  schema: ideaSetSchema,
  description: "Набор идей одной ветки расхождения",
  example: ideaSetExample,
});

const ideaBoardSchema: z.ZodType<IdeaBoard> = z.object({
  topic: z.string().describe("Тема, по которой собрана доска"),
  ideas: z.array(ideaSchema).describe("Идеи после слияния наборов и дедупликации по slug"),
});

const ideaBoardExample: IdeaBoard = { topic: researchBriefExample.topic, ideas: [ideaExample] };

const ideaBoardType = defineType("IdeaBoard", {
  schema: ideaBoardSchema,
  description: "Доска идей: выход воркфлоу diverge_merge",
  example: ideaBoardExample,
});

export const t = {
  SourceId: sourceIdType,
  Source: sourceType,
  TopicRef: topicRefType,
  ResearchBrief: researchBriefType,
  Idea: ideaType,
  IdeaSet: ideaSetType,
  IdeaSetArr: listType(ideaSetType),
  IdeaBoard: ideaBoardType,
};

export const researchBrief: Fn<{ topic: string }, ResearchBrief> = { name: "research_brief" };
export const generateIdeas: Fn<{ brief: ResearchBrief }, IdeaSet> = { name: "generate_ideas" };
export const renderBoard: Fn<{ merged: IdeaSet; brief: ResearchBrief }, IdeaBoard> = { name: "render_board" };
