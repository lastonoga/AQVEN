import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import type { ApiProviderKey, ApiSecret, ApiSetting } from "@/domain"
import type { RouterContext } from "@/router"
import { messageOf } from "@/lib/errors"

type SettingsApi = RouterContext["api"]["settings"]

export type ProjectKeys = {
  readonly providers: readonly ApiProviderKey[]
  readonly secrets: readonly ApiSecret[]
  readonly stored: readonly ApiSetting[]
}

export type KeysLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly keys: ProjectKeys }

export type ProjectKeysState = {
  readonly load: KeysLoad
  readonly reload: () => Promise<void>
  readonly retry: () => void
}

const LOADING: KeysLoad = { kind: "loading" }

const orNothing = async <T>(request: Promise<readonly T[]>): Promise<readonly T[]> => request.catch((): readonly T[] => [])

const readKeys = async (settings: SettingsApi): Promise<KeysLoad> => {
  try {
    const [providers, secrets, stored] = await Promise.all([
      settings.providers(),
      orNothing(settings.secrets()),
      orNothing(settings.list("project")),
    ])
    return { kind: "ready", keys: { providers, secrets, stored } }
  } catch (reason) {
    return { kind: "failed", message: messageOf(reason) }
  }
}

export function useProjectKeys(): ProjectKeysState {
  const { api } = useRouter().options.context
  const [load, setLoad] = useState<KeysLoad>(LOADING)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let live = true
    void readKeys(api.settings).then((next) => {
      if (live) setLoad(next)
    })
    return () => {
      live = false
    }
  }, [api, revision])

  const reload = async (): Promise<void> => {
    setLoad(await readKeys(api.settings))
  }

  const retry = (): void => {
    setLoad(LOADING)
    setRevision((current) => current + 1)
  }

  return { load, reload, retry }
}
