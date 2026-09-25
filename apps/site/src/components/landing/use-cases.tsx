import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, CircleAlert } from "lucide-react";
import { cn } from "cn";
import { Card, CardContent } from "@/components/ui/card";
import { ActorTag, TimelineStep, type Actor, type TimelineEntry } from "@/components/landing/actors";
import {
  ContractBreakSchematic,
  CostLatencySchematic,
  RegressionCaseSchematic,
  RunTraceSchematic,
  SeriesVerdictSchematic,
} from "@/components/landing/schematics";
import {
  SITUATIONS,
  type DocLink,
  type Situation,
  type SituationId,
} from "@/components/landing/situations";

type Story = {
  readonly situation: string;
  readonly steps: readonly [TimelineEntry, TimelineEntry, TimelineEntry];
  readonly limit: string;
  readonly visual: ReactNode;
  readonly caption: string;
  readonly more: DocLink;
};

type Role = {
  readonly actor: Actor;
  readonly body: string;
};

type Tone = "error" | "plain";

type OutputLine = {
  readonly tone: Tone;
  readonly text: string;
};

const ROLES: readonly Role[] = [
  {
    actor: "You",
    body: "You set the direction, read the evidence, agree what counts as a failure and decide what ships.",
  },
  {
    actor: "Agent",
    body: "Your coding agent edits the workflow files, writes cases and experiments, and lines up runs for you to read.",
  },
  {
    actor: "AQVEN",
    body: "AQVEN checks the files, runs flows and series, writes the verdicts and keeps the findings.",
  },
];

const CHECK_COMMAND = "aqven check";

const TONE_STYLE: Readonly<Record<Tone, string>> = {
  error: "text-destructive",
  plain: "text-muted-foreground",
};

const CHECK_OUTPUT: readonly OutputLine[] = [
  {
    tone: "error",
    text: "flows/support_case/nodes/triage/triage.node.yaml:8:3: error E_REF_MISSING in[0].from: reference $prepare.out.messages: the value has no field messages",
  },
  { tone: "plain", text: "errors: 1, warnings: 0" },
];

const CheckOutputVisual = () => (
  <div className="overflow-hidden rounded-lg border border-border">
    <div className="flex items-center gap-1.5 border-b border-border bg-background-subtle px-3 py-2">
      <span className="size-2 rounded-full bg-border" />
      <span className="size-2 rounded-full bg-border" />
      <span className="size-2 rounded-full bg-border" />
    </div>
    <div className="flex flex-col gap-1.5 bg-card px-3 py-2.5 font-mono text-xs leading-relaxed">
      <span className="text-muted-foreground">
        <span className="text-success">$ </span>
        {CHECK_COMMAND}
      </span>
      {CHECK_OUTPUT.map((line) => (
        <span key={line.text} className={cn("wrap-anywhere", TONE_STYLE[line.tone])}>
          {line.text}
        </span>
      ))}
    </div>
  </div>
);

