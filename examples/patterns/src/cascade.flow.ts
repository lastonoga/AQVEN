import { $const, branch, call, code, defineComponent, defineFlow, llm, map, root, tool } from "@wf/dsl";
import type { Component } from "@wf/dsl";
import { cascade, cascadeResultType, confidenceOf, judgeTypes } from "@wf/std/judges";
import type { CascadeConfig } from "@wf/std/judges";
import type { Answer, Digest, Queue, Ticket } from "./domain/support.js";
import { answerCheap, answerStrong, loadQueue, pickEscalated, t } from "./domain/support.js";

const strictJson = { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" };

const ticketCascadeConfig: CascadeConfig = {
  cheap: { modelRole: "small_fast", family: "mistral", maxOutputTokens: 400, usdMicrosPerCall: 120 },
  strong: { modelRole: "writer_strong", family: "anthropic", maxOutputTokens: 1_200, usdMicrosPerCall: 2_400 },
  escalateBelow: 0.72,
  maxEscalatedShare: 0.25,
};

const digestCascadeConfig: CascadeConfig = {
  cheap: { modelRole: "small_fast", family: "mistral", maxOutputTokens: 600, usdMicrosPerCall: 150 },
  strong: { modelRole: "writer_strong", family: "anthropic", maxOutputTokens: 1_600, usdMicrosPerCall: 3_000 },
  escalateBelow: 0.6,
  maxEscalatedShare: 1,
};

const $ticket = root<{ ticket: Ticket }>("in");

const cheap = llm("cheap", {
  description: "Ответ дешёвой моделью",
  fn: answerCheap,
  modelRole: ticketCascadeConfig.cheap.modelRole,
  overrides: { temperature: 0.2, maxOutputTokens: ticketCascadeConfig.cheap.maxOutputTokens },
  trustIn: "untrusted",
  outputContract: strictJson,
  in: { ticket: $ticket.ticket },
});

const gate = code("gate", {
  description: "Проверка уверенности: ниже порога — эскалация на сильную модель",
  fn: confidenceOf<Answer>(),
  pure: true,
  timeoutMs: 2_000,
  out: judgeTypes.Confidence,
  in: { answer: cheap.out, config: $const(ticketCascadeConfig) },
});

const strong = llm("strong", {
  description: "Переписывание сильной моделью при низкой уверенности",
  fn: answerStrong,
  modelRole: ticketCascadeConfig.strong.modelRole,
  overrides: { temperature: 0.3, maxOutputTokens: ticketCascadeConfig.strong.maxOutputTokens },
  trustIn: "untrusted",
  outputContract: strictJson,
  in: { ticket: $ticket.ticket, draft: cheap.out },
});

const chosen = branch("chosen", {
  description: "Ступень каскада по уровню уверенности",
  on: gate.out.level,
  onType: judgeTypes.ConfidenceLevel,
  default: null,
  cases: { sure: cheap.out, unsure: strong },
});

export const ticketCascade: Component<{ ticket: Ticket }, Answer> = defineComponent({
  name: "ticket_cascade",
  in: { ticket: t.Ticket },
  out: { type: "Answer", from: chosen.out },
  nodes: [cheap, gate, strong, chosen],
});

const $input = root<Queue>("input");

const tickets = tool("tickets", {
  description: "Очередь необработанных обращений",
  tool: loadQueue,
  effect: "read",
  ttlSeconds: 60,
  timeoutMs: 8_000,
  out: t.TicketArr,
  in: { queue: $input.name, locale: $input.locale },
});

const triage = map("triage", {
  over: tickets.out,
  itemType: t.Ticket,
  concurrency: 6,
  onItemError: "skip",
  maxItems: 200,
  budget: { usdMicros: 150_000 },
  do: (ticket) =>
    call("resolve", {
      description: "Каскад на обращение: дешёвая модель, проверка уверенности, эскалация",
      component: ticketCascade,
      out: t.Answer,
      in: { ticket },
    }),
});

const hard_cases = code("hard_cases", {
  description: "Обращения, ушедшие на сильную модель",
  fn: pickEscalated,
  pure: true,
  timeoutMs: 3_000,
  out: t.AnswerArr,
  in: { answers: triage.out, tickets: tickets.out },
});

const digest = call("digest", {
  description: "Сводка по эскалациям каскадом из библиотеки",
  component: cascade<Answer[], Digest>(),
  typeArgs: ["Answer[]", "Digest"],
  out: cascadeResultType<Digest>("Digest"),
  budget: { usdMicros: 40_000 },
  in: { task: hard_cases.out, config: $const(digestCascadeConfig) },
});

export default defineFlow({
  flow: "cascade",
  version: 1,
  input: "Queue",
  output: { type: "Digest", from: digest.out.answer },
  context: ["locale"],
  budget: { usdMicros: 300_000, seconds: 180 },
  policies: { trust: { defaultIn: "untrusted" }, escalation: { role: "support_lead" } },
  defaults: {
    retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full" },
    timeoutMs: 60_000,
  },
  components: { ticketCascade },
  nodes: [tickets, triage, hard_cases, digest],
});
