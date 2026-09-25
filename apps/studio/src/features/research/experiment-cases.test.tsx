import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { touchExperimentFile } from "@/mocks/authoring"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const LINE = "Cases this experiment runs"

const datasetLine = (): Promise<HTMLElement> => screen.findByRole("group", { name: LINE })

const openEditor = async (): Promise<HTMLElement> => {
  fireEvent.click(within(await datasetLine()).getByRole("button", { name: "Change cases" }))
  const editor = await screen.findByRole("region", { name: "Cases" })
  await within(editor).findByRole("group", { name: "Cases the experiment runs" })
  return editor
}

const tagGroup = (editor: HTMLElement, tag: string): HTMLElement => within(editor).getByRole("radiogroup", { name: `Value of tag ${tag}` })

const saveButton = (editor: HTMLElement): HTMLElement => within(editor).getByRole("button", { name: "Save" })

const saveWhenReady = async (editor: HTMLElement): Promise<void> => {
  await waitFor(() => {
    expect(saveButton(editor).hasAttribute("disabled")).toBe(false)
  })
  fireEvent.click(saveButton(editor))
}

describe("ExperimentScreen: dataset line", () => {
  it("names the dataset, the tags and the selected share of cases under the title", async () => {
    await renderRoute("/research/experiments/reply_look")
    const line = await datasetLine()
    expect(within(line).getByText("Dataset:")).toBeTruthy()
    const dataset = within(line).getByRole("link", { name: "Open the cases of support_case_cases this experiment runs" })
    expect(dataset.textContent).toBe("support_case_cases")
    expect(dataset.getAttribute("href")).toContain("/flows/support_case/cases")
    expect(dataset.getAttribute("href")).toContain("dataset=support_case_cases")
    expect(dataset.getAttribute("href")).toContain("regression")
    expect(within(line).getByRole("link", { name: "Open the cases of tag regression=yes" }).textContent).toBe("regression=yes")
    expect(line.textContent).toContain("5 of 12 cases")
  })

  it("says every case is selected when the experiment lists no tags", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const line = await datasetLine()
    expect(line.textContent).toContain("every case")
    expect(line.textContent).toContain("12 of 12 cases")
  })

  it("keeps the dataset as plain text when the experiment has no project flow to open its cases in", async () => {
    await renderRoute("/research/experiments/critique_planted_defects")
    const line = await datasetLine()
    expect(within(line).getByText("planted_defect_replies")).toBeTruthy()
    expect(within(line).queryByRole("link")).toBeNull()
  })
})

