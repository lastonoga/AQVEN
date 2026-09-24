import { useState } from "react"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SEPARATOR } from "@/lib/format"
import { Heading } from "./heading"
import { Marker } from "./marker"
import { NumberStepper } from "./number-stepper"
import { PropertyList } from "./property-list"
import { MetaLine, Rich } from "./rich"
import { Meter } from "./stat"
import { Surface } from "./surface"
import { Tag } from "./tag"
import { Text } from "./text"
import { TextBlock } from "./text-block"
import { Tile, TileNote, TileValue } from "./tile"

describe("Tag", () => {
  it("keeps leading and detail around an asChild element", () => {
    render(
      <Tag tone="warning" asChild leading="◆" detail="v7">
        <button type="button">write_pitch</button>
      </Tag>,
    )
    const button = screen.getByRole("button")
    expect(button.getAttribute("data-tone")).toBe("warning")
    expect(button.textContent).toBe("◆write_pitchv7")
  })

  it("renders a text leading as its own flex item and skips an empty one", () => {
    const { container } = render(
      <>
        <Tag leading="▪">city</Tag>
        <Tag leading={null}>plain</Tag>
      </>,
    )
    const [withLeading, withoutLeading] = Array.from(container.children)
    expect(withLeading?.firstElementChild?.textContent).toBe("▪")
    expect(withLeading?.firstElementChild?.className).toContain("shrink-0")
    expect(withoutLeading?.children).toHaveLength(0)
  })

  it("lets the square shape override the size padding", () => {
    render(
      <Tag shape="square" size="micro">
        ◆
      </Tag>,
    )
    const tag = screen.getByText("◆")
    expect(tag.className).toContain("size-4")
    expect(tag.className).not.toContain("px-1.5")
    expect(tag.getAttribute("data-tone")).toBe("neutral")
  })
})

describe("Text", () => {
  it("renders the requested element with a tone scope", () => {
    render(
      <Text as="dt" role="hint" tone="llm">
        key
      </Text>,
    )
    const text = screen.getByText("key")
    expect(text.tagName).toBe("DT")
    expect(text.getAttribute("data-tone")).toBe("llm")
    expect(text.className).toContain("text-tone-fg")
  })

  it("keeps embedded data verbatim inside an uppercase role", () => {
    render(
      <Text role="label" verbatim tone="default">
        judge_facts
      </Text>,
    )
    const text = screen.getByText("judge_facts")
    expect(text.className).toContain("normal-case")
    expect(text.className).not.toContain("uppercase")
    expect(text.hasAttribute("data-tone")).toBe(false)
  })
})

describe("Rich and MetaLine", () => {
  it("renders toned spans and icon glyphs", () => {
    const { container } = render(<Rich value={[{ text: "12/12", tone: "success" }, { glyph: "cross", tone: "destructive", text: "< 0.90" }]} />)
    expect(container.querySelectorAll("[data-tone]")).toHaveLength(2)
    expect(container.querySelectorAll("svg")).toHaveLength(1)
    expect(container.textContent).toBe("12/12< 0.90")
  })

  it("renders literal glyphs as text", () => {
    const { container } = render(<Rich value={{ glyph: "▪", text: "city" }} />)
    expect(container.textContent).toBe("▪city")
  })

  it("drops empty parts and separates the rest", () => {
    const { container } = render(<MetaLine parts={["a", null, false, "", undefined, 0, "b"]} />)
    expect(container.textContent).toBe(["a", "0", "b"].join(SEPARATOR))
    expect(container.querySelectorAll("[aria-hidden]")).toHaveLength(2)
  })
})

describe("Heading", () => {
  it("renders a numeric label description as a count", () => {
    render(<Heading size="label" title="Signatures" description={5} />)
    const count = screen.getByText("5")
    expect(count.className).toContain("font-semibold")
    expect(count.getAttribute("data-tone")).toBeNull()
  })

  it("mutes the label title", () => {
    render(<Heading size="label" title="Model" />)
    expect(screen.getByRole("heading").getAttribute("data-tone")).toBe("neutral")
  })

  it("wraps the body in a section after the heading", () => {
    const { container } = render(
      <Heading size="label" id="model" title="Model" below={["attempt 2"]}>
        <p>body</p>
      </Heading>,
    )
    const section = container.querySelector("section")
    expect(section?.id).toBe("model")
    expect(screen.getByRole("heading").textContent).toBe("Model")
    expect(screen.getByText("attempt 2").className).toContain("mt-1.5")
  })
})

