import { ArrowRight, CircleAlert, CircleCheck, RotateCw } from "lucide-react";
import { cn } from "cn";

const NodeChip = ({
  label,
  kind,
  loop,
  transparent,
}: {
  label: string;
  kind: string;
  loop?: boolean;
  transparent?: boolean;
}) => (
  <div
    className={cn(
      "relative flex shrink-0 flex-col items-center gap-1 rounded-md border border-border px-3 py-2 text-center",
      transparent ? "bg-transparent" : "bg-card shadow-xs",
    )}
  >
    {loop && (
      <span
        className="absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full border border-border bg-background-subtle"
        title="loops until it succeeds"
      >
        <RotateCw className="size-2.5 text-muted-foreground" aria-hidden="true" />
      </span>
    )}
    <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{kind}</span>
    <span className="font-mono text-xs font-medium text-foreground">{label}</span>
  </div>
);

const Connector = ({ broken }: { broken?: boolean }) => (
  <div className="flex h-8 w-8 shrink-0 items-center justify-center sm:w-10">
    <svg viewBox="0 0 40 10" className="h-2.5 w-full overflow-visible" aria-hidden="true">
      <line
        x1="0"
        y1="5"
        x2="34"
        y2="5"
        className={cn("stroke-2", broken ? "stroke-destructive" : "stroke-border")}
        strokeDasharray={broken ? "3 3" : undefined}
      />
      <path
        d="M34 1 L39 5 L34 9"
        className={cn("fill-none stroke-2", broken ? "stroke-destructive" : "stroke-border")}
      />
    </svg>
  </div>
);

export const CheckBeforeItRunsSchematic = () => (
  <div className="rounded-lg border border-border bg-background-subtle p-4">
    <div className="flex items-center justify-center sm:justify-start">
      <NodeChip label="collect_orders" kind="code" />
      <Connector />
      <NodeChip label="classify_intent" kind="llm" />
      <Connector broken />
      <NodeChip label="route_to_queue" kind="switch" />
    </div>
    <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
      <p className="font-mono text-xs leading-relaxed text-destructive">
        E_REF_MISSING: route_to_queue expects category, classify_intent never produces it
      </p>
    </div>
  </div>
);

const DiffLine = ({ sign, children }: { sign: "-" | "+" | " "; children: string }) => (
  <div
    className={cn(
      "flex gap-3 px-3 py-0.5 font-mono text-xs leading-relaxed",
      sign === "-" && "bg-destructive/10 text-destructive",
      sign === "+" && "bg-success/10 text-success",
      sign === " " && "text-muted-foreground",
    )}
  >
    <span className="w-2 shrink-0 select-none opacity-70">{sign}</span>
    <span className="whitespace-pre-wrap">{children}</span>
  </div>
);

export const ReviewLikeCodeSchematic = () => (
  <div className="overflow-hidden rounded-lg border border-border">
    <div className="flex items-center justify-between border-b border-border bg-background-subtle px-3 py-2">
      <code className="font-mono text-xs text-muted-foreground">
        flows/route_ticket/nodes/classify_intent/classify_intent.prompt.md
      </code>
      <span className="flex items-center gap-2 font-mono text-xs">
        <span className="text-success">+1</span>
        <span className="text-destructive">-1</span>
      </span>
    </div>
    <div className="bg-card py-2">
      <DiffLine sign=" ">Classify the ticket into one of:</DiffLine>
      <DiffLine sign="-">billing, technical, other.</DiffLine>
      <DiffLine sign="+">billing, technical, refund, other.</DiffLine>
    </div>
  </div>
);

const FileCard = ({ path, lines }: { path: string; lines: string[] }) => (
  <div className="overflow-hidden rounded-lg border border-border">
    <div className="border-b border-border bg-background-subtle px-3 py-2">
      <code className="font-mono text-xs text-muted-foreground">{path}</code>
    </div>
    <div className="bg-card px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
      {lines.map((line, i) => (
        <div key={i} className="whitespace-pre">
          {line || " "}
        </div>
      ))}
    </div>
  </div>
);

