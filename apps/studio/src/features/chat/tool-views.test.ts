import { describe, expect, it } from "vitest"
import type { PatchSpecArgs, PatchSpecResult, ReadRunArgs, ReadRunResult, RunDatasetArgs, RunDatasetResult } from "@/domain"
import { runId } from "@/data/ids"
import { isPatchSpecArgs, isPatchSpecProgress, isPatchSpecResult, isReadRunArgs, isReadRunResult, isRunDatasetArgs, isRunDatasetResult } from "./guards"
import { designedToolCall, inlineText, snapshotOf, toolContext, type NavigationLog } from "./test-support"
import { PATCH_SPEC_VIEW, READ_RUN_VIEW, RUN_DATASET_VIEW } from "./tool-views"

type Settled<A, R> = { readonly args: A; readonly result: R }

const settled = <A, R>(
  toolCallId: string,
  args: (value: unknown) => value is A,
  result: (value: unknown) => value is R,
): Settled<A, R> => {
  const part = snapshotOf(designedToolCall(toolCallId), "complete")
  if (!args(part.args) || !result(part.result)) throw new Error(`${toolCallId} does not match its tool contract`)
  return { args: part.args, result: part.result }
}

describe("read_run view", () => {
  const log: NavigationLog = []
  const ctx = toolContext(log)
  const { args, result }: Settled<ReadRunArgs, ReadRunResult> = settled("tc_read_run_1", isReadRunArgs, isReadRunResult)

  it("renders the designed card", () => {
    expect(inlineText(READ_RUN_VIEW.title(args, result, ctx))).toBe("read_run · #8247 · pitch_gen_b")
    expect(READ_RUN_VIEW.lines(result, ctx).map(inlineText)).toEqual([
      "attempts: 429 → schema → truncated → fallback",
      "billed $0.0611 · of that failed $0.0100",
    ])
    expect(READ_RUN_VIEW.actions(args, result, ctx).map((action) => action.label)).toEqual(["To attempt ladder", "Attempt 2 prompt"])
  })

  it("opens the attempt ladder and the failed attempt prompt, and omits the prompt action without a schema failure", () => {
    const [ladder, prompt] = READ_RUN_VIEW.actions(args, result, ctx)
    ladder?.run()
    prompt?.run()
    expect(log).toEqual(["attempts 8247 pitch_gen_b", "call 8247 call_01HT9 prompt"])
    const clean: ReadRunResult = { ...result, attempts: ["http_429", "fallback"] }
    expect(READ_RUN_VIEW.actions(args, clean, ctx).map((action) => action.label)).toEqual(["To attempt ladder"])
  })
})

describe("patch_spec view", () => {
  const ctx = toolContext([])
  const { args, result }: Settled<PatchSpecArgs, PatchSpecResult> = settled("tc_patch_spec_1", isPatchSpecArgs, isPatchSpecResult)

  it("renders the designed card with success-toned change lines", () => {
    expect(inlineText(PATCH_SPEC_VIEW.title(args, result, ctx))).toBe("patch_spec · r42 · 2 nodes")
    const lines = PATCH_SPEC_VIEW.lines(result, ctx)
    expect(lines.map(inlineText)).toEqual([
      "+ pitch_gen_b.max_tokens: 4096 → 8192",
      "+ brand_voice v3 → v4 (superlatives banned)",
      "branches affected: 4 · run estimate ~$0.11",
    ])
    expect(lines.slice(0, 2)).toEqual([
      { text: "+ pitch_gen_b.max_tokens: 4096 → 8192", tone: "success" },
      { text: "+ brand_voice v3 → v4 (superlatives banned)", tone: "success" },
    ])
  })

  it("keeps Apply and Revert enabled only for a draft", () => {
    const draft = PATCH_SPEC_VIEW.actions(args, result, ctx)
    expect(draft.map((action) => [action.label, action.disabled])).toEqual([
      ["Show diff", false],
      ["Apply", false],
      ["Revert", false],
    ])
    const applied = PATCH_SPEC_VIEW.actions(args, { ...result, state: "applied" }, ctx)
    expect(applied.map((action) => action.disabled)).toEqual([false, true, true])
  })

  it("renders the running progress line", () => {
    const part = snapshotOf(designedToolCall("tc_patch_spec_2"), "running")
    if (!isPatchSpecArgs(part.args) || !isPatchSpecProgress(part.artifact)) throw new Error("tc_patch_spec_2 has no progress")
    expect(inlineText(PATCH_SPEC_VIEW.progress(part.args, part.artifact, ctx))).toBe("editing judge_panel · 2 of 3 steps")
  })
})

describe("run_dataset view", () => {
  const log: NavigationLog = []
  const ctx = toolContext(log)
  const { args, result }: Settled<RunDatasetArgs, RunDatasetResult> = settled("tc_run_dataset_1", isRunDatasetArgs, isRunDatasetResult)

  it("renders the designed card with a success-toned full score", () => {
    expect(inlineText(RUN_DATASET_VIEW.title(args, result, ctx))).toBe("run_dataset · regress_truncated")
    const lines = RUN_DATASET_VIEW.lines(result, ctx)
    expect(lines.map(inlineText)).toEqual([
      "regress_truncated · 12/12 · $0.18",
      "pitch_golden_v4 · 44/48 · $0.61",
      "live calls · no cassette recording",
    ])
    expect(lines[0]).toContainEqual({ text: "12/12", tone: "success" })
    expect(lines[1]).toContainEqual({ text: "44/48" })
  })

  it("labels cassette runs and enables Open run only when the dataset run produced one", () => {
    const cassette: RunDatasetResult = { ...result, callMode: "cassette", recordCassette: true, runId: runId("8247") }
    const withoutRun: RunDatasetResult = { ...result, runId: null }
    expect(inlineText(RUN_DATASET_VIEW.lines(cassette, ctx).at(-1) ?? "")).toBe("cassette calls · cassette recording")
    expect(RUN_DATASET_VIEW.actions(args, withoutRun, ctx).map((action) => action.disabled)).toEqual([true])
    expect(RUN_DATASET_VIEW.actions(args, cassette, ctx).map((action) => action.disabled)).toEqual([false])
    RUN_DATASET_VIEW.actions(args, cassette, ctx)[0]?.run()
    expect(log).toEqual(["run 8247"])
  })
})
