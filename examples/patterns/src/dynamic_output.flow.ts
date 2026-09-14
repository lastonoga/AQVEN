import { defineFlow, tool, llm, code, branch, root, $const } from "@wf/dsl";
import { collectIds, checkIds, extractTypes } from "@wf/std/extract";
import { t, policiesForOrder, resolveTicket, repairResolution } from "./domain/orders.js";
import type { LineItemId, Resolution, SupportRequest } from "./domain/orders.js";

const $input = root<SupportRequest>("input");

const load_policies = tool("load_policies", {
  description: "Политики возврата, применимые к заказу",
  tool: policiesForOrder, effect: "read", ttlSeconds: 600, timeoutMs: 5_000,
  out: t.PolicyArr, in: { order: $input.order },
});

const resolve = llm("resolve", {
  description: "Решение по обращению: схема выхода сужена множествами из входа, выдумать несуществующий id позиции или политики модель не может",
  fn: resolveTicket, modelRole: "writer", trustIn: "untrusted",
  overrides: { temperature: 0.2, maxOutputTokens: 800 },
  allowedSets: [
    { type: t.LineItemId, from: $input.order.items.$all.id },
    { type: t.PolicyId, from: load_policies.out.$all.id },
  ],
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { order: $input.order, ticket: $input.ticket, policies: load_policies.out },
});

const used_items = code("used_items", {
  description: "Идентификаторы позиций, на которые сослалась модель",
  fn: collectIds<Resolution, LineItemId>(), pure: true, timeoutMs: 2_000, out: t.LineItemIdArr,
  in: { value: resolve.out, path: $const("refunds[*].itemId") },
});

const check_refs = code("check_refs", {
  description: "Проверка вхождения на приёме: без allowedSets сюда приходят выдуманные id и ветка уходит в ремонт",
  fn: checkIds<LineItemId>(), pure: true, timeoutMs: 2_000, out: t.LineItemIdCheck,
  in: { used: used_items.out, allowed: $input.order.items.$all.id },
});

const repair = llm("repair", {
  description: "Ремонт решения с подсказкой ближайших существующих позиций",
  fn: repairResolution, modelRole: "writer", trustIn: "untrusted",
  overrides: { temperature: 0, maxOutputTokens: 800 },
  allowedSets: [
    { type: t.LineItemId, from: $input.order.items.$all.id },
    { type: t.PolicyId, from: load_policies.out.$all.id },
  ],
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { order: $input.order, policies: load_policies.out, draft: resolve.out, check: check_refs.out },
});

const decide = branch("decide", {
  description: "Ссылки внутри множества — принять, иначе ремонт",
  on: check_refs.out.status, onType: extractTypes.IdCheckStatus, default: null,
  cases: { ok: resolve.out, unknown_ids: repair },
});

export default defineFlow({
  flow: "dynamic_output", version: 1, input: "SupportRequest",
  output: { type: "Resolution", from: decide.out },
  context: ["date", "locale"],
  budget: { usdMicros: 120_000, seconds: 60, tokens: null },
  policies: { trust: { defaultIn: "untrusted" }, pii: { maskInTraces: true, allowlistProfile: "pii_safe" } },
  defaults: { retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full",
      retryOn: ["timeout", "rate_limit", "server_error"] }, timeoutMs: 30_000 },
  nodes: [load_policies, resolve, used_items, check_refs, repair, decide],
});