const NODE_YAML_LINES = [
  'kind: "Node"',
  'node: "code"',
  'description: "Reads unresolved tickets from the queue"',
  'run: "collect_orders"',
  "in:",
  '- name: "queue_id"',
  '  type: "QueueId"',
  '  from: "$input.queue_id"',
  "out:",
  '- name: "tickets"',
  '  type: "Ticket[]"',
];

const NODE_PY_LINES = [
  "from route_ticket.types import QueueId, CollectOrdersOut",
  "",
  "def collect_orders(queue_id: QueueId) -> CollectOrdersOut:",
  "    tickets = fetch_open_tickets(queue_id)",
  "    return CollectOrdersOut(tickets=tickets)",
];

export const RealFilesSchematic = () => (
  <div className="flex flex-col gap-3">
    <FileCard path="flows/route_ticket/nodes/collect_orders/collect_orders.node.yaml" lines={NODE_YAML_LINES} />
    <FileCard path="flows/route_ticket/nodes/collect_orders/collect_orders.py" lines={NODE_PY_LINES} />
  </div>
);

const REPO_TREE_LINES = [
  "AQVEN/",
  "├── packages/",
  "│   ├── aqven/          the engine",
  "│   └── aqven-llm/      model providers",
  "├── apps/",
  "│   └── studio/         the UI",
  "├── LICENSE              AQVEN License 1.0.0",
  "└── README.md",
];

const TerminalCard = ({ lines }: { lines: string[] }) => (
  <div className="overflow-hidden rounded-lg border border-border">
    <div className="flex items-center gap-1.5 border-b border-border bg-background-subtle px-3 py-2">
      <span className="size-2 rounded-full bg-border" />
      <span className="size-2 rounded-full bg-border" />
      <span className="size-2 rounded-full bg-border" />
    </div>
    <div className="bg-card px-3 py-2 font-mono text-xs leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className="whitespace-pre text-muted-foreground">
          <span className="text-success">$ </span>
          {line}
        </div>
      ))}
    </div>
  </div>
);

export const RepoOwnershipSchematic = () => (
  <div className="flex flex-col gap-3">
    <FileCard path="lastonoga/AQVEN" lines={REPO_TREE_LINES} />
    <TerminalCard lines={["git clone https://github.com/lastonoga/AQVEN", "cd AQVEN && uv sync"]} />
  </div>
);

const TRACE_STEPS = [
  { node: "collect_orders", detail: "3 orders read from queue", llm: false },
  { node: "classify_intent", detail: "category: refund, confidence: 0.41", llm: true },
  { node: "route_to_queue", detail: "sent to: escalations", llm: false },
];

export const RunTraceSchematic = () => (
  <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background-subtle p-4">
    {TRACE_STEPS.map((step, i) => (
      <div key={step.node} className="flex items-start gap-2">
        <span className="mt-1.5 font-mono text-[10px] text-muted-foreground">{i + 1}</span>
        <div
          className={cn(
            "flex flex-1 flex-col gap-0.5 rounded-md border px-2.5 py-1.5",
            step.llm ? "border-llm-border bg-llm-bg" : "border-border bg-card",
          )}
        >
          <span className="font-mono text-xs font-medium text-foreground">{step.node}</span>
          <span className={cn("font-mono text-[10px]", step.llm ? "text-llm" : "text-muted-foreground")}>
            {step.detail}
          </span>
        </div>
      </div>
    ))}
  </div>
);

const SERIES_EDGE = 82;
const SERIES_CELLS = [
  { variant: "gpt", low: 86, value: 91, high: 95 },
  { variant: "mistral", low: 84, value: 89, high: 93 },
];

