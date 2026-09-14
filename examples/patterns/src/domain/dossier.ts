import { idType } from "@wf/dsl";
import type { Fn, Id, Type } from "@wf/dsl";
import type { Issue, VerifyFixOut } from "@wf/std/loops";

export type DocId = Id<"DocId">;
export type ClauseId = Id<"ClauseId">;
export type SectionId = Id<"SectionId">;

export type Clause = { id: ClauseId; title: string; text: string };
export type Doc = { id: DocId; title: string; text: string; clauses: Clause[] };
export type TableSection = { id: SectionId; title: string; amountMinor: number };
export type FinancialTable = { currency: string; asOf: string; sections: TableSection[] };
export type Dossier = { dealId: string; period: string; documents: Doc[]; table: FinancialTable };

export type DealRef = { dealId: string; period: string };
export type ReviewBrief = { dossier: Dossier; threshold: number; maxWords: number };
export type ReviewHistory = { objections: string[]; rejectedHeadlines: string[] };

export type FactSheet = { claims: string[]; sources: DocId[] };
export type Risk = { title: string; severity: number; evidence: DocId[] };
export type RiskRegister = { risks: Risk[]; summary: string };

export type QuoteSource = "cached" | "recomputed";
export type SectionDelta = { section: SectionId; deltaMinor: number; share: number };
export type NumbersReport = { currency: string; source: QuoteSource; deltas: SectionDelta[] };

export type Stance = "buy" | "hold" | "pass";
export type Opinion = { stance: Stance; thesis: string; confidence: number };

export type ClauseCheck = { clauseId: ClauseId; verdict: string; blocking: boolean; quote: string };
export type ClauseReport = { checked: number; blocking: number; notes: string[] };

export type MemoCriterion = { id: string; text: string; weight: number; scale: string };
export type MemoRubric = { criteria: MemoCriterion[]; reasoningBeforeScore: true };
export type ReviewMemo = { headline: string; body: string; stance: Stance; citations: DocId[] };

export type JudgeScore = { judge: string; family: string; score: number; why: string; hardFail: boolean };
export type PanelDecision = "accept" | "revise" | "escalate";
export type PanelVerdict = { decision: PanelDecision; score: number; spread: number; objections: string[] };

export type ReviewIteration = { memo: ReviewMemo; score: number; accepted: boolean };
export type MemoDocument = { text: string; iterations: number; stance: Stance };

const ty = <T>(name: string): Type<T> => ({ name });

export const t = {
  DocId: idType<DocId>("DocId"),
  ClauseId: idType<ClauseId>("ClauseId"),
  SectionId: idType<SectionId>("SectionId"),
  Text: ty<string>("Text"),
  Doc: ty<Doc>("Doc"),
  DocArr: ty<Doc[]>("Doc[]"),
  FinancialTable: ty<FinancialTable>("FinancialTable"),
  Dossier: ty<Dossier>("Dossier"),
  ReviewBrief: ty<ReviewBrief>("ReviewBrief"),
  ReviewHistory: ty<ReviewHistory>("ReviewHistory"),
  FactSheet: ty<FactSheet>("FactSheet"),
  RiskRegister: ty<RiskRegister>("RiskRegister"),
  NumbersReport: ty<NumbersReport>("NumbersReport"),
  Opinion: ty<Opinion>("Opinion"),
  OpinionArr: ty<Opinion[]>("Opinion[]"),
  ClauseCheck: ty<ClauseCheck>("ClauseCheck"),
  ClauseVerifyOut: ty<VerifyFixOut<ClauseCheck>>("VerifyFixOut<ClauseCheck>"),
  ClauseReport: ty<ClauseReport>("ClauseReport"),
  ReviewMemo: ty<ReviewMemo>("ReviewMemo"),
  JudgeScore: ty<JudgeScore>("JudgeScore"),
  PanelDecision: ty<PanelDecision>("PanelDecision"),
  PanelVerdict: ty<PanelVerdict>("PanelVerdict"),
  ReviewIteration: ty<ReviewIteration>("ReviewIteration"),
  MemoDocument: ty<MemoDocument>("MemoDocument"),
  Score: ty<number>("Score"),
};

