import {
  ArrowRight,
  Compass,
  FileCode,
  GitCompareArrows,
  RotateCw,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { cn } from "cn";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActorTag, TimelineStep, type Actor, type TimelineEntry } from "@/components/landing/actors";
import {
  CheckBeforeItRunsSchematic,
  ContractBreakSchematic,
  CostLatencySchematic,
  RealFilesSchematic,
  RepoOwnershipSchematic,
  ReviewLikeCodeSchematic,
  RunTraceSchematic,
} from "@/components/landing/schematics";
import {
  SITUATIONS,
  USE_CASES_PATH,
  situationHref,
  type Situation,
  type SituationId,
} from "@/components/landing/situations";
import { REPO } from "@/components/landing/site-nav";

const TRUST: readonly string[] = [
  "Alpha",
  "Source available",
  "AQVEN License",
  "Python",
  "Runs locally",
  "No account needed",
];

type Guard = { readonly heading: string; readonly body: string; readonly visual: React.ReactNode };

const GUARDS: readonly Guard[] = [
  {
    heading: "Check it before it runs.",
    body: "aqven check finds broken connections offline, before a run costs a token. It checks the wiring, not whether the answers are right.",
    visual: <CheckBeforeItRunsSchematic />,
  },
  {
    heading: "Review a change like code.",
    body: "A prompt edit shows up in your diff. Your teammate reviews it in a pull request.",
    visual: <ReviewLikeCodeSchematic />,
  },
  {
    heading: "See where an answer went wrong.",
    body: "Every run keeps its full event log. Follow an \"almost right\" answer back to the step that produced it.",
    visual: <RunTraceSchematic />,
  },
  {
    heading: "See what each step costs.",
    body: "Dollar cost and latency for every step of every run. A call nothing can price counts as unknown, not as free.",
    visual: <CostLatencySchematic />,
  },
];

const COMPARE = [
  { row: "Where the logic lives", tracing: "Your code, scattered", builders: "Their platform", aqven: "Files in your repo" },
  { row: "Check before it runs", tracing: "No", builders: "No", aqven: "Yes" },
  { row: "Your coding agent can edit it", tracing: "No", builders: "No", aqven: "Yes" },
  { row: "Yours if they disappear", tracing: "Yes", builders: "No", aqven: "Yes" },
];

const Section = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <section className={cn("py-20 lg:py-28", className)}>
    <div className="container mx-auto px-6">{children}</div>
  </section>
);

const SectionHeading = ({ badge, children }: { badge: string; children: React.ReactNode }) => (
  <>
    <Badge variant="secondary">{badge}</Badge>
    <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl lg:text-5xl">{children}</h2>
  </>
);

export const TrustStrip = () => (
  <div className="border-y border-border bg-background-subtle">
    <div className="container mx-auto flex flex-wrap items-center justify-center gap-2 px-6 py-4">
      {TRUST.map((item) => (
        <Badge key={item} variant="secondary">
          {item}
        </Badge>
      ))}
    </div>
  </div>
);

const SITUATION_ICON: Record<SituationId, React.ReactNode> = {
  find: <Compass className="size-5" aria-hidden="true" />,
  explain: <ScanSearch className="size-5" aria-hidden="true" />,
  compare: <GitCompareArrows className="size-5" aria-hidden="true" />,
  confirm: <ShieldCheck className="size-5" aria-hidden="true" />,
  build: <FileCode className="size-5" aria-hidden="true" />,
};

const SituationCard = ({ situation }: { situation: Situation }) => (
  <li className="w-full sm:w-[calc(50%-0.5rem)] lg:w-auto lg:min-w-0 lg:flex-1 lg:basis-0">
    <a
      href={situationHref(situation.id)}
      className="group flex h-full flex-col gap-3 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 transition-[box-shadow,--tw-ring-color] duration-200 hover:shadow-md hover:ring-foreground/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-background text-foreground ring-1 ring-foreground/10">
          {SITUATION_ICON[situation.id]}
        </span>
        <ArrowRight
          className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden="true"
        />
      </span>
      <h3 className="text-2xl font-semibold tracking-tight">{situation.verb}</h3>
      <p className="text-muted-foreground italic">&ldquo;{situation.question}&rdquo;</p>
      <p className="mt-auto pt-1 text-sm text-foreground">{situation.summary}</p>
    </a>
  </li>
);

