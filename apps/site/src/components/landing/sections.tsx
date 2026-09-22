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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const REPO = "https://github.com/lastonoga/AQVEN";

interface StudioView {
  icon: React.ReactNode;
  title: string;
  summary: string;
  src: string;
  alt: string;
}

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

const STUDIO_VIEWS: StudioView[] = [
  {
    icon: <Workflow className="size-5" />,
    title: "See the whole project",
    summary: "Every workflow in the project, read from your files.",
    src: "/images/studio/project-flows.png",
    alt: "AQVEN Studio showing a project and its workflows",
  },
  {
    icon: <Zap className="size-5" />,
    title: "Find a bad result",
    summary: "A recorded run, with its cost, duration and finished steps.",
    src: "/images/studio/runs.png",
    alt: "AQVEN Studio showing a recorded run with cost, duration and completed steps",
  },
  {
    icon: <Layers className="size-5" />,
    title: "Look inside a step",
    summary: "The exact input and output of a single node.",
    src: "/images/studio/node-inspector.png",
    alt: "AQVEN Studio node inspector showing the input and output of one step",
  },
  {
    icon: <ChartLine className="size-5" />,
    title: "Score a change",
    summary: "Scorers, a dataset and a policy behind one evaluation.",
    src: "/images/studio/evaluations.png",
    alt: "AQVEN Studio evaluations view showing scorers, a dataset and a policy",
  },
  {
    icon: <Database className="size-5" />,
    title: "Keep the cases",
    summary: "The reusable cases every evaluation runs against.",
    src: "/images/studio/dataset-controls.png",
    alt: "AQVEN Studio Datasets tab with a CSV upload, a selected dataset and its list of cases",
  },
];

const GUARDS = [
  {
    heading: "Check it before it runs.",
    body: "Broken connections between steps, inputs that don't match, a prompt pointing at something that isn't there. Caught before a customer finds it.",
  },
  {
    heading: "Review a change like code.",
    body: "A prompt edit shows up in your diff. Your teammate reviews the logic in a pull request, the same as everything else you ship.",
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
    <Tabs
      defaultValue={STUDIO_VIEWS[0].title}
      orientation="vertical"
      className="mt-14 grid grid-cols-1 items-start gap-4 lg:mt-20 lg:grid-cols-5 lg:gap-6"
    >
      <TabsList className="flex h-auto w-full flex-col justify-start gap-1 rounded-xl bg-muted p-1.5 lg:col-span-2">
        {STUDIO_VIEWS.map((view) => (
          <TabsTrigger
            key={view.title}
            value={view.title}
            className="h-auto w-full items-start justify-start rounded-lg px-4 py-3 text-start whitespace-normal"
          >
            <span className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-muted-foreground">{view.icon}</span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{view.title}</span>
                <span className="text-sm font-normal text-muted-foreground">{view.summary}</span>
              </span>
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {STUDIO_VIEWS.map((view) => (
        <TabsContent key={view.title} value={view.title} className="m-0 lg:col-span-3">
          {/* Fixed-ratio frame: the source screenshots range from 1.50 to 4.35 in aspect, so
              each one is matted inside a constant box and switching views never shifts
              the layout. Capture future shots at 16:9 and the matting disappears. */}
          <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10">
            <img
              src={view.src}
              alt={view.alt}
              loading="lazy"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </TabsContent>
      ))}
    </Tabs>
    <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
      {GUARDS.map((guard) => (
        <Card key={guard.heading}>
          <CardHeader>
            <CardTitle className="text-xl">{guard.heading}</CardTitle>
          </CardHeader>
          <CardContent>
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
        <CardContent>
          <p className="text-muted-foreground">
            AQVEN runs next to your application: your providers, your tools, your stack. Python, on
            your machine, pointed at the project folder you already have.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl">Source available.</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Read the code. Run it yourself. Change it to fit how your team works. Your workflows are
            files in your repo: they&rsquo;re yours, and they stay yours whatever happens to us.
          </p>
          <a
            href={REPO}
            className="mt-6 inline-flex text-sm font-medium underline underline-offset-4"
          >
            View on GitHub
          </a>
        </CardContent>
      </Card>
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
  },
  {
    icon: <Shield className="size-5" />,
    title: "It has to pass a check before it can say it's done.",
    description: "A change that doesn't hold together never reaches you.",
  },
  {
    icon: <Sparkles className="size-5" />,
    title: "The docs are written for it, not only for you.",
    description: "Machine-readable project context an agent can load before it edits.",
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
