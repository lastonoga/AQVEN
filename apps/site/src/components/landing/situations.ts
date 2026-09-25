export type SituationId = "find" | "explain" | "compare" | "confirm" | "build";

export type DocLink = { readonly label: string; readonly href: string };

export type Situation = {
  readonly id: SituationId;
  readonly verb: string;
  readonly title: string;
  readonly question: string;
  readonly summary: string;
  readonly doc: DocLink;
};

export const USE_CASES_PATH = "/use-cases/";

export const situationHref = (id: SituationId): string => `${USE_CASES_PATH}#${id}`;

export const SITUATIONS: readonly Situation[] = [
  {
    id: "find",
    verb: "Find",
    title: "Find what you'd miss by hand.",
    question: "What am I missing?",
    summary: "Your agent explores cases and variants you wouldn't try yourself.",
    doc: { label: "The research loop", href: "/mcp-cli/research-loop/" },
  },
  {
    id: "explain",
    verb: "Explain",
    title: "Explain where a run went wrong.",
    question: "Why did this fail?",
    summary: "Follow a bad answer back to the step where it started.",
    doc: { label: "How to investigate a run", href: "/studio/investigate-a-run/" },
  },
  {
    id: "compare",
    verb: "Compare",
    title: "Compare changes on your own cases.",
    question: "What should I change?",
    summary: "Models and prompts side by side, with cost and latency.",
    doc: { label: "Research in Studio", href: "/studio/research/" },
  },
  {
    id: "confirm",
    verb: "Confirm",
    title: "Confirm a fix before you ship it.",
    question: "Can I trust this change?",
    summary: "A verdict on held-out cases that is allowed to say inconclusive.",
    doc: { label: "Experiments, series and findings", href: "/concepts/experiments-series-and-findings/" },
  },
  {
    id: "build",
    verb: "Build",
    title: "Build it so it stays readable.",
    question: "How do I keep it readable as it grows?",
    summary: "Typed files in your repo, checked before a run costs a token.",
    doc: { label: "Quickstart", href: "/start/quickstart/" },
  },
];
