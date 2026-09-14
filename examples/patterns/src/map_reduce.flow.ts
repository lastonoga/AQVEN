import { code, defineFlow, llm, map, root, tool, $const } from "@wf/dsl";
import { foldCounts } from "@wf/std/diverge";
import { classifyTicket, t, ticketsOfBatch, writeDigest } from "./domain/triage.js";
import type { BatchRef, CategoryStat, Label } from "./domain/triage.js";

const $input = root<BatchRef>("input");

const tickets = tool("tickets", {
  description: "Пакет обращений за период",
  tool: ticketsOfBatch,
  effect: "read",
  ttlSeconds: 600,
  timeoutMs: 20_000,
  out: t.TicketArr,
  in: { batchId: $input.batch_id },
});

const labels = map("labels", {
  over: tickets.out,
  itemType: t.Ticket,
  concurrency: 8,
  onItemError: "skip",
  maxItems: 500,
  budget: { usdMicros: 200_000 },
  do: (ticket) =>
    llm("classify", {
      description: "Категория и острота одного обращения",
      fn: classifyTicket,
      modelRole: "small_fast",
      overrides: { seed: 3, maxOutputTokens: 200 },
      trustIn: "untrusted",
      allowedSets: [
        { type: t.CategoryId, from: $input.categories.$all.id },
        { type: t.TicketId, from: tickets.out.$all.id },
      ],
      outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
      in: { ticket, categories: $input.categories },
    }),
});

const stats = code("stats", {
  description: "Свёртка меток в статистику по категориям",
  fn: foldCounts<Label, CategoryStat[]>(),
  pure: true,
  timeoutMs: 5_000,
  out: t.CategoryStatArr,
  in: { items: labels.out, groupBy: $const("category_id") },
});

const digest = llm("digest", {
  description: "Сводка по пакету: только существующие категории",
  fn: writeDigest,
  modelRole: "writer",
  overrides: { maxOutputTokens: 800 },
  trustIn: "trusted",
  allowedSets: [{ type: t.CategoryId, from: $input.categories.$all.id }],
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { stats: stats.out, batch: $input },
});

export default defineFlow({
  flow: "map_reduce",
  version: 1,
  input: "BatchRef",
  output: { type: "Digest", from: digest.out },
  context: ["date", "locale"],
  budget: { usdMicros: 350_000, seconds: 300 },
  policies: {
    trust: { defaultIn: "untrusted" },
    pii: { maskInTraces: true, allowlistProfile: "pii_safe" },
  },
  defaults: {
    retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full", retryOn: ["timeout", "rate_limit"] },
    timeoutMs: 45_000,
  },
  nodes: [tickets, labels, stats, digest],
});