export const SeriesVerdictSchematic = () => (
  <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-background-subtle p-4">
    <span className="font-mono text-[10px] text-muted-foreground">promises above 0.80, margin 0.02</span>
    {SERIES_CELLS.map((cell) => {
      const clears = cell.low > SERIES_EDGE;
      return (
        <div key={cell.variant} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate font-mono text-[10px] text-muted-foreground">{cell.variant}</span>
          <div className="relative h-1.5 flex-1 rounded-full bg-border">
            <div
              className={cn("absolute inset-y-0 rounded-full", clears ? "bg-success" : "bg-destructive")}
              style={{ left: `${cell.low}%`, width: `${cell.high - cell.low}%` }}
            />
            <div
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
              style={{ left: `${cell.value}%` }}
            />
            <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-foreground/60" style={{ left: `${SERIES_EDGE}%` }} />
          </div>
          <span className={cn("w-9 shrink-0 text-right font-mono text-[10px]", clears ? "text-success" : "text-destructive")}>
            {(cell.value / 100).toFixed(2)}
          </span>
        </div>
      );
    })}
    <div className="mt-1 flex items-center gap-1.5 self-start rounded-full border border-success/30 bg-success/10 px-2.5 py-1">
      <CircleCheck className="size-3 text-success" aria-hidden="true" />
      <span className="font-mono text-[10px] text-success">holdout: confirmed</span>
    </div>
  </div>
);

export const RegressionCaseSchematic = () => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background-subtle px-4 py-4">
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xs font-medium text-foreground">angry_refund_request</span>
      <span className="font-mono text-[10px] text-muted-foreground">datasets/route_ticket_cases.yaml</span>
    </div>
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 font-mono text-[10px] text-success">
      <CircleCheck className="size-3" aria-hidden="true" /> regression test
    </span>
  </div>
);

const COST_NODES = [
  { node: "collect_orders", cost: "$0.00", latency: "12ms", expensive: false },
  { node: "classify_intent", cost: "$0.02", latency: "840ms", expensive: true },
  { node: "route_to_queue", cost: "$0.00", latency: "3ms", expensive: false },
];

export const CostLatencySchematic = () => (
  <div className="flex flex-col gap-1 rounded-lg border border-border bg-background-subtle p-4">
    {COST_NODES.map((node) => (
      <div
        key={node.node}
        className={cn(
          "flex items-center justify-between rounded-md border px-2.5 py-1.5",
          node.expensive ? "border-destructive/30 bg-destructive/5" : "border-border bg-card",
        )}
      >
        <span className="font-mono text-xs text-foreground">{node.node}</span>
        <span className={cn("font-mono text-[10px]", node.expensive ? "text-destructive" : "text-muted-foreground")}>
          {node.cost} · {node.latency}
        </span>
      </div>
    ))}
  </div>
);

const SCATTERED_FILES = [
  { label: "classify.prompt.md", rotate: -4, offset: 0 },
  { label: "agents/router.yaml", rotate: 3, offset: 14 },
  { label: "route.py", rotate: -6, offset: 4 },
  { label: "tools/functions.py", rotate: 5, offset: 18 },
  { label: "classify.node.yaml", rotate: -2, offset: 8 },
  { label: "fragments/tone.md", rotate: 4, offset: 0 },
];

export const ScatteredFilesSchematic = () => (
  <div className="flex flex-wrap items-start justify-center gap-x-4 gap-y-3 rounded-lg border border-dashed border-border bg-background-subtle px-6 py-8">
    {SCATTERED_FILES.map((file) => (
      <span
        key={file.label}
        style={{ transform: `rotate(${file.rotate}deg) translateY(${file.offset}px)` }}
        className="rounded-md border border-border bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground shadow-xs"
      >
        {file.label}
      </span>
    ))}
  </div>
);

const MINI_CHAIN = ["collect", "classify", "route"];

