import { defineId, defineType, listType } from "@wf/dsl";
import type { Fn, Id } from "@wf/dsl";
import { z } from "zod";
import type { IdCheck } from "@wf/std/extract";
import { idCheckSchema } from "./std.js";
import { idValue, schemaOf } from "./schema.js";

export type LineItemId = Id<"LineItemId">;
export type PolicyId = Id<"PolicyId">;

export type OrderItem = { id: LineItemId; title: string; priceMinor: number };
export type Order = { number: string; items: OrderItem[] };
export type Policy = { id: PolicyId; title: string; text: string };
export type Ticket = { text: string };
export type SupportRequest = { order: Order; ticket: Ticket };

export type RefundLine = { itemId: LineItemId; amountMinor: number; reason: string };
export type Resolution = { reasoning: string; policyId: PolicyId; refunds: RefundLine[] };

const lineItemIdType = defineId<LineItemId>("LineItemId", {
  description: "Идентификатор позиции заказа; возврат оформляется только по позициям этого заказа",
  source: "order.items[].id",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const policyIdType = defineId<PolicyId>("PolicyId", {
  description: "Идентификатор правила возврата; решение обязано ссылаться на одно из поданных правил",
  source: "policies_for_order()",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const lineItemIdSchema = schemaOf(lineItemIdType);

const orderItemSchema: z.ZodType<OrderItem> = z.object({
  id: lineItemIdSchema.describe("Идентификатор позиции заказа"),
  title: z.string().describe("Название товара так, как оно видно клиенту в заказе"),
  priceMinor: z.int().describe("Цена позиции в копейках, без учёта скидки на заказ целиком"),
});

const orderItemExample: OrderItem = {
  id: idValue<LineItemId>("li-2"),
  title: "Кофемолка Wilfa Uniform, чёрная",
  priceMinor: 1_749_000,
};

const orderItemType = defineType("OrderItem", {
  schema: orderItemSchema,
  description: "Позиция заказа: что именно купил клиент и за сколько",
  example: orderItemExample,
});

const orderSchema: z.ZodType<Order> = z.object({
  number: z.string().describe("Номер заказа в том виде, в каком клиент видит его в письме"),
  items: z.array(orderItemSchema).describe("Позиции заказа: только по ним допустим возврат"),
});

const orderExample: Order = {
  number: "R-2025-084517",
  items: [
    { id: idValue<LineItemId>("li-1"), title: "Кофе в зёрнах Tasty Coffee, 1 кг", priceMinor: 149_000 },
    orderItemExample,
  ],
};

const orderType = defineType("Order", {
  schema: orderSchema,
  description: "Заказ клиента с позициями: основание для расчёта возврата",
  example: orderExample,
});

const policySchema: z.ZodType<Policy> = z.object({
  id: schemaOf(policyIdType).describe("Идентификатор правила возврата"),
  title: z.string().describe("Короткое название правила"),
  text: z.string().describe("Формулировка правила целиком: на неё ссылается обоснование решения"),
});

const policyExample: Policy = {
  id: idValue<PolicyId>("pol-defect-14d"),
  title: "Возврат по браку в течение 14 дней",
  text: "Если клиент заявил о браке в течение 14 дней с получения, деньги возвращаются полностью, включая доставку.",
};

const policyType = defineType("Policy", {
  schema: policySchema,
  description: "Правило возврата, поданное на вход решателю",
  example: policyExample,
});

const ticketSchema: z.ZodType<Ticket> = z.object({
  text: z.string().describe("Текст обращения клиента без правок"),
});

const ticketExample: Ticket = {
  text: "Кофемолка пришла с треснувшим бункером, пользоваться нельзя. Заказ получил позавчера, хочу вернуть деньги.",
};

const ticketType = defineType("Ticket", {
  schema: ticketSchema,
  description: "Обращение клиента в поддержку по заказу",
  example: ticketExample,
});

const refundLineSchema: z.ZodType<RefundLine> = z.object({
  itemId: lineItemIdSchema.describe("Позиция заказа, по которой возвращаются деньги"),
  amountMinor: z.int().describe("Сумма возврата по позиции в копейках; не больше цены позиции"),
  reason: z.string().describe("Причина возврата по этой позиции, словами клиента или оператора"),
});

const resolutionSchema: z.ZodType<Resolution> = z.object({
  reasoning: z.string().describe("Рассуждение до решения: какое правило применено и почему"),
  policyId: schemaOf(policyIdType).describe("Правило возврата, на котором держится решение"),
  refunds: z.array(refundLineSchema).describe("Построчный возврат: по каким позициям и на какую сумму"),
});

const resolutionExample: Resolution = {
  reasoning: "Клиент заявил о браке на второй день после получения, значит действует правило возврата по браку в течение 14 дней. Возврат полный по позиции кофемолки, остальные позиции исправны.",
  policyId: idValue<PolicyId>("pol-defect-14d"),
  refunds: [
    { itemId: idValue<LineItemId>("li-2"), amountMinor: 1_749_000, reason: "Треснувший бункер, товар неработоспособен" },
  ],
};

const resolutionType = defineType("Resolution", {
  schema: resolutionSchema,
  description: "Решение по обращению: обоснование, применённое правило и построчный возврат",
  example: resolutionExample,
});

const supportRequestSchema: z.ZodType<SupportRequest> = z.object({
  order: orderSchema.describe("Заказ клиента с позициями"),
  ticket: ticketSchema.describe("Обращение клиента по этому заказу"),
});

const supportRequestExample: SupportRequest = { order: orderExample, ticket: ticketExample };

const supportRequestType = defineType("SupportRequest", {
  schema: supportRequestSchema,
  description: "Обращение вместе с заказом: вход воркфлоу dynamic_output",
  example: supportRequestExample,
});

const lineItemIdCheckExample: IdCheck<LineItemId> = {
  status: "unknown_ids",
  unknown: [idValue<LineItemId>("li-7")],
  nearest: [{ used: idValue<LineItemId>("li-7"), candidates: [idValue<LineItemId>("li-2")] }],
};

const lineItemIdCheckType = defineType("IdCheck<LineItemId>", {
  schema: idCheckSchema(lineItemIdSchema, "Позиция заказа"),
  description: "Проверка позиций, на которые сослалось решение о возврате",
  example: lineItemIdCheckExample,
});

export const t = {
  LineItemId: lineItemIdType,
  PolicyId: policyIdType,
  OrderItem: orderItemType,
  Order: orderType,
  Ticket: ticketType,
  Policy: policyType,
  SupportRequest: supportRequestType,
  PolicyArr: listType(policyType),
  Resolution: resolutionType,
  LineItemIdArr: listType(lineItemIdType),
  LineItemIdCheck: lineItemIdCheckType,
};

export const policiesForOrder: Fn<{ order: Order }, Policy[]> = { name: "policies_for_order" };
export const resolveTicket: Fn<{ order: Order; ticket: Ticket; policies: Policy[] }, Resolution> = {
  name: "resolve_ticket",
};
export const repairResolution: Fn<
  { order: Order; policies: Policy[]; draft: Resolution; check: IdCheck<LineItemId> },
  Resolution
> = { name: "repair_resolution" };
