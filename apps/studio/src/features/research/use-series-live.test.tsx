import { act, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { SeriesEvent, SeriesStatus } from "@/domain"
import * as ids from "@/data/ids"
import { renderInStudio } from "@/test/render-route"
import { useSeriesLive, type SeriesEvents } from "./use-series-live"

const SERIES = ids.seriesId("01a0c100-0000-7000-8000-000000000004")

type Subscription = { readonly afterSeq: number; readonly emit: (event: SeriesEvent) => void; readonly close: () => void }

const fakeStream = (): { readonly stream: SeriesEvents; readonly subscriptions: Subscription[] } => {
  const subscriptions: Subscription[] = []
  const stream: SeriesEvents = (_id, afterSeq, onEvent) => {
    const close = vi.fn()
    subscriptions.push({ afterSeq, emit: onEvent, close })
    return close
  }
  return { stream, subscriptions }
}

function Probe({ status, stream }: { readonly status: SeriesStatus; readonly stream: SeriesEvents }) {
  const { following } = useSeriesLive({ id: SERIES, status }, stream)
  return <p>{following ? "following" : "settled"}</p>
}

describe("useSeriesLive", () => {
  it("follows an active series from its first event and stops on the finish", async () => {
    const { stream, subscriptions } = fakeStream()
    await renderInStudio(<Probe status="running" stream={stream} />)
    expect(await screen.findByText("following")).toBeTruthy()
    expect(subscriptions.map((item) => item.afterSeq)).toEqual([0])
    act(() => {
      subscriptions[0]?.emit({ kind: "attempt", seq: 2, done: 1, total: 4, spendUsd: 0.01 })
    })
    expect(screen.getByText("following")).toBeTruthy()
    act(() => {
      subscriptions[0]?.emit({ kind: "finished", seq: 3, status: "done", verdict: "confirmed" })
    })
    expect(await screen.findByText("settled")).toBeTruthy()
    expect(subscriptions[0]?.close).toHaveBeenCalled()
    expect(subscriptions).toHaveLength(1)
  })

  it("leaves a settled series alone", async () => {
    const { stream, subscriptions } = fakeStream()
    await renderInStudio(<Probe status="done" stream={stream} />)
    expect(await screen.findByText("settled")).toBeTruthy()
    expect(subscriptions).toHaveLength(0)
  })
})
