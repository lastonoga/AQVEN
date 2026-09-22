import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StructuredValue, ValueDisplayProvider, flattenValue, shortenPaths } from "./value-display"

describe("StructuredValue", () => {
  it("shortens dot paths and keeps colliding labels distinct", () => {
    expect(shortenPaths(["record.fields[3].type"])).toEqual(["r.f[3].t"])
    expect(shortenPaths(["record.fields[3].type", "record.foo[3].type"])).toEqual([
      "r.fi[3].t",
      "r.fo[3].t",
    ])
    expect(shortenPaths(["reply.text", "record.type"])).toEqual(["rep.t", "rec.t"])
  })

  it("prepares a short label and full-path tooltip for every flat key", () => {
    render(<StructuredValue value={{ signals: [{ code: "grounded" }], scores: [{ score: 3 }] }} compact />)
    const abbreviations = screen.getByRole("list").querySelectorAll("abbr")
    expect(Array.from(abbreviations, (item) => [item.textContent, item.title])).toEqual([
      ["s[0].c:", "signals[0].code"],
      ["s[0].s:", "scores[0].score"],
    ])
  })

  it("shows nested objects and arrays as flat path and value rows", () => {
    const value = { channel: "amazon", signals: [{ key: "flicker", label: "Мерцает" }] }
    expect(flattenValue(value)).toEqual([
      { path: "channel", value: "amazon" },
      { path: "signals[0].key", value: "flicker" },
      { path: "signals[0].label", value: "Мерцает" },
    ])
    render(<StructuredValue value={value} compact />)
    const list = screen.getByRole("list")
    expect(within(list).getAllByRole("listitem")).toHaveLength(3)
    expect(within(list).getByText("signals[0].label:")).toBeTruthy()
    expect(within(list).getByText("s[0].l:").getAttribute("title")).toBe("signals[0].label")
    expect(list.className).toContain("aqven-flat-value")
    expect(list.className).not.toContain("max-h-")
    expect(list.className).not.toContain("overflow-auto")
  })

  it("shows a long value in full without expanding or scrolling", () => {
    const message = "Лента мигает. ".repeat(100)
    render(<StructuredValue value={{ message }} compact />)
    const row = screen.getByRole("listitem")
    expect(row.querySelector(".aqven-flat-value-data")?.textContent).toBe(message)
    expect(row.querySelector("details")).toBeNull()
    expect(row.className).toContain("whitespace-pre-wrap")
    expect(screen.getByRole("list").className).not.toContain("overflow-auto")
  })

  it("shows a binary media reference as JSON in Raw mode", () => {
    const ref = { kind: "blob", blob_id: "sha256-video", media_type: "video/mp4", size_bytes: 6129 }
    render(
      <ValueDisplayProvider mode="json">
        <StructuredValue value={ref} mediaOnly media={[
          { slot: "clip", mediaType: "video/mp4", blobId: "sha256-video", bytes: 6129, name: "clip.mp4" },
        ]} />
      </ValueDisplayProvider>,
    )
    expect(screen.getByText(/"blob_id": "sha256-video"/u)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Play video: clip.mp4" })).toBeNull()
  })
})