describe("TextBlock", () => {
  it("splits text into block lines", () => {
    const { container } = render(<TextBlock text={"one\ntwo"} variant="plain" />)
    expect(container.firstElementChild?.children).toHaveLength(2)
  })

  it("joins clamped lines inside one element", () => {
    const { container } = render(<TextBlock lines={[["one"], [{ text: "two", mark: "issue" }]]} variant="output" clamp />)
    const block = container.firstElementChild
    expect(block?.className).toContain("line-clamp-5")
    expect(block?.textContent).toBe("one\ntwo")
    expect(block?.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe("destructive")
  })

  it("renders the empty fallback", () => {
    const { container } = render(<TextBlock text="" empty="nothing" />)
    expect(container.textContent).toBe("nothing")
  })
})

describe("PropertyList", () => {
  it("renders keys and toned values as a description list", () => {
    const { container } = render(<PropertyList rows={[{ key: "verdict", value: "FAIL", tone: "destructive" }]} variant="grid" />)
    expect(container.querySelector("dt")?.textContent).toBe("verdict")
    expect(container.querySelector("dd")?.getAttribute("data-tone")).toBe("destructive")
  })
})

describe("Meter", () => {
  it("clamps the bar width and exposes the value", () => {
    render(<Meter value={1.4} tone="success" label="score" />)
    const meter = screen.getByRole("meter")
    expect(meter.getAttribute("aria-valuenow")).toBe("1.4")
    expect(meter.firstElementChild?.getAttribute("style")).toContain("width: 100%")
  })
})

describe("Surface and Marker", () => {
  it("marks a selected surface as current", () => {
    render(
      <Surface interactive selected tone="llm">
        card
      </Surface>,
    )
    const surface = screen.getByText("card")
    expect(surface.getAttribute("aria-current")).toBe("true")
    expect(surface.getAttribute("data-tone")).toBe("llm")
  })

  it("labels a marker as an image", () => {
    render(<Marker shape="end" tone="neutral" label="end of trace" />)
    expect(screen.getByRole("img", { name: "end of trace" }).textContent).toBe("∎")
  })
})

describe("Tile", () => {
  it("names the group by its small label and shows the value large with its trail", () => {
    render(
      <Tile label="Cases">
        <TileValue trail="of 12">12</TileValue>
        <TileNote tone="warning">below the recommended 52</TileNote>
      </Tile>,
    )
    const tile = screen.getByRole("group", { name: "Cases" })
    expect(within(tile).getByText("12").className).toContain("text-3xl")
    expect(within(tile).getByText("of 12")).toBeTruthy()
    expect(within(tile).getByText("below the recommended 52").getAttribute("data-tone")).toBe("warning")
  })
})

function Stepper({ initial }: { readonly initial: string }) {
  const [value, setValue] = useState(initial)
  return <NumberStepper label="Repeats" value={value} min={1} max={3} invalid={false} decreaseLabel="Fewer" increaseLabel="More" onChange={setValue} />
}

describe("NumberStepper", () => {
  it("steps within its bounds and disables the button at each end", () => {
    render(<Stepper initial="2" />)
    const input = screen.getByRole("spinbutton", { name: "Repeats" })
    fireEvent.click(screen.getByRole("button", { name: "More" }))
    expect(input).toHaveProperty("value", "3")
    expect(screen.getByRole("button", { name: "More" })).toHaveProperty("disabled", true)
    fireEvent.change(input, { target: { value: "1" } })
    expect(screen.getByRole("button", { name: "Fewer" })).toHaveProperty("disabled", true)
    expect(screen.getByRole("button", { name: "More" })).toHaveProperty("disabled", false)
  })
})
