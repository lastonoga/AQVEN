import { describe, expect, it } from "vitest"
import { waitEvidence } from "./review-sections"
import { copy, toolApprovalWait } from "./test-support"

describe("waitEvidence", () => {
  it("builds one column per pending tool call with its arguments as rows", () => {
    expect(waitEvidence(toolApprovalWait, copy.t)).toEqual([
      {
        id: "call_72A68FD2786D4691914A4B38",
        title: "issue_store_credit",
        lines: ["call call_72A68FD2786D4691914A4B38"],
        rows: [
          { key: "amount", value: '{\n  "amount_minor": 2000,\n  "currency": "eur"\n}' },
          { key: "customer_id", value: "cus_7k2m9p4q1x8z" },
          { key: "order_id", value: "LUM-20260903" },
        ],
        value: {
          amount: { amount_minor: 2000, currency: "eur" },
          customer_id: "cus_7k2m9p4q1x8z",
          order_id: "LUM-20260903",
        },
      },
    ])
  })

  it("builds one column per bound input for a form wait", () => {
    const detail = { ...toolApprovalWait, wait_kind: "form" as const, suspend_data: { kind: "inline" as const, value: { reply: { text: "hi" }, score: 0.9 } } }
    expect(waitEvidence(detail, copy.t)).toEqual([
      { id: "reply", title: "reply", lines: [], rows: [{ key: "text", value: "hi" }], value: { text: "hi" } },
      { id: "score", title: "score", lines: [], rows: [{ key: "score", value: "0.9" }], value: 0.9 },
    ])
  })

  it("names the blob instead of inlining it", () => {
    const detail = { ...toolApprovalWait, suspend_data: { kind: "blob" as const, blob_id: "blob_1", sha256: "sha256-1", size_bytes: 12, media_type: "application/json", preview: "", truncated: false } }
    expect(waitEvidence(detail, copy.t)).toEqual([
      { id: "blob", title: "What the run produced", lines: ["stored as blob blob_1"], rows: [] },
    ])
  })

  it("returns nothing when the engine kept no suspend data", () => {
    expect(waitEvidence({ ...toolApprovalWait, suspend_data: null }, copy.t)).toEqual([])
  })
})
