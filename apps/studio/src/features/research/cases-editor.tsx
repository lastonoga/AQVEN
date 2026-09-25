import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { AuthoringDataset, CaseSelectionDraft, ExperimentDetail, WrittenFile } from "@/domain"
import { Surface, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { CasesPicker, datasetsForSubject, FailureReport, sameSelection, selectionOf, useAuthoringOptions, WrittenReport, writeFailureOf, type WriteFailure } from "./authoring"
import { ResearchSection } from "./layout"
import { casesFlowOf } from "./presenters"
import { useSpecHash, type SpecHash } from "./use-spec-hash"

type SaveState =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved"; readonly written: WrittenFile }
  | { readonly kind: "failed"; readonly failure: WriteFailure }

type CasesEditorProps = { readonly experiment: ExperimentDetail; readonly onClose: () => void }

type OutcomeProps = { readonly state: SaveState; readonly file: string; readonly onReload: () => void }

const IDLE: SaveState = { kind: "idle" }

const NO_DATASETS: readonly AuthoringDataset[] = []

function Outcome({ state, file, onReload }: OutcomeProps) {
  if (state.kind === "saved") return <WrittenReport file={state.written.file} diagnostics={state.written.diagnostics} />
  if (state.kind === "failed") return <FailureReport failure={state.failure} file={file} onReload={onReload} />
  return null
}

function HashNote({ hash }: { readonly hash: SpecHash }) {
  const t = useTranslations("research.experiment.dataset")
  if (hash.kind !== "failed") return null
  return (
    <Text as="p" role="hint" tone="destructive">
      {t("hashFailed", { reason: hash.message })}
    </Text>
  )
}

function useDatasets(experiment: ExperimentDetail): { readonly datasets: readonly AuthoringDataset[]; readonly note: string | null } {
  const t = useTranslations("research.experiment.dataset")
  const options = useAuthoringOptions(null)
  if (options.kind === "loading") return { datasets: NO_DATASETS, note: t("loading") }
  if (options.kind === "failed") return { datasets: NO_DATASETS, note: t("loadFailed", { reason: options.message }) }
  return { datasets: datasetsForSubject(options.options.datasets, experiment.subject, experiment.cases.dataset), note: null }
}

export function CasesEditor({ experiment, onClose }: CasesEditorProps) {
  const t = useTranslations("research.experiment.dataset")
  const router = useRouter()
  const source = router.options.context.api.authoring
  const spec = useSpecHash(experiment.files.spec)
  const { datasets, note } = useDatasets(experiment)
  const [draft, setDraft] = useState<CaseSelectionDraft>(() => selectionOf(experiment.cases))
  const [save, setSave] = useState<SaveState>(IDLE)
  const written = selectionOf(experiment.cases)
  const dirty = !sameSelection(draft, written)
  const saving = save.kind === "saving"
  const canSave = dirty && !saving && spec.hash.kind === "ready"

  const choose = (next: CaseSelectionDraft): void => {
    setDraft(next)
    if (save.kind !== "saving") setSave(IDLE)
  }

  const submit = (): void => {
    const hash = spec.hash
    if (!dirty || saving || hash.kind !== "ready") return
    setSave({ kind: "saving" })
    void source.saveCases(experiment.id, draft, hash.hash).then(
      (result) => {
        spec.written(result.fileHash)
        setSave({ kind: "saved", written: result })
        void router.invalidate()
      },
      (reason: unknown) => {
        setSave({ kind: "failed", failure: writeFailureOf(reason) })
      },
    )
  }

  const reload = (): void => {
    setSave(IDLE)
    spec.reread()
    void router.invalidate()
  }

  const actions = (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="ghost" onClick={onClose}>
        {t("close")}
      </Button>
      <Button type="button" size="sm" disabled={!canSave} onClick={submit}>
        {saving ? t("saving") : t("save")}
      </Button>
    </div>
  )

  return (
    <ResearchSection title={t("editorTitle")} description={t("editorDescription", { file: experiment.files.spec })} trailing={actions}>
      <Surface variant="panel" className="flex min-w-0 flex-col gap-4 p-4">
        {note === null ? (
          <CasesPicker datasets={datasets} value={draft} onChange={choose} casesFlow={casesFlowOf(experiment)} disabled={saving} />
        ) : (
          <Text as="p" role="hint" tone="neutral">
            {note}
          </Text>
        )}
      </Surface>
      <HashNote hash={spec.hash} />
      <Outcome state={save} file={experiment.files.spec} onReload={reload} />
    </ResearchSection>
  )
}
