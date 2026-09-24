import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import type { ApiResearchBudget } from "@/domain"
import type { RouterContext } from "@/router"
import { settingKey } from "@/data/ids"
import { messageOf } from "@/lib/errors"
import { SPEND_CAP_SCOPE, SPEND_CAP_SETTING } from "./presenters"

type SettingsApi = RouterContext["api"]["settings"]

export type BudgetLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly budget: ApiResearchBudget }

export type ResearchBudgetState = {
  readonly load: BudgetLoad
  readonly pending: boolean
  readonly failure: string | null
  readonly retry: () => void
  readonly save: (fileHash: string, cap: string) => void
  readonly removeOverride: () => void
}

const LOADING: BudgetLoad = { kind: "loading" }

const readBudget = async (settings: SettingsApi): Promise<BudgetLoad> => {
  try {
    return { kind: "ready", budget: await settings.budget() }
  } catch (reason) {
    return { kind: "failed", message: messageOf(reason) }
  }
}

const savedBudget = async (settings: SettingsApi, fileHash: string, cap: string): Promise<ApiResearchBudget> =>
  settings.saveBudget({ research: { spend_cap_usd: cap }, file_hash: fileHash })

const withoutOverride = async (settings: SettingsApi): Promise<ApiResearchBudget> => {
  await settings.clear(SPEND_CAP_SCOPE, settingKey(SPEND_CAP_SETTING))
  return settings.budget()
}

export function useResearchBudget(): ResearchBudgetState {
  const { api } = useRouter().options.context
  const [load, setLoad] = useState<BudgetLoad>(LOADING)
  const [revision, setRevision] = useState(0)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void readBudget(api.settings).then((next) => {
      if (live) setLoad(next)
    })
    return () => {
      live = false
    }
  }, [api, revision])

  const refreshQuietly = async (): Promise<void> => {
    const next = await readBudget(api.settings)
    if (next.kind === "ready") setLoad(next)
  }

  const settle = (write: () => Promise<ApiResearchBudget>): void => {
    if (pending) return
    setPending(true)
    setFailure(null)
    void write().then(
      (budget) => {
        setPending(false)
        setLoad({ kind: "ready", budget })
      },
      (reason: unknown) => {
        setPending(false)
        setFailure(messageOf(reason))
        void refreshQuietly()
      },
    )
  }

  return {
    load,
    pending,
    failure,
    retry: () => {
      setLoad(LOADING)
      setRevision((current) => current + 1)
    },
    save: (fileHash, cap) => {
      settle(() => savedBudget(api.settings, fileHash, cap))
    },
    removeOverride: () => {
      settle(() => withoutOverride(api.settings))
    },
  }
}
