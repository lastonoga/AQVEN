import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const PAGE = "/research/experiments/new"
const CREATE_URL = `${API_BASE}/experiments`
const EXPERIMENT_ID = "triage_on_mistral"

type Json = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

const openForm = async (): Promise<HTMLElement> => {
  await renderRoute(PAGE)
  return screen.findByRole("form", { name: "New experiment" })
}

const recordCreates = (): Json[] => {
  const bodies: Json[] = []
  server.events.on("request:start", ({ request }) => {
    if (request.method !== "POST" || new URL(request.url).pathname !== CREATE_URL) return
    void request
      .clone()
      .json()
      .then((body: unknown) => {
        if (isRecord(body)) bodies.push(body)
      })
  })
  return bodies
}

const pick = async (trigger: string | RegExp, list: string, option: string | RegExp): Promise<void> => {
  fireEvent.click(screen.getByRole("combobox", { name: trigger }))
  const listbox = await screen.findByRole("listbox", { name: list })
  fireEvent.click(within(listbox).getByRole("option", { name: option }))
}

const type = (label: string | RegExp, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

const fillAgentExperiment = async (): Promise<void> => {
  type("Question in words", "Mistral triages as well as gemini")
  type("Experiment id", EXPERIMENT_ID)
  await pick("Choose a flow", "Choose a flow", /^support_case/)
  fireEvent.click(await screen.findByRole("button", { name: "Vary triage" }))
  await pick("Value of triage in variant variant_2", "Value of triage in variant variant_2", /^mistral/)
  expect(await screen.findByRole("combobox", { name: /Dataset support_case_cases/ })).toBeTruthy()
}

const create = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "Create experiment" }))
}

const captureHandoffs = (): unknown[] => {
  const sent: unknown[] = []
  server.use(
    http.post(`${API_BASE}/chat/sessions/:sessionId/messages`, async ({ request }) => {
      const body: unknown = await request.json()
      sent.push(isRecord(body) ? body["text"] : null)
      return HttpResponse.json({ turn_id: "turn-1", accepted_at: "2026-09-18T03:00:00Z" }, { status: 202 })
    }),
  )
  return sent
}

afterEach(() => {
  server.events.removeAllListeners()
})