export const MiniWorkflowSchematic = () => (
  <div className="flex items-center gap-1.5">
    {MINI_CHAIN.map((step, i) => (
      <div key={step} className="flex items-center gap-1.5">
        <span className="rounded border border-border bg-card px-2 py-1 font-mono text-[10px] text-foreground">
          {step}
        </span>
        {i < MINI_CHAIN.length - 1 && (
          <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
    ))}
  </div>
);

const MINI_RUNS: { id: string; status: "success" | "failed" | "running" }[] = [
  { id: "run_8f2a", status: "success" },
  { id: "run_8f29", status: "failed" },
  { id: "run_8f28", status: "running" },
];

export const MiniRunsSchematic = () => (
  <div className="flex w-full flex-col gap-1">
    {MINI_RUNS.map((run) => (
      <div
        key={run.id}
        className="flex items-center justify-between rounded border border-border bg-card px-2 py-1"
      >
        <span className="font-mono text-[10px] text-muted-foreground">{run.id}</span>
        <span
          className={cn(
            "size-1.5 rounded-full",
            run.status === "success" && "bg-success",
            run.status === "failed" && "bg-destructive",
            run.status === "running" && "animate-pulse bg-foreground/40",
          )}
        />
      </div>
    ))}
  </div>
);

export const MiniTypeMismatchSchematic = () => (
  <div className="flex items-center gap-1.5">
    <span className="rounded border border-border bg-card px-2 py-1 font-mono text-[10px] text-foreground">
      OrderId
    </span>
    <svg viewBox="0 0 24 10" className="h-2.5 w-6 shrink-0 overflow-visible" aria-hidden="true">
      <line x1="0" y1="5" x2="20" y2="5" className="stroke-2 stroke-destructive" strokeDasharray="3 3" />
      <path d="M20 1 L24 5 L20 9" className="fill-none stroke-2 stroke-destructive" />
    </svg>
    <span className="rounded border border-destructive/40 bg-destructive/5 px-2 py-1 font-mono text-[10px] text-destructive">
      TicketId
    </span>
  </div>
);

export const MiniCheckPassedSchematic = () => (
  <div className="flex items-center gap-2 rounded border border-border bg-card px-2.5 py-1.5 font-mono text-[10px]">
    <span className="text-muted-foreground">$ aqven check</span>
    <span className="flex items-center gap-1 text-success">
      <CircleCheck className="size-3" aria-hidden="true" /> 0 errors
    </span>
  </div>
);

const ForkConnector = () => (
  <svg viewBox="0 0 100 34" className="h-8 w-24 shrink-0 overflow-visible" aria-hidden="true">
    <path d="M50 0 L50 10" className="fill-none stroke-2 stroke-border" />
    <path d="M14 10 L86 10" className="fill-none stroke-2 stroke-border" />
    <path d="M14 10 L14 26" className="fill-none stroke-2 stroke-border" />
    <path d="M86 10 L86 26" className="fill-none stroke-2 stroke-border" />
    <path d="M10 22 L14 27 L18 22" className="fill-none stroke-2 stroke-border" />
    <path d="M82 22 L86 27 L90 22" className="fill-none stroke-2 stroke-border" />
  </svg>
);

export const HeroCanvasSchematic = () => (
  <div className="relative w-full overflow-hidden rounded-md border border-border">
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:20px_20px]"
    />
    <div className="relative flex flex-col items-center gap-1 px-6 py-8">
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <NodeChip label="collect_orders" kind="code" transparent />
        <Connector />
        <NodeChip label="classify_intent" kind="llm" transparent />
      </div>
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">parallel</span>
      <ForkConnector />
      <div className="flex items-center gap-6">
        <NodeChip label="notify_customer" kind="tool" transparent />
        <NodeChip label="retry_failed" kind="loop" loop transparent />
      </div>
      <div className="mt-5 flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1">
        <CircleCheck className="size-3.5 text-success" aria-hidden="true" />
        <span className="font-mono text-xs text-success">aqven check: 0 errors</span>
      </div>
    </div>
  </div>
);

export const MiniAgentReadSchematic = () => (
  <div className="flex w-full flex-col gap-1 rounded border border-border bg-card px-2.5 py-2">
    <span className="font-mono text-[10px] text-muted-foreground">reading flows/route_ticket/flow.yaml</span>
    <span className="font-mono text-[10px] text-muted-foreground">reading agents/classifier.yaml</span>
    <span className="flex items-center gap-1 font-mono text-[10px] text-success">
      <CircleCheck className="size-3" aria-hidden="true" /> ready to edit
    </span>
  </div>
);

export const heroCanvasVisual = <HeroCanvasSchematic />;