const STORIES: Readonly<Record<SituationId, Story>> = {
  find: {
    situation:
      "The workflow almost works. But you hand-picked a few examples, and you can't say how it behaves on inputs you haven't tried.",
    steps: [
      {
        actors: ["You"],
        title: "Hand your agent a question.",
        body: "Say what the flow is for, what counts as done and how much it may spend.",
      },
      {
        actors: ["Agent", "You"],
        title: "It writes cases, you name the failures.",
        body: "Cases span risks such as length or channel. You read the failing runs first and agree the failure modes.",
      },
      {
        actors: ["Agent", "AQVEN"],
        title: "Test the riskiest one.",
        body: "The agent writes an experiment, metric first. AQVEN runs it on working cases: a signal, not yet a finding.",
      },
    ],
    limit: "The agent can tell a plausible story, and nothing in the engine checks that you read the traces.",
    visual: <ContractBreakSchematic />,
    caption:
      "Triage on gemini-2.5-flash-lite wrote more than the 200 characters its type allows, on all three tries.",
    more: { label: "A day with AQVEN", href: "/start/a-day-with-aqven/" },
  },
  explain: {
    situation:
      "The final answer fails a check. The cause could be the context, one step, the model, a contract between steps or the infrastructure. Rewriting the last prompt is a guess.",
    steps: [
      {
        actors: ["You"],
        title: "Open the run in Studio.",
        body: "A Failed steps panel lists every failed execution in plain words, with its error code and a hint.",
      },
      {
        actors: ["You"],
        title: "Walk back to the first failure.",
        body: "Click a step: what it read, the prompt as sent, what came back. Later failures often follow from the first.",
      },
      {
        actors: ["You", "Agent"],
        title: "Test the suspicion.",
        body: "Rerun just that step with a changed prompt. Then an experiment checks the fix beyond the one run you saw.",
      },
    ],
    limit: "A trace shows where a failure appeared, not why.",
    visual: <RunTraceSchematic />,
    caption: "One card per step, with what it received and returned. Read back from the output.",
    more: { label: "From a bad answer to a verified fix", href: "/start/engineering-loop-walkthrough/" },
  },
  compare: {
    situation:
      "A new model came out, or the current version costs too much and passes one day, fails the next. You want variants compared on your own cases.",
    steps: [
      {
        actors: ["Agent", "You"],
        title: "Write the comparison down first.",
        body: "One experiment, one factor. The metric and your margin go in the file before any data.",
      },
      {
        actors: ["AQVEN"],
        title: "Run both on the same cases, several times.",
        body: "Every variant runs every selected case, with repeats. The series pauses near your spend cap.",
      },
      {
        actors: ["You"],
        title: "Read quality, cost and latency side by side.",
        body: "Each metric gets a value and a 95% interval. Filter to the cases where variants disagree and open their runs.",
      },
    ],
    limit:
      "It measures your criteria on your cases, not a leaderboard, and doesn't check that variants got an equal budget.",
    visual: <CostLatencySchematic />,
    caption: "Each finished step logs its model, time, tokens and cost. The expensive one stands out.",
    more: { label: "How to follow and read a series in Studio", href: "/studio/series/" },
  },
  confirm: {
    situation:
      "Your agent proposed an improvement, and the examples you work with pass. That can be a real effect, or a fix tuned to the cases it saw.",
    steps: [
      {
        actors: ["Agent"],
        title: "Explore on working cases.",
        body: "Every dataset is split in half. On the working half the agent iterates freely and gets signals, never findings.",
      },
      {
        actors: ["AQVEN"],
        title: "Confirm once on held-out cases.",
        body: "When the question is frozen, one series runs on the held-out half, cases the agent never sees one by one.",
      },
      {
        actors: ["AQVEN", "You"],
        title: "Read the verdict AQVEN writes.",
        body: "Confirmed, refuted or inconclusive, from the 95% interval and your margin. It lands in FINDINGS.md with its scope.",
      },
    ],
    limit: "A green verdict is not a production guarantee: it holds for the cases, checks and versions it measured.",
    visual: (
      <div className="flex flex-col gap-3">
        <SeriesVerdictSchematic />
        <RegressionCaseSchematic />
      </div>
    ),
    caption: "A held-out verdict against a margin set before the data, and the case that broke, tagged regression.",
    more: { label: "How a series decides", href: "/concepts/how-a-series-decides/" },
  },
  build: {
    situation:
      "Your coding agent builds a new AI process fast. A few weeks in, the prompt, the routing and the logic are spread across code nobody on the team can follow.",
    steps: [
      {
        actors: ["Agent"],
        title: "Flows, nodes and prompts as typed files.",
        body: "A flow is a folder in your repo. Prompts live in Markdown files, and every change shows in your diff.",
      },
      {
        actors: ["AQVEN"],
        title: "aqven check before a run.",
        body: "It validates every file and binding, then simulates each flow with a stand-in model. No network, no API key.",
      },
      {
        actors: ["Agent"],
        title: "Your agent edits the same files.",
        body: "Claude Code, Codex or Cursor connect over MCP. Structural changes go through flow_patch: every file lands, or none does.",
      },
    ],
    limit: "A passing check means the structure holds together, not that the logic is right.",
    visual: <CheckOutputVisual />,
    caption: "Real output from the docs: one typo in a binding, reported with file, line and rule before any model call.",
    more: { label: "How to check a project before committing", href: "/engine/check/" },
  },
};

const sectionBackground = (index: number): string => (index % 2 === 1 ? "bg-background-subtle" : "");