export const memoRubric: MemoRubric = {
  reasoningBeforeScore: true,
  criteria: [
    { id: "evidence", text: "Каждое утверждение опирается на документ досье", weight: 0.4, scale: "1-5" },
    { id: "numbers", text: "Цифры меморандума сходятся с финансовой таблицей", weight: 0.3, scale: "1-5" },
    { id: "risks", text: "Блокирующие риски названы прямо, без смягчения", weight: 0.2, scale: "1-5" },
    { id: "brevity", text: "Позиция читается с первого абзаца", weight: 0.1, scale: "1-5" },
  ],
};

export const loadDossier: Fn<{ dealId: string; period: string }, Dossier> = { name: "load_deal_dossier" };
export const quoteTableCached: Fn<{ dealId: string; period: string }, FinancialTable> = {
  name: "quote_table_cached",
};
export const recomputeTable: Fn<{ table: FinancialTable; period: string }, FinancialTable> = {
  name: "recompute_table",
};

export const buildReviewBrief: Fn<{ dossier: Dossier; threshold: number; maxWords: number }, ReviewBrief> = {
  name: "build_review_brief",
};
export const tableDeltas: Fn<
  { baseline: FinancialTable; actual: FinancialTable; source: QuoteSource },
  NumbersReport
> = { name: "table_deltas" };
export const collectOpinions: Fn<
  { openai: Opinion; anthropic: Opinion; google: Opinion; qwen: Opinion },
  Opinion[]
> = { name: "collect_opinions" };
export const foldClauseChecks: Fn<
  { checks: VerifyFixOut<ClauseCheck>[]; documents: Doc[] },
  ClauseReport
> = { name: "fold_clause_checks" };
export const foldPanel: Fn<{ scores: JudgeScore[]; threshold: number }, PanelVerdict> = { name: "fold_panel" };
export const reviewIteration: Fn<{ memo: ReviewMemo; verdict: PanelVerdict }, ReviewIteration> = {
  name: "review_iteration",
};
export const renderMemo: Fn<{ iteration: ReviewIteration; dossier: Dossier }, MemoDocument> = {
  name: "render_memo",
};
export const checkClauseDraft: Fn<{ candidate: ClauseCheck }, Issue[]> = { name: "check_clause_draft" };
export const scoreClauseDraft: Fn<{ candidate: ClauseCheck }, number> = { name: "score_clause_draft" };

export const extractFacts: Fn<{ documents: Doc[]; brief: ReviewBrief }, FactSheet> = { name: "extract_facts" };
export const registerRisks: Fn<
  { documents: Doc[]; history: ReviewHistory; brief: ReviewBrief },
  RiskRegister
> = { name: "register_risks" };
export const writeOpinion: Fn<{ brief: ReviewBrief; documents: Doc[] }, Opinion> = { name: "write_opinion" };
export const draftClauseCheck: Fn<{ task: Doc; feedback: Issue[] }, ClauseCheck> = { name: "draft_clause_check" };
export const writeMemo: Fn<
  {
    facts: FactSheet;
    risks: RiskRegister;
    numbers: NumbersReport;
    opinions: Opinion[];
    clauses: ClauseReport;
    history: ReviewHistory;
    brief: ReviewBrief;
  },
  ReviewMemo
> = { name: "write_memo" };
export const scoreMemo: Fn<{ memo: ReviewMemo; rubric: MemoRubric; brief: ReviewBrief }, JudgeScore> = {
  name: "score_memo",
};
export const reviseMemo: Fn<{ memo: ReviewMemo; verdict: PanelVerdict; documents: Doc[] }, ReviewMemo> = {
  name: "revise_memo",
};
