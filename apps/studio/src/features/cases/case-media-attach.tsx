import { useRef, useState, type ReactNode } from "react"
import { useRouter } from "@tanstack/react-router"
import { Paperclip } from "lucide-react"
import { useTranslations } from "use-intl"
import { ApiError } from "@/api/client"
import type { ApiDatasetSummary, FilePath } from "@/domain"
import { Text } from "@/components/studio"
import { rawFileUrl } from "@/components/studio/media-output"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import * as ids from "@/data/ids"
import type { Translator } from "@/i18n/translator"
import { casesRouteApi } from "@/lib/routes"
import { messageOf } from "@/lib/errors"
import type { AttachTarget } from "./media-files"

export type CaseMediaAttachProps = {
  readonly dataset: ApiDatasetSummary
  readonly caseName: string
  readonly targets: readonly AttachTarget[]
}

type AttachState =
  | { readonly kind: "idle" }
  | { readonly kind: "saving"; readonly field: string }
  | { readonly kind: "saved"; readonly path: FilePath }
  | { readonly kind: "stale" }
  | { readonly kind: "failed"; readonly reason: string }

type AttachKind = AttachState["kind"]
type StateOf<K extends AttachKind> = Extract<AttachState, { readonly kind: K }>
type StatusContext = { readonly t: Translator<"cases.media">; readonly folder: string }
type StatusViews = { readonly [K in AttachKind]: (state: StateOf<K>, context: StatusContext) => ReactNode }

const IDLE: AttachState = { kind: "idle" }
const RELOAD_CODES: ReadonlySet<string> = new Set(["STALE_FILE", "FILE_VANISHED", "FILE_EXISTS"])

const reasonOf = (reason: unknown): string => {
  const detail = reason instanceof ApiError ? reason.problems[0]?.message : undefined
  return detail === undefined ? messageOf(reason) : `${messageOf(reason)}: ${detail}`
}

const failureOf = (reason: unknown): AttachState =>
  reason instanceof ApiError && RELOAD_CODES.has(reason.code) ? { kind: "stale" } : { kind: "failed", reason: reasonOf(reason) }

type AttachButtonProps = {
  readonly target: AttachTarget
  readonly busy: boolean
  readonly onFile: (target: AttachTarget, file: File) => void
}

function AttachButton({ target, busy, onFile }: AttachButtonProps) {
  const t = useTranslations("cases.media")
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { input.current?.click() }}>
        <Paperclip aria-hidden />
        {target.filled ? t("replace", { field: target.field }) : t("attach", { field: target.field })}
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        disabled={busy}
        accept={target.accept}
        aria-label={t("fileFor", { field: target.field })}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file !== undefined) onFile(target, file)
        }}
      />
    </>
  )
}

const STATUS: StatusViews = {
  idle: (_state, { t, folder }) => <Text as="p" role="hint" tone="neutral">{t("hint", { folder })}</Text>,
  saving: (state, { t }) => <Text as="p" role="hint" tone="neutral">{t("saving", { field: state.field })}</Text>,
  saved: (state, { t }) => (
    <Text as="p" role="hint" tone="success">
      {t.rich("saved", {
        path: state.path,
        link: (chunks) => <a href={rawFileUrl(state.path)} target="_blank" rel="noreferrer" className="font-mono underline underline-offset-2">{chunks}</a>,
      })}
    </Text>
  ),
  stale: (_state, { t }) => <Text as="p" role="hint" tone="warning">{t("stale")}</Text>,
  failed: (state, { t }) => <Text as="p" role="hint" tone="destructive">{t("failed", { reason: state.reason })}</Text>,
}

const renderStatus = <K extends AttachKind>(state: StateOf<K>, context: StatusContext): ReactNode => {
  const view: (state: StateOf<K>, context: StatusContext) => ReactNode = STATUS[state.kind]
  return view(state, context)
}

function AttachStatus({ state, folder }: { readonly state: AttachState; readonly folder: string }) {
  const t = useTranslations("cases.media")
  return renderStatus(state, { t, folder })
}

export function CaseMediaAttach({ dataset, caseName, targets }: CaseMediaAttachProps) {
  const t = useTranslations("cases.media")
  const { api } = casesRouteApi.useRouteContext()
  const router = useRouter()
  const [state, setState] = useState<AttachState>(IDLE)
  const busy = state.kind === "saving"
  if (targets.length === 0) return null

  const attach = async (target: AttachTarget, file: File): Promise<void> => {
    setState({ kind: "saving", field: target.field })
    try {
      const attached = await api.datasets.attachMedia({
        datasetId: ids.datasetId(dataset.dataset_id),
        caseName,
        location: target.location,
        fileHash: dataset.file_hash,
        file,
      })
      setState({ kind: "saved", path: ids.filePath(attached.path) })
      await router.invalidate()
    } catch (reason) {
      const failure = failureOf(reason)
      setState(failure)
      if (failure.kind === "stale") await router.invalidate()
    }
  }

  return (
    <div role="group" aria-label={t("aria")} aria-busy={busy} className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {targets.map((target) => (
          <AttachButton key={target.location} target={target} busy={busy} onFile={(chosen, file) => { void attach(chosen, file) }} />
        ))}
        {busy ? <Spinner aria-hidden="true" /> : null}
      </div>
      <div aria-live="polite">
        <AttachStatus state={state} folder={dataset.media_folder} />
      </div>
    </div>
  )
}
