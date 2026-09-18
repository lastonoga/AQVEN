import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { IntlProvider } from "use-intl"
import { describe, expect, it } from "vitest"
import { messages } from "@/i18n/messages"
import type { RunId } from "@/domain"
import * as ids from "@/data/ids"
import { COMPLETED_RUN_ID } from "@/mocks/data/runs"
import { FormattedDocument } from "./presentation"
import { PresentationModeSwitch, PresentationProvider, PresentationValue } from "./presentation-state"
import type { PresentationBatch, PresentationTarget } from "./presentation-data"

const renderValue = (value: unknown, document: unknown): void => {
  render(<IntlProvider locale="en" messages={messages.en} timeZone="UTC"><FormattedDocument value={value} document={document} compact /></IntlProvider>)
}

describe("FormattedDocument", () => {
  it("shows complete multiline text and remaining leaves without an inner scroller", () => {
    const rationale = "Reason one\n" + "long reason ".repeat(80)
    renderValue({ reply: { text: rationale, citations: [{ id: "A", score: 3 }] } }, {
      version: 1,
      root: { kind: "section", children: [{ kind: "text", path: "/reply/text" }] },
    })
    const text = screen.getByText((_content, node) => node?.tagName === "P" && node.textContent === rationale)
    expect(text.textContent).toBe(rationale)
    expect(screen.getByText("Additional data")).toBeTruthy()
    const list = screen.getByRole("list")
    expect(within(list).getByText("reply.citations[0].id:")).toBeTruthy()
    expect(within(list).getByText("reply.citations[0].score:")).toBeTruthy()
    expect(list.className).not.toContain("overflow-auto")
    expect(text.className).toContain("whitespace-pre-wrap")
  })

  it("falls back to the original value for an unknown version or missing pointer", () => {
    renderValue({ reply: "recorded" }, { version: 2, root: { kind: "section", children: [] } })
    expect(screen.getByText("reply:")).toBeTruthy()
    renderValue({ reply: "recorded" }, { version: 1, root: { kind: "section", children: [{ kind: "text", path: "/missing" }] } })
    expect(screen.getAllByText("reply:")).toHaveLength(2)
  })

  it("renders media through the existing media component", () => {
    renderValue({ photo: { $media: "image/png", blob_id: "blob-1", size_bytes: 3 } }, {
      version: 1,
      root: { kind: "section", children: [{ kind: "media", path: "/photo", alt: "Preview" }] },
    })
    expect(screen.getByRole("button", { name: "Open image: Preview" })).toBeTruthy()
  })

  it("maps text and field tones to readable Studio text and keeps field semantics", () => {
    renderValue({ message: "Review this\ncarefully", outcome: "Approved" }, {
      version: 1,
      root: { kind: "section", children: [
        { kind: "text", path: "/message", tone: "warning" },
        { kind: "field", label: "Outcome", path: "/outcome", tone: "positive" },
      ] },
    })
    const message = screen.getByText((_content, node) => node?.tagName === "P" && node.textContent === "Review this\ncarefully")
    expect(message.tagName).toBe("P")
    expect(message.getAttribute("data-tone")).toBe("warning")
    expect(message.className).toContain("whitespace-pre-wrap")
    const outcome = screen.getByText("Approved")
    expect(outcome.tagName).toBe("DD")
    expect(outcome.getAttribute("data-tone")).toBe("success")
    expect(screen.getByText("Outcome").tagName).toBe("DT")
  })

  it("gives nested section and list titles progressively deeper heading levels", () => {
    renderValue("recorded", {
      version: 1,
      root: { kind: "section", title: "Summary", children: [
        { kind: "list", title: "Highlights", children: [
          { kind: "section", title: "Detail", children: [{ kind: "badge", value: "Ready", tone: "positive" }] },
        ] },
      ] },
    })
    expect(screen.getByRole("heading", { name: "Summary", level: 4 })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Highlights", level: 5 })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Detail", level: 6 })).toBeTruthy()
    expect(screen.getByText("Ready").getAttribute("data-tone")).toBe("success")
  })

  it("renders a compact semantic card with its full multiline content and nested nodes", () => {
    const rationale = "Cause A\n" + "Detailed finding ".repeat(60)
    renderValue({ case: { rationale, status: "Needs review", owner: "Mira" } }, {
      version: 1,
      root: { kind: "section", children: [
        { kind: "card", title: "Diagnosis", description: "A full case review", tone: "warning", children: [
          { kind: "text", path: "/case/rationale" },
          { kind: "field", label: "Status", path: "/case/status" },
        ] },
      ] },
    })
    const article = screen.getByRole("article")
    expect(article.getAttribute("data-tone")).toBe("warning")
    expect(article.className).toContain("px-2.25")
    expect(article.className).not.toContain("overflow")
    expect(within(article).getByRole("heading", { name: "Diagnosis", level: 5 })).toBeTruthy()
    expect(within(article).getByText("A full case review")).toBeTruthy()
    const text = within(article).getByText((_content, node) => node?.tagName === "P" && node.textContent === rationale)
    expect(text.textContent).toBe(rationale)
    expect(text.className).toContain("whitespace-pre-wrap")
    expect(within(article).getByText("Needs review").tagName).toBe("DD")
    expect(screen.getByText("case.owner:")).toBeTruthy()
  })

  it("splits a visible set into endpoint-sized batches", async () => {
    const sizes: number[] = []
    const read = (_runId: RunId, _locale: string, targets: readonly PresentationTarget[]): Promise<PresentationBatch> => {
      sizes.push(targets.length)
      return Promise.resolve({ results: targets.map((target) => ({ target, status: "unavailable", document: null, formatter: null, error: null })) })
    }
    render(
      <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
        <PresentationProvider runId={ids.runId(COMPLETED_RUN_ID)} locale="en" read={read}>
          <PresentationModeSwitch />
          {Array.from({ length: 101 }, (_, index) => (
            <PresentationValue key={index} address={{ node_id: `node-${String(index)}`, branch_key: null, iteration: null, item_index: null }}
              side="output" value={{ index }} />
          ))}
        </PresentationProvider>
      </IntlProvider>,
    )
    expect(sizes).toEqual([])
    await waitFor(() => { expect(sizes.sort((left, right) => left - right)).toEqual([1, 100]) })
  })

  it("keeps input and output independent when both use one formatter", async () => {
    const read = (_runId: RunId, _locale: string, targets: readonly PresentationTarget[]): Promise<PresentationBatch> =>
      Promise.resolve({ results: targets.map((target) => ({
        target, status: "formatted", formatter: "project.views:render", formatter_version: "sha256-test", error: null,
        document: { version: 1, root: { kind: "section", title: null, children: [{ kind: "text", value: target.side === "input" ? "INPUT view" : "OUTPUT view" }] } },
      })) })
    const address = { node_id: "reply", branch_key: null, iteration: null, item_index: null }
    render(
      <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
        <PresentationProvider runId={ids.runId(COMPLETED_RUN_ID)} locale="en" read={read}>
          <PresentationModeSwitch />
          <PresentationValue address={address} side="input" value={{ raw: "input" }} />
          <PresentationValue address={address} side="output" value={{ raw: "output" }} />
        </PresentationProvider>
      </IntlProvider>,
    )
    expect(await screen.findByText("INPUT view")).toBeTruthy()
    expect(await screen.findByText("OUTPUT view")).toBeTruthy()
  })

  it("explains a malformed media document and keeps the flat fallback in the detail view", async () => {
    const read = (_runId: RunId, _locale: string, targets: readonly PresentationTarget[]): Promise<PresentationBatch> =>
      Promise.resolve({ results: targets.map((target) => ({
        target, status: "formatted", formatter: "project.views:render", error: null,
        document: { version: 1, root: { kind: "section", children: [{ kind: "media", path: "/reply" }] } },
      })) })
    render(
      <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
        <PresentationProvider runId={ids.runId(COMPLETED_RUN_ID)} locale="en" read={read}>
          <PresentationModeSwitch />
          <PresentationValue address={{ node_id: "reply", branch_key: null, iteration: null, item_index: null }}
            side="output" value={{ reply: "recorded" }} detail />
        </PresentationProvider>
      </IntlProvider>,
    )
    expect(await screen.findByText("The formatter could not display this value.")).toBeTruthy()
    expect(screen.getByText("reply:")).toBeTruthy()
  })

  it("retries errors and unavailable targets, then refreshes formatter output on every Formatted entry", async () => {
    let reads = 0
    const read = (_runId: RunId, _locale: string, targets: readonly PresentationTarget[]): Promise<PresentationBatch> => {
      reads += 1
      const current = reads
      return Promise.resolve({ results: targets.map((target) => current <= 2
        ? { target, status: current === 1 ? "error" : "unavailable", document: null, formatter: null, error: "formatter unavailable" }
        : { target, status: "formatted", formatter: "project.views:render", formatter_version: `sha256-v${String(current)}`, error: null,
          document: { version: 1, root: { kind: "section", children: [{ kind: "text", value: `version ${String(current)}` }] } } }) })
    }
    const address = { node_id: "reply", branch_key: null, iteration: null, item_index: null }
    render(
      <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
        <PresentationProvider runId={ids.runId(COMPLETED_RUN_ID)} locale="en" read={read}>
          <PresentationModeSwitch />
          <PresentationValue address={address} side="output" value={{ reply: "recorded" }} detail />
        </PresentationProvider>
      </IntlProvider>,
    )
    expect(await screen.findByText("The formatter could not display this value.")).toBeTruthy()
    expect(reads).toBe(1)
    fireEvent.click(screen.getByRole("radio", { name: "Raw" }))
    fireEvent.click(screen.getByRole("radio", { name: "Formatted" }))
    await waitFor(() => { expect(reads).toBe(2) })
    expect(screen.queryByText("No formatter is available for this value.")).toBeNull()
    expect(reads).toBe(2)
    fireEvent.click(screen.getByRole("radio", { name: "Raw" }))
    fireEvent.click(screen.getByRole("radio", { name: "Formatted" }))
    expect(await screen.findByText("version 3")).toBeTruthy()
    expect(reads).toBe(3)
    fireEvent.click(screen.getByRole("radio", { name: "Raw" }))
    fireEvent.click(screen.getByRole("radio", { name: "Formatted" }))
    expect(await screen.findByText("version 4")).toBeTruthy()
    expect(reads).toBe(4)
  })

  it("refreshes a target when its recorded value reference changes", async () => {
    let reads = 0
    const read = (_runId: RunId, _locale: string, targets: readonly PresentationTarget[]): Promise<PresentationBatch> => {
      reads += 1
      const current = reads
      return Promise.resolve({ results: targets.map((target) => ({
        target, status: "formatted", formatter: "project.views:render", formatter_version: `sha256-v${String(current)}`, error: null,
        document: { version: 1, root: { kind: "section", children: [{ kind: "text", value: `value ${String(current)}` }] } },
      })) })
    }
    const address = { node_id: "reply", branch_key: null, iteration: null, item_index: null }
    const view = (recorded: string) => (
      <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
        <PresentationProvider runId={ids.runId(COMPLETED_RUN_ID)} locale="en" read={read}>
          <PresentationModeSwitch />
          <PresentationValue address={address} side="output" value={{ reply: recorded }} valueRef={{ kind: "inline", value: { reply: recorded } }} />
        </PresentationProvider>
      </IntlProvider>
    )
    const mounted = render(view("first"))
    expect(await screen.findByText("value 1")).toBeTruthy()
    mounted.rerender(view("second"))
    expect(await screen.findByText("value 2")).toBeTruthy()
    expect(reads).toBe(2)
  })

  it("shows a binary value's stored reference in Raw mode", () => {
    const read = (): Promise<PresentationBatch> => Promise.resolve({ results: [] })
    render(
      <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
        <PresentationProvider runId={ids.runId(COMPLETED_RUN_ID)} locale="en" read={read}>
          <PresentationModeSwitch />
          <PresentationValue address={{ node_id: "voice", branch_key: null, iteration: null, item_index: null }}
            side="output" value="" valueRef={{ kind: "blob", blob_id: "sha256-audio", sha256: "sha256-audio", size_bytes: 42,
              media_type: "audio/wav", preview: "", truncated: false }} mediaOnly />
        </PresentationProvider>
      </IntlProvider>,
    )
    fireEvent.click(screen.getByRole("radio", { name: "Raw" }))
    expect(screen.getByText(/"blob_id": "sha256-audio"/u)).toBeTruthy()
  })

  it("shows input and output media as references without previews in Raw mode", () => {
    const read = (): Promise<PresentationBatch> => Promise.resolve({ results: [] })
    const input = { photo: { $media: "image/jpeg", blob_id: "sha256-input", size_bytes: 42, name: "input.jpeg" } }
    const output = { voice: { $media: "audio/wav", blob_id: "sha256-output", size_bytes: 84, name: "output.wav" } }
    const address = { node_id: "media", branch_key: null, iteration: null, item_index: null }
    render(
      <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
        <PresentationProvider runId={ids.runId(COMPLETED_RUN_ID)} locale="en" read={read}>
          <PresentationModeSwitch />
          <PresentationValue address={address} side="input" value={input} media={[
            { slot: "photo", mediaType: "image/jpeg", blobId: "sha256-input", bytes: 42, name: "input.jpeg" },
          ]} />
          <PresentationValue address={address} side="output" value={output} media={[
            { slot: "voice", mediaType: "audio/wav", blobId: "sha256-output", bytes: 84, name: "output.wav" },
          ]} />
        </PresentationProvider>
      </IntlProvider>,
    )

    expect(screen.getByRole("button", { name: "Open image: input.jpeg" })).toBeTruthy()
    expect(screen.getByLabelText("output.wav")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "Raw" }))
    expect(screen.queryByRole("button", { name: "Open image: input.jpeg" })).toBeNull()
    expect(screen.queryByLabelText("output.wav")).toBeNull()
    expect(screen.getByText(/"blob_id": "sha256-input"/u)).toBeTruthy()
    expect(screen.getByText(/"blob_id": "sha256-output"/u)).toBeTruthy()
  })
})
