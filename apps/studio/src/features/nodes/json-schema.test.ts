import { describe, expect, it } from "vitest"
import { liveNodeDetails } from "@/mocks/data/nodes"
import { isJsonObject, schemaFields, schemaTypeLabel } from "./json-schema"

const triage = liveNodeDetails["support_case/triage"]

const property = (schema: unknown, name: string): unknown => {
  if (!isJsonObject(schema)) return null
  const properties = schema["properties"]
  return isJsonObject(properties) ? properties[name] : null
}

describe("schemaTypeLabel", () => {
  it("reads the plain shapes of a real input schema", () => {
    expect(schemaTypeLabel(property(triage?.in_schema, "message"))).toBe("string")
    expect(schemaTypeLabel(property(triage?.in_schema, "channel"))).toBe("enum(3)")
    expect(schemaTypeLabel(property(triage?.in_schema, "signals"))).toBe("object[]")
  })

  it("marks an anyOf with null as optional", () => {
    expect(schemaTypeLabel(property(triage?.in_schema, "product"))).toBe("object?")
  })

  it("names a referenced definition", () => {
    expect(schemaTypeLabel({ $ref: "#/$defs/Image" })).toBe("Image")
  })

  it("counts the members of a oneOf root", () => {
    expect(schemaTypeLabel({ oneOf: [{ type: "object" }, { type: "object" }, { type: "object" }] })).toBe("union(3)")
  })

  it("falls back to any for a schema that is not an object", () => {
    expect(schemaTypeLabel(null)).toBe("any")
  })
})

describe("schemaFields", () => {
  it("lists the properties of a real schema with their required flag", () => {
    const fields = schemaFields(triage?.in_schema)
    expect(fields.map((field) => field.name)).toContain("intake_fields")
    expect(fields.every((field) => field.required)).toBe(true)
  })

  it("stays empty for a schema without properties", () => {
    expect(schemaFields({ oneOf: [] })).toEqual([])
    expect(schemaFields(null)).toEqual([])
  })

  it("marks optional properties as not required", () => {
    const fields = schemaFields({ type: "object", properties: { a: { type: "string" }, b: { type: "string" } }, required: ["a"] })
    expect(fields.map((field) => [field.name, field.required])).toEqual([
      ["a", true],
      ["b", false],
    ])
  })
})
