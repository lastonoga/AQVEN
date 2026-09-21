import { describe, expect, it } from "vitest"
import { fieldIsVisible, initialManualInput, missingManualInput, projectManualInput, schemaAtPath } from "./manual-input-model"

const schema = {
  type: "object",
  properties: {
    customer: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
    origin: { oneOf: [
      { type: "object", properties: { kind: { const: "storefront", type: "string" }, page: { type: "string" } }, required: ["kind", "page"] },
      { type: "object", properties: { kind: { const: "marketplace", type: "string" }, order_ref: { type: "string" } }, required: ["kind", "order_ref"] },
    ] },
    ignored: { type: "string" },
  },
}

describe("manual input selection", () => {
  it("shows an entire object selected by a backend input path", () => {
    const paths = ["$input.customer"]
    expect(fieldIsVisible("customer", paths)).toBe(true)
    expect(fieldIsVisible("customer.id", paths)).toBe(true)
    expect(fieldIsVisible("origin", paths)).toBe(false)
  })

  it("shows only a selected nested field", () => {
    const paths = ["$input.origin.kind"]
    expect(fieldIsVisible("origin", paths)).toBe(true)
    expect(fieldIsVisible("origin.kind", paths)).toBe(true)
    expect(fieldIsVisible("origin.page", paths)).toBe(false)
  })

  it("projects edited values to the chosen paths without adding missing or null fields", () => {
    const draft = {
      customer: { id: "cus_1", name: "Ada" },
      origin: { kind: "storefront", page: "home" },
      ignored: "skip",
      optional: null,
    }
    expect(projectManualInput(draft, ["$input.customer.id", "$input.origin.kind", "$input.optional"])).toEqual({
      customer: { id: "cus_1" }, origin: { kind: "storefront" }, optional: null,
    })
    expect(projectManualInput({}, ["$input.optional"])).toEqual({})
  })

  it("keeps the whole editable array when a node reads an item", () => {
    expect(fieldIsVisible("items", ["$input.items[0].name"])).toBe(true)
    expect(projectManualInput({ items: [{ name: "one", extra: 1 }], ignored: true }, ["$input.items[0].name"])).toEqual({ items: [{ name: "one", extra: 1 }] })
  })

  it("finds schema members within oneOf branches", () => {
    expect(schemaAtPath(schema, "origin.kind")).toEqual({ const: "storefront", type: "string" })
  })

  it("initializes the active union branch and checks only selected fields", () => {
    const draft = initialManualInput(schema)
    expect(draft["origin"]).toEqual({ kind: "storefront" })
    expect(missingManualInput(schema, ["$input"], draft)).not.toContain("")
    expect(missingManualInput(schema, ["$input.origin"], draft)).toContain("origin.page")
    expect(missingManualInput(schema, ["$input.customer.id"], draft)).toContain("customer.id")
    expect(missingManualInput(schema, ["$input.customer.id"], { customer: { id: "1" } })).toEqual([])
  })
})
