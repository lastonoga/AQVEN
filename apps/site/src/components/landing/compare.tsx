import type { ReactNode } from "react";
import { ArrowRight, CircleAlert } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActorTag, type Actor } from "@/components/landing/actors";

type Answer = {
  readonly verb: string;
  readonly question: string;
  readonly tracing: string;
  readonly evals: string;
  readonly aqven: string;
};

type Role = { readonly actor: Actor; readonly title: string; readonly gets: string; readonly elsewhere: string };

type OtherTool = { readonly name: string; readonly examples: string; readonly fits: string; readonly aqven: string };

type Source = { readonly label: string; readonly href: string };

const ANSWERS: readonly Answer[] = [
  {
    verb: "Find",
    question: "What am I missing?",
    tracing:
      "You browse traces for failures your users already hit. Trying a variant nobody thought of means changing your app and running it again by hand.",
    evals: "The library runs the cases you wrote. Finding the cases you did not think of stays your job.",
    aqven:
      "Your coding agent changes the workflow files, runs series on working cases within the budget you set, and brings back failure modes for you to agree on.",
  },
  {
    verb: "Explain",
    question: "Why did this fail?",
    tracing:
      "Their strength: a trace of every call in the app you run. Testing a suspicion still means editing your app and running it again.",
    evals: "A failing score for the case. Finding the step where the failure started means going to the traces.",
    aqven:
      "Every step of the run with its input, the prompt as it was sent, the output and the checks. Fork the run from the step you suspect and run it again from there.",
  },
  {
    verb: "Compare",
    question: "What should I change?",
    tracing:
      "Dataset experiments with scores per item and a side-by-side view against a baseline. Prompt versions can live in the platform; any other change to the workflow is code you change and track yourself.",
    evals: "Pass rates and scores per prompt or model, in a table or a CI report.",
    aqven:
      "A variant is a file the agent writes: an agent, a prompt, one step or a whole flow. Variants run on your own cases with cost and latency, and you see the cases that disagree, not only the average.",
  },
  {
    verb: "Confirm",
    question: "Can I trust this change?",
    tracing:
      "Averages, some with a standard deviation across repeats. Whether a difference is real is left to you.",
    evals:
      "Scores on the cases you ran. The open-source libraries we checked document no held-out split or significance test; Confident AI, the paid platform behind DeepEval, adds significance to comparisons.",
    aqven:
      "The question and the decision rule are written before any data. The verdict comes from held-out cases the agent does not see one by one, each number has a 95% interval, and the verdict can be inconclusive.",
  },
  {
    verb: "Remember",
    question: "Will the next session know what this one learned?",
    tracing: "The experiment stays in the platform. The conclusion lives wherever you write it down.",
    evals: "A report per run. The conclusion lives wherever you write it down.",
    aqven:
      "A held-out verdict is written once to the experiment's findings, with its scope, and summed up in FINDINGS.md for the next agent session to read first.",
  },
  {
    verb: "Build",
    question: "How do I keep it readable as it grows?",
    tracing: "The workflow stays in your app code. The platform watches it; it does not hold it.",
    evals: "The workflow stays in your app code. The library calls it.",
    aqven:
      "Typed files in your repo: a flow, one file per step, prompts in Markdown. aqven check validates every connection and simulates each flow before a run costs a token.",
  },
];

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