describe("NewExperimentScreen", () => {
  it("opens from the New experiment button of the Research list", async () => {
    const router = await renderRoute("/research")
    fireEvent.click(await screen.findByRole("link", { name: "New experiment" }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PAGE)
    })
    expect(await screen.findByRole("heading", { level: 1, name: "New experiment" })).toBeTruthy()
  })

  it("lists what is missing and sends nothing when the form is empty", async () => {
    const creates = recordCreates()
    await openForm()
    create()
    const alert = await screen.findByText("4 things to fix before creating:")
    expect(alert).toBeTruthy()
    expect(screen.getAllByText("Write the question in words").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Choose the flow the experiment runs").length).toBeGreaterThan(0)
    expect(creates).toEqual([])
  })

  it("offers llm nodes for an agent factor, call nodes for a flow factor and hands a use factor to the chat", async () => {
    await openForm()
    await pick("Choose a flow", "Choose a flow", /^support_case/)
    const nodesOf = async (): Promise<readonly (string | null)[]> =>
      within(await screen.findByRole("list", { name: "Nodes of support_case" }))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    const llm = await nodesOf()
    expect(llm).toContain("Vary triage")
    expect(llm).toContain("Vary revise")
    expect(llm).not.toContain("Vary prepare")
    expect(screen.getByRole("link", { name: "Open revise of support_case on the canvas" }).getAttribute("href")).toContain("node=polish__revise")
    fireEvent.click(screen.getByRole("radio", { name: "called flow" }))
    expect(await nodesOf()).toEqual(["Vary panel"])
    fireEvent.click(screen.getByRole("radio", { name: "node" }))
    expect(await nodesOf()).toContain("Vary prepare")
    expect(await screen.findByRole("button", { name: "Ask chat to write the alternatives" })).toBeTruthy()
  })

  it("reads a check the way the engine scores it", async () => {
    await openForm()
    await pick("Add a check", "Add a check", /^cost_usd/)
    const check = await screen.findByRole("group", { name: "Check cost_usd" })
    expect(within(check).getByRole("radio", { name: "score" }).getAttribute("aria-checked")).toBe("true")
    await pick("Add a check", "Add a check", /^max_words/)
    expect(await screen.findByText("A JSON object the check gets as with; its keys: field, max. A field is a path such as $out.reply or $in.message")).toBeTruthy()
  })

  it("writes an agent experiment through the server and opens it", async () => {
    const creates = recordCreates()
    const router = await renderRoute(PAGE)
    await screen.findByRole("form", { name: "New experiment" })
    await fillAgentExperiment()
    fireEvent.click(screen.getByRole("radio", { name: "not worse" }))
    type("Margin", "0.05")
    create()
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/research/experiments/${EXPERIMENT_ID}`)
    })
    expect(creates).toHaveLength(1)
    expect(creates[0]).toMatchObject({
      experiment_id: EXPERIMENT_ID,
      prompts: {},
      spec: {
        apiVersion: "aqven/v1",
        kind: "Experiment",
        description: "Mistral triages as well as gemini",
        subject: { flow: "support_case" },
        varies: { what: "agent", nodes: ["triage"] },
        cases: { dataset: "support_case_cases" },
        variants: [{ id: "as_written" }, { id: "mistral", nodes: { triage: "mistral" } }],
        question: { kind: "noninferior", baseline: "as_written", candidate: "mistral", primary: "success_rate", margin: 0.05 },
        plan: { repeats: 1 },
      },
    })
  })

  it("shows why the server refused the experiment next to the form", async () => {
    server.use(
      http.post(CREATE_URL, () =>
        HttpResponse.json(
          {
            ok: false,
            op: "experiment_create",
            code: "REQUEST_INVALID",
            message: "the experiment does not validate",
            problems: [{ path: ["spec", "question", "margin"], code: "greater_than", message: "Input should be greater than 0" }],
          },
          { status: 422 },
        ),
      ),
    )
    await openForm()
    await fillAgentExperiment()
    create()
    expect(await screen.findByText("Not written: the experiment does not validate")).toBeTruthy()
    expect(screen.getByText("Input should be greater than 0")).toBeTruthy()
    expect(screen.getByText("spec.question.margin")).toBeTruthy()
  })

  it("stays on the form with the check report when the written file has errors", async () => {
    server.use(
      http.post(CREATE_URL, () =>
        HttpResponse.json(
          {
            experiment_id: EXPERIMENT_ID,
            file: `experiments/${EXPERIMENT_ID}/experiment.yaml`,
            file_hash: "sha256-new",
            diagnostics: [
              { code: "E_AGENT_UNKNOWN", severity: "error", file: `experiments/${EXPERIMENT_ID}/experiment.yaml`, path: ["variants", 1, "nodes", "triage"], message: "agent mistral does not exist", line: 12, column: 5, hint: null },
            ],
          },
          { status: 201 },
        ),
      ),
    )
    const router = await renderRoute(PAGE)
    await screen.findByRole("form", { name: "New experiment" })
    await fillAgentExperiment()
    create()
    expect(await screen.findByText("agent mistral does not exist")).toBeTruthy()
    expect(screen.getByRole("link", { name: `Open experiment ${EXPERIMENT_ID}` }).getAttribute("href")).toBe(`/research/experiments/${EXPERIMENT_ID}`)
    expect(router.state.location.pathname).toBe(PAGE)
  })

  it("hands the form as it stands to the chat", async () => {
    const sent = captureHandoffs()
    await openForm()
    await fillAgentExperiment()
    const button = screen.getByRole("button", { name: "Ask chat to draft" })
    await waitFor(() => {
      expect(button.hasAttribute("disabled")).toBe(false)
    })
    fireEvent.click(button)
    await waitFor(() => {
      expect(sent).toHaveLength(1)
    })
    const text = String(sent[0])
    expect(text).toContain(`experiments/${EXPERIMENT_ID}/experiment.yaml`)
    expect(text).toContain('"triage": "mistral"')
  })
})
