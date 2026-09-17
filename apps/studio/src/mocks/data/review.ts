import type { IsoDateTime, ReviewDetail, ReviewQueueItem } from "@/domain"
import { datasetId, isoDateTime, nodeId, reviewId, revisionId, rowId, runId } from "@/data/ids"
import { pitchNode } from "./catalog"
import { FIXTURE_NOW } from "./clock"
import { WORKFLOWS, perWorkflow, workflowKey } from "./keys"

const MS_PER_MINUTE = 60_000

const minutesFromNow = (minutes: number): IsoDateTime =>
  isoDateTime(new Date(Date.parse(FIXTURE_NOW) + minutes * MS_PER_MINUTE).toISOString())

const REVIEW_8247 = reviewId("review_8247_decide_pitch")
const REVIEW_8244 = reviewId("review_8244_brief_extra")
const REVIEW_8236 = reviewId("review_8236_decide_pitch")

const PITCH_GOLDEN = datasetId("pitch_golden_v4")
const PITCH_PROMPT = { id: "pitch_v7", revision: revisionId("r42") }

const DECIDE_PITCH = pitchNode("decide_pitch")
const PITCH_GEN_D = pitchNode("pitch_gen_d")

const pitchQueue: readonly ReviewQueueItem[] = [
  {
    id: REVIEW_8247,
    runId: runId("8247"),
    stage: DECIDE_PITCH.stage,
    nodeId: DECIDE_PITCH.id,
    kind: "approval",
    status: "pending",
    trigger: { kind: "verdict", verdict: "needs_human", required: "approved" },
    sla: { budgetMinutes: 240, dueAt: minutesFromNow(192) },
  },
  {
    id: REVIEW_8244,
    runId: runId("8244"),
    stage: PITCH_GEN_D.stage,
    nodeId: PITCH_GEN_D.id,
    kind: "input",
    status: "pending",
    trigger: { kind: "humanInput", slot: "brief addition" },
    sla: { budgetMinutes: null, dueAt: minutesFromNow(520) },
  },
  {
    id: REVIEW_8236,
    runId: runId("8236"),
    stage: DECIDE_PITCH.stage,
    nodeId: DECIDE_PITCH.id,
    kind: "approval",
    status: "escalated",
    trigger: { kind: "verdict", verdict: "needs_human", required: "approved" },
    sla: { budgetMinutes: 240, dueAt: minutesFromNow(-65) },
  },
]

const modelOf = (id: string): string => pitchNode(id).model?.model ?? ""

const pitchDetails: readonly ReviewDetail[] = [
  {
    id: REVIEW_8247,
    row: rowId("07"),
    branch: "b",
    produced: { title: "Park, spa and quiet", highlights: ["12 ha park", "1,200 m² spa", "third hook empty"] },
    call: {
      nodeId: nodeId("pitch_gen_b"),
      model: modelOf("pitch_gen_b"),
      temperature: 0.9,
      prompt: PITCH_PROMPT,
      costUsd: 0.0611,
      durationS: 7.3,
      postChecks: [{ name: "hooks[*] non-empty", pass: false }],
    },
    escalation: {
      verdict: "needs_human",
      summary:
        "facts pass, tone passes, but the third hook is empty and the loop stopped on stagnation at 0.814 — below threshold 0.90.",
    },
    judges: [
      { judge: "style", score: 0.83 },
      { judge: "facts", score: 0.88 },
      { judge: "tone", score: 0.8 },
    ],
    loop: { iterations: 4, stopReason: "stagnation" },
    expected: { title: "A holiday next to the park" },
    dataset: { id: PITCH_GOLDEN, ordinal: 7, rowCount: 48 },
  },
  {
    id: REVIEW_8244,
    row: rowId("41"),
    branch: "d",
    produced: { title: "Negotiations by the sea", highlights: ["room for 20", "240 m to beach", "late checkout"] },
    call: {
      nodeId: PITCH_GEN_D.id,
      model: modelOf("pitch_gen_d"),
      temperature: 0.9,
      prompt: PITCH_PROMPT,
      costUsd: 0.0112,
      durationS: 2,
      postChecks: [{ name: "hooks[*] non-empty", pass: true }],
    },
    escalation: {
      verdict: "needs_human",
      summary: "the prompt slot $brief_extra is bound to @lead and is still empty, so the branch waits before the critic loop.",
    },
    judges: [
      { judge: "style", score: 0.84 },
      { judge: "facts", score: 0.91 },
      { judge: "tone", score: 0.83 },
    ],
    loop: { iterations: 1, stopReason: "threshold" },
    expected: { title: "Negotiations by the sea" },
    dataset: { id: PITCH_GOLDEN, ordinal: 41, rowCount: 48 },
  },
  {
    id: REVIEW_8236,
    row: rowId("33"),
    branch: "c",
    produced: { title: "Sochi without overpaying", highlights: ["price for 3 nights", "right on the water", "transfer included"] },
    call: {
      nodeId: nodeId("pitch_gen_c"),
      model: modelOf("pitch_gen_c"),
      temperature: 0.9,
      prompt: PITCH_PROMPT,
      costUsd: 0.0106,
      durationS: 1.6,
      postChecks: [
        { name: "hooks[*] non-empty", pass: true },
        { name: "claims ⊆ facts", pass: false },
      ],
    },
    escalation: {
      verdict: "needs_human",
      summary: "hooks pass, but facts reject “right on the water” for a hotel 240 m away and the loop stopped on stagnation at 0.814 — below threshold 0.90.",
    },
    judges: [
      { judge: "style", score: 0.72 },
      { judge: "facts", score: 0.41 },
      { judge: "tone", score: 0.79 },
    ],
    loop: { iterations: 4, stopReason: "stagnation" },
    expected: { title: "240 m to beach" },
    dataset: { id: PITCH_GOLDEN, ordinal: 33, rowCount: 48 },
  },
]

const detailEntry = (detail: ReviewDetail): readonly [string, ReviewDetail] => [
  workflowKey(WORKFLOWS.pitchPipeline, detail.id),
  detail,
]

export const reviewQueues: Readonly<Record<string, readonly ReviewQueueItem[]>> = perWorkflow((workflow) =>
  workflow === WORKFLOWS.pitchPipeline ? pitchQueue : [],
)

export const reviewDetails: Readonly<Record<string, ReviewDetail>> = Object.fromEntries(pitchDetails.map(detailEntry))