export const Situations = () => (
  <Section>
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
      <SectionHeading badge="What it’s for">Find. Explain. Compare. Confirm. Build.</SectionHeading>
    </div>
    <ul className="mx-auto mt-12 flex max-w-6xl flex-wrap justify-center gap-4 lg:mt-16 lg:flex-nowrap">
      {SITUATIONS.map((situation) => (
        <SituationCard key={situation.id} situation={situation} />
      ))}
    </ul>
    <div className="mt-12 flex justify-center">
      <Button variant="outline" size="lg" asChild>
        <a href={USE_CASES_PATH}>All use cases</a>
      </Button>
    </div>
  </Section>
);

export const StudioEvidence = () => (
  <Section>
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
      <SectionHeading badge="Evidence">Built for inspection, not blind trust.</SectionHeading>
      <p className="text-muted-foreground lg:text-lg">
        AQVEN shows whether a result is promising, confirmed within its scope, inconclusive or invalid.
      </p>
    </div>
    <div className="mx-auto mt-14 grid max-w-5xl items-start gap-6 md:grid-cols-2 lg:mt-16">
      {GUARDS.map((guard) => (
        <Card key={guard.heading}>
          <CardHeader>
            <CardTitle className="text-xl">{guard.heading}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {guard.visual}
            <p className="text-muted-foreground">{guard.body}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  </Section>
);

type LoopRole = { readonly actor: Actor; readonly title: string; readonly body: string };

const LOOP_ROLES: readonly LoopRole[] = [
  {
    actor: "You",
    title: "Set the question.",
    body: "What to find out, what counts as success, and the budget.",
  },
  {
    actor: "Agent",
    title: "Do the experimental work.",
    body: "Prepares variations, runs the experiments, inspects the results, proposes the next step.",
  },
  {
    actor: "AQVEN",
    title: "Keep the evidence.",
    body: "Runs the workflow, records every run, applies your checks and computes verdicts.",
  },
  {
    actor: "You",
    title: "Decide.",
    body: "What to change, what to confirm, and what still needs investigation.",
  },
];

const LOOP_STEPS: readonly TimelineEntry[] = [
  {
    actors: ["Agent"],
    title: "Build it and run it.",
    body: "Flows, nodes and prompts as files. Every run leaves a full trace.",
  },
  {
    actors: ["You", "Agent"],
    title: "Bet on the riskiest failure.",
    body: "You agree the failure modes. The hypothesis is written before any numbers.",
  },
  {
    actors: ["Agent", "AQVEN"],
    title: "Explore on working cases.",
    body: "One change at a time. 95% intervals, not one lucky run.",
  },
  {
    actors: ["AQVEN"],
    title: "Confirm on held-out cases.",
    body: "Cases kept apart while exploring. Confirmed, refuted or inconclusive.",
  },
  {
    actors: ["AQVEN", "Agent"],
    title: "Keep the finding.",
    body: "The verdict goes into FINDINGS.md. The failing case is tagged regression.",
  },
];

export const ResearchLoop = () => (
  <Section className="bg-background-subtle">
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
      <SectionHeading badge="The research loop">Your agent does the work. You direct the investigation.</SectionHeading>
    </div>
    <ol className="mx-auto mt-12 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {LOOP_ROLES.map((role) => (
        <li key={role.title} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
          <span className="self-start">
            <ActorTag actor={role.actor} />
          </span>
          <span className="font-medium tracking-tight">{role.title}</span>
          <span className="text-sm text-muted-foreground">{role.body}</span>
        </li>
      ))}
    </ol>
    <div className="mx-auto mt-14 grid max-w-6xl items-start gap-10 lg:mt-16 lg:grid-cols-2">
      <div className="flex flex-col">
        <ol>
          {LOOP_STEPS.map((step, index) => (
            <TimelineStep key={step.title} index={index} entry={step} last={index === LOOP_STEPS.length - 1} headingLevel={3} />
          ))}
        </ol>
        <span className="mt-7 ml-12 flex items-center gap-1.5 self-start rounded-full border border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground">
          <RotateCw className="size-3" aria-hidden="true" /> next round, on fresh cases
        </span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Caught by an experiment, not by a customer.</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ContractBreakSchematic />
          <p className="text-muted-foreground">
            Triage wrote past its 200-character limit three tries in a row. The engine refused each
            output, and the agent&rsquo;s next experiment measures how often it happens.
          </p>
        </CardContent>
      </Card>
    </div>
    <div className="mt-14 flex flex-col items-center justify-center gap-2 sm:flex-row">
      <Button variant="outline" size="lg" asChild>
        <a href="/studio/research/">Research in Studio</a>
      </Button>
      <Button size="lg" asChild>
        <a href="/mcp-cli/research-loop/">How the agent&rsquo;s loop works</a>
      </Button>
    </div>
  </Section>
);

