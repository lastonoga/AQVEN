import { idType } from "@wf/dsl";
import type { Fn, Id, Type } from "@wf/dsl";
import type { IdCheck } from "@wf/std/extract";

export type LineItemId = Id<"LineItemId">;
export type PolicyId = Id<"PolicyId">;

export type OrderItem = { id: LineItemId; title: string; priceMinor: number };
export type Order = { number: string; items: OrderItem[] };
export type Policy = { id: PolicyId; title: string; text: string };
export type Ticket = { text: string };
export type SupportRequest = { order: Order; ticket: Ticket };

export type RefundLine = { itemId: LineItemId; amountMinor: number; reason: string };
export type Resolution = { reasoning: string; policyId: PolicyId; refunds: RefundLine[] };

const ty = <T>(name: string): Type<T> => ({ name });

export const t = {
  LineItemId: idType<LineItemId>("LineItemId"),
  PolicyId: idType<PolicyId>("PolicyId"),
  PolicyArr: ty<Policy[]>("Policy[]"),
  Resolution: ty<Resolution>("Resolution"),
  LineItemIdArr: ty<LineItemId[]>("LineItemId[]"),
  LineItemIdCheck: ty<IdCheck<LineItemId>>("IdCheck<LineItemId>"),
};

export const policiesForOrder: Fn<{ order: Order }, Policy[]> = { name: "policies_for_order" };
export const resolveTicket: Fn<{ order: Order; ticket: Ticket; policies: Policy[] }, Resolution> = {
  name: "resolve_ticket",
};
export const repairResolution: Fn<
  { order: Order; policies: Policy[]; draft: Resolution; check: IdCheck<LineItemId> },
  Resolution
> = { name: "repair_resolution" };
