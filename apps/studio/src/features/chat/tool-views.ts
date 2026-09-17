import type {
  AttemptCode,
  CallSheetTab,
  DatasetScore,
  PatchSpecArgs,
  PatchSpecProgress,
  PatchSpecResult,
  ReadRunArgs,
  ReadRunResult,
  RunDatasetArgs,
  RunDatasetResult,
  RunId,
  SpecChange,
} from "@/domain"
import type { Inline, Span } from "@/components/studio"
import { SEPARATOR, joinMeta, ratio, runRef, usd } from "@/lib/format"
import { noop } from "@/lib/noop"
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
import type { ToolContext } from "./tool-context"

export type ToolAction = { readonly label: string; readonly run: () => void; readonly disabled: boolean }

export type ToolGuards<A, R, P> = {
  readonly args: (value: unknown) => value is A
  readonly result: (value: unknown) => value is R
  readonly progress: (value: unknown) => value is P
}

export type ToolView<A, R, P> = {
  readonly guards: ToolGuards<A, R, P>
  readonly title: (args: A, result: R, ctx: ToolContext) => Inline
  readonly lines: (result: R, ctx: ToolContext) => readonly Inline[]
  readonly actions: (args: A, result: R, ctx: ToolContext) => readonly ToolAction[]
  readonly progress: (args: A, progress: P, ctx: ToolContext) => Inline
}

const ARROW = " → "
const EXACT_USD = 4
const ROUNDED_USD = 2
const NO_PROGRESS_LABEL = ""
const PROMPT_TAB: CallSheetTab = "prompt"

const ATTEMPT_CODE: Readonly<Record<AttemptCode, string>> = {
  http_429: "429",
  schema_invalid: "schema",
  truncated: "truncated",
  fallback: "fallback",
}

const CALL_MODE_KEY = {
  live: "tool.runDataset.callModeLive",
  cassette: "tool.runDataset.callModeCassette",
} as const satisfies Readonly<Record<RunDatasetResult["callMode"], string>>

const action = (label: string, run: () => void, disabled = false): ToolAction => ({ label, run, disabled })

const firstSchemaFailure = (attempts: readonly AttemptCode[]): number => attempts.indexOf("schema_invalid") + 1

const attemptPromptActions = (args: ReadRunArgs, result: ReadRunResult, ctx: ToolContext): readonly ToolAction[] => {
  const attempt = firstSchemaFailure(result.attempts)
  if (attempt === 0) return []
  return [
    action(ctx.t("tool.readRun.attemptPrompt", { n: attempt }), () => {
      ctx.openCall(args.runId, result.callId, PROMPT_TAB)
    }),
  ]
}

export const READ_RUN_VIEW: ToolView<ReadRunArgs, ReadRunResult, never> = {
  guards: { args: isReadRunArgs, result: isReadRunResult, progress: NO_PROGRESS },
  title: (args) => joinMeta(["read_run", runRef(args.runId), args.nodeId]),
  lines: (result, { t }) => [
    t("tool.readRun.attempts", { sequence: result.attempts.map((code) => ATTEMPT_CODE[code]).join(ARROW) }),
    joinMeta([
      t("tool.readRun.billed", { amount: usd(result.billedUsd, EXACT_USD) }),
      t("tool.readRun.failedShare", { amount: usd(result.failedUsd, EXACT_USD) }),
    ]),
  ],
  actions: (args, result, ctx) => [
    action(ctx.t("tool.readRun.toLadder"), () => {
      ctx.openAttempts(args.runId, result.columnId)
    }),
    ...attemptPromptActions(args, result, ctx),
  ],
  progress: () => NO_PROGRESS_LABEL,
}

const changeLine = (change: SpecChange): Span => {
  if (change.kind === "field") return { text: `+ ${change.nodeId}.${change.field}: ${change.from}${ARROW}${change.to}`, tone: "success" }
  return { text: `+ ${change.knowledgeId} ${change.from}${ARROW}${change.to} (${change.note})`, tone: "success" }
}

export const PATCH_SPEC_VIEW: ToolView<PatchSpecArgs, PatchSpecResult, PatchSpecProgress> = {
  guards: { args: isPatchSpecArgs, result: isPatchSpecResult, progress: isPatchSpecProgress },
  title: (_args, result, { t }) => joinMeta(["patch_spec", result.revision, t("tool.patchSpec.nodes", { count: result.nodeCount })]),
  lines: (result, { t }) => [
    ...result.changes.map(changeLine),
    joinMeta([
      t("tool.patchSpec.branchesAffected", { count: result.branchesAffected }),
      t("tool.patchSpec.runEstimate", { amount: usd(result.runEstimateUsd, ROUNDED_USD) }),
    ]),
  ],
  actions: (_args, result, { t }) => {
    const settled = result.state !== "draft"
    return [
      action(t("tool.patchSpec.showDiff"), noop),
      action(t("tool.patchSpec.apply"), noop, settled),
      action(t("tool.patchSpec.revert"), noop, settled),
    ]
  },
  progress: (_args, progress, { t }) =>
    joinMeta([
      t("tool.patchSpec.progressTarget", { target: progress.target }),
      t("tool.patchSpec.progressSteps", { step: progress.step, total: progress.totalSteps }),
    ]),
}

const ratioSpan = (score: DatasetScore): Span => {
  const text = ratio(score, false)
  if (score.passed !== score.total) return { text }
  return { text, tone: "success" }
}

const scoreLine = (score: DatasetScore): readonly Span[] => [
  { text: `${score.datasetId}${SEPARATOR}` },
  ratioSpan(score),
  { text: `${SEPARATOR}${usd(score.costUsd, ROUNDED_USD)}` },
]

const openRunAction = (runId: RunId | null, ctx: ToolContext): ToolAction => {
  const label = ctx.t("tool.runDataset.openRun")
  if (runId === null) return action(label, noop, true)
  return action(label, () => {
    ctx.openRun(runId)
  })
}

export const RUN_DATASET_VIEW: ToolView<RunDatasetArgs, RunDatasetResult, never> = {
  guards: { args: isRunDatasetArgs, result: isRunDatasetResult, progress: NO_PROGRESS },
  title: (args) => joinMeta(["run_dataset", args.datasetId]),
  lines: (result, { t }) => [
    ...result.scores.map(scoreLine),
    joinMeta([
      t(CALL_MODE_KEY[result.callMode]),
      t(result.recordCassette ? "tool.runDataset.recordingOn" : "tool.runDataset.recordingOff"),
    ]),
  ],
  actions: (_args, result, ctx) => [openRunAction(result.runId, ctx)],
  progress: () => NO_PROGRESS_LABEL,
}