describe("ExperimentScreen: cases editor", () => {
  it("opens the dataset and tags of the experiment, counts a new choice live and writes it", async () => {
    await renderRoute("/research/experiments/reply_look")
    const editor = await openEditor()
    expect(within(editor).getByRole("combobox", { name: /Dataset support_case_cases/ })).toBeTruthy()
    const regression = tagGroup(editor, "regression")
    expect(within(regression).getByRole("radio", { name: "yes · 5" }).getAttribute("aria-checked")).toBe("true")
    expect(within(tagGroup(editor, "channel")).getByRole("radio", { name: "any" }).getAttribute("aria-checked")).toBe("true")
    expect(saveButton(editor).hasAttribute("disabled")).toBe(true)

    fireEvent.click(within(regression).getByRole("radio", { name: "no · 7" }))
    expect(await within(editor).findByText("7 of 12 cases")).toBeTruthy()
    expect(within(editor).getByRole("img", { name: "2 working, 5 held out" })).toBeTruthy()

    fireEvent.click(within(tagGroup(editor, "length")).getByRole("radio", { name: "long · 5" }))
    expect(await within(editor).findByText("4 of 12 cases")).toBeTruthy()

    await saveWhenReady(editor)
    expect(await within(editor).findByText("aqven check found no problems in experiments/reply_look/experiment.yaml")).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByRole("group", { name: LINE }).textContent).toContain("4 of 12 cases")
    })
    const line = screen.getByRole("group", { name: LINE })
    expect(within(line).getByRole("link", { name: "Open the cases of tag regression=no" })).toBeTruthy()
    expect(within(line).getByRole("link", { name: "Open the cases of tag length=long" })).toBeTruthy()
    expect(saveButton(editor).hasAttribute("disabled")).toBe(true)
  })

  it("clears a tag back to any and shows the whole dataset without asking the server", async () => {
    await renderRoute("/research/experiments/reply_look")
    const editor = await openEditor()
    fireEvent.click(within(tagGroup(editor, "regression")).getByRole("radio", { name: "any" }))
    expect(await within(editor).findByText("12 of 12 cases")).toBeTruthy()
    expect(within(editor).getByRole("link", { name: /Open these cases/ }).getAttribute("href")).toContain("dataset=support_case_cases")
  })

  it("offers the datasets a local flow can run and resets the tags when the dataset changes", async () => {
    await renderRoute("/research/experiments/critique_recall_by_agent")
    const editor = await openEditor()
    expect(within(tagGroup(editor, "planted")).getByRole("radio", { name: "yes · 8" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(within(editor).getByRole("combobox", { name: /Dataset planted_defect_replies/ }))
    const list = await screen.findByRole("listbox", { name: "Datasets" })
    expect(within(list).getAllByRole("option").map((option) => option.getAttribute("data-value"))).toEqual([
      "judge_panel_cases",
      "long_customer_messages",
      "planted_defect_replies",
      "support_case_cases",
    ])
    fireEvent.click(within(list).getByRole("option", { name: /long_customer_messages/ }))
    expect(await within(editor).findByRole("combobox", { name: /Dataset long_customer_messages/ })).toBeTruthy()
    expect(within(tagGroup(editor, "length")).getByRole("radio", { name: "any" }).getAttribute("aria-checked")).toBe("true")
    expect(within(editor).getByText("12 of 12 cases")).toBeTruthy()
  })

  it("says the file changed on disk, reloads it on request and writes the same choice again", async () => {
    await renderRoute("/research/experiments/reply_look")
    const editor = await openEditor()
    await waitFor(() => {
      expect(within(editor).queryByText("counting…")).toBeNull()
    })
    fireEvent.click(within(tagGroup(editor, "regression")).getByRole("radio", { name: "no · 7" }))
    await waitFor(() => {
      expect(saveButton(editor).hasAttribute("disabled")).toBe(false)
    })
    touchExperimentFile("reply_look")
    fireEvent.click(saveButton(editor))
    const alert = await within(editor).findByRole("alert")
    expect(alert.textContent).toContain("experiments/reply_look/experiment.yaml changed on disk after you opened it")
    expect(screen.getByRole("group", { name: LINE }).textContent).toContain("5 of 12 cases")

    fireEvent.click(within(alert).getByRole("button", { name: "Reload" }))
    await waitFor(() => {
      expect(within(editor).queryByRole("alert")).toBeNull()
    })
    expect(within(tagGroup(editor, "regression")).getByRole("radio", { name: "no · 7" }).getAttribute("aria-checked")).toBe("true")
    await saveWhenReady(editor)
    expect(await within(editor).findByText("aqven check found no problems in experiments/reply_look/experiment.yaml")).toBeTruthy()
  })

  it("shows the problems aqven check found in the written file", async () => {
    await renderRoute("/research/experiments/reply_stage_budget")
    const editor = await openEditor()
    fireEvent.click(within(tagGroup(editor, "lamp_kind")).getByRole("radio", { name: "none · 1" }))
    await saveWhenReady(editor)
    const problems = await within(editor).findByRole("list", { name: "Problems aqven check found in the written file" })
    expect(within(problems).getByText("E_CASES_EMPTY")).toBeTruthy()
    expect(within(problems).getByText("error")).toBeTruthy()
    expect(within(problems).getByText("drop a tag or pick another value")).toBeTruthy()
  })

  it("lists why the server refused to write the file", async () => {
    server.use(
      http.put(`${API_BASE}/experiments/:experimentId/cases`, () =>
        HttpResponse.json(
          {
            ok: false,
            op: "experiment_cases_write",
            code: "BLOCKING_PROBLEMS",
            message: "the tree has blocking problems",
            problems: [{ path: ["cases", "dataset"], code: "E_DATASET_MISMATCH", message: "dataset belongs to flow judge_panel" }],
            candidates: [],
            conflict: null,
            retry_after_ms: null,
          },
          { status: 422 },
        ),
      ),
    )
    await renderRoute("/research/experiments/reply_look")
    const editor = await openEditor()
    fireEvent.click(within(tagGroup(editor, "regression")).getByRole("radio", { name: "no · 7" }))
    await saveWhenReady(editor)
    expect(await within(editor).findByText("Not written: the tree has blocking problems")).toBeTruthy()
    const problems = within(editor).getByRole("list", { name: "Why the file was not written" })
    expect(within(problems).getByText("E_DATASET_MISMATCH")).toBeTruthy()
    expect(within(problems).getByText("cases.dataset")).toBeTruthy()
  })

  it("closes without writing", async () => {
    await renderRoute("/research/experiments/reply_look")
    const editor = await openEditor()
    fireEvent.click(within(editor).getByRole("button", { name: "Close" }))
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Cases" })).toBeNull()
    })
    expect(within(await datasetLine()).getByRole("button", { name: "Change cases" })).toBeTruthy()
  })
})
