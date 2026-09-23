import { describe, expect, it } from "vitest"
import { messageOf } from "./errors"

describe("messageOf", () => {
  it("reads the message of an error and stringifies anything else", () => {
    expect(messageOf(new Error("engine down"))).toBe("engine down")
    expect(messageOf("timeout")).toBe("timeout")
    expect(messageOf(404)).toBe("404")
  })
})
