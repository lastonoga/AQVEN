import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import type { ApiExperimentDetail } from "@/domain"
import { liveExperiments } from "@/mocks/data/experiments"
import { liveProject } from "@/mocks/data/project"
import { server } from "@/mocks/node"
import { TEST_NOW } from "@/test/clock"
import { renderRoute } from "@/test/render-route"
import * as ids from "@/data/ids"
import { GROUPING_KEY, seenKey, seenMarks } from "./viewer-memory"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const OPEN_PREFIX = "Open experiment "
const NEW = "new"
const SEEN_KEY = seenKey(liveProject.root)
const MINUTE_MS = 60_000

const openLink = (id: string): Promise<HTMLElement> => screen.findByRole("link", { name: `${OPEN_PREFIX}${id}` })

const rowOf = async (id: string): Promise<HTMLElement> => {
  const row = (await openLink(id)).closest("[role=row]")
  if (!(row instanceof HTMLElement)) throw new Error(`No row for ${id}`)
  return row
}

const sectionOf = (name: string): Promise<HTMLElement> => screen.findByRole("region", { name })

const sectionTitles = async (): Promise<readonly string[]> => {
  await screen.findAllByRole("table")
  return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)
}

const experimentsIn = async (name: string): Promise<readonly string[]> =>
  within(within(await sectionOf(name)).getByRole("table", { name: `Experiments on ${name}` }))
    .getAllByRole("link")
    .map((link) => (link.getAttribute("aria-label") ?? "").replace(OPEN_PREFIX, ""))

const fresh = async (id: string): Promise<boolean> => within(await rowOf(id)).queryByText(NEW) !== null

const expanderOf = async (name: string): Promise<HTMLElement> => within(await sectionOf(name)).getByRole("button", { name })

const groupBy = (label: string): void => {
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Group by" })).getByRole("radio", { name: label }))
}

const captureHandoffs = (): unknown[] => {
  const sent: unknown[] = []
  server.use(
    http.post(`${API_BASE}/chat/sessions/:sessionId/messages`, async ({ request }) => {
      const body: unknown = await request.json()
      sent.push(typeof body === "object" && body !== null && "text" in body ? body.text : null)
      return HttpResponse.json({ turn_id: "turn-1", accepted_at: "2026-09-18T03:00:00Z" }, { status: 202 })
    }),
  )
  return sent
}

const clickWhenReady = async (button: HTMLElement): Promise<void> => {
  await waitFor(() => {
    expect(button.hasAttribute("disabled")).toBe(false)
  })
  fireEvent.click(button)
}

const minutesBefore = (minutes: number): string => new Date(TEST_NOW.getTime() - minutes * MINUTE_MS).toISOString()

const serveExperiments = (rows: readonly ApiExperimentDetail[]): void => {
  server.use(http.get(`${API_BASE}/experiments`, () => HttpResponse.json({ items: rows, next_cursor: null, total_estimate: rows.length })))
}

const blockStorage = (): void => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("storage is blocked")
  })
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage is blocked")
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ResearchScreen: activity", () => {
  it("groups the experiments by what is going on, the latest activity first, with older and archived ones folded", async () => {
    await renderRoute("/research")
    expect(await sectionTitles()).toEqual(["Running", "Needs you", "Changed today"])
    expect(await experimentsIn("Running")).toEqual(["intent_escalation_agents"])
    expect(await experimentsIn("Needs you")).toEqual(["reply_overpromise_risk", "panel_single_judge", "critique_planted_defects", "panel_judge_prompt"])
    expect(await experimentsIn("Changed today")).toEqual(["reply_noninferior_mistral", "intent_split_long_messages", "judge_panel_agents", "panel_merge_rule"])
    expect(within(await sectionOf("Needs you")).getByText("4 experiments")).toBeTruthy()
    expect(screen.getByText("15 experiments")).toBeTruthy()
    const older = await expanderOf("Older (5)")
    const archived = await expanderOf("Archived (1)")
    expect([older.getAttribute("aria-expanded"), archived.getAttribute("aria-expanded")]).toEqual(["false", "false"])
    expect(screen.queryByRole("link", { name: `${OPEN_PREFIX}reply_look` })).toBeNull()
    fireEvent.click(older)
    expect(await experimentsIn("Older (5)")).toEqual(["intent_ballot_pair", "panel_aa_noise", "critique_recall_by_agent", "reply_stage_budget", "reply_look"])
    fireEvent.click(archived)
    expect(await experimentsIn("Archived (1)")).toEqual(["panel_failure_scan"])
  })

  it("says why an experiment needs you", async () => {
    await renderRoute("/research")
    expect((await rowOf("reply_overpromise_risk")).textContent).toContain("spend waits for approval")
    expect((await rowOf("panel_single_judge")).textContent).toContain("last series invalid")
    expect((await rowOf("critique_planted_defects")).textContent).toContain("files changed after the last series")
    expect((await rowOf("panel_judge_prompt")).textContent).toContain("check errors")
    expect((await rowOf("reply_noninferior_mistral")).textContent).not.toContain("check errors")
  })

  it("tells when each experiment last moved, by its files or by its last series", async () => {
    const [first, second] = liveExperiments
    if (first === undefined || second === undefined) throw new Error("the fixture has experiments")
    serveExperiments([
      { ...first, last_activity: minutesBefore(12), activity_source: "files" },
      { ...second, last_activity: minutesBefore(120), activity_source: "series", running: true },
    ])
    await renderRoute("/research")
    expect((await rowOf(first.experiment_id)).textContent).toContain("changed 12m ago")
    expect((await rowOf(second.experiment_id)).textContent).toContain("last series 2h ago")
  })

  it("opens an experiment from its row", async () => {
    const router = await renderRoute("/research")
    fireEvent.click(await openLink("judge_panel_agents"))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/research/experiments/judge_panel_agents")
    })
  })
})

