import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RoutePending } from "./-feedback"

describe("RoutePending", () => {
  it("announces loading and preserves a page-sized skeleton", () => {
    render(<RoutePending />)
    const status = screen.getByRole("status", { name: "Loading page" })
    expect(status.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)
  })
})
