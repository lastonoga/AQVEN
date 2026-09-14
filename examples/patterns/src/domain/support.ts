import { idType } from "@wf/dsl";
import type { Fn, Id, Type } from "@wf/dsl";
import type {
  Classification,
  EscalationPolicy,
  JudgeResult,
  PanelVerdict,
  RouteSpec,
  RoutedResult,
  Rubric,
} from "@wf/std/judges";

export type DocId = Id<"DocId">;

export type KbDoc = { id: DocId; title: string; text: string };
export type Ticket = { id: string; text: string; locale: string; tier: string };
export type Queue = { name: string; locale: string };
export type Answer = { text: string; citations: DocId[]; tone: string };
export type Digest = { text: string; escalated: number };
export type RouteKind = "billing" | "technical" | "legal" | "account";
export type TechRoute = "api" | "mobile" | "infra";
export type RoutedAnswer = RoutedResult<RouteKind, Answer>;

const ty = <T>(name: string): Type<T> => ({ name });

export const t = {
  DocId: idType<DocId>("DocId"),
  KbDocArr: ty<KbDoc[]>("KbDoc[]"),
  Ticket: ty<Ticket>("Ticket"),
  TicketArr: ty<Ticket[]>("Ticket[]"),
  Answer: ty<Answer>("Answer"),
  AnswerArr: ty<Answer[]>("Answer[]"),
  Digest: ty<Digest>("Digest"),
  RouteKind: ty<RouteKind>("RouteKind"),
  AnswerReviewForm: ty<unknown>("AnswerReviewForm"),
  ManagerDecisionForm: ty<unknown>("ManagerDecisionForm"),
};

export const answerRubric: Rubric = {
  reasoningBeforeScore: true,
  criteria: [
    { id: "factual_consistency", text: "Ответ опирается только на статьи базы знаний", weight: 0.4, scale: "1-5", hardFailBelow: 3 },
    { id: "fit_to_request", text: "Ответ решает вопрос обращения целиком", weight: 0.4, scale: "1-5" },
    { id: "tone", text: "Тон спокойный, без обвинений и жаргона", weight: 0.2, scale: "1-5" },
  ],
};

export const searchKb: Fn<{ query: string; locale: string }, KbDoc[]> = { name: "search_kb" };
export const loadQueue: Fn<{ queue: string; locale: string }, Ticket[]> = { name: "load_queue" };
export const loadPolicy: Fn<{ tier: string }, EscalationPolicy> = { name: "load_escalation_policy" };

export const draftAnswer: Fn<{ ticket: Ticket; docs: KbDoc[] }, Answer> = { name: "draft_answer" };
export const scoreAnswer: Fn<{ candidate: Answer; rubric: Rubric }, JudgeResult<Answer>> = { name: "score_answer" };
export const reviseAnswer: Fn<{ draft: Answer; verdict: PanelVerdict<Answer>; docs: KbDoc[] }, Answer> = {
  name: "revise_answer",
};
export const rewriteAnswer: Fn<{ ticket: Ticket; docs: KbDoc[]; verdict: PanelVerdict<Answer> }, Answer> = {
  name: "rewrite_answer",
};

export const answerCheap: Fn<{ ticket: Ticket }, Answer> = { name: "answer_cheap" };
export const answerStrong: Fn<{ ticket: Ticket; draft: Answer }, Answer> = { name: "answer_strong" };
export const pickEscalated: Fn<{ answers: Answer[]; tickets: Ticket[] }, Answer[]> = { name: "pick_escalated" };

export const classifyTicket: Fn<{ ticket: Ticket; routes: RouteSpec<RouteKind>[] }, Classification<RouteKind>> = {
  name: "classify_ticket",
};
export const replyAsExpert: Fn<{ ticket: Ticket }, Answer> = { name: "reply_as_expert" };
export const stampRoute: Fn<{ route: Classification<RouteKind>; answer: Answer }, RoutedAnswer> = {
  name: "stamp_route",
};

export const autoAnswer: Fn<{ ticket: Ticket; policy: EscalationPolicy }, Answer> = { name: "auto_answer" };
