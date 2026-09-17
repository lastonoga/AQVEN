import { describe, expect, it } from "vitest"
import type { ChatToolCallPart, ToolName } from "@/domain"
import { chatThreads } from "@/mocks/data/chat"
import {
  NO_PROGRESS,
  isPatchSpecArgs,
  isPatchSpecProgress,
  isPatchSpecResult,
  isReadRunArgs,
  isReadRunResult,
  isRunDatasetArgs,
  isRunDatasetResult,
} from "./guards"
import { threadToolCalls } from "./test-support"

type PartGuards = {
  readonly args: (value: unknown) => boolean
  readonly result: (value: unknown) => boolean
  readonly progress: (value: unknown) => boolean
}

const GUARDS: Readonly<Record<ToolName, PartGuards>> = {
  read_run: { args: isReadRunArgs, result: isReadRunResult, progress: NO_PROGRESS },
  patch_spec: { args: isPatchSpecArgs, result: isPatchSpecResult, progress: isPatchSpecProgress },
  run_dataset: { args: isRunDatasetArgs, result: isRunDatasetResult, progress: NO_PROGRESS },
}

const allToolCalls: readonly ChatToolCallPart[] = Object.values(chatThreads).flatMap(threadToolCalls)

const settledOrPending = (part: ChatToolCallPart): boolean => {
  const guards = GUARDS[part.toolName]
  if ("result" in part) return guards.result(part.result)
  return "artifact" in part && guards.progress(part.artifact)
}

describe("chat tool guards", () => {
  it("accept every tool call served by the mock backend", () => {
    expect(allToolCalls.length).toBeGreaterThan(0)
    expect(allToolCalls.every((part) => GUARDS[part.toolName].args(part.args))).toBe(true)
    expect(allToolCalls.every(settledOrPending)).toBe(true)
  })

  it("reject malformed payloads", () => {
    expect(isReadRunArgs({ runId: 8247, nodeId: "pitch_gen_b" })).toBe(false)
    expect(isReadRunResult({ attempts: ["http_500"], billedUsd: 0.06, failedUsd: 0.01, callId: "call_01HT9", columnId: "pitch_gen_b" })).toBe(false)
    expect(isReadRunResult({ attempts: ["http_429"], billedUsd: 0.06, failedUsd: 0.01 })).toBe(false)
    expect(isPatchSpecResult({ revision: "r42", nodeCount: 1, changes: [{ kind: "rename" }], branchesAffected: 1, runEstimateUsd: 0.1, state: "draft" })).toBe(false)
    expect(isPatchSpecProgress({ target: "judge_panel", step: "2", totalSteps: 3 })).toBe(false)
    expect(isRunDatasetResult({ scores: [], callMode: "replay", recordCassette: false, runId: null })).toBe(false)
    expect(isRunDatasetArgs(null)).toBe(false)
    expect(NO_PROGRESS({ target: "judge_panel", step: 2, totalSteps: 3 })).toBe(false)
  })
})
