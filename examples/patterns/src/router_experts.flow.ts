import { $const, branch, call, code, defineComponent, defineFlow, llm, root } from "@wf/dsl";
import type { Component } from "@wf/dsl";
import { routedResultType, routerExperts } from "@wf/std/judges";
import type { RouteSpec, RouterConfig } from "@wf/std/judges";
import type { Answer, RouteKind, TechRoute, Ticket } from "./domain/support.js";
import { classifyTicket, replyAsExpert, stampRoute, t } from "./domain/support.js";

const strictJson = { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" };

type Expert = Component<{ ticket: Ticket }, Answer>;

const routeCatalog: RouteSpec<RouteKind>[] = [
  { route: "billing", modelRole: "expert_billing", description: "Счета, списания, возвраты", examples: ["двойное списание"] },
  { route: "technical", modelRole: "expert_technical", description: "Ошибки продукта и интеграций", examples: ["500 на вебхуке"] },
  { route: "legal", modelRole: "expert_legal", description: "Договор, персональные данные", examples: ["удалите мои данные"] },
  { route: "account", modelRole: "expert_account", description: "Доступы, роли, тарифы", examples: ["не входит в аккаунт"] },
];

const techRouterConfig: RouterConfig<TechRoute> = {
  classifierRole: "small_fast",
  routes: [
    { route: "api", modelRole: "expert_api", description: "Публичный API и вебхуки", examples: ["429 на /orders"] },
    { route: "mobile", modelRole: "expert_mobile", description: "Мобильные приложения", examples: ["падает на iOS 18"] },
    { route: "infra", modelRole: "expert_infra", description: "Доступность и задержки", examples: ["медленно грузится"] },
  ],
  fallback: "api",
  minConfidence: 0.6,
};

const simpleExpert = (name: string, modelRole: string, persona: string): Expert => {
  const $expert = root<{ ticket: Ticket }>("in");
  const reply = llm("reply", {
    description: `Ответ эксперта: ${persona}`,
    fn: replyAsExpert,
    modelRole,
    overrides: { temperature: 0.4, maxOutputTokens: 800 },
    trustIn: "untrusted",
    outputContract: strictJson,
    in: { ticket: $expert.ticket },
  });
  return defineComponent({ name, in: { ticket: t.Ticket }, out: { type: "Answer", from: reply.out }, nodes: [reply] });
};

export const expertBilling = simpleExpert("expert_billing", "expert_billing", "биллинг и возвраты");
export const expertLegal = simpleExpert("expert_legal", "expert_legal", "договор и персональные данные");
export const expertAccount = simpleExpert("expert_account", "expert_account", "доступы и тарифы");

const $tech = root<{ ticket: Ticket }>("in");

const tech_route = call("tech_route", {
  description: "Второй уровень маршрутизации: api, mobile, infra",
  component: routerExperts<Ticket, TechRoute, Answer>(),
  typeArgs: ["Ticket", "TechRoute", "Answer"],
  out: routedResultType<TechRoute, Answer>("TechRoute", "Answer"),
  in: { task: $tech.ticket, config: $const(techRouterConfig) },
});

export const expertTechnical: Expert = defineComponent({
  name: "expert_technical",
  in: { ticket: t.Ticket },
  out: { type: "Answer", from: tech_route.out.result },
  nodes: [tech_route],
});

const $input = root<Ticket>("input");

const classify = llm("classify", {
  description: "Классификация обращения по маршрутам",
  fn: classifyTicket,
  modelRole: "small_fast",
  overrides: { temperature: 0, maxOutputTokens: 200 },
  trustIn: "untrusted",
  outputContract: strictJson,
  in: { ticket: $input, routes: $const(routeCatalog) },
});

const billing = call("billing", {
  description: "Ветка эксперта по биллингу",
  component: expertBilling,
  out: t.Answer,
  in: { ticket: $input },
});

const technical = call("technical", {
  description: "Ветка технического эксперта с вложенной маршрутизацией",
  component: expertTechnical,
  out: t.Answer,
  in: { ticket: $input },
});

const legal = call("legal", {
  description: "Ветка юридического эксперта",
  component: expertLegal,
  out: t.Answer,
  in: { ticket: $input },
});

const account = call("account", {
  description: "Ветка эксперта по аккаунтам",
  component: expertAccount,
  out: t.Answer,
  in: { ticket: $input },
});

const routed = branch("routed", {
  description: "Маршрут по классификации обращения",
  on: classify.out.route,
  onType: t.RouteKind,
  default: null,
  cases: { billing, technical, legal, account },
});

const result = code("result", {
  description: "Ответ с отметкой маршрута и уверенности классификатора",
  fn: stampRoute,
  pure: true,
  timeoutMs: 2_000,
  out: routedResultType<RouteKind, Answer>("RouteKind", "Answer"),
  in: { route: classify.out, answer: routed.out },
});

export default defineFlow({
  flow: "router_experts",
  version: 1,
  input: "Ticket",
  output: { type: "RoutedResult<RouteKind, Answer>", from: result.out },
  context: ["locale"],
  budget: { usdMicros: 200_000, seconds: 90 },
  policies: { trust: { defaultIn: "untrusted" }, escalation: { role: "support_lead" } },
  defaults: {
    retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full" },
    timeoutMs: 60_000,
  },
  components: { expertBilling, expertTechnical, expertLegal, expertAccount },
  nodes: [classify, billing, technical, legal, account, routed, result],
});
