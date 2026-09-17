import { describe, expect, it } from "vitest"
import type { IsoDateTime, ShellData } from "@/domain"
import { isoDateTime, runId, workflowId, workspaceId } from "@/data/ids"
import { runBadge, workflowRows, type WorkflowRowCopy } from "./presenters"

const SINCE: Readonly<Record<string, string>> = {
  "2026-09-16T10:00:00Z": "2 h ago",
  "2026-09-15T12:00:00Z": "yesterday",
}

const copy: WorkflowRowCopy = {
  stages: (count) => `${String(count)} stages`,
  run: (ref) => `run ${ref}`,
  neverRun: "never run",
  since: (date: IsoDateTime) => SINCE[date] ?? date,
}

const shell: ShellData = {
  workspace: { id: workspaceId("hotel_pitch"), initial: "A" },
  currentWorkflowId: workflowId("pitch_pipeline"),
  latestRun: { id: runId("8247"), status: "degraded" },
  workflows: [
    { id: workflowId("pitch_pipeline"), stageCount: 7, lastRun: { id: runId("8247"), startedAt: isoDateTime("2026-09-16T10:00:00Z") } },
    { id: workflowId("seo_brief_writer"), stageCount: 4, lastRun: { id: runId("8102"), startedAt: isoDateTime("2026-09-15T12:00:00Z") } },
    { id: workflowId("support_triage"), stageCount: 8, lastRun: null },
  ],
}

describe("workflowRows", () => {
  it("joins stage count, run reference and relative time into one meta line", () => {
    expect(workflowRows(shell, copy).map((row) => row.meta)).toEqual([
      "7 stages · run #8247 · 2 h ago",
      "4 stages · run #8102 · yesterday",
      "8 stages · never run",
    ])
  })

  it("marks only the current workflow and gives it the llm dot", () => {
    expect(workflowRows(shell, copy).map((row) => [row.id, row.current, row.dot])).toEqual([
      ["pitch_pipeline", true, "llm"],
      ["seo_brief_writer", false, "neutral"],
      ["support_triage", false, "neutral"],
    ])
  })
})

describe("runBadge", () => {
  it.each([
    ["degraded", "warning"],
    ["ok", "success"],
    ["failed", "destructive"],
  ] as const)("maps a %s run to the %s tone with a # reference", (status, tone) => {
    expect(runBadge({ id: runId("8247"), status })).toEqual({ label: "#8247", tone })
  })
})
