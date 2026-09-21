import type { Dispatch, SetStateAction } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { IntlProvider } from "use-intl"
import { describe, expect, it, vi } from "vitest"
import type { ApiChatModelCatalog } from "@/domain"
import { TooltipProvider } from "@/components/ui/tooltip"
import { messages } from "@/i18n/messages"
import { DEFAULT_CHAT_CHOICE, keptEffort, offeredEfforts, type ChatChoice } from "./chat-choice"
import { ChatSettings } from "./chat-settings"

const CATALOG: ApiChatModelCatalog = {
  backend: "codex",
  models: [
    {
      id: "gpt-5.6-sol",
      display_name: "GPT-5.6-Sol",
      description: "Reliable agentic workhorse.",
      is_default: true,
      efforts: [
        { effort: "low", description: "Fast responses" },
        { effort: "high", description: "Greater depth" },
      ],
      default_effort: "low",
    },
    {
      id: "gpt-5.6-thinker",
      display_name: "GPT-5.6-Thinker",
      description: null,
      is_default: false,
      efforts: [{ effort: "max", description: "Maximum depth" }],
      default_effort: "max",
    },
  ],
  accepts_any_model: true,
  detail: null,
}

function mount(choice: ChatChoice, onChange: Dispatch<SetStateAction<ChatChoice>>, catalog: ApiChatModelCatalog = CATALOG) {
  return render(
    <IntlProvider locale="en" messages={messages.en}>
      <TooltipProvider>
        <ChatSettings
          backend={catalog.backend}
          choice={choice}
          disabled={false}
          onChange={onChange}
          loadModels={() => Promise.resolve(catalog)}
        />
      </TooltipProvider>
    </IntlProvider>,
  )
}

describe("chat settings", () => {
  it("offers every effort the catalog knows until a model narrows them", () => {
    expect(offeredEfforts(CATALOG, null)).toEqual(["low", "high", "max"])
    expect(offeredEfforts(CATALOG, "gpt-5.6-thinker")).toEqual(["max"])
  })

  it("drops an effort the newly chosen model does not support", () => {
    expect(keptEffort(CATALOG, "gpt-5.6-thinker", "low")).toBeNull()
    expect(keptEffort(CATALOG, "gpt-5.6-sol", "low")).toBe("low")
  })

  it("shows the default model on the composer trigger until one is chosen", async () => {
    mount(DEFAULT_CHAT_CHOICE, vi.fn())
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Model and agent settings" }).textContent).toContain("Default model")
    })
  })

  it("puts the chosen effort beside the model on the trigger", async () => {
    mount({ model: "gpt-5.6-sol", effort: "high", permissionMode: "default" }, vi.fn())
    await waitFor(() => {
      const label = screen.getByRole("combobox", { name: "Model and agent settings" }).textContent
      expect(label).toContain("GPT-5.6-Sol")
      expect(label).toContain("High")
    })
  })

  it("lists models and approval modes together, without a search field", async () => {
    mount(DEFAULT_CHAT_CHOICE, vi.fn())
    await waitFor(() => { expect(screen.getByRole("combobox", { name: "Model and agent settings" })).toBeDefined() })
    fireEvent.click(screen.getByRole("combobox", { name: "Model and agent settings" }))
    await waitFor(() => { expect(screen.getByText("GPT-5.6-Sol")).toBeDefined() })
    expect(screen.getByText("Manual")).toBeDefined()
    expect(screen.getByText("Plan")).toBeDefined()
    expect(screen.queryByPlaceholderText(/model name/i)).toBeNull()
  })

  it("moves effort along the slider in catalog order", async () => {
    const onChange = vi.fn()
    mount({ model: "gpt-5.6-sol", effort: "low", permissionMode: "accept_edits" }, onChange)
    await waitFor(() => { expect(screen.getByRole("combobox", { name: "Model and agent settings" })).toBeDefined() })
    fireEvent.click(screen.getByRole("combobox", { name: "Model and agent settings" }))
    const slider = await screen.findByRole("slider", { name: "Reasoning effort" })
    fireEvent.keyDown(slider, { key: "ArrowRight" })
    expect(onChange).toHaveBeenCalledWith({ model: "gpt-5.6-sol", effort: "high", permissionMode: "accept_edits" })
  })

  it("adopts the catalog default when nothing is chosen yet", async () => {
    const seen: ChatChoice[] = []
    const record: Dispatch<SetStateAction<ChatChoice>> = (update) => {
      seen.push(typeof update === "function" ? update(DEFAULT_CHAT_CHOICE) : update)
    }
    mount(DEFAULT_CHAT_CHOICE, record)
    await waitFor(() => { expect(seen.length).toBeGreaterThan(0) })
    expect(seen[0]).toEqual({ model: "gpt-5.6-sol", effort: "high", permissionMode: "accept_edits" })
  })

  it("keeps the menu usable when the catalog fails to load", async () => {
    render(
      <IntlProvider locale="en" messages={messages.en}>
        <TooltipProvider>
          <ChatSettings
            backend="claude"
            choice={DEFAULT_CHAT_CHOICE}
            disabled={false}
            onChange={vi.fn()}
            loadModels={() => Promise.reject(new Error("offline"))}
          />
        </TooltipProvider>
      </IntlProvider>,
    )
    await waitFor(() => { expect(screen.getByRole("combobox", { name: "Model and agent settings" })).toBeDefined() })
    fireEvent.click(screen.getByRole("combobox", { name: "Model and agent settings" }))
    await waitFor(() => { expect(screen.getByText("Model list unavailable")).toBeDefined() })
    expect(screen.getByText("Manual")).toBeDefined()
  })
})
