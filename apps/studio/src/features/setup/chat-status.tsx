import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "@tanstack/react-router"
import { RefreshCw } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiChatBackendKind, ApiChatStatus } from "@/domain"
import { Dot, Text, TitledPanel, type Tone } from "@/components/studio"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ChatBackendSwitch, useChatBackend } from "@/features/chat-backend"
import { messageOf } from "@/lib/errors"
import { CommandLine } from "./command-line"
import { LOGIN_COMMANDS, LOGIN_STATE_TONE, type LoginState } from "./presenters"

type StatusResult = {
  readonly backend: ApiChatBackendKind
  readonly revision: number
  readonly status: ApiChatStatus | null
  readonly error: string | null
}

export type ChatStatusPanelProps = {
  readonly selectable?: boolean
  readonly title?: string
  readonly description?: string
}

function StatusLine({ tone, children }: { readonly tone: Tone; readonly children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Dot tone={tone} />
      <Text role="meta">{children}</Text>
    </div>
  )
}

function SignedIn({ status }: { readonly status: ApiChatStatus }) {
  const t = useTranslations("setup.agent")
  const backend = t(`names.${status.backend}`)
  const line = status.account === null ? t("signedIn", { backend }) : t("signedInAs", { backend, account: status.account })
  return <StatusLine tone={LOGIN_STATE_TONE.logged_in}>{line}</StatusLine>
}

function SignedOut({ status }: { readonly status: ApiChatStatus }) {
  const t = useTranslations("setup.agent")
  return (
    <>
      <StatusLine tone={LOGIN_STATE_TONE.logged_out}>{t("signedOut", { backend: t(`names.${status.backend}`) })}</StatusLine>
      <CommandLine command={LOGIN_COMMANDS[status.backend]} />
    </>
  )
}

function Unknown({ status }: { readonly status: ApiChatStatus }) {
  const t = useTranslations("setup.agent")
  return (
    <>
      <StatusLine tone={LOGIN_STATE_TONE.unknown}>{t("unknown", { backend: t(`names.${status.backend}`) })}</StatusLine>
      {status.detail === null ? null : (
        <Text as="p" role="hint" tone="neutral" className="wrap-anywhere">
          {status.detail}
        </Text>
      )}
    </>
  )
}

const STATUS_BODY: Readonly<Record<LoginState, (props: { readonly status: ApiChatStatus }) => ReactNode>> = {
  logged_in: SignedIn,
  logged_out: SignedOut,
  unknown: Unknown,
}

function StatusBody({ pending, status, error }: { readonly pending: boolean; readonly status: ApiChatStatus | null; readonly error: string | null }) {
  const t = useTranslations("setup.agent")
  if (pending) return <p role="status" className="text-sm text-muted-foreground">{t("checking")}</p>
  if (error !== null) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {t("checkFailed")} {error}
      </p>
    )
  }
  if (status === null) return null
  const Body = STATUS_BODY[status.state]
  return <Body status={status} />
}

function BackendLoad() {
  const t = useTranslations("setup.agent")
  const { backend, error, retry } = useChatBackend()
  if (backend !== null) return null
  if (error === null) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden="true" />
        {t("loading")}
      </p>
    )
  }
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("backendLoadFailed")}</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
      <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
        {t("retry")}
      </Button>
    </Alert>
  )
}

function BackendChoice() {
  const t = useTranslations("setup.agent")
  return (
    <div className="flex flex-col gap-2">
      <ChatBackendSwitch />
      <p className="text-xs text-muted-foreground">{t("selectHint")}</p>
    </div>
  )
}

export function ChatStatusPanel({ selectable = false, title, description }: ChatStatusPanelProps) {
  const t = useTranslations("setup.agent")
  const { api } = useRouter().options.context
  const { backend } = useChatBackend()
  const [result, setResult] = useState<StatusResult | null>(null)
  const [revision, setRevision] = useState(0)
  const current = result !== null && result.backend === backend && result.revision === revision ? result : null
  const pending = backend !== null && current === null

  useEffect(() => {
    if (backend === null) return
    let live = true
    void api.chat.status().then(
      (status) => {
        if (live) setResult({ backend, revision, status, error: null })
      },
      (reason: unknown) => {
        if (live) setResult({ backend, revision, status: null, error: messageOf(reason) })
      },
    )
    return () => {
      live = false
    }
  }, [api, backend, revision])

  const recheck = (
    <Button
      variant="outline"
      size="xs"
      disabled={pending || backend === null}
      aria-busy={pending}
      onClick={() => {
        setRevision((value) => value + 1)
      }}
    >
      {pending ? <Spinner aria-hidden="true" /> : <RefreshCw />}
      {t("checkAgain")}
    </Button>
  )
  return (
    <TitledPanel size="section" title={title ?? t("title")} below={[description ?? t("description")]} trailing={recheck}>
      <div className="flex flex-col gap-3 p-3">
        {selectable ? <BackendChoice /> : <BackendLoad />}
        <StatusBody pending={pending} status={current?.status ?? null} error={current?.error ?? null} />
      </div>
    </TitledPanel>
  )
}
