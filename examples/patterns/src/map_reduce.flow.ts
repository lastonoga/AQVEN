import { code, defineFlow, idType, llm, map, root, tool, $const } from "@wf/dsl";
import type { Fn, Id, IdType, Type } from "@wf/dsl";
import { foldCounts } from "@wf/std/diverge";

type CategoryId = Id<"CategoryId">;
type TicketId = Id<"TicketId">;
type Category = { id: CategoryId; title: string };
type BatchRef = { batch_id: string; categories: Category[] };
type Ticket = { id: TicketId; text: string; created_at: string };
type Label = { ticket_id: TicketId; category_id: CategoryId; severity: number };
type CategoryStat = { category_id: CategoryId; count: number; avg_severity: number };
type Digest = { batch_id: string; headline: string; stats: CategoryStat[] };

const ty = <T>(name: string): Type<T> => ({ name });
const categoryId: IdType<CategoryId> = idType<CategoryId>("CategoryId");
const ticketId: IdType<TicketId> = idType<TicketId>("TicketId");

const t = {
  CategoryId: categoryId,
  TicketId: ticketId,
  Ticket: ty<Ticket>("Ticket"),
  TicketArr: ty<Ticket[]>("Ticket[]"),
  CategoryStatArr: ty<CategoryStat[]>("CategoryStat[]"),
  Digest: ty<Digest>("Digest"),
};

const ticketsOfBatch: Fn<{ batchId: string }, Ticket[]> = { name: "tickets_of_batch" };
const classifyTicket: Fn<{ ticket: Ticket; categories: Category[] }, Label> = { name: "classify_ticket" };
const writeDigest: Fn<{ stats: CategoryStat[]; batch: BatchRef }, Digest> = { name: "write_digest" };

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
