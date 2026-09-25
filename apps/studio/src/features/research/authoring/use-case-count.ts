import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import type { AuthoringDataset, CaseCount, CaseSelectionDraft } from "@/domain"
import { messageOf } from "@/lib/errors"
import { findDataset, selectionKey, wholeDataset } from "./model"

export type CaseCountState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly previous: CaseCount | null }
  | { readonly kind: "ready"; readonly count: CaseCount }
  | { readonly kind: "failed"; readonly message: string }

type Tracked = { readonly key: string | null; readonly selection: CaseSelectionDraft | null }

type Counted = { readonly key: string; readonly state: CaseCountState }

const IDLE: CaseCountState = { kind: "idle" }

const NO_DATASETS: readonly AuthoringDataset[] = []

const keyOf = (selection: CaseSelectionDraft | null): string | null => (selection === null ? null : selectionKey(selection))

const shownCount = (counted: Counted | null): CaseCount | null => (counted?.state.kind === "ready" ? counted.state.count : null)

const localCount = (selection: CaseSelectionDraft | null, datasets: readonly AuthoringDataset[]): CaseCount | null => {
  if (selection === null || Object.keys(selection.tags).length > 0) return null
  const dataset = findDataset(datasets, selection.dataset)
  return dataset === null ? null : wholeDataset(dataset)
}

export function useCaseCount(selection: CaseSelectionDraft | null, datasets: readonly AuthoringDataset[] = NO_DATASETS): CaseCountState {
  const source = useRouter().options.context.api.authoring
  const key = keyOf(selection)
  const [tracked, setTracked] = useState<Tracked>({ key, selection })
  const [counted, setCounted] = useState<Counted | null>(null)
  if (tracked.key !== key) setTracked({ key, selection })
  const local = localCount(selection, datasets)
  const counts = local === null
  useEffect(() => {
    const request = tracked.selection
    const requested = tracked.key
    if (request === null || requested === null || !counts) return
    let active = true
    void source.count(request).then(
      (count) => {
        if (active) setCounted({ key: requested, state: { kind: "ready", count } })
      },
      (reason: unknown) => {
        if (active) setCounted({ key: requested, state: { kind: "failed", message: messageOf(reason) } })
      },
    )
    return () => {
      active = false
    }
  }, [source, tracked, counts])
  if (key === null) return IDLE
  if (local !== null) return { kind: "ready", count: local }
  if (counted === null || counted.key !== key) return { kind: "loading", previous: shownCount(counted) }
  return counted.state
}