export const Comparison = () => (
  <Section className="bg-background-subtle">
    <div className="mx-auto max-w-3xl text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
        Not a tracing tool. Not a drag-and-drop builder.
      </h2>
    </div>
    <div className="mx-auto mt-12 max-w-4xl">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead> </TableHead>
            <TableHead>Tracing tools</TableHead>
            <TableHead>Visual builders</TableHead>
            <TableHead className="font-semibold text-foreground">AQVEN</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {COMPARE.map((item) => (
            <TableRow key={item.row}>
              <TableCell className="whitespace-normal font-medium">{item.row}</TableCell>
              <TableCell className="whitespace-normal text-muted-foreground">{item.tracing}</TableCell>
              <TableCell className="whitespace-normal text-muted-foreground">{item.builders}</TableCell>
              <TableCell className="whitespace-normal font-medium">{item.aqven}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </Section>
);

export const Stack = () => (
  <Section>
    <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl">Keep your models. Keep your code.</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground">
            AQVEN runs on your machine, next to your application, with the workflow in your own repo.
          </p>
          <RealFilesSchematic />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl">Source available.</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground">
            Read the code, run it and change it: your workflows stay yours, whatever happens to us.
          </p>
          <RepoOwnershipSchematic />
          <a
            href={REPO}
            className="inline-flex text-sm font-medium underline underline-offset-4"
          >
            View on GitHub
          </a>
        </CardContent>
      </Card>
    </div>
  </Section>
);

type Faq = { readonly question: string; readonly answer: string };

const FAQS: readonly Faq[] = [
  {
    question: "Is AQVEN open source?",
    answer:
      "No. It is source-available under the AQVEN License 1.0.0: you can read, run and change the code, and commercial redistribution is restricted.",
  },
  {
    question: "Is AQVEN ready for production?",
    answer: "AQVEN is in alpha: expect changes between releases. Try it on a workflow you can afford to change.",
  },
  {
    question: "What models and providers does AQVEN support?",
    answer:
      "OpenAI, Anthropic, Google Gemini, OpenRouter, Mistral, DeepSeek and more. Swap a model per agent without touching the rest.",
  },
  {
    question: "Do I need an account or a cloud service?",
    answer: "Not for AQVEN: it runs on your machine, nothing hosted by us. Model calls use your own provider keys.",
  },
  {
    question: "Can my coding agent actually edit these workflows?",
    answer: "Yes. Every flow, node and prompt is a plain file your agent can read, edit and check.",
  },
  {
    question: "Can my coding agent run experiments?",
    answer:
      "Yes, through MCP tools or the aqven series command, and AQVEN computes the statistics. Near your spend cap, a series waits for a person to continue it in Studio.",
  },
  {
    question: "Does AQVEN replace my application, or run alongside it?",
    answer:
      "Alongside it, with your providers and your tools. The workflow itself moves into AQVEN files in your repo: AQVEN doesn't trace one you already have.",
  },
  {
    question: "What happens to my workflows if AQVEN goes away?",
    answer: "They stay yours. Every flow, node, prompt and dataset is a file in your own repo.",
  },
];

export const FAQ = () => (
  <Section className="bg-background-subtle">
    <div className="mx-auto max-w-3xl text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl lg:text-5xl">
        Frequently asked questions.
      </h2>
    </div>
    <Accordion type="single" collapsible className="mx-auto mt-14 w-full max-w-2xl">
      {FAQS.map((faq) => (
        <AccordionItem key={faq.question} value={faq.question}>
          <AccordionTrigger className="text-left text-base font-medium">
            {faq.question}
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  </Section>
);
