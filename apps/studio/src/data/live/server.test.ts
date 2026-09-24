import { describe, expect, it } from "vitest"
import { http, HttpResponse } from "msw"
import { API_BASE, ApiError } from "@/api/client"
import { liveHealth, liveServerStatus } from "@/mocks/data/server"
import { server as mockServer } from "@/mocks/node"
import { server } from "./server"

const SERVICE_UNAVAILABLE = 503

describe("server source", () => {
  it("reads the liveness report and the checks", async () => {
    await expect(server.health()).resolves.toEqual(liveHealth)
    await expect(server.status()).resolves.toEqual(liveServerStatus)
  })

  it("keeps the identity of a server that is still starting", async () => {
    mockServer.use(
      http.get(`${API_BASE}/health`, () => HttpResponse.json({ ...liveHealth, status: "starting" }, { status: SERVICE_UNAVAILABLE })),
    )
    await expect(server.health()).resolves.toMatchObject({ status: "starting", pid: liveHealth.pid })
  })

  it("fails with the engine envelope when a probe does not answer with its report", async () => {
    mockServer.use(
      http.get(`${API_BASE}/status`, () =>
        HttpResponse.json({ op: "status_get", code: "UNAUTHORIZED", message: "missing token" }, { status: 401 }),
      ),
      http.get(`${API_BASE}/health`, () => HttpResponse.text("bad gateway", { status: 502 })),
    )
    await expect(server.status()).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" })
    await expect(server.health()).rejects.toBeInstanceOf(ApiError)
  })

  it("fails when the server is unreachable", async () => {
    mockServer.use(http.get(`${API_BASE}/health`, () => HttpResponse.error()))
    await expect(server.health()).rejects.toThrow()
  })
})
