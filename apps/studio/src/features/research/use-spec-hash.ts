import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import type { ContentHash, FilePath } from "@/domain"
import { messageOf } from "@/lib/errors"

export type SpecHash =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly hash: ContentHash }
  | { readonly kind: "failed"; readonly message: string }

type Read = { readonly key: string; readonly hash: SpecHash }

export type SpecHashState = {
  readonly hash: SpecHash
  readonly reread: () => void
  readonly written: (hash: ContentHash) => void
}

const LOADING: SpecHash = { kind: "loading" }

export function useSpecHash(path: FilePath): SpecHashState {
  const source = useRouter().options.context.api.authoring
  const [revision, setRevision] = useState(0)
  const [read, setRead] = useState<Read | null>(null)
  const key = `${path}#${String(revision)}`
  useEffect(() => {
    let active = true
    void source.fileHash(path).then(
      (hash) => {
        if (active) setRead({ key, hash: { kind: "ready", hash } })
      },
      (reason: unknown) => {
        if (active) setRead({ key, hash: { kind: "failed", message: messageOf(reason) } })
      },
    )
    return () => {
      active = false
    }
  }, [source, path, key])
  return {
    hash: read === null || read.key !== key ? LOADING : read.hash,
    reread: () => {
      setRevision((value) => value + 1)
    },
    written: (hash) => {
      setRead({ key, hash: { kind: "ready", hash } })
    },
  }
}
