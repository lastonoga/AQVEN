import { render, screen, waitFor } from "@testing-library/react"
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

function mount(choice: ChatChoice, onChange: (next: ChatChoice) => void, catalog: ApiChatModelCatalog = CATALOG) {
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

  it("shows the default model until one is chosen", async () => {
    mount(DEFAULT_CHAT_CHOICE, vi.fn())
    await waitFor(() => { expect(screen.getByRole("combobox", { name: "Model" }).textContent).toContain("Default model") })
  })

  it("names the chosen model on the trigger", async () => {
    mount({ ...DEFAULT_CHAT_CHOICE, model: "gpt-5.6-sol" }, vi.fn())
    await waitFor(() => { expect(screen.getByRole("combobox", { name: "Model" }).textContent).toContain("GPT-5.6-Sol") })
  })

  it("keeps approvals visible even when the catalog fails to load", async () => {
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
    await waitFor(() => { expect(screen.getByText("Model list unavailable")).toBeDefined() })
    expect(screen.getByRole("radiogroup", { name: "Approvals" })).toBeDefined()
  })
})
