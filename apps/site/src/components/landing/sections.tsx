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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const REPO = "https://github.com/lastonoga/AQVEN";

interface Row {
  heading: string;
  body: string;
  image: string;
  alt: string;
}

const TRUST = ["Source available", "PolyForm Shield", "Python", "Runs locally", "No account needed"];

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

const ROWS: Row[] = [
  {
    heading: "See every step on one screen.",
    body: "What runs, what feeds what, where a person has to approve. Read from your files, not from a diagram somebody drew six months ago.",
    image: "/images/studio/project-flows.png",
    alt: "AQVEN Studio showing a project and its workflows",
  },
  {
    heading: "Find where a bad result came from.",
    body: "Open the exact case and walk back to the first step that didn't do what it should.",
    image: "/images/studio/runs.png",
    alt: "AQVEN Studio showing a recorded run with cost, duration and completed steps",
  },
  {
    heading: "Look inside any step.",
    body: "What went in, what came out, which model answered, what it cost. Raw values, not a summary.",
    image: "/images/studio/node-inspector.png",
    alt: "AQVEN Studio node inspector showing the input and output of one step",
  },
  {
    heading: "See if quality is going up or down.",
    body: "Not one failure at a time. The direction, across every case you care about, after every change.",
    image: "/images/studio/evaluations.png",
    alt: "AQVEN Studio evaluations view showing scorers, a dataset and a policy",
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
    <div className="container mx-auto flex flex-wrap items-center justify-center gap-x-8 gap-y-2 px-6 py-4">
      {TRUST.map((item) => (
        <span key={item} className="text-sm text-muted-foreground">
          {item}
        </span>
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
        A month in, nobody on the team can say what actually happens — and it&rsquo;s not a demo. It
        runs thousands of times before anyone notices something drifted.
      </p>
    </div>
    <div className="mx-auto mt-14 grid max-w-4xl gap-4 sm:grid-cols-2">
      {QUOTES.map((quote) => (
        <blockquote
          key={quote}
          className="rounded-lg border border-border bg-card p-5 text-card-foreground"
        >
          <p className="text-muted-foreground italic">&ldquo;{quote}&rdquo;</p>
        </blockquote>
      ))}
    </div>
    <div className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
      {STAKES.map((item) => (
        <div
          key={item.label}
          className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-6"
        >
          <span className="text-muted-foreground">{item.icon}</span>
          <span className="text-sm font-medium">{item.label}</span>
        </div>
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
      defaultValue={ROWS[0].heading}
      orientation="vertical"
      className="mt-14 grid grid-cols-1 gap-4 rounded-xl border border-border p-4 lg:mt-20 lg:grid-cols-4"
    >
      <TabsList className="flex h-auto w-full flex-col justify-start gap-1 rounded-lg bg-muted p-1.5">
        {ROWS.map((row) => (
          <TabsTrigger
            key={row.heading}
            value={row.heading}
            className="w-full justify-start rounded-lg px-4 py-3 text-start whitespace-normal"
          >
            <span className="font-semibold">{row.heading}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {ROWS.map((row) => (
        <TabsContent key={row.heading} value={row.heading} className="col-span-1 m-0 lg:col-span-3">
          <p className="max-w-2xl text-muted-foreground lg:text-lg">{row.body}</p>
          <img
            src={row.image}
            alt={row.alt}
            loading="lazy"
            className="mt-6 w-full rounded-lg border border-border bg-card object-cover"
          />
        </TabsContent>
      ))}
    </Tabs>
    <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
      {GUARDS.map((guard) => (
        <div key={guard.heading} className="rounded-lg border border-border bg-card p-8">
          <h3 className="text-xl font-semibold tracking-tight">{guard.heading}</h3>
          <p className="mt-3 text-muted-foreground">{guard.body}</p>
        </div>
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
    <div className="mx-auto mt-12 max-w-4xl overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="p-4 font-medium text-muted-foreground"> </th>
            <th className="p-4 font-medium text-muted-foreground">Tracing tools</th>
            <th className="p-4 font-medium text-muted-foreground">Visual builders</th>
            <th className="p-4 font-semibold text-foreground">AQVEN</th>
          </tr>
        </thead>
        <tbody>
          {COMPARE.map((item) => (
            <tr key={item.row} className="border-b border-border">
              <td className="p-4 font-medium">{item.row}</td>
              <td className="p-4 text-muted-foreground">{item.tracing}</td>
              <td className="p-4 text-muted-foreground">{item.builders}</td>
              <td className="p-4 font-medium">{item.aqven}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Section>
);

export const Stack = () => (
  <Section>
    <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2">
      <div className="rounded-lg border border-border bg-card p-8">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Keep your models. Keep your code.
        </h2>
        <p className="mt-4 text-muted-foreground">
          AQVEN runs next to your application — your providers, your tools, your stack. Python, on
          your machine, pointed at the project folder you already have.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-8">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Source available.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Read the code. Run it yourself. Change it to fit how your team works. Your workflows are
          files in your repo — they&rsquo;re yours, and they stay yours whatever happens to us.
        </p>
        <a
          href={REPO}
          className="mt-6 inline-flex text-sm font-medium underline underline-offset-4"
        >
          View on GitHub
        </a>
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
    description: "Types don't match, the check fails — before production does.",
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
        <a
          key={item.title}
          href={item.href}
          className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-6 transition-colors hover:border-ring hover:bg-accent"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-accent text-muted-foreground">
            {item.icon}
          </span>
          <span className="font-medium tracking-tight">{item.title}</span>
          <span className="text-sm text-muted-foreground">{item.description}</span>
        </a>
      ))}
    </div>
    <div className="mt-14 flex justify-center">
      <Button size="lg" asChild>
        <a href="/start/">Read the documentation</a>
      </Button>
    </div>
  </Section>
);
