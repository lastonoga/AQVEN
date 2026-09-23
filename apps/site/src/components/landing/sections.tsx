import {
  Blocks,
  ChartLine,
  Database,
  FileText,
  Globe,
  Layers,
  Lock,
  Rocket,
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
  CostLatencySchematic,
  EvalGateSchematic,
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
    body: "Run the same dataset before and after. The gate reports which scores went up, which went down, and whether it's a real improvement, not a vibe.",
    visual: <EvalGateSchematic />,
  },
  {
    heading: "Fix a bug once. It stays fixed.",
    body: "A bug you fixed without a case for it comes back next edit. Pin the exact input that broke it as a dataset case, and the fix survives the next change, yours or your agent's.",
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
    description: "The cases that must keep working.",
    href: "/studio/datasets/",
  },
  {
    icon: <ChartLine className="size-5" />,
    title: "Evaluations",
    description: "Score a change before you ship it.",
    href: "/studio/evals/",
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
