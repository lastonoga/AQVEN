import { createTranslator } from "use-intl"
import type { ApiExecutionDetail, ApiHumanWait, ApiHumanWaitDetail, ApiJsonObject, ApiRun } from "@/domain"
import { formats } from "@/i18n/formats"
import { messages } from "@/i18n/messages"
import { TEST_NOW } from "@/test/clock"
import type { ReviewCopy, ReviewEntry } from "./presenters"

export const NOW = TEST_NOW

const MINUTE = 60_000
const at = (minutes: number): string => new Date(NOW.getTime() + minutes * MINUTE).toISOString()

export const FORM_DEADLINE = at(3 * 60 + 32)
export const APPROVAL_DEADLINE = at(-(60 + 19))

export const copy: ReviewCopy = {
  t: createTranslator({ locale: "en", messages: messages.en, formats, namespace: "review" }),
  domain: createTranslator({ locale: "en", messages: messages.en, formats, namespace: "domain" }),
}

export const FORM_RUN_ID = "01a0b148-4489-7696-91c6-841c80234778"
export const APPROVAL_RUN_ID = "01a0b104-4658-70aa-b49b-7c2586b56d92"

export const formWait: ApiHumanWait = {
  address: { node_id: "approvals__lead", branch_key: "lead", iteration: null, item_index: null },
  wait_kind: "form",
  attempt: 1,
  state: "waiting",
  assignee: "support_lead",
  waiting_since: at(-28),
  deadline_at: FORM_DEADLINE,
  on_timeout: "escalate",
  form_type_id: "ReplyApproval",
}

export const approvalWait: ApiHumanWait = {
  address: { node_id: "route__resolve", branch_key: "defect", iteration: null, item_index: null },
  wait_kind: "tool_approval",
  attempt: 3,
  state: "waiting",
  assignee: "support_lead",
  waiting_since: at(-(2 * 60 + 19)),
  deadline_at: APPROVAL_DEADLINE,
  on_timeout: "fail",
  form_type_id: "ToolApprovalAnswer",
}

export const formRun: ApiRun = {
  run_id: FORM_RUN_ID,
  flow_id: "support_case",
  status: "suspended",
  mode: "replay",
  started_at: "2026-09-17T21:31:38.516000Z",
  finished_at: null,
  cost_usd: "0",
  tokens_in: 0,
  tokens_out: 0,
  node_counts: { pending: 1, running: 1, ok: 37, failed: 1, skipped: 0, suspended: 0, cancelled: 0 },
  content_hash: "sha256-1d6cd1dcac8472621e14b90be07aa0602ee3ccace830062172604028558882e5",
  definition_changed: false,
  waits: [formWait],
  lineage: { relation: "fork", parent_run_id: APPROVAL_RUN_ID },
}

export const approvalRun: ApiRun = {
  ...formRun,
  run_id: APPROVAL_RUN_ID,
  started_at: "2026-09-17T20:17:21.525604Z",
  lineage: null,
  waits: [approvalWait],
}

export const replyApprovalSchema: ApiJsonObject = {
  additionalProperties: false,
  properties: {
    decision: { enum: ["approve", "edit", "reject"], type: "string" },
    edited_text: { anyOf: [{ maxLength: 1500, type: "string" }, { type: "null" }] },
    note: { anyOf: [{ maxLength: 400, type: "string" }, { type: "null" }] },
  },
  required: ["decision", "edited_text", "note"],
  type: "object",
}

export const mediaApprovalSchema: ApiJsonObject = {
  additionalProperties: false,
  properties: { use_image: { type: "boolean" }, use_voice: { type: "boolean" }, use_clip: { type: "boolean" } },
  required: ["use_image", "use_voice", "use_clip"],
  type: "object",
}

export const toolApprovalSchema: ApiJsonObject = {
  $defs: {
    ToolCallDecision: {
      additionalProperties: false,
      properties: {
        approve: { title: "Approve", type: "boolean" },
        message: { anyOf: [{ type: "string" }, { type: "null" }], default: null, title: "Message" },
        override_args: { anyOf: [{ type: "object" }, { type: "null" }], default: null },
      },
      required: ["approve"],
      title: "ToolCallDecision",
      type: "object",
    },
  },
  additionalProperties: false,
  properties: {
    approve: { title: "Approve", type: "boolean" },
    message: { anyOf: [{ type: "string" }, { type: "null" }], default: null, title: "Message" },
    calls: { additionalProperties: { $ref: "#/$defs/ToolCallDecision" }, title: "Calls", type: "object" },
  },
  required: ["approve"],
  title: "ToolApprovalAnswer",
  type: "object",
}

export const toolApprovalWait: ApiHumanWaitDetail = {
  ...approvalWait,
  form_schema: toolApprovalSchema,
  suspend_data: {
    kind: "inline",
    value: {
      calls: [
        {
          tool_call_id: "call_72A68FD2786D4691914A4B38",
          tool_name: "issue_store_credit",
          args: { amount: { amount_minor: 2000, currency: "eur" }, customer_id: "cus_7k2m9p4q1x8z", order_id: "LUM-20260903" },
        },
      ],
    },
  },
  attempts: [
    {
      attempt: 3,
      assignee: "support_lead",
      waiting_since: at(-(2 * 60 + 19)),
      deadline_at: APPROVAL_DEADLINE,
      state: "waiting",
      resolved_at: null,
    },
  ],
  resolved_by: null,
  answer_ref: null,
  ignored_answers: [],
}

export const approvalExecution: ApiExecutionDetail = {
  address: toolApprovalWait.address,
  kind: "llm",
  status: "suspended",
  attempts_count: 1,
  started_at: "2026-09-17T20:17:21.525604Z",
  finished_at: null,
  latency_ms: null,
  agent: null,
  inference: null,
  model: "openrouter:openai/gpt-oss-20b",
  profile: null,
  cost_usd: "0",
  tokens_in: 0,
  tokens_out: 0,
  cache_hit: false,
  degraded: false,
  summary: null,
  input_ref: null,
  output_ref: null,
  trace_id: null,
  span_id: null,
  provenance: {},
  schema_source: "unavailable",
  allowed_sets: [],
  prompt: null,
  response: null,
  attempts: [],
  checks: [],
  rule_firings: [],
  error: null,
  human: toolApprovalWait,
}

export const formEntry: ReviewEntry = { run: formRun, wait: formWait }
export const approvalEntry: ReviewEntry = { run: approvalRun, wait: approvalWait }
