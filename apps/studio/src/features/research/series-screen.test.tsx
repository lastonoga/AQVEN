import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { WaitsInlineProps } from "@/features/review"
import { RESEARCH_SERIES } from "@/mocks/data/research"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

vi.mock("@/features/review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/review")>()),
  WaitsInline: (props: WaitsInlineProps) => (
    <section aria-label="Embedded waits">
      {props.seriesId ?? "no series"} in {props.flowId ?? "no flow"}
    </section>
  ),
}))

const seriesPath = (key: keyof typeof RESEARCH_SERIES, search = ""): string => `/research/series/${RESEARCH_SERIES[key]}${search}`

const region = (name: string): Promise<HTMLElement> => screen.findByRole("region", { name })

const caseButtons = async (): Promise<readonly HTMLElement[]> => within(await screen.findByRole("list", { name: "Cases of this series" })).getAllByRole("button")

const openFirstCase = async (): Promise<HTMLElement> => {
  const [first] = await caseButtons()
  fireEvent.click(first ?? document.body)
  return screen.findByRole("table", { name: /^Attempts of / })
}

describe("SeriesScreen header and verdict", () => {
  it("shows the experiment, status, split, size, progress and spend against the cap", async () => {
    await renderRoute(seriesPath("noninferiorHoldout"))
    const title = await screen.findByRole("heading", { level: 1 })
    expect(within(title).getByRole("link", { name: "reply_noninferior_mistral" }).getAttribute("href")).toBe("/research/experiments/reply_noninferior_mistral")
    expect(screen.getByText("DONE")).toBeTruthy()
    expect(screen.getByText("holdout")).toBeTruthy()
    expect(screen.getByText(/6×3 · gpt, mistral · started Sep 21, 14:05 · finished Sep 21, 14:39/)).toBeTruthy()
    expect(screen.getByText("36 of 36 attempts")).toBeTruthy()
    expect(screen.getByText(/^\$0\.\d\d of \$1\.00 cap$/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
    expect(screen.queryByText("live")).toBeNull()
  })

  it("states the verdict with the differences behind it and where the finding was written", async () => {
    await renderRoute(seriesPath("noninferiorHoldout"))
    const verdict = await region("Verdict")
    expect(within(verdict).getByText("confirmed")).toBeTruthy()
    expect(verdict.textContent).toContain("clears the 0.05 margin")
    const contrasts = within(within(verdict).getByRole("list", { name: "Differences behind the verdict" })).getAllByRole("listitem")
    expect(contrasts.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^primarycritique: mistral − gpt = [+−]0\.\d\d \(95% CI .+\), margin 0\.05$/),
      expect.stringMatching(/^guardrailcost per pass: mistral − gpt = [+−]\$0\.\d{4} \(95% CI .+\), margin 20%$/),
    ])
    expect(within(verdict).getByText(`Finding written to experiments/reply_noninferior_mistral/findings/${RESEARCH_SERIES.noninferiorHoldout}.yaml`)).toBeTruthy()
  })

  it("calls a dev series a signal, not a finding", async () => {
    await renderRoute(seriesPath("noninferiorDev"))
    const verdict = await region("Verdict")
    expect(within(verdict).getByText("signal")).toBeTruthy()
    expect(within(verdict).getByText("working cases, a signal not a finding")).toBeTruthy()
  })

  it("marks a failed series invalid with its reason and the error", async () => {
    await renderRoute(seriesPath("panelFailed"))
    const verdict = await region("Verdict")
    expect(within(verdict).getByText("invalid")).toBeTruthy()
    expect(within(verdict).getByText("infrastructure errors")).toBeTruthy()
    expect(within(verdict).getByRole("alert").textContent).toBe("The series failed: 8 of 30 attempts hit infrastructure errors")
    expect(screen.getByText("FAILED")).toBeTruthy()
  })

  it("follows a running series and stops it", async () => {
    await renderRoute(seriesPath("escalationRunning"))
    expect(await screen.findByText("20 of 54 attempts")).toBeTruthy()
    expect(screen.getByText("live")).toBeTruthy()
    expect((await region("Verdict")).textContent).toContain("The verdict comes when the series finishes.")
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(await screen.findByText("CANCELLED")).toBeTruthy()
    expect((await region("Verdict")).textContent).toContain("No finding: cancelled after 20 of 54 attempts.")
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
    expect(screen.queryByText("live")).toBeNull()
  })

  it("approves the spend of a series that waits for it", async () => {
    await renderRoute(seriesPath("overpromiseAwaiting"))
    expect(await screen.findByText("AWAITING APPROVAL")).toBeTruthy()
    expect(screen.getByText("No attempts have finished yet")).toBeTruthy()
    expect((await region("Verdict")).textContent).toContain("The verdict comes when the series finishes.")
    fireEvent.click(screen.getByRole("button", { name: "Approve spend" }))
    expect(await screen.findByText("RUNNING")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Approve spend" })).toBeNull()
    expect((await region("Verdict")).textContent).toContain("spend approved by local")
  })
})

describe("SeriesScreen matrix", () => {
  it("draws every variant against the primary, guardrail and built-in metrics without a total score", async () => {
    await renderRoute(seriesPath("noninferiorHoldout"))
    const matrix = await screen.findByRole("table", { name: "Metrics by variant" })
    const headers = within(matrix).getAllByRole("columnheader").map((cell) => cell.textContent)
    expect(headers).toEqual([
      "Variant",
      "critiqueprimary · 0.05 · ↑",
      "cost per passguardrail · 20% · ↓",
      "promisescheck · ↑",
      "success ratebuilt-in · ↑",
      "cost per attemptbuilt-in · ↓",
      "latency p50built-in · ↓",
      "latency p95built-in · ↓",
      "valid on first trybuilt-in · ↑",
      "infra errorsbuilt-in · ↓",
    ])
    expect(within(matrix).getByRole("img", { name: /^critique of mistral: 0\.\d\d, 95% CI 0\.\d\d–0\.\d\d, passes$/ })).toBeTruthy()
    expect(within(matrix).getByRole("img", { name: /^critique of gpt: 0\.\d\d, 95% CI 0\.\d\d–0\.\d\d, baseline$/ })).toBeTruthy()
    expect(within(matrix).getByRole("img", { name: /^cost per pass of mistral: \$0\.\d{4}, 95% CI .+, passes$/ })).toBeTruthy()
  })

  it("shows how stable each variant is across repeats", async () => {
    await renderRoute(seriesPath("noninferiorHoldout"))
    const stability = await screen.findByRole("table", { name: "Stability by variant" })
    const rows = within(stability).getAllByRole("row").slice(1)
    expect(rows.map((row) => within(row).getByRole("img").getAttribute("aria-label"))).toEqual([
      expect.stringMatching(/^\d+ always, \d+ flaky, \d+ never$/),
      expect.stringMatching(/^\d+ always, \d+ flaky, \d+ never$/),
    ])
  })

  it("draws the threshold of a threshold question on its column", async () => {
    await renderRoute(seriesPath("critiqueDev"))
    const matrix = await screen.findByRole("table", { name: "Metrics by variant" })
    expect(within(matrix).getByRole("img", { name: /^label of deepseek: .+, (passes|fails|unclear)$/ })).toBeTruthy()
  })
})

describe("SeriesScreen cases", () => {
  it("lists every case with k of n per variant, failed checks and spend", async () => {
    await renderRoute(seriesPath("noninferiorHoldout"))
    const rows = await caseButtons()
    expect(rows).toHaveLength(6)
    expect(rows[0]?.textContent).toMatch(/^arc_floor_burning_smell_replacement\d of 3\d of 3.*\$0\.\d{4}$/)
    expect(within(rows[0] ?? document.body).getAllByLabelText(/^(gpt|mistral): \d of 3 attempts passed$/)).toHaveLength(2)
  })

  it("filters the failures and the cases where variants disagree through the address", async () => {
    const router = await renderRoute(seriesPath("noninferiorHoldout"))
    await caseButtons()
    const filters = screen.getByRole("navigation", { name: "Filter cases" })
    fireEvent.click(within(filters).getByRole("link", { name: "Failures" }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ failures: true })
    })
    await waitFor(async () => {
      expect((await caseButtons()).length).toBeLessThan(6)
    })
    fireEvent.click(within(filters).getByRole("link", { name: "Variants disagree" }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ failures: true, divergent: true })
    })
    fireEvent.click(within(filters).getByRole("link", { name: "All cases" }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({})
    })
    expect(await caseButtons()).toHaveLength(6)
  })

  it("opens the attempts of a case with links to their runs", async () => {
    await renderRoute(seriesPath("noninferiorHoldout"))
    const [first] = await caseButtons()
    fireEvent.click(first ?? document.body)
    expect(first?.getAttribute("aria-expanded")).toBe("true")
    const attempts = await screen.findByRole("table", { name: "Attempts of arc_floor_burning_smell_replacement" })
    const rows = within(attempts).getAllByRole("row").slice(1)
    expect(rows.map((row) => row.textContent.slice(0, 4))).toEqual(["gpt1", "gpt2", "gpt3", "mist", "mist", "mist"])
    const link = within(rows[0] ?? document.body).getByRole("link", { name: /^Open run #/ })
    expect(link.getAttribute("href")).toMatch(/^\/runs\/01a0c100-0000-7000-8000-/)
  })

  it("opens an attempt of an arm in the run view of its own", async () => {
    const router = await renderRoute(seriesPath("critiqueDev"))
    const attempts = await openFirstCase()
    expect(screen.queryByRole("link", { name: "Variants disagree" })).toBeNull()
    const link = within(attempts).getAllByRole("link", { name: /^Open run #/ })[0]
    fireEvent.click(link ?? document.body)
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/runs\//)
    })
    expect(await screen.findByRole("heading", { level: 1, name: /^Run #/ })).toBeTruthy()
    expect(screen.getAllByText("experiment").length).toBeGreaterThan(0)
    expect(screen.getByRole("link", { name: /^attempt of series #/ }).getAttribute("href")).toBe(`/research/series/${RESEARCH_SERIES.critiqueDev}`)
  })

  it("sends an attempt of a project flow to the runs of that flow", async () => {
    const router = await renderRoute(seriesPath("noninferiorHoldout"))
    const attempts = await openFirstCase()
    fireEvent.click(within(attempts).getAllByRole("link", { name: /^Open run #/ })[0] ?? document.body)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/flows/support_case/runs")
    })
    expect(String(Reflect.get(router.state.location.search, "run"))).toMatch(/^01a0c100-/)
  })

  it("shows the error of an attempt that hit the infrastructure", async () => {
    await renderRoute(seriesPath("panelFailed"))
    const attempts = await openFirstCase()
    expect(within(attempts).getAllByText("OpenRouter answered 502 Bad Gateway for mistralai/mistral-nemo").length).toBeGreaterThan(0)
    expect(within(attempts).getAllByText("error").length).toBeGreaterThan(0)
  })

  it("marks the attempt that is running now", async () => {
    await renderRoute(seriesPath("escalationRunning"))
    const attempts = await openFirstCase()
    const rows = within(attempts).getAllByRole("row").slice(1)
    expect(rows.filter((row) => row.textContent.includes("running"))).toHaveLength(1)
  })
})

describe("SeriesScreen waits", () => {
  it("embeds the waits of a look series and names it by its cases", async () => {
    await renderRoute(seriesPath("lookWaiting"))
    expect(await screen.findByRole("heading", { level: 1, name: "Look at 3 cases" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "cases of support_case_cases" }).getAttribute("href")).toContain("/flows/support_case/cases")
    expect((await region("Verdict")).textContent).toContain("A look has no verdict: read the cases below.")
    expect((await region("Embedded waits")).textContent).toBe(`${RESEARCH_SERIES.lookWaiting} in support_case`)
    expect(screen.getAllByText("1 waiting")).toHaveLength(2)
  })

  it("leaves the waits out when nothing waits", async () => {
    await renderRoute(seriesPath("noninferiorHoldout"))
    await caseButtons()
    expect(screen.queryByRole("region", { name: "Embedded waits" })).toBeNull()
  })
})
