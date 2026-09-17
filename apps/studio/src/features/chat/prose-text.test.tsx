import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ProseText } from "./prose-text"

describe("ProseText", () => {
  it("keeps typed line breaks and inline code", () => {
    const { container } = render(<ProseText type="text" text={"hello `there`\n\nline2"} status={{ type: "complete" }} />)
    const paragraph = container.querySelector("p")
    expect(paragraph?.querySelectorAll("br")).toHaveLength(2)
    expect(paragraph?.textContent).toBe("hello thereline2")
    expect(paragraph?.querySelector("span")?.textContent).toBe("there")
  })
})
