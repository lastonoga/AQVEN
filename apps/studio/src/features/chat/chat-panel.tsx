import { useEffect, useState } from "react"
import { useParams } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type {
  ApiChatApprovalReply,
  ApiChatMessageRequest,
  ApiChatSession,
  ApiChatBackendKind,
  ApiChatModelCatalog,
  ApiChatSessionCreate,
  ApiChatSessionSettings,
  ApiChatStatus,
  ChatSessionId,
  FlowId,
} from "@/domain"
import { chatSessionId } from "@/data/ids"
import { Surface, Text } from "@/components/studio"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { projectRouteApi } from "@/lib/routes"
import { useChatBackend } from "@/features/chat-backend"
import { rememberedSession, rememberSession, useHandoffSignal } from "@/features/chat-handoff"
import { ChatSession } from "./chat-session"
import { DEFAULT_CHAT_CHOICE, type ChatChoice } from "./chat-choice"
import { ChatChoiceContext, type ChatChoiceControl } from "./chat-choice-context"
import { ChatThreadList } from "./chat-thread-list"
import { chatTransport, type ChatTransport } from "./chat-transport"

export type ChatApi = {
  readonly status: () => Promise<ApiChatStatus>
  readonly models: (backend: ApiChatBackendKind) => Promise<ApiChatModelCatalog>
  readonly sessions: () => Promise<readonly ApiChatSession[]>
  readonly create: (body: ApiChatSessionCreate) => Promise<ApiChatSession>
  readonly settings: (sessionId: ChatSessionId, body: ApiChatSessionSettings) => Promise<ApiChatSession>
  readonly send: (sessionId: ChatSessionId, body: ApiChatMessageRequest) => Promise<unknown>
  readonly approve: (sessionId: ChatSessionId, approvalId: string, body: ApiChatApprovalReply) => Promise<unknown>
  readonly interrupt: (sessionId: ChatSessionId) => Promise<unknown>
}

type PanelState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly backend: ApiChatSession["backend"]; readonly sessions: readonly ApiChatSession[]; readonly session: ApiChatSession | null }
  | { readonly kind: "offline"; readonly backend: ApiChatSession["backend"]; readonly detail: string }

const newSession = (flowId: FlowId | null, choice: ChatChoice): ApiChatSessionCreate => ({
  flow_id: flowId,
  model: choice.model,
  effort: choice.effort,
  permission_mode: choice.permissionMode,
  resume_session_id: null,
})

const newest = (sessions: readonly ApiChatSession[]): ApiChatSession | null =>
  [...sessions].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null

const remember = (projectRoot: string, session: ApiChatSession): void => {
  rememberSession(projectRoot, session.session_id)
}

const remembered = (projectRoot: string, sessions: readonly ApiChatSession[]): ApiChatSession | null => {
  const id = rememberedSession(projectRoot)
  return sessions.find((session) => session.session_id === id) ?? null
}

const openSession = async (api: ChatApi, projectRoot: string, backend: ApiChatSession["backend"]): Promise<PanelState> => {
  const sessions = await api.sessions()
  const matching = sessions.filter((session) => session.backend === backend)
  return { kind: "ready", backend, sessions, session: remembered(projectRoot, matching) ?? newest(matching) }
}

function ChatNotice({ message }: { readonly message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <Text role="hint" tone="neutral" as="p" className="text-center">
        {message}
      </Text>
    </div>
  )
}

function ChatBody({ state, transport, onRetry }: { readonly state: PanelState; readonly transport: ChatTransport; readonly onRetry: () => void }) {
  const t = useTranslations("chat")
  const common = useTranslations("common")
  if (state.kind === "loading") return (
    <div role="status" className="flex flex-1 items-center justify-center gap-2 px-6 text-sm text-muted-foreground">
      <Spinner aria-hidden="true" />{t("session.connecting")}
    </div>
  )
  if (state.kind === "offline") return (
    <div className="flex flex-1 items-center px-4">
      <Alert variant="destructive">
        <AlertTitle>{t("session.loadFailed", { detail: state.detail })}</AlertTitle>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>{common("retry")}</Button>
      </Alert>
    </div>
  )
  if (state.session === null) return <ChatNotice message={t("session.noThread")} />
  return <ChatSession key={state.session.session_id} session={state.session} transport={transport} />
}

