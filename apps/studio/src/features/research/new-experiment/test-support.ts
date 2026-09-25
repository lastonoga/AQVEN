import type { AuthoringNode, AuthoringOptions, NodeKind } from "@/domain"
import * as ids from "@/data/ids"
import { initialForm, reduceForm, type FormAction, type NewExperimentForm } from "./form-state"

const node = (id: string, kind: NodeKind, fields: Partial<Omit<AuthoringNode, "id" | "kind">> = {}): AuthoringNode => ({
  id: ids.nodeId(id),
  flowNode: ids.nodeId(id),
  kind,
  description: "",
  agent: null,
  inference: null,
  calls: null,
  ...fields,
})

export const SUPPORT = ids.flowId("support_case")
export const PANEL = ids.flowId("judge_panel")
export const SOLO = ids.flowId("solo_judge")
export const OTHER_CONTRACT = ids.flowId("reply_digest")
export const CASES = ids.datasetId("support_case_cases")

export const OPTIONS: AuthoringOptions = {
  flows: [
    {
      id: SUPPORT,
      description: "A support request from message to reply",
      input: "SupportRequest",
      output: "SupportReply",
      nodes: [
        node("classify", "llm", { agent: ids.agentId("gpt"), inference: ids.inferenceId("classify") }),
        node("revise", "llm", { agent: ids.agentId("gpt"), inference: ids.inferenceId("revise") }),
        node("panel", "call", { calls: PANEL }),
        node("route", "code"),
      ],
    },
    { id: PANEL, description: "", input: "Draft", output: "Verdict", nodes: [node("ask_gemini", "llm", { agent: ids.agentId("gemini") })] },
    { id: SOLO, description: "", input: "Draft", output: "Verdict", nodes: [node("judge", "llm", { agent: ids.agentId("gpt") })] },
    { id: OTHER_CONTRACT, description: "", input: "Draft", output: "Digest", nodes: [] },
  ],
  agents: [
    { id: ids.agentId("gpt"), model: "openai:gpt-5.2-mini" },
    { id: ids.agentId("mistral"), model: "mistral:mistral-small-2609" },
  ],
  datasets: [
    {
      id: CASES,
      flow: SUPPORT,
      total: 12,
      splits: { dev: 6, holdout: 6 },
      tags: [{ tag: "language", values: [{ value: "de", count: 5 }, { value: "en", count: 7 }] }],
    },
  ],
  evaluators: [
    { use: "expected", needsParams: false, description: "The output equals expected_output", kind: "binary", params: [{ name: "fields", required: false }] },
    {
      use: "max_words",
      needsParams: true,
      description: "The output has at most max words",
      kind: "binary",
      params: [
        { name: "field", required: true },
        { name: "max", required: true },
      ],
    },
    { use: "cost_usd", needsParams: false, description: "The cost of the attempt in USD", kind: "continuous", params: [] },
  ],
  questionKinds: ["look", "threshold", "compare", "noninferior"],
  metrics: ["success_rate", "cost_usd", "cost_of_pass"],
}

export const formAfter = (...actions: readonly FormAction[]): NewExperimentForm => actions.reduce(reduceForm, initialForm())

export const agentExperiment = (): NewExperimentForm =>
  formAfter(
    { type: "describe", text: "Mistral revises replies as well as GPT" },
    { type: "chooseFlow", flow: SUPPORT, dataset: CASES },
    { type: "chooseFactor", what: "agent" },
    { type: "toggleNode", node: ids.nodeId("revise") },
    { type: "renameVariant", key: 0, id: "gpt" },
    { type: "setValue", key: 1, node: ids.nodeId("revise"), value: "mistral" },
    { type: "editQuestion", patch: { kind: "noninferior", margin: "0.05" } },
  )
