import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { server } from "@/mocks/node"
import { API_BASE, HttpError, postJson, readJson, readJsonOrNull } from "./client"

describe("http client", () => {
  it("reads JSON under the API base", async () => {
    server.use(http.get(`${API_BASE}/probe`, () => HttpResponse.json({ ok: true })))
    await expect(readJson<{ readonly ok: boolean }>("/probe")).resolves.toEqual({ ok: true })
  })

  it("throws HttpError with status and path on non-2xx", async () => {
    server.use(http.get(`${API_BASE}/broken`, () => HttpResponse.json({ error: "boom" }, { status: 500 })))
    const failure = readJsonOrNull("/broken")
    await expect(failure).rejects.toBeInstanceOf(HttpError)
    await expect(failure).rejects.toMatchObject({ status: 500, path: "/broken", message: "HTTP 500 /broken" })
  })

  it("maps 404 to null only in readJsonOrNull", async () => {
    server.use(http.get(`${API_BASE}/gone`, () => HttpResponse.json({ error: "not_found" }, { status: 404 })))
    await expect(readJsonOrNull("/gone")).resolves.toBeNull()
    await expect(readJson("/gone")).rejects.toMatchObject({ status: 404 })
  })

  it("posts a JSON body", async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(`${API_BASE}/commands`, async ({ request }) => {
        bodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await expect(postJson("/commands", { decision: "approve" })).resolves.toBeUndefined()
    expect(bodies).toEqual([{ decision: "approve" }])
  })
})
