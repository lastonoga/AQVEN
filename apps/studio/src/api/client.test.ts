import { describe, expect, it } from "vitest"
import { liveConflictError, liveInvalidRequestError, liveNotFoundError } from "@/mocks/data/errors"
import { ApiError, apiError, isNotFound, isUnauthorized } from "./client"

describe("api error envelope", () => {
  it("reads the flat engine envelope", () => {
    const error = apiError(liveNotFoundError.status, liveNotFoundError.body)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(404)
    expect(error.op).toBe("flow_get")
    expect(error.code).toBe("NOT_FOUND")
    expect(error.message).toBe("flow no_such_flow is not in the project")
    expect(isNotFound(error)).toBe(true)
    expect(isUnauthorized(error)).toBe(false)
  })

  it("keeps the conflict code so screens can branch on it", () => {
    const error = apiError(liveConflictError.status, liveConflictError.body)
    expect(error.status).toBe(409)
    expect(error.code).toBe("ALREADY_RESUMED")
    expect(error.problems).toEqual([])
    expect(error.retryAfterMs).toBeNull()
  })

  it("carries per-field problems so forms can paint them", () => {
    const error = apiError(liveInvalidRequestError.status, liveInvalidRequestError.body)
    expect(error.code).toBe("REQUEST_INVALID")
    expect(error.problems.map((problem) => problem.path)).toEqual([
      ["body", "address"],
      ["body", "payload"],
      ["body", "client_op_id"],
    ])
    expect(error.problems[0]?.code).toBe("missing")
  })

  it("falls back when the body is not an envelope", () => {
    const error = apiError(500, "gateway exploded")
    expect(error.code).toBe("INTERNAL")
    expect(error.message).toBe("HTTP 500")
    expect(error.problems).toEqual([])
  })
})