const OTHER_TOOLS: readonly OtherTool[] = [
  {
    name: "Visual builders",
    examples: "n8n, Dify",
    fits: "The workflow lives in the platform and is assembled in its editor, which suits people who connect business apps without code. n8n evaluates on a dataset, with metrics on paid plans; Dify hands evaluation to a tracing tool.",
    aqven: "In AQVEN the workflow is typed files in git that your coding agent edits, checked before every run, and tested with experiments that end in a verdict.",
  },
  {
    name: "Agent frameworks",
    examples: "LangGraph, CrewAI",
    fits: "You write the agent loop in code and ship it inside your service. Evaluation comes from a companion product, such as LangSmith for LangGraph, or a test command in CrewAI.",
    aqven: "AQVEN calls models through Pydantic AI and checkpoints runs with DBOS, and adds the declared workflow, the check before a run, and experiments with verdicts.",
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
  { label: "LangSmith: comparing experiments", href: "https://docs.langchain.com/langsmith/compare-experiment-results" },
  { label: "LangSmith: repetitions", href: "https://docs.langchain.com/langsmith/repetition" },
  { label: "Arize Phoenix: datasets and experiments", href: "https://arize.com/docs/phoenix/datasets-and-experiments/overview-datasets" },
  { label: "promptfoo: command line", href: "https://www.promptfoo.dev/docs/usage/command-line/" },
  { label: "DeepEval: getting started", href: "https://deepeval.com/docs/getting-started" },
  { label: "Ragas: experimentation", href: "https://docs.ragas.io/en/stable/concepts/experimentation/" },
  { label: "n8n: metrics for AI workflows", href: "https://docs.n8n.io/build/integrate-ai/test-and-improve-ai-workflows/use-metrics-to-measure-quality/" },
  { label: "Dify: tracing integrations", href: "https://docs.dify.ai/en/cloud/use-dify/monitor/integrations/integrate-langfuse" },
  { label: "LangGraph: graph API", href: "https://docs.langchain.com/oss/python/langgraph/graph-api" },
  { label: "CrewAI: testing", href: "https://docs.crewai.com/en/concepts/testing" },
];

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

const QuestionCell = ({ answer }: { answer: Answer }) => (
  <div className="flex flex-col gap-1.5">
    <span className="self-start rounded-md border border-border bg-card px-2 py-0.5 text-xs font-semibold">{answer.verb}</span>
    <span className="font-medium">{answer.question}</span>
  </div>
);

export const QuestionComparison = () => (
  <Section id="questions">
    <Heading
      badge="Question by question"
      title="The questions a score doesn't answer."
      lead="You own a multi-step LLM workflow. These are the questions you need answered before you change it, and what answering each one takes with the tools you may already use."
    />
    <div className="mx-auto mt-12 max-w-6xl overflow-x-auto">
      <Table className="min-w-[56rem]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-44">Your question</TableHead>
            <TableHead>With a tracing platform</TableHead>
            <TableHead>With an eval library</TableHead>
            <TableHead className="font-semibold text-foreground">With AQVEN</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ANSWERS.map((answer) => (
            <TableRow key={answer.verb} className="align-top">
              <TableCell className="whitespace-normal">
                <QuestionCell answer={answer} />
              </TableCell>
              <TableCell className="whitespace-normal text-muted-foreground">{answer.tracing}</TableCell>
              <TableCell className="whitespace-normal text-muted-foreground">{answer.evals}</TableCell>
              <TableCell className="whitespace-normal font-medium">{answer.aqven}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
    <p className="mx-auto mt-6 max-w-6xl text-sm text-muted-foreground">
      Tracing platforms such as Langfuse, LangSmith and Arize Phoenix. Eval libraries such as promptfoo, DeepEval and Ragas.
    </p>
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

export const OtherTools = () => (
  <Section id="other-tools">
    <Heading
      badge="Other tools"
      title="If you build with a visual builder or a framework."
      lead="They build and run workflows too. The question is where the workflow lives and how you learn what to change."
    />
    <div className="mx-auto mt-12 grid max-w-5xl gap-4 lg:grid-cols-2">
      {OTHER_TOOLS.map((tool) => (
        <Card key={tool.name}>
          <CardHeader className="flex flex-col gap-1">
            <CardTitle className="text-xl">{tool.name}</CardTitle>
            <span className="text-sm text-muted-foreground">{tool.examples}</span>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground">{tool.fits}</p>
            <p className="font-medium">{tool.aqven}</p>
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
