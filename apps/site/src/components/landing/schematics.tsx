import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "cn";

const NodeChip = ({ label, kind }: { label: string; kind: string }) => (
  <div className="flex shrink-0 flex-col items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-center shadow-xs">
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

export const MiniAgentReadSchematic = () => (
  <div className="flex w-full flex-col gap-1 rounded border border-border bg-card px-2.5 py-2">
    <span className="font-mono text-[10px] text-muted-foreground">reading flows/route_ticket/flow.yaml</span>
    <span className="font-mono text-[10px] text-muted-foreground">reading agents/classifier.yaml</span>
    <span className="flex items-center gap-1 font-mono text-[10px] text-success">
      <CircleCheck className="size-3" aria-hidden="true" /> ready to edit
    </span>
  </div>
);
