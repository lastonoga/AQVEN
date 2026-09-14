import { defineId, defineType, listType } from "@wf/dsl";
import type { Fn, Id } from "@wf/dsl";
import { z } from "zod";
import { idValue, schemaOf } from "./schema.js";

export type CategoryId = Id<"CategoryId">;
export type TicketId = Id<"TicketId">;

export type Category = { id: CategoryId; title: string };
export type BatchRef = { batch_id: string; categories: Category[] };
export type Ticket = { id: TicketId; text: string; created_at: string };
export type Label = { ticket_id: TicketId; category_id: CategoryId; severity: number };
export type CategoryStat = { category_id: CategoryId; count: number; avg_severity: number };
export type Digest = { batch_id: string; headline: string; stats: CategoryStat[] };

const categoryIdType = defineId<CategoryId>("CategoryId", {
  description: "Идентификатор категории обращений; классификатор обязан выбрать одну из поданных категорий",
  source: "batch.categories[].id",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const ticketIdType = defineId<TicketId>("TicketId", {
  description: "Идентификатор обращения внутри разбираемого пакета",
  source: "tickets_of_batch()",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const categoryIdSchema = schemaOf(categoryIdType);
const ticketIdSchema = schemaOf(ticketIdType);

const categorySchema: z.ZodType<Category> = z.object({
  id: categoryIdSchema.describe("Идентификатор категории"),
  title: z.string().describe("Название категории так, как его читает дежурный менеджер"),
});

const categoryExample: Category = {
  id: idValue<CategoryId>("cat-delivery-delay"),
  title: "Задержка доставки",
};

const categoryType = defineType("Category", {
  schema: categorySchema,
  description: "Категория обращений из справочника пакета",
  example: categoryExample,
});

const batchRefSchema: z.ZodType<BatchRef> = z.object({
  batch_id: z.string().describe("Идентификатор пакета обращений за период"),
  categories: z.array(categorySchema).describe("Справочник категорий: разрешённое множество для классификатора"),
});

const batchRefExample: BatchRef = {
  batch_id: "batch-2025-03-17",
  categories: [
    categoryExample,
    { id: idValue<CategoryId>("cat-wrong-item"), title: "Привезли не тот товар" },
  ],
};

const batchRefType = defineType("BatchRef", {
  schema: batchRefSchema,
  description: "Пакет обращений за период: вход воркфлоу map_reduce",
  example: batchRefExample,
});

const ticketSchema: z.ZodType<Ticket> = z.object({
  id: ticketIdSchema.describe("Идентификатор обращения"),
  text: z.string().describe("Текст обращения клиента без правок"),
  created_at: z.iso.datetime().describe("Момент создания обращения в UTC, формат ISO 8601"),
});

const ticketExample: Ticket = {
  id: idValue<TicketId>("tkt-48219"),
  text: "Заказ обещали в понедельник, сегодня четверг, курьер не звонил. Где посылка?",
  created_at: "2025-03-17T09:12:00Z",
};

const ticketType = defineType("Ticket", {
  schema: ticketSchema,
  description: "Обращение из пакета, поданное на классификацию",
  example: ticketExample,
});

const labelSchema: z.ZodType<Label> = z.object({
  ticket_id: ticketIdSchema.describe("Обращение, которому присвоена метка"),
  category_id: categoryIdSchema.describe("Категория из справочника пакета"),
  severity: z.number().describe("Острота обращения от 0 до 1, где 1 — клиент требует эскалации"),
});

const labelExample: Label = {
  ticket_id: idValue<TicketId>("tkt-48219"),
  category_id: idValue<CategoryId>("cat-delivery-delay"),
  severity: 0.7,
};

const labelType = defineType("Label", {
  schema: labelSchema,
  description: "Метка обращения: категория и острота",
  example: labelExample,
});

const categoryStatSchema: z.ZodType<CategoryStat> = z.object({
  category_id: categoryIdSchema.describe("Категория, по которой собрана статистика"),
  count: z.int().describe("Сколько обращений пакета попало в категорию"),
  avg_severity: z.number().describe("Средняя острота обращений категории, от 0 до 1"),
});

const categoryStatExample: CategoryStat = {
  category_id: idValue<CategoryId>("cat-delivery-delay"),
  count: 137,
  avg_severity: 0.62,
};

const categoryStatType = defineType("CategoryStat", {
  schema: categoryStatSchema,
  description: "Статистика по одной категории обращений в пакете",
  example: categoryStatExample,
});

const digestSchema: z.ZodType<Digest> = z.object({
  batch_id: z.string().describe("Пакет, по которому собрана сводка"),
  headline: z.string().describe("Главный вывод по пакету одной строкой"),
  stats: z.array(categoryStatSchema).describe("Статистика по категориям в порядке убывания числа обращений"),
});

const digestExample: Digest = {
  batch_id: "batch-2025-03-17",
  headline: "Две трети обращений недели — задержки доставки по складу в Домодедове",
  stats: [
    categoryStatExample,
    { category_id: idValue<CategoryId>("cat-wrong-item"), count: 24, avg_severity: 0.41 },
  ],
};

const digestType = defineType("Digest", {
  schema: digestSchema,
  description: "Сводка по пакету обращений: выход воркфлоу map_reduce",
  example: digestExample,
});

export const t = {
  CategoryId: categoryIdType,
  TicketId: ticketIdType,
  Category: categoryType,
  BatchRef: batchRefType,
  Ticket: ticketType,
  TicketArr: listType(ticketType),
  Label: labelType,
  CategoryStat: categoryStatType,
  CategoryStatArr: listType(categoryStatType),
  Digest: digestType,
};

export const ticketsOfBatch: Fn<{ batchId: string }, Ticket[]> = { name: "tickets_of_batch" };
export const classifyTicket: Fn<{ ticket: Ticket; categories: Category[] }, Label> = { name: "classify_ticket" };
export const writeDigest: Fn<{ stats: CategoryStat[]; batch: BatchRef }, Digest> = { name: "write_digest" };
