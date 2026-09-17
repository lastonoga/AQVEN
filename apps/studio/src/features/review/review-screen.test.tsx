import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

type DecisionCall = { readonly reviewId: string; readonly body: unknown }

const REVIEW_PATH = "/en/hotel_pitch/pitch_pipeline/review"

const queueCards = async (): Promise<readonly HTMLElement[]> =>
  within(await screen.findByRole("navigation", { name: "Review queue" })).getAllByRole("link")

const selectedFlags = (cards: readonly HTMLElement[]): readonly boolean[] => cards.map((card) => card.getAttribute("aria-current") !== null)

const failDecisions = () => {
  server.use(http.post("*/reviews/:reviewId/decision", () => new HttpResponse(null, { status: 500 })))
}

const captureDecisions = (): DecisionCall[] => {
  const calls: DecisionCall[] = []
  server.use(
    http.post("*/reviews/:reviewId/decision", async ({ params, request }) => {
      calls.push({ reviewId: String(params["reviewId"]), body: await request.json() })
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return calls
}

describe("ReviewScreen", () => {
  it("selects the first queue card when the URL has no item", async () => {
    await renderRoute(REVIEW_PATH)
    const cards = await queueCards()
    expect(cards.map((card) => card.textContent)).toEqual([
      "run #82473 h 12 m leftstage 7 · decide_pitchneeds_human · verdict ≠ approved",
      "run #82448 h 40 m leftstage 4 · pitch_gen_dhuman input · brief addition",
      "overduerun #8236overdue 1 h 05 mstage 7 · decide_pitchescalated · SLA breached",
    ])
    expect(selectedFlags(cards)).toEqual([true, false, false])
    expect(screen.getByText("run #8247 · stage 7 · row #07 · branch b")).toBeDefined()
    expect(screen.getByText("SLA 4 h · 3 h 12 m left · then escalate")).toBeDefined()
  })

  it("selects the queue item named in the URL", async () => {
    await renderRoute(`${REVIEW_PATH}?item=review_8236_decide_pitch`)
    const cards = await queueCards()
    expect(selectedFlags(cards)).toEqual([false, false, true])
    expect(await screen.findByText("SLA 4 h · overdue 1 h 05 m · escalated")).toBeDefined()
  })

  it("switches the detail from a queue card", async () => {
    const router = await renderRoute(REVIEW_PATH)
    const [, inputCard] = await queueCards()
    fireEvent.click(inputCard ?? document.body)
    expect(await screen.findByText("run #8244 · stage 4 · row #41 · branch d")).toBeDefined()
    expect(router.state.location.search).toEqual({ item: "review_8244_brief_extra" })
  })

  it("sends the decision with the note and moves to the next item", async () => {
    const calls = captureDecisions()
    const router = await renderRoute(REVIEW_PATH)
    fireEvent.change(await screen.findByLabelText("Your decision"), { target: { value: "keep the park angle" } })
    fireEvent.click(screen.getByRole("button", { name: "Approve · resume run" }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ item: "review_8244_brief_extra" })
    })
    expect(calls).toEqual([{ reviewId: "review_8247_decide_pitch", body: { decision: "approve", note: "keep the park angle" } }])
  })

  it("keeps the note and the screen when the decision fails", async () => {
    failDecisions()
    const router = await renderRoute(REVIEW_PATH)
    const note = await screen.findByLabelText("Your decision")
    fireEvent.change(note, { target: { value: "keep the park angle" } })
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }))
    expect((await screen.findByRole("alert")).textContent).toBe("The decision was not saved. Your note is kept, try again.")
    expect(screen.getByLabelText("Your decision")).toHaveProperty("value", "keep the park angle")
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Request changes" })).toHaveProperty("disabled", false)
    })
    expect(router.state.location.search).toEqual({})
  })

  it("shows a not-found detail for an unknown item", async () => {
    await renderRoute(`${REVIEW_PATH}?item=missing`)
    expect(await screen.findByText("No data for this review step")).toBeDefined()
    expect(selectedFlags(await queueCards())).toEqual([false, false, false])
  })

  it("shows the empty queue for a workflow without review steps", async () => {
    await renderRoute("/en/hotel_pitch/support_triage/review")
    expect(await screen.findByText("Nothing waiting for review")).toBeDefined()
    expect(screen.getByText("Select a step to review")).toBeDefined()
  })
})
