import { describe, expect, it } from "vitest"
import { designedToolCall, snapshotOf, toolContext } from "./test-support"
import { presentToolCall, type ToolCallSnapshot } from "./tool-card-model"
import { PATCH_SPEC_VIEW, READ_RUN_VIEW } from "./tool-views"

const ctx = toolContext([])
const readRun = snapshotOf(designedToolCall("tc_read_run_1"), "complete")
const running = snapshotOf(designedToolCall("tc_patch_spec_2"), "requires-action")

const ERROR_CARD = { kind: "card", tone: "destructive", title: "read_run", lines: ["Tool call failed"], actions: [] }

describe("presentToolCall", () => {
  it("presents a settled tool call as a full llm card", () => {
    const model = presentToolCall(readRun, READ_RUN_VIEW, ctx)
    expect(model).toMatchObject({ kind: "card", tone: "llm", title: "read_run · #8247 · pitch_gen_b" })
  })

  it("presents a pending tool call with progress as a progress row", () => {
    expect(presentToolCall(running, PATCH_SPEC_VIEW, ctx)).toEqual({ kind: "progress", label: "editing judge_panel · 2 of 3 steps" })
    expect(presentToolCall({ ...running, statusType: "running" }, PATCH_SPEC_VIEW, ctx)).toMatchObject({ kind: "progress" })
  })

  it("hides a pending tool call without readable progress", () => {
    expect(presentToolCall({ ...readRun, result: undefined }, READ_RUN_VIEW, ctx)).toEqual({ kind: "hidden" })
    expect(presentToolCall({ ...running, artifact: { step: 2 } }, PATCH_SPEC_VIEW, ctx)).toEqual({ kind: "hidden" })
  })

  it.each<readonly [string, ToolCallSnapshot]>([
    ["invalid args", { ...readRun, args: { runId: 8247 } }],
    ["an error flag", { ...readRun, isError: true }],
    ["an incomplete status", { ...readRun, statusType: "incomplete" }],
    ["an invalid result", { ...readRun, result: { attempts: "four" } }],
  ])("presents %s as the error card", (_label, part) => {
    expect(presentToolCall(part, READ_RUN_VIEW, ctx)).toEqual(ERROR_CARD)
  })
})
