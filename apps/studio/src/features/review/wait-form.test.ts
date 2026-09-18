import { describe, expect, it } from "vitest"
import { emptyDraft, RAW_FIELD, readPayload, readWaitForm, type AnswerDraft, type FieldValue } from "./wait-form"
import { mediaApprovalSchema, replyApprovalSchema, toolApprovalSchema } from "./test-support"

const fieldsOf = (form: ReturnType<typeof readWaitForm>) => (form.kind === "fields" ? form.fields : [])

describe("readWaitForm", () => {
  it("reads ReplyApproval as an enum plus two nullable texts", () => {
    expect(fieldsOf(readWaitForm(replyApprovalSchema))).toEqual([
      { control: "enum", options: ["approve", "edit", "reject"], name: "decision", label: "decision", required: true, nullable: false },
      { control: "text", multiline: true, maxLength: 1500, name: "edited_text", label: "edited_text", required: true, nullable: true },
      { control: "text", multiline: true, maxLength: 400, name: "note", label: "note", required: true, nullable: true },
    ])
  })

  it("reads MediaApproval as three required booleans", () => {
    expect(fieldsOf(readWaitForm(mediaApprovalSchema)).map((field) => [field.name, field.control, field.required])).toEqual([
      ["use_image", "boolean", true],
      ["use_voice", "boolean", true],
      ["use_clip", "boolean", true],
    ])
  })

  it("falls back to a json control for the nested calls map of ToolApprovalAnswer", () => {
    expect(fieldsOf(readWaitForm(toolApprovalSchema)).map((field) => [field.name, field.control, field.label])).toEqual([
      ["approve", "boolean", "Approve"],
      ["message", "text", "Message"],
      ["calls", "json", "Calls"],
    ])
  })

  it("falls back to a raw payload form when no schema is known", () => {
    expect(readWaitForm(null)).toEqual({ kind: "raw" })
    expect(readWaitForm({ type: "string" })).toEqual({ kind: "raw" })
  })
})

describe("readPayload", () => {
  it("submits the ReplyApproval defaults the engine accepts", () => {
    const form = readWaitForm(replyApprovalSchema)
    expect(readPayload(form, emptyDraft(form))).toEqual({ ok: true, payload: { decision: "approve", edited_text: null, note: null } })
  })

  it("keeps typed text and coerces an emptied nullable field to null", () => {
    const form = readWaitForm(replyApprovalSchema)
    const draft: AnswerDraft = new Map([
      ["decision", "edit"],
      ["edited_text", "fixed reply"],
      ["note", ""],
    ])
    expect(readPayload(form, draft)).toEqual({ ok: true, payload: { decision: "edit", edited_text: "fixed reply", note: null } })
  })

  it("parses the json control and reports the field when the text is broken", () => {
    const form = readWaitForm(toolApprovalSchema)
    const good = new Map<string, FieldValue>([
      ["approve", true],
      ["message", ""],
      ["calls", '{"call_1":{"approve":true}}'],
    ])
    expect(readPayload(form, good)).toEqual({ ok: true, payload: { approve: true, message: null, calls: { call_1: { approve: true } } } })
    expect(readPayload(form, new Map([...good, ["calls", "{oops"]]))).toEqual({ ok: false, invalid: ["calls"] })
  })

  it("parses the raw payload form", () => {
    const form = readWaitForm(null)
    expect(readPayload(form, new Map([[RAW_FIELD, '{"decision":"approve"}']]))).toEqual({ ok: true, payload: { decision: "approve" } })
    expect(readPayload(form, new Map([[RAW_FIELD, "nope"]]))).toEqual({ ok: false, invalid: [RAW_FIELD] })
  })
})