describe("ResearchScreen: new since the last visit", () => {
  it("marks what moved since this viewer last looked and moves the mark when the viewer leaves", async () => {
    localStorage.setItem(SEEN_KEY, "2026-09-22T12:00:00Z")
    const router = await renderRoute("/research")
    await sectionTitles()
    expect(await fresh("intent_escalation_agents")).toBe(true)
    expect(await fresh("reply_overpromise_risk")).toBe(true)
    expect(await fresh("panel_single_judge")).toBe(true)
    expect(await fresh("critique_planted_defects")).toBe(false)
    expect(await fresh("reply_noninferior_mistral")).toBe(false)
    fireEvent.click(await openLink("judge_panel_agents"))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/research/experiments/judge_panel_agents")
    })
    await waitFor(() => {
      expect(seenMarks(liveProject.root)?.visit).toBe("2026-09-23T08:40:09Z")
    })
  })

  it("marks nothing on the first visit and remembers the visit when the page is left", async () => {
    await renderRoute("/research")
    await sectionTitles()
    expect(screen.queryAllByText(NEW)).toEqual([])
    window.dispatchEvent(new Event("pagehide"))
    const marks = seenMarks(liveProject.root)
    expect(marks?.visit).toBe("2026-09-23T08:40:09Z")
    expect(marks?.items.get(ids.experimentId("intent_escalation_agents"))).toBe("2026-09-23T08:40:09Z")
  })

  it("works without browser storage: no marks, the activity groups, and a switch that still switches", async () => {
    blockStorage()
    await renderRoute("/research")
    expect(await sectionTitles()).toEqual(["Running", "Needs you", "Changed today"])
    expect(screen.queryAllByText(NEW)).toEqual([])
    groupBy("Flow")
    await waitFor(async () => {
      expect(await sectionTitles()).toEqual(["judge_panel", "support_case", "Flows of experiments"])
    })
  })
})

describe("ResearchScreen: flow and failure mode", () => {
  it("switches to one section per flow, newest first inside, remembers the choice and keeps archived ones apart", async () => {
    await renderRoute("/research")
    await sectionTitles()
    groupBy("Flow")
    await waitFor(async () => {
      expect(await sectionTitles()).toEqual(["judge_panel", "support_case", "Flows of experiments"])
    })
    expect(localStorage.getItem(GROUPING_KEY)).toBe("flow")
    expect(await experimentsIn("judge_panel")).toEqual(["judge_panel_agents", "panel_merge_rule", "panel_judge_prompt", "panel_aa_noise"])
    expect(await experimentsIn("support_case")).toEqual(["reply_overpromise_risk", "reply_noninferior_mistral", "reply_stage_budget", "reply_look"])
    expect(await experimentsIn("Flows of experiments")).toEqual([
      "intent_escalation_agents",
      "panel_single_judge",
      "critique_planted_defects",
      "intent_split_long_messages",
      "intent_ballot_pair",
      "critique_recall_by_agent",
    ])
    expect(await expanderOf("Archived (1)")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Older/ })).toBeNull()
  })

  it("opens a flow from the heading of its section", async () => {
    localStorage.setItem(GROUPING_KEY, "flow")
    const router = await renderRoute("/research")
    fireEvent.click(await screen.findByRole("link", { name: "Open the flow support_case" }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/flows/support_case/canvas")
    })
  })

  it("keeps one section per failure mode with experiments without one last, and filters by a mode from its heading", async () => {
    localStorage.setItem(GROUPING_KEY, "failureMode")
    const router = await renderRoute("/research")
    expect(await sectionTitles()).toEqual(["intent_misread", "judge_misses_defect", "overpromise", "panel_wrong_winner", "reply_quality", "No failure mode"])
    expect(await experimentsIn("panel_wrong_winner")).toEqual(["panel_single_judge", "judge_panel_agents", "panel_merge_rule", "panel_judge_prompt"])
    expect(await experimentsIn("No failure mode")).toEqual(["panel_aa_noise", "reply_stage_budget", "reply_look"])
    fireEvent.click(screen.getByRole("link", { name: "Show only reply_quality" }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ failureMode: "reply_quality" })
    })
    await waitFor(async () => {
      expect(await sectionTitles()).toEqual(["reply_quality"])
    })
  })
})