const Label = ({ children }: { children: ReactNode }) => (
  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</h3>
);

const DocLinks = ({ links }: { links: readonly DocLink[] }) => (
  <div className="flex flex-col gap-3">
    <Label>Read more</Label>
    <ul className="flex flex-col gap-2">
      {links.map((link) => (
        <li key={link.href}>
          <a
            href={link.href}
            className="group inline-flex items-start gap-1.5 text-sm font-medium underline underline-offset-4"
          >
            {link.label}
            <ArrowRight
              className="mt-0.5 size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </a>
        </li>
      ))}
    </ul>
  </div>
);

const SituationHeader = ({ situation, index }: { situation: Situation; index: number }) => (
  <div className="flex flex-col gap-4">
    <div className="flex items-center gap-3">
      <span className="rounded-md border border-border bg-card px-3 py-1 text-base font-semibold tracking-tight text-foreground">
        {situation.verb}
      </span>
      <span className="font-mono text-xs text-muted-foreground">
        {index + 1} / {SITUATIONS.length}
      </span>
    </div>
    <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl lg:text-5xl">{situation.title}</h2>
    <p className="text-lg text-muted-foreground italic">&ldquo;{situation.question}&rdquo;</p>
  </div>
);

const SituationSection = ({ situation, index }: { situation: Situation; index: number }) => {
  const story = STORIES[situation.id];
  return (
    <section id={situation.id} className={cn("scroll-mt-20 py-16 lg:py-24", sectionBackground(index))}>
      <div className="container mx-auto px-6">
        <div className="grid items-start gap-12 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-8">
            <SituationHeader situation={situation} index={index} />
            <div className="flex flex-col gap-3">
              <Label>The situation</Label>
              <p className="text-muted-foreground lg:text-lg">{story.situation}</p>
            </div>
            <Card>
              <CardContent className="flex flex-col gap-4">
                <div className="overflow-x-auto">{story.visual}</div>
                <p className="text-sm text-muted-foreground">{story.caption}</p>
              </CardContent>
            </Card>
          </div>
          <div className="flex min-w-0 flex-col gap-8">
            <div className="flex flex-col gap-5">
              <Label>What you do in AQVEN</Label>
              <ol>
                {story.steps.map((step, stepIndex) => (
                  <TimelineStep
                    key={step.title}
                    index={stepIndex}
                    entry={step}
                    last={stepIndex === story.steps.length - 1}
                    headingLevel={4}
                  />
                ))}
              </ol>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-4">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="flex flex-col gap-1.5">
                <Label>What it won&rsquo;t do</Label>
                <p className="text-sm text-foreground">{story.limit}</p>
              </div>
            </div>
            <DocLinks links={[situation.doc, story.more]} />
          </div>
        </div>
      </div>
    </section>
  );
};

export const SituationSections = () => (
  <>
    {SITUATIONS.map((situation, index) => (
      <SituationSection key={situation.id} situation={situation} index={index} />
    ))}
  </>
);

const UseCasesIndex = () => (
  <nav aria-label="Use cases" className="w-full overflow-hidden rounded-xl border border-border bg-card">
    <ol className="divide-y divide-border">
      {SITUATIONS.map((situation, index) => (
        <li key={situation.id}>
          <a
            href={`#${situation.id}`}
            className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-accent sm:px-5"
          >
            <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
              <span className="text-lg font-semibold tracking-tight text-foreground">{situation.verb}</span>
              <span className="text-sm text-muted-foreground">{situation.summary}</span>
            </span>
            <ArrowDown
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5"
              aria-hidden="true"
            />
          </a>
        </li>
      ))}
    </ol>
  </nav>
);

export const useCasesIndexVisual = <UseCasesIndex />;

export const WhoDoesWhat = () => (
  <div className="border-y border-border bg-background-subtle">
    <div className="container mx-auto px-6 py-10">
      <h2 className="sr-only">Who does what</h2>
      <div className="grid gap-8 md:grid-cols-3 lg:gap-12">
        {ROLES.map((role) => (
          <div key={role.actor} className="flex flex-col items-start gap-3">
            <ActorTag actor={role.actor} />
            <p className="text-sm text-muted-foreground lg:text-base">{role.body}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);
