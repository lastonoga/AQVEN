import { describe, expect, it } from "vitest"
import type { ApiRunError } from "@/domain"
import { failedSteps, isListedFailure, isLongMessage, oneLine, readableResponse } from "./failed-steps"
import { FACE_RUN_ID, faceEvents, finishedAt, itemAddress, schemaRejection, topAddress } from "./test-support"

const timeout = (nodeId: string): ApiRunError => ({ code: "timeout", message: "step ran out of time", address: topAddress(nodeId), hint: null, details: null })

describe("failedSteps", () => {
  it("lists the failed map item with its address and error", () => {
    const steps = failedSteps(faceEvents())
    expect(steps).toHaveLength(1)
    expect(steps[0]?.address).toEqual(itemAddress("assess__look", 0))
    expect(steps[0]?.error?.code).toBe("OUTPUT_SCHEMA_REJECTED")
  })

  it("keeps only the last finish of an execution, so a later success clears the failure", () => {
    const events = [
      finishedAt(FACE_RUN_ID, 1, topAddress("plan"), timeout("plan")),
      finishedAt(FACE_RUN_ID, 2, topAddress("plan")),
      finishedAt(FACE_RUN_ID, 3, topAddress("compile"), timeout("compile")),
    ]
    expect(failedSteps(events).map((step) => step.address.node_id)).toEqual(["compile"])
  })

  it("keeps a failure whose error the engine did not record", () => {
    const event = { ...finishedAt(FACE_RUN_ID, 1, topAddress("plan")), status: "failed" as const, error: null }
    expect(failedSteps([event])).toEqual([{ key: "plan|||", address: topAddress("plan"), error: null }])
  })
})

describe("isListedFailure", () => {
  it("recognises a run error that repeats a listed step error", () => {
    const steps = failedSteps(faceEvents())
    expect(isListedFailure(schemaRejection, steps)).toBe(true)
    expect(isListedFailure({ ...schemaRejection, code: "E_MAP_ITEM_FAILED" }, steps)).toBe(false)
    expect(isListedFailure({ ...schemaRejection, address: null }, steps)).toBe(false)
  })
})

describe("oneLine", () => {
  it("keeps the first line and shortens a long provider dump", () => {
    expect(oneLine("first line\nsecond line")).toBe("first line")
    const long = oneLine(`status_code: 400, ${"x".repeat(1000)}`)
    expect(long.length).toBeLessThanOrEqual(241)
    expect(long.endsWith("…")).toBe(true)
  })
})

describe("isLongMessage", () => {
  it("folds a message that runs past the limit or over several lines", () => {
    expect(isLongMessage("short", 480)).toBe(false)
    expect(isLongMessage("x".repeat(481), 480)).toBe(true)
    expect(isLongMessage("first\nsecond", 480)).toBe(true)
    expect(isLongMessage("trailing newline\n", 480)).toBe(false)
  })
})

describe("readableResponse", () => {
  it("unwraps the JSON a provider nests inside a string", () => {
    const text = readableResponse(schemaRejection.details?.provider_response ?? "")
    expect(text).toContain('"status": "INVALID_ARGUMENT"')
    expect(text).toContain("too many states for serving")
    expect(text).not.toContain("\\n")
  })

  it("returns text that is not JSON as it came", () => {
    expect(readableResponse("upstream is rate-limited")).toBe("upstream is rate-limited")
  })
})