export function ChatPanel() {
  const common = useTranslations("common")
  const chat = useTranslations("chat.session")
  const { api } = projectRouteApi.useRouteContext()
  const { flowId } = useParams({ strict: false })
  const { project } = projectRouteApi.useLoaderData()
  const handoff = useHandoffSignal()
  const { backend, pending, error: backendError, select, retry } = useChatBackend()
  const [transport] = useState<ChatTransport>(() => chatTransport(api.chat))
  const [state, setState] = useState<PanelState>({ kind: "loading" })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [choice, setChoice] = useState<ChatChoice>(DEFAULT_CHAT_CHOICE)

  useEffect(() => {
    let live = true
    if (backend === null) return
    void openSession(api.chat, project.root, backend).catch((error: unknown): PanelState => ({ kind: "offline", backend, detail: String(error) })).then((opened) => {
      if (live) setState(opened)
    })
    return () => {
      live = false
    }
  }, [api, backend, project.root, revision, handoff?.seq])

  const selectSession = async (session: ApiChatSession): Promise<void> => {
    if (session.backend !== backend && !(await select(session.backend))) return
    remember(project.root, session)
    setState((current) => current.kind === "ready" ? { ...current, backend: session.backend, session } : current)
    setCreateError(null)
  }

  const createThread = async (): Promise<void> => {
    if (creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const status = await api.chat.status()
      if (status.backend !== backend) {
        setCreateError(chat("selectedAgentChanged"))
        retry()
        return
      }
      if (status.state !== "logged_in") {
        setCreateError(status.detail ?? status.state)
        return
      }
      const session = await api.chat.create(newSession(flowId ?? null, choice))
      if (session.backend !== backend) {
        setCreateError(chat("selectedAgentChanged"))
        retry()
        return
      }
      remember(project.root, session)
      setState((current) => current.kind === "ready"
        ? { ...current, backend: session.backend, sessions: [session, ...current.sessions], session }
        : { kind: "ready", backend: session.backend, sessions: [session], session })
    } catch (error) {
      setCreateError(String(error))
    } finally {
      setCreating(false)
    }
  }

  const applySettings = async (body: ApiChatSessionSettings): Promise<void> => {
    const open = state.kind === "ready" ? state.session : null
    if (open === null) return
    try {
      const updated = await api.chat.settings(chatSessionId(open.session_id), body)
      setState((current) => current.kind === "ready"
        ? {
            ...current,
            session: updated,
            sessions: current.sessions.map((item) => (item.session_id === updated.session_id ? updated : item)),
          }
        : current)
    } catch (error) {
      setCreateError(String(error))
    }
  }

  const visibleState: PanelState = state.kind === "loading" || backend === null || state.backend === backend ? state : { kind: "loading" }
  const control: ChatChoiceControl | null = backend === null
    ? null
    : {
        backend,
        session: visibleState.kind === "ready" ? visibleState.session : null,
        choice,
        disabled: creating || pending !== null,
        onChange: setChoice,
        loadModels: api.chat.models,
        applyToSession: (body) => { void applySettings(body) },
      }

  return (
    <ChatChoiceContext value={control}>
    <Surface variant="plain" className="dark flex h-full min-h-0 min-w-0 flex-col overflow-hidden pt-2">
      {backend === null && backendError !== null ? (
        <div className="flex flex-1 items-center px-4">
          <Alert variant="destructive">
            <AlertTitle>{chat("backendLoadFailed")}</AlertTitle>
            <AlertDescription>{backendError}</AlertDescription>
            <Button variant="outline" size="sm" className="mt-3" onClick={retry}>{common("retry")}</Button>
          </Alert>
        </div>
      ) : (
        <>
          {visibleState.kind === "ready" ? (
            <ChatThreadList
              sessions={visibleState.sessions}
              activeId={visibleState.session?.session_id ?? null}
              creating={creating || pending !== null}
              onSelect={(session) => { void selectSession(session) }}
              onCreate={() => { void createThread() }}
            />
          ) : null}
          {backendError === null || backend === null ? null : <p role="alert" className="px-3.5 py-2 text-xs text-destructive">{backendError}</p>}
          {createError === null ? null : <p role="alert" className="px-3.5 py-2 text-xs text-destructive">{createError}</p>}
          <ChatBody state={visibleState} transport={transport} onRetry={() => { setState({ kind: "loading" }); setRevision((current) => current + 1) }} />
        </>
      )}
    </Surface>
    </ChatChoiceContext>
  )
}
