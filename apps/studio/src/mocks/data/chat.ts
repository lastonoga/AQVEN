import type { ChatThread, RunSummary, WorkflowId } from "@/domain"
import { callId, columnId, datasetId, nodeId, revisionId, runId } from "@/data/ids"
import { runLists } from "./run-list"
import { WORKFLOWS, perWorkflow, workflowKey } from "./keys"

const PITCH_RUN = runId("8247")
const PITCH_GEN_B = nodeId("pitch_gen_b")
const REGRESS_TRUNCATED = datasetId("regress_truncated")
const PITCH_GOLDEN = datasetId("pitch_golden_v4")

const pitchPipelineThread: ChatThread = [
  {
    id: "msg_pitch_01",
    role: "user",
    content: "Why did branch b cost $0.06 — three times the others?",
  },
  {
    id: "msg_pitch_02",
    role: "assistant",
    status: { type: "complete", reason: "stop" },
    content: [
      {
        type: "text",
        text: "Four attempts. Schema failed on `hooks: string[3]` — the model returned five hooks, then truncation at the 4096 limit, then the fallback profile. All four attempts were billed, failures included.",
      },
      {
        type: "tool-call",
        toolCallId: "tc_read_run_1",
        toolName: "read_run",
        args: { runId: PITCH_RUN, nodeId: PITCH_GEN_B },
        result: {
          attempts: ["http_429", "schema_invalid", "truncated", "fallback"],
          billedUsd: 0.0611,
          failedUsd: 0.01,
          callId: callId("call_01HT9"),
          columnId: columnId("pitch_gen_b"),
        },
      },
    ],
  },
  {
    id: "msg_pitch_03",
    role: "user",
    content: "Raise the output limit and drop superlatives from the tone",
  },
  {
    id: "msg_pitch_04",
    role: "assistant",
    status: { type: "complete", reason: "stop" },
    content: [
      { type: "text", text: "Done — two changes in revision r42. It is a draft, not applied to the run." },
      {
        type: "tool-call",
        toolCallId: "tc_patch_spec_1",
        toolName: "patch_spec",
        args: { instruction: "Raise the output limit and drop superlatives from the tone" },
        result: {
          revision: revisionId("r42"),
          nodeCount: 2,
          changes: [
            { kind: "field", nodeId: PITCH_GEN_B, field: "max_tokens", from: "4096", to: "8192" },
            { kind: "knowledge", knowledgeId: "brand_voice", from: "v3", to: "v4", note: "superlatives banned" },
          ],
          branchesAffected: 4,
          runEstimateUsd: 0.11,
          state: "draft",
        },
      },
    ],
  },
  {
    id: "msg_pitch_05",
    role: "assistant",
    status: { type: "complete", reason: "stop" },
    content: [
      {
        type: "text",
        text: "Ran dataset `regress_truncated`: 12/12 vs 7/12 before the fix. Branch c still lies about beach distance — that is a fact from `load_hotels`, not tone.",
      },
      {
        type: "tool-call",
        toolCallId: "tc_run_dataset_1",
        toolName: "run_dataset",
        args: { datasetId: REGRESS_TRUNCATED },
        result: {
          scores: [
            { datasetId: REGRESS_TRUNCATED, passed: 12, total: 12, costUsd: 0.18 },
            { datasetId: PITCH_GOLDEN, passed: 44, total: 48, costUsd: 0.61 },
          ],
          callMode: "live",
          recordCassette: false,
          runId: PITCH_RUN,
        },
      },
    ],
  },
  {
    id: "msg_pitch_06",
    role: "user",
    content: "Add a facts judge for branch c and rerun the loop",
  },
  {
    id: "msg_pitch_07",
    role: "assistant",
    status: { type: "running" },
    content: [
      {
        type: "tool-call",
        toolCallId: "tc_patch_spec_2",
        toolName: "patch_spec",
        args: { instruction: "Add a facts judge for branch c and rerun the loop" },
        artifact: { target: nodeId("judge_panel"), step: 2, totalSteps: 3 },
      },
    ],
  },
]

const latestRunThread = (workflow: WorkflowId, run: RunSummary): ChatThread => [
  { id: `msg_${workflow}_01`, role: "user", content: `How did the last run of ${workflow} go?` },
  {
    id: `msg_${workflow}_02`,
    role: "assistant",
    status: { type: "complete", reason: "stop" },
    content: [
      {
        type: "text",
        text: `Run #${run.id} finished \`${run.status}\`: ${String(run.assertions.passed)}/${String(run.assertions.total)} assertions · $${run.costUsd.toFixed(4)} billed · ${run.durationS.toFixed(2)} s.`,
      },
    ],
  },
]

const neverRunThread = (workflow: WorkflowId): ChatThread => [
  { id: `msg_${workflow}_01`, role: "user", content: `Is ${workflow} ready to run?` },
  {
    id: `msg_${workflow}_02`,
    role: "assistant",
    status: { type: "complete", reason: "stop" },
    content: [{ type: "text", text: `\`${workflow}\` has never been run, so there is no trace to read yet.` }],
  },
]

const threadOf = (workflow: WorkflowId): ChatThread => {
  if (workflow === WORKFLOWS.pitchPipeline) return pitchPipelineThread
  const latest = runLists[workflowKey(workflow)]?.[0]
  if (latest === undefined) return neverRunThread(workflow)
  return latestRunThread(workflow, latest)
}

export const chatThreads: Readonly<Record<string, ChatThread>> = perWorkflow(threadOf)