describe("ResearchScreen: rows and filters", () => {
  it("shows the question, subject, variants, last series and spend of each experiment", async () => {
    localStorage.setItem(GROUPING_KEY, "flow")
    await renderRoute("/research")
    const row = await rowOf("reply_noninferior_mistral")
    expect(row.textContent).toContain("not worse")
    expect(row.textContent).toContain("support_case · polish")
    expect(row.textContent).toContain("gpt → mistral")
    expect(row.textContent).toContain("confirmedholdout")
    expect(row.textContent).toMatch(/2 series · \$0\.\d\d$/)
    expect((await rowOf("intent_split_long_messages")).textContent).toContain("experiment flow message_intent")
    expect((await rowOf("critique_planted_defects")).textContent).toContain("signaldev")
    expect((await rowOf("reply_look")).textContent).toContain("no series")
    expect((await rowOf("reply_overpromise_risk")).textContent).toContain("AWAITING APPROVAL")
    expect((await rowOf("intent_escalation_agents")).textContent).toContain("deepseek → qwen, gpt")
    expect((await rowOf("intent_escalation_agents")).textContent).toContain("experiment flow escalation · escalate")
  })

  it("filters every section by question and failure mode and hides the sections left empty", async () => {
    localStorage.setItem(GROUPING_KEY, "flow")
    const router = await renderRoute("/research")
    await sectionTitles()
    fireEvent.change(screen.getByRole("combobox", { name: "Question" }), { target: { value: "compare" } })
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ question: "compare" })
    })
    await waitFor(async () => {
      expect(await sectionTitles()).toEqual(["judge_panel", "Flows of experiments"])
    })
    expect(await experimentsIn("judge_panel")).toEqual(["judge_panel_agents", "panel_judge_prompt", "panel_aa_noise"])
    expect(await experimentsIn("Flows of experiments")).toEqual(["panel_single_judge", "intent_split_long_messages", "intent_ballot_pair"])
    fireEvent.change(screen.getByRole("combobox", { name: "Failure mode" }), { target: { value: "reply_quality" } })
    expect(await screen.findByText("No experiments match these filters")).toBeTruthy()
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull()
    fireEvent.click(screen.getByRole("link", { name: "Clear filters" }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({})
    })
    await waitFor(async () => {
      expect(await sectionTitles()).toEqual(["judge_panel", "support_case", "Flows of experiments"])
    })
  })

  it("offers the failure modes of the project in the filter", async () => {
    localStorage.setItem(GROUPING_KEY, "flow")
    await renderRoute("/research?question=%22threshold%22")
    expect(await sectionTitles()).toEqual(["support_case", "Flows of experiments"])
    const options = within(screen.getByRole("combobox", { name: "Failure mode" })).getAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual(["all", "intent_misread", "judge_misses_defect", "overpromise", "panel_wrong_winner", "reply_quality"])
    expect(await experimentsIn("support_case")).toEqual(["reply_overpromise_risk", "reply_stage_budget"])
    expect(await experimentsIn("Flows of experiments")).toEqual(["critique_planted_defects", "critique_recall_by_agent"])
  })
})

describe("ResearchScreen: hypotheses", () => {
  it("hands hypotheses about one flow to the chat from the heading of its section", async () => {
    localStorage.setItem(GROUPING_KEY, "flow")
    const sent = captureHandoffs()
    await renderRoute("/research")
    await clickWhenReady(within(await sectionOf("judge_panel")).getByRole("button", { name: "Suggest hypotheses" }))
    expect((await within(await sectionOf("judge_panel")).findByRole("status")).textContent).toBe("Sent to the chat on the left.")
    expect(String(sent[0])).toContain("Suggest hypotheses worth testing")
    expect(String(sent[0])).toContain("reply_noninferior_mistral")
    expect(String(sent[0])).toContain("Focus on the flow judge_panel.")
    expect(String(sent[0])).not.toContain("support_case.")
  })

  it("hands project-wide hypotheses from the page header and offers none on the section of experiment flows", async () => {
    localStorage.setItem(GROUPING_KEY, "flow")
    const sent = captureHandoffs()
    await renderRoute("/research?failureMode=%22intent_misread%22")
    expect(await sectionTitles()).toEqual(["Flows of experiments"])
    expect(within(await sectionOf("Flows of experiments")).queryByRole("button")).toBeNull()
    const [pageButton] = screen.getAllByRole("button", { name: "Suggest hypotheses" })
    if (pageButton === undefined) throw new Error("no page-level hypotheses button")
    await clickWhenReady(pageButton)
    expect((await screen.findByRole("status")).textContent).toBe("Sent to the chat on the left.")
    expect(String(sent[0])).not.toContain("Focus on the flow")
    expect(String(sent[0])).toContain("Focus on the failure mode intent_misread.")
  })

  it("says so when the project has no experiments yet", async () => {
    server.use(http.get(`${API_BASE}/experiments`, () => HttpResponse.json({ items: [], next_cursor: null, total_estimate: 0 })))
    await renderRoute("/research")
    expect(await screen.findByText("No experiments yet")).toBeTruthy()
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull()
    expect(screen.getByRole("button", { name: "Suggest hypotheses" })).toBeTruthy()
  })
})
