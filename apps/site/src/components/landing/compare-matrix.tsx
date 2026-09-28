import { Check, Contrast, X } from "lucide-react";
import { cn } from "cn";

type Mark = "yes" | "no" | "partly";

type Cell = { readonly mark: Mark; readonly note?: string };

export type ProductId = "aqven" | "langfuse" | "langsmith" | "phoenix" | "promptfoo" | "deepeval" | "n8n" | "langgraph";

export type FeatureId = "trace" | "experiments" | "intervals" | "heldOut" | "files" | "check" | "hosted" | "local";

type Product = { readonly id: ProductId; readonly name: string };

type Feature = { readonly id: FeatureId; readonly label: string; readonly cells: Readonly<Record<ProductId, Cell>> };

const YES: Cell = { mark: "yes" };
const NO: Cell = { mark: "no" };
const partly = (note: string): Cell => ({ mark: "partly", note });

const PRODUCTS: Readonly<Record<ProductId, Product>> = {
  aqven: { id: "aqven", name: "AQVEN" },
  langfuse: { id: "langfuse", name: "Langfuse" },
  langsmith: { id: "langsmith", name: "LangSmith" },
  phoenix: { id: "phoenix", name: "Arize Phoenix" },
  promptfoo: { id: "promptfoo", name: "promptfoo" },
  deepeval: { id: "deepeval", name: "DeepEval" },
  n8n: { id: "n8n", name: "n8n" },
  langgraph: { id: "langgraph", name: "LangGraph" },
};

const FEATURES: Readonly<Record<FeatureId, Feature>> = {
  trace: {
    id: "trace",
    label: "Trace of every step of a run",
    cells: {
      aqven: YES,
      langfuse: YES,
      langsmith: YES,
      phoenix: YES,
      promptfoo: YES,
      deepeval: YES,
      n8n: YES,
      langgraph: partly("via LangSmith"),
    },
  },
  experiments: {
    id: "experiments",
    label: "Experiments on your own cases",
    cells: {
      aqven: YES,
      langfuse: YES,
      langsmith: YES,
      phoenix: YES,
      promptfoo: YES,
      deepeval: YES,
      n8n: partly("metrics on paid plans"),
      langgraph: partly("via LangSmith"),
    },
  },
  intervals: {
    id: "intervals",
    label: "Tells you whether a difference is real",
    cells: {
      aqven: YES,
      langfuse: NO,
      langsmith: NO,
      phoenix: NO,
      promptfoo: NO,
      deepeval: partly("Confident AI, paid"),
      n8n: NO,
      langgraph: NO,
    },
  },
  heldOut: {
    id: "heldOut",
    label: "Confirms a change on held-out cases",
    cells: {
      aqven: YES,
      langfuse: NO,
      langsmith: NO,
      phoenix: NO,
      promptfoo: NO,
      deepeval: NO,
      n8n: NO,
      langgraph: NO,
    },
  },
  files: {
    id: "files",
    label: "The workflow as files in your repo",
    cells: {
      aqven: YES,
      langfuse: NO,
      langsmith: NO,
      phoenix: NO,
      promptfoo: NO,
      deepeval: NO,
      n8n: partly("export; git on paid plans"),
      langgraph: YES,
    },
  },
  check: {
    id: "check",
    label: "Checks the whole workflow before a run",
    cells: {
      aqven: YES,
      langfuse: NO,
      langsmith: NO,
      phoenix: NO,
      promptfoo: NO,
      deepeval: NO,
      n8n: partly("structure and config"),
      langgraph: partly("graph structure"),
    },
  },
  hosted: {
    id: "hosted",
    label: "Hosted workspace for a team",
    cells: {
      aqven: NO,
      langfuse: YES,
      langsmith: YES,
      phoenix: YES,
      promptfoo: partly("Enterprise"),
      deepeval: YES,
      n8n: YES,
      langgraph: partly("paid"),
    },
  },
  local: {
    id: "local",
    label: "Runs on your machine, no vendor account",
    cells: {
      aqven: YES,
      langfuse: YES,
      langsmith: NO,
      phoenix: YES,
      promptfoo: YES,
      deepeval: YES,
      n8n: YES,
      langgraph: YES,
    },
  },
};

const MARK_LABEL: Readonly<Record<Mark, string>> = { yes: "Yes", no: "No", partly: "Partly" };

const MarkIcon = ({ mark }: { mark: Mark }) => {
  const icons: Readonly<Record<Mark, React.ReactNode>> = {
    yes: <Check className="size-5 text-foreground" aria-hidden="true" />,
    no: <X className="size-5 text-muted-foreground/60" aria-hidden="true" />,
    partly: <Contrast className="size-4.5 text-muted-foreground" aria-hidden="true" />,
  };
  return icons[mark];
};

const MarkCell = ({ cell }: { cell: Cell }) => (
  <span className="flex flex-col items-center gap-1">
    <MarkIcon mark={cell.mark} />
    <span className="sr-only">{MARK_LABEL[cell.mark]}</span>
    {cell.note === undefined ? null : <span className="text-center text-[11px] leading-tight text-muted-foreground">{cell.note}</span>}
  </span>
);

export type CompareMatrixProps = {
  readonly products: readonly ProductId[];
  readonly features: readonly FeatureId[];
  readonly caption: string;
};

export const CompareMatrix = ({ products, features, caption }: CompareMatrixProps) => (
  <div className="overflow-x-auto rounded-xl border border-border bg-card">
    <table className="w-full min-w-[40rem] border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border">
          <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground" />
          {products.map((id) => (
            <th
              key={id}
              scope="col"
              className={cn("px-3 py-3 text-center font-medium", id === "aqven" ? "bg-muted text-foreground" : "text-muted-foreground")}
            >
              {PRODUCTS[id].name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {features.map((featureId) => (
          <tr key={featureId} className="border-b border-border last:border-b-0">
            <th scope="row" className="px-4 py-3 text-left font-normal">
              {FEATURES[featureId].label}
            </th>
            {products.map((id) => (
              <td key={id} className={cn("px-3 py-3 align-top", id === "aqven" ? "bg-muted" : "")}>
                <MarkCell cell={FEATURES[featureId].cells[id]} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const MatrixLegend = () => (
  <p className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
    <span className="inline-flex items-center gap-1.5">
      <Check className="size-4 text-foreground" aria-hidden="true" /> Yes
    </span>
    <span className="inline-flex items-center gap-1.5">
      <Contrast className="size-3.5" aria-hidden="true" /> Partly, or on a paid plan
    </span>
    <span className="inline-flex items-center gap-1.5">
      <X className="size-4 text-muted-foreground/60" aria-hidden="true" /> No, or not documented
    </span>
    <span>Checked against each product&rsquo;s documentation on 28 September 2026.</span>
  </p>
);

export const LANDING_PRODUCTS: readonly ProductId[] = ["aqven", "langfuse", "langsmith", "promptfoo", "deepeval", "n8n"];
export const LANDING_FEATURES: readonly FeatureId[] = ["trace", "experiments", "intervals", "heldOut", "files", "check", "hosted"];
export const ALL_PRODUCTS: readonly ProductId[] = ["aqven", "langfuse", "langsmith", "phoenix", "promptfoo", "deepeval", "n8n", "langgraph"];
export const ALL_FEATURES: readonly FeatureId[] = ["trace", "experiments", "intervals", "heldOut", "files", "check", "hosted", "local"];
