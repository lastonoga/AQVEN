import type { ReactNode } from "react";
import { ArrowRight, CircleAlert } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ALL_FEATURES, ALL_PRODUCTS, CompareMatrix, MatrixLegend } from "@/components/landing/compare-matrix";
import { ActorTag, type Actor } from "@/components/landing/actors";

type Role = { readonly actor: Actor; readonly title: string; readonly gets: string; readonly elsewhere: string };

type Source = { readonly label: string; readonly href: string };

const ROLES: readonly Role[] = [
  {
    actor: "You",
    title: "Direct the investigation and decide.",
    gets: "One place to set the question, the budget and what counts as success, then read verdicts that say what is confirmed, what is only a signal and what is still unknown.",
    elsewhere: "With a trace viewer and an eval report side by side, you are also the one who runs each experiment.",
  },
  {
    actor: "Agent",
    title: "Do the experimental work.",
    gets: "Files it can edit and check, tools to run flows, series and forks, and a spend cap: near it, a series waits for a person to approve more.",
    elsewhere:
      "Tracing platforms also let a coding agent read traces and datasets over MCP. What the agent can do next is the difference: here it changes the workflow and runs the experiment on it.",
  },
  {
    actor: "AQVEN",
    title: "Run, record and decide the statistics.",
    gets: "Runs the workflow, records every step, applies the checks and computes the verdict, so the conclusion does not rest on the agent reading its own numbers.",
    elsewhere: "With the other tools, anything beyond averages is a script you or the agent write after the run.",
  },
];

const NOT_FOR: readonly string[] = [
  "One prompt and one model call: call the model's SDK directly.",
  "You only want to trace an app you already run: a tracing platform fits better.",
  "You need a hosted service for a team: AQVEN runs on your machine.",
  "You can't run Python 3.14: the engine requires it, and your step code runs on it.",
  "You need an OSI-approved open-source license: AQVEN is source-available.",
];

const SOURCES: readonly Source[] = [
  { label: "Langfuse: experiments", href: "https://langfuse.com/docs/evaluation/experiments/overview" },
  { label: "Langfuse: self-hosting", href: "https://langfuse.com/self-hosting" },
  { label: "LangSmith: comparing experiments", href: "https://docs.langchain.com/langsmith/compare-experiment-results" },
  { label: "LangSmith: repetitions", href: "https://docs.langchain.com/langsmith/repetition" },
  { label: "LangSmith: self-hosted", href: "https://docs.langchain.com/langsmith/self-hosted" },
  { label: "Arize Phoenix: datasets and experiments", href: "https://arize.com/docs/phoenix/datasets-and-experiments/overview-datasets" },
  { label: "promptfoo: tracing", href: "https://www.promptfoo.dev/docs/tracing/" },
  { label: "promptfoo: command line", href: "https://www.promptfoo.dev/docs/usage/command-line/" },
  { label: "DeepEval: getting started", href: "https://deepeval.com/docs/getting-started" },
  { label: "Confident AI: experiments", href: "https://www.confident-ai.com/docs/llm-evaluation/experiments" },
  { label: "n8n: metrics for AI workflows", href: "https://docs.n8n.io/build/integrate-ai/test-and-improve-ai-workflows/use-metrics-to-measure-quality/" },
  { label: "n8n: MCP server tools", href: "https://docs.n8n.io/connect/connect-to-n8n-mcp-server/mcp-server-tools-reference/" },
  { label: "LangGraph: graph API", href: "https://docs.langchain.com/oss/python/langgraph/graph-api" },
]

type Lens = { readonly tool: string; readonly answers: string; readonly strong: boolean };

const LENSES: readonly Lens[] = [
  { tool: "Traces", answers: "What did the app do?", strong: false },
  { tool: "Evals", answers: "How did it score on my cases?", strong: false },
  { tool: "AQVEN", answers: "What should change, and is it confirmed?", strong: true },
];

const CompareLenses = () => (
  <div className="w-full overflow-hidden rounded-xl border border-border bg-card">
    <ol className="divide-y divide-border">
      {LENSES.map((lens) => (
        <li key={lens.tool} className="flex items-center justify-between gap-6 px-6 py-5">
          <span className={cn("font-mono text-sm", lens.strong ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {lens.tool}
          </span>
          <span className={cn("text-right lg:text-lg", lens.strong ? "font-semibold" : "text-muted-foreground")}>
            {lens.answers}
          </span>
        </li>
      ))}
    </ol>
  </div>
);

export const compareHeroVisual = <CompareLenses />;

const Section = ({ id, className, children }: { id?: string; className?: string; children: ReactNode }) => (
  <section id={id} className={cn("scroll-mt-20 py-16 lg:py-24", className)}>
    <div className="container mx-auto px-6">{children}</div>
  </section>
);

const Heading = ({ badge, title, lead }: { badge: string; title: string; lead: string }) => (
  <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
    <Badge variant="secondary">{badge}</Badge>
    <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{title}</h2>
    <p className="text-muted-foreground lg:text-lg">{lead}</p>
  </div>
);

export const ComparisonAtGlance = () => (
  <Section id="at-a-glance">
    <Heading
      badge="At a glance"
      title="What each tool gives you."
      lead="Tracing platforms and eval libraries are good at watching and scoring. AQVEN is built for deciding what to change and confirming it."
    />
    <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-5">
      <CompareMatrix products={ALL_PRODUCTS} features={ALL_FEATURES} caption="AQVEN compared with tracing platforms, eval libraries, a visual builder and an agent framework" />
      <MatrixLegend />
    </div>
  </Section>
);

export const WhoDoesWhat = () => (
  <Section id="roles" className="bg-background-subtle">
    <Heading
      badge="Who does what"
      title="Your agent does the work. You decide. AQVEN runs and records it."
      lead="The difference is not a feature list. It is who can do which part of the investigation, and on what."
    />
    <div className="mx-auto mt-12 grid max-w-6xl gap-4 lg:grid-cols-3">
      {ROLES.map((role) => (
        <Card key={role.actor}>
          <CardHeader className="flex flex-col gap-3">
            <span className="self-start">
              <ActorTag actor={role.actor} />
            </span>
            <CardTitle className="text-xl">{role.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-foreground">{role.gets}</p>
            <p className="text-sm text-muted-foreground">{role.elsewhere}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  </Section>
);

export const UseTogether = () => (
  <Section id="together" className="bg-background-subtle">
    <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h2 className="text-3xl font-semibold tracking-tight text-balance">Use them together.</h2>
        <p className="text-muted-foreground lg:text-lg">
          Evals stay the measuring tool inside AQVEN: its checks are built-in, your own functions, or a model as judge. A
          tracing platform keeps watching what runs in production. AQVEN is where you and your coding agent work out what
          to change before it ships.
        </p>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-5 py-5">
        <CircleAlert className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">When AQVEN is not the right tool</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {NOT_FOR.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  </Section>
);

export const Sources = () => (
  <Section id="sources">
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h2 className="text-xl font-semibold tracking-tight">Sources</h2>
      <p className="text-sm text-muted-foreground">
        What this page says about other products comes from their documentation, checked on 28 September 2026. Products
        change; if something here is out of date, open an issue on GitHub.
      </p>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {SOURCES.map((source) => (
          <li key={source.href}>
            <a
              href={source.href}
              className="group inline-flex items-start gap-1.5 underline underline-offset-4"
              rel="noopener"
            >
              {source.label}
              <ArrowRight
                className="mt-0.5 size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  </Section>
);
