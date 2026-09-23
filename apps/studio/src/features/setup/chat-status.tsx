import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { RefreshCw } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiChatStatus } from "@/domain"
import { PropertyList, TitledPanel, type PropertyRow } from "@/components/studio"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ChatBackendSwitch, useChatBackend } from "@/features/chat-backend"
import type { Translator } from "@/i18n/translator"
import { LOGIN_STATE_TONE } from "./presenters"

const statusRows = (status: ApiChatStatus, t: Translator<"setup.agent">): readonly PropertyRow[] => [
  { key: t("backend"), value: t(`names.${status.backend}`) },
  { key: t("state"), value: t(`states.${status.state}`), tone: LOGIN_STATE_TONE[status.state] },
  { key: t("method"), value: status.method === null ? t("none") : t(`methods.${status.method}`) },
  { key: t("account"), value: status.account ?? t("none") },
  { key: t("detail"), value: status.detail ?? t("none") },
]

export function ChatStatusPanel({ selectable = false, title }: { readonly selectable?: boolean; readonly title?: string }) {
  const t = useTranslations("setup.agent")
  const { api } = useRouter().options.context
  const { backend, error: backendError, retry } = useChatBackend()
  const [result, setResult] = useState<{ readonly backend: ApiChatStatus["backend"]; readonly revision: number; readonly status: ApiChatStatus | null; readonly error: string | null } | null>(null)
  const [revision, setRevision] = useState(0)
  const current = result !== null && result.backend === backend && result.revision === revision ? result : null
  const pending = backend !== null && current === null
  const status = current?.status ?? null
  const error = current?.error ?? null

  useEffect(() => {
    if (backend === null) return
    let live = true
    void api.chat.status().then((current) => {
      if (live) setResult({ backend, revision, status: current, error: null })
    }).catch((reason: unknown) => {
      if (live) setResult({ backend, revision, status: null, error: String(reason) })
    })
    return () => { live = false }
  }, [api, backend, revision])

  const recheck = (
    <Button
      variant="outline"
      size="xs"
      disabled={pending || backend === null}
      aria-busy={pending}
      onClick={() => { setRevision((current) => current + 1) }}
    >
      {pending ? <Spinner aria-hidden="true" /> : <RefreshCw />}
      {t("checkAgain")}
    </Button>
  )
  return (
    <TitledPanel size="section" title={title ?? t("title")} below={[t("description")]} trailing={recheck}>
      {selectable ? (
        <div className="flex flex-col gap-2 border-b border-border px-3 py-3">
          <ChatBackendSwitch />
          <p className="text-xs text-muted-foreground">{t("selectHint")}</p>
        </div>
      ) : null}
      {!selectable && backend === null && backendError !== null ? (
        <div className="p-3">
          <Alert variant="destructive">
            <AlertTitle>{t("backendLoadFailed")}</AlertTitle>
            <AlertDescription>{backendError}</AlertDescription>
            <Button variant="outline" size="sm" className="mt-3" onClick={retry}>{t("retry")}</Button>
          </Alert>
        </div>
      ) : null}
      {!selectable && backend === null && backendError === null ? (
        <p role="status" className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{t("loading")}</p>
      ) : null}
      {error === null ? null : <p role="alert" className="px-3 py-2 text-xs text-destructive">{error}</p>}
      {pending ? (
        <p role="status" className="px-3 py-4 text-sm text-muted-foreground">{t("checking")}</p>
      ) : status === null ? null : <PropertyList rows={statusRows(status, t)} />}
    </TitledPanel>
  )
}
