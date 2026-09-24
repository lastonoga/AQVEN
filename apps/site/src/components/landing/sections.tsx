import {
  Blocks,
  ChartLine,
  CircleCheck,
  Database,
  FileText,
  Globe,
  Layers,
  Lock,
  Rocket,
  RotateCw,
  Settings,
  Shield,
  Sparkles,
  Workflow,
  Zap,
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
import {
  CheckBeforeItRunsSchematic,
  ContractBreakSchematic,
  CostLatencySchematic,
  SeriesVerdictSchematic,
  MiniCheckPassedSchematic,
  MiniTypeMismatchSchematic,
  RealFilesSchematic,
  RegressionCaseSchematic,
  RepoOwnershipSchematic,
  ReviewLikeCodeSchematic,
  RunTraceSchematic,
  ScatteredFilesSchematic,
} from "@/components/landing/schematics";

const REPO = "https://github.com/lastonoga/AQVEN";

const TRUST = ["Source available", "AQVEN License", "Python", "Runs locally", "No account needed"];

const QUOTES = [
  "I don't recognize half of this.",
  "Did it connect that output to the next step, or does it only look like it did?",
  "It reorganized three steps. What did it drop?",
  "It feels worse than last month. I can't prove it.",
];

const STAKES = [
  { icon: <ChartLine className="size-5" />, label: "Refunds" },
  { icon: <FileText className="size-5" />, label: "Invoices" },
  { icon: <Shield className="size-5" />, label: "Approvals" },
  { icon: <Database className="size-5" />, label: "Records" },
];

const GUARDS: { heading: string; body: string; visual: React.ReactNode }[] = [
  {
    heading: "Check it before it runs.",
    body: "Broken connections between steps, inputs that don't match, a prompt pointing at something that isn't there. Caught before a customer finds it.",
    visual: <CheckBeforeItRunsSchematic />,
  },
  {
    heading: "Review a change like code.",
    body: "A prompt edit shows up in your diff. Your teammate reviews the logic in a pull request, the same as everything else you ship.",
    visual: <ReviewLikeCodeSchematic />,
  },
  {
    heading: "No more guessing why an answer went wrong.",
    body: "Every run keeps its full event log: what each step received, what it returned, what it cost. An \"almost right\" answer stops being a guess.",
    visual: <RunTraceSchematic />,
  },
  {
    heading: "Know an edit helped, before you ship it.",
    body: "Write the question and its margin down first, then run every case for every variant, several times. The verdict comes from a 95% interval against that margin: confirmed, refuted or inconclusive, not a vibe.",
    visual: <SeriesVerdictSchematic />,
  },
  {
    heading: "Fix a bug once. It stays fixed.",
    body: "A bug you fixed without a case for it comes back next edit. Turn the run that broke into a case tagged regression, and after each change, yours or your agent's, one experiment over that tag runs them all again.",
    visual: <RegressionCaseSchematic />,
  },
  {
    heading: "No surprise on the bill.",
    body: "Every step's dollar cost and latency, per run. The expensive node is visible before it becomes a surprise on the bill.",
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

export const Problem = () => (
  <Section>
    <div className="mx-auto max-w-3xl text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl lg:text-5xl">
        AI workflows get hard to follow, fast.
      </h2>
      <p className="mt-6 text-muted-foreground lg:text-lg">
        The prompt is in one file. The model settings are in another. Routing lives in code. Tools
        are somewhere else. Then your coding agent edits ten things at once, twice a week.
      </p>
      <p className="mt-4 text-muted-foreground lg:text-lg">
        A month in, nobody on the team can say what actually happens, and it&rsquo;s not a demo. It
        runs thousands of times before anyone notices something drifted.
      </p>
    </div>
    <div className="mx-auto mt-14 max-w-3xl">
      <ScatteredFilesSchematic />
    </div>
    <div className="mx-auto mt-14 grid max-w-4xl gap-x-12 gap-y-7 sm:grid-cols-2">
      {QUOTES.map((quote) => (
        <blockquote key={quote} className="border-l-2 border-border pl-5">
          <p className="text-muted-foreground italic lg:text-lg">&ldquo;{quote}&rdquo;</p>
        </blockquote>
      ))}
    </div>
    <div className="mx-auto mt-14 flex max-w-3xl flex-wrap items-center justify-center gap-x-10 gap-y-4">
      {STAKES.map((item) => (
        <span
          key={item.label}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
        >
          {item.icon}
          {item.label}
        </span>
      ))}
    </div>
  </Section>
);

export const StudioEvidence = () => (
  <Section>
    <div className="mx-auto max-w-3xl text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl lg:text-5xl">
        Your team can finally read the workflow.
      </h2>
    </div>
    <div className="mx-auto mt-14 grid max-w-6xl items-start gap-6 md:grid-cols-2 lg:mt-20 lg:grid-cols-3">
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

type LoopActor = "You" | "Agent" | "AQVEN";

const ACTOR_STYLE: Record<LoopActor, string> = {
  You: "border-border bg-accent text-foreground",
  Agent: "border-llm-border bg-llm-bg text-llm",
  AQVEN: "border-border bg-background text-muted-foreground",
};

const LOOP_STEPS: { actor: LoopActor; title: string; body: string }[] = [
  {
    actor: "You",
    title: "State the task.",
    body: "What goes in, what comes out, and what counts as done.",
  },
  {
    actor: "Agent",
    title: "Build it and run it.",
    body: "Flows, nodes and prompts as files. aqven check passes first, then every run leaves a full trace.",
  },
  {
    actor: "Agent",
    title: "Bet on the riskiest failure.",
    body: "It reads the failing runs, groups them into failure modes, and turns the riskiest into a hypothesis with a metric and a margin, written down before any number comes back.",
  },
  {
    actor: "AQVEN",
    title: "Explore on working cases.",
    body: "The experiment runs every case on every variant, several times. The agent reads 95% intervals, not one lucky run.",
  },
  {
    actor: "Agent",
    title: "Fix the flow.",
    body: "One change at a time, measured again on the same working cases.",
  },
  {
    actor: "AQVEN",
    title: "Confirm on held-out cases.",
    body: "Cases the agent never tuned on. The verdict: confirmed, refuted or inconclusive.",
  },
  {
    actor: "Agent",
    title: "Keep the finding.",
    body: "The verdict is written to FINDINGS.md and the case that broke stays in the dataset. Rounds repeat until everything you called done is confirmed.",
  },
];

const LOOP_LIMITS = [
  "Only a series on held-out cases writes a finding. On working cases the verdict stays a signal.",
  "AQVEN runs the attempts and does the statistics. The agent quotes the verdict; it never computes one.",
  "A series that would cost more than your spend cap waits for you in Studio.",
  "A finding edited by hand fails aqven check.",
];

const LoopStep = ({ index, step, last }: { index: number; step: (typeof LOOP_STEPS)[number]; last: boolean }) => (
  <li className="flex gap-4">
    <span className="flex flex-col items-center">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-xs font-medium text-foreground">
        {index + 1}
      </span>
      {!last && <span aria-hidden="true" className="my-1 w-px flex-1 bg-border" />}
    </span>
    <div className="flex min-w-0 flex-col gap-1 pb-7">
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <h3 className="font-medium tracking-tight">{step.title}</h3>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium",
            ACTOR_STYLE[step.actor],
          )}
        >
          {step.actor}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{step.body}</p>
    </div>
  </li>
);

export const ResearchLoop = () => (
  <Section>
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
      <Badge variant="secondary">The research loop</Badge>
      <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl lg:text-5xl">
        Your agent keeps testing until the workflow holds.
      </h2>
      <p className="text-muted-foreground lg:text-lg">
        You state the task. The agent builds the workflow, runs it, bets on what could break and
        tests each bet across agents. AQVEN runs the experiments and writes the verdicts. Round
        after round, until the workflow is reliable and you can see why.
      </p>
    </div>
    <div className="mx-auto mt-14 grid max-w-6xl items-start gap-10 lg:mt-20 lg:grid-cols-2">
      <div className="flex flex-col">
        <ol>
          {LOOP_STEPS.map((step, index) => (
            <LoopStep key={step.title} index={index} step={step} last={index === LOOP_STEPS.length - 1} />
          ))}
        </ol>
        <span className="ml-12 flex items-center gap-1.5 self-start rounded-full border border-border bg-background-subtle px-3 py-1 font-mono text-xs text-muted-foreground">
          <RotateCw className="size-3" aria-hidden="true" /> next round, on fresh cases
        </span>
      </div>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Caught by an experiment, not by a customer.</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ContractBreakSchematic />
            <p className="text-muted-foreground">
              In the showcase example, the triage step runs on gemini-2.5-flash-lite. During an
              experiment it wrote an observation longer than the 200 characters its type allows,
              three tries in a row. The engine refused the output each time, as designed, and the
              attempt counted as a failure of the model, not of the infrastructure. The prompt
              already stated the limit, so this is a risk to measure, not a typo: the agent&rsquo;s
              next experiment tests how often triage breaks its contract, with another agent beside it.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">What the agent can&rsquo;t fake.</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {LOOP_LIMITS.map((limit) => (
                <li key={limit} className="flex items-start gap-2.5">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  <span className="text-sm text-muted-foreground">{limit}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
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
            AQVEN runs next to your application: your providers, your tools, your stack. Python, on
            your machine, with the workflow committed in your own repo. Here&rsquo;s an actual node,
            not a mockup:
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
            Read the code. Run it yourself. Change it to fit how your team works. Your workflows are
            files in your repo: they&rsquo;re yours, and they stay yours whatever happens to us.
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

const FAQS = [
  {
    question: "Is AQVEN open source?",
    answer:
      "No. AQVEN is source-available under the AQVEN License 1.0.0, a modified PolyForm Shield license: you can read the code, run it and change it, and the license restricts commercial redistribution.",
  },
  {
    question: "What models and providers does AQVEN support?",
    answer:
      "OpenAI, Anthropic, Google Gemini, OpenRouter, Mistral, DeepSeek and more, through one provider catalog. Swap a model per agent without touching the rest of the workflow.",
  },
  {
    question: "Do I need an account or a cloud service?",
    answer:
      "No. uv tool install aqven runs locally: Python, SQLite, your own machine. Nothing to sign up for, nothing hosted by us.",
  },
  {
    question: "Can my coding agent actually edit these workflows?",
    answer:
      "Yes, that's the point. Every flow, node and prompt is a plain file your agent can read, edit and check, the same way it already edits your application code.",
  },
  {
    question: "Can my coding agent test the workflow on its own?",
    answer:
      "Yes. It starts experiments through the project's MCP tools or the aqven series command, and AQVEN runs the attempts and computes the statistics. It explores on working cases as often as it needs, and only a series on held-out cases writes a finding. A series that would cost more than your spend cap waits for your approval in Studio.",
  },
  {
    question: "Does AQVEN replace my application, or run alongside it?",
    answer:
      "Alongside it. AQVEN runs next to your existing application, using your providers and your tools. The workflow is a set of files in your repo, not a separate platform.",
  },
  {
    question: "What happens to my workflows if AQVEN goes away?",
    answer:
      "They stay yours. Every flow, node, prompt and dataset is already a file committed to your own repo, not a definition trapped in someone else's platform.",
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

const CASE_STUDY_STATS = [
  { value: "1 week → 1 day", label: "to a better workflow" },
  { value: "~$30", label: "for the whole experiment" },
  { value: "~500", label: "versions of the workflow, prompts and models" },
];

export const Testimonial = () => (
  <Section>
    <div className="mx-auto max-w-3xl">
      <Badge variant="secondary">Why I built this</Badge>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
        I spent a week tuning it by hand. The next round took a day and $30.
      </h2>
      <div className="mt-8 space-y-4 text-muted-foreground">
        <p>
          I built Tonicc, an app that scans your face and suggests skincare. It isn&rsquo;t a
          medical diagnosis, but getting it wrong still has a cost: a false alarm, a confusing
          result, the wrong product. So every scan goes through about 250 model calls. It uses
          different crops, models and prompts, then cross-checks and validates the results, with a
          final step that decides when they disagree.
        </p>
        <p>
          The first version took me a week. I&rsquo;d change a prompt, try another model, rerun
          the tests, read what broke and start again.
        </p>
        <p>
          For the next version I handed that loop to Claude inside AQVEN Studio. Its job was to
          look up how vision tasks like this usually fail and pick the riskiest guess about what
          was wrong with mine. Then it tested that guess, wrote down what happened and moved on to
          the next one. In about a day it tried roughly 500 versions of the workflow, prompts and
          models, for about $30. The result was more stable and worked better than the version
          I&rsquo;d spent a week on.
        </p>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-6 border-y border-border py-8 sm:grid-cols-3">
        {CASE_STUDY_STATS.map((stat) => (
          <div key={stat.label} className="text-center sm:text-left">
            <div className="font-mono text-2xl font-semibold text-foreground">{stat.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-10 text-xl font-medium text-balance md:text-2xl">
        &ldquo;The model isn&rsquo;t the system. The loop around it is.&rdquo;
      </p>
      <div className="mt-6 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-foreground">
          KB
        </span>
        <div>
          <div className="font-semibold">Kir Burkhanov</div>
          <div className="text-sm text-muted-foreground">Author of AQVEN</div>
        </div>
      </div>
    </div>
  </Section>
);

export const AGENT_FEATURES = [
  {
    icon: <Workflow className="size-5" />,
    title: "It reads the whole workflow before it edits.",
    description: "Steps, inputs, outputs, and what connects to what.",
  },
  {
    icon: <Lock className="size-5" />,
    title: "It can't wire two steps together wrong.",
    description: "Types don't match, the check fails before production does.",
    visual: <MiniTypeMismatchSchematic />,
  },
  {
    icon: <Shield className="size-5" />,
    title: "It has to pass a check before it can say it's done.",
    description: "A change that doesn't hold together never reaches you.",
    visual: <MiniCheckPassedSchematic />,
  },
  {
    icon: <Sparkles className="size-5" />,
    title: "The docs are written for it, not only for you.",
    description: "Every page also ships as llms.txt, a plain-Markdown index an agent fetches before it edits.",
  },
];

export const INSIDE_FEATURES = [
  {
    icon: <Workflow className="size-5" />,
    title: "Workflows",
    description: "Steps, order, and what connects to what.",
    href: "/concepts/files-as-source-of-truth/",
    wide: true,
  },
  {
    icon: <Blocks className="size-5" />,
    title: "Nodes",
    description: "Model calls, tools, code, branches, loops.",
    href: "/concepts/ten-kinds-of-nodes/",
  },
  {
    icon: <FileText className="size-5" />,
    title: "Prompts",
    description: "Separate files, versioned and previewable.",
    href: "/engine/prompts/",
  },
  {
    icon: <Settings className="size-5" />,
    title: "Tools",
    description: "Python functions and MCP connections.",
    href: "/engine/tool-node/",
  },
  {
    icon: <Layers className="size-5" />,
    title: "Types",
    description: "Typed inputs and outputs between steps.",
    href: "/concepts/agent-inference-and-the-llm-node/",
  },
  {
    icon: <Globe className="size-5" />,
    title: "Providers",
    description: "Your models, your keys.",
    href: "/integrations/model-providers/",
  },
  {
    icon: <Zap className="size-5" />,
    title: "Runs",
    description: "Every execution, recorded and inspectable.",
    href: "/studio/investigate-a-run/",
    wide: true,
  },
  {
    icon: <Database className="size-5" />,
    title: "Datasets",
    description: "Tagged cases, split into working and held-out.",
    href: "/studio/cases/",
  },
  {
    icon: <ChartLine className="size-5" />,
    title: "Experiments",
    description: "Hypotheses tested across agents, with a verdict.",
    href: "/studio/research/",
  },
  {
    icon: <Shield className="size-5" />,
    title: "Human review",
    description: "Steps that wait for a person.",
    href: "/studio/respond-to-a-review/",
  },
  {
    icon: <Rocket className="size-5" />,
    title: "Debugging",
    description: "Find the step where it went wrong.",
    href: "/concepts/finding-the-node-that-went-wrong/",
  },
  {
    icon: <Sparkles className="size-5" />,
    title: "For coding agents",
    description: "Project context an agent can read.",
    href: "/mcp-cli/connect-an-agent/",
    wide: true,
  },
];

export const WhatsInside = () => (
  <Section className="bg-background-subtle">
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
      <Badge variant="secondary">What&rsquo;s inside</Badge>
      <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl lg:text-5xl">
        Every part of an AI workflow, documented.
      </h2>
    </div>
    <div className="mx-auto mt-14 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {INSIDE_FEATURES.map((item) => (
        <Card
          key={item.title}
          className={cn(
            "relative transition-[transform,box-shadow,--tw-ring-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "hover:-translate-y-0.5 hover:ring-foreground/20 hover:shadow-md active:translate-y-0",
            item.wide && "bg-linear-to-br from-muted via-card to-card lg:col-span-2",
          )}
        >
          {item.wide && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(to_bottom_right,black,transparent_65%)]"
            />
          )}
          <CardContent className="relative flex flex-col items-start gap-3">
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-full text-muted-foreground",
                item.wide ? "bg-background text-foreground ring-1 ring-foreground/10" : "bg-accent",
              )}
            >
              {item.icon}
            </span>
            <span className={cn("font-medium tracking-tight", item.wide && "text-base")}>
              <a href={item.href} className="after:absolute after:inset-0">
                {item.title}
              </a>
            </span>
            <span className="text-sm text-muted-foreground">{item.description}</span>
          </CardContent>
        </Card>
      ))}
    </div>
    <div className="mt-14 flex justify-center">
      <Button size="lg" asChild>
        <a href="/start/">Read the documentation</a>
      </Button>
    </div>
  </Section>
);
