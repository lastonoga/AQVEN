import { useContext, useState } from "react"
import { useParams, useRouter } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ApiChatBackendKind, ApiChatSession, ChatSessionId, FlowId } from "@/domain"
import * as ids from "@/data/ids"
import { useChatBackend } from "@/features/chat-backend"
import { projectRouteApi } from "@/lib/routes"
import type { RouterContext } from "@/router"
import { messageOf } from "@/lib/errors"
import { ChatHandoffContext } from "./handoff-context"
import { rememberedSession, rememberSession } from "./session-memory"

export type HandoffState =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "sent"; readonly session: ChatSessionId }
  | { readonly kind: "failed"; readonly message: string }

export type ChatHandoff = {
  readonly state: HandoffState
  readonly available: boolean
  readonly send: (prompt: string) => void
}

type ChatPort = RouterContext["api"]["chat"]

const IDLE: HandoffState = { kind: "idle" }

const newest = (sessions: readonly ApiChatSession[]): ApiChatSession | null =>
  [...sessions].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null

const targetSession = async (chat: ChatPort, root: string, backend: ApiChatBackendKind, flowId: FlowId | null): Promise<ApiChatSession> => {
  const sessions = (await chat.sessions()).filter((session) => session.backend === backend)
  const remembered = rememberedSession(root)
  const reused = sessions.find((session) => session.session_id === remembered) ?? newest(sessions)
  if (reused !== null) return reused
  return chat.create({ flow_id: flowId, model: null, effort: null, permission_mode: null, resume_session_id: null })
}

export function useChatHandoff(): ChatHandoff {
  const t = useTranslations("chat.session")
  const { api } = useRouter().options.context
  const { project } = projectRouteApi.useLoaderData()
  const { flowId } = useParams({ strict: false })
  const { backend, retry } = useChatBackend()
  const { announce } = useContext(ChatHandoffContext)
  const [state, setState] = useState<HandoffState>(IDLE)

  const deliver = async (selected: ApiChatBackendKind, prompt: string): Promise<ChatSessionId> => {
    const status = await api.chat.status()
    if (status.backend !== selected) {
      retry()
      throw new Error(t("selectedAgentChanged"))
    }
    if (status.state !== "logged_in") throw new Error(t("loggedOut", { detail: status.detail ?? status.state }))
    const session = await targetSession(api.chat, project.root, selected, flowId ?? null)
    const sessionId = ids.chatSessionId(session.session_id)
    await api.chat.send(sessionId, { text: prompt, client_op_id: ids.clientOpId() })
    rememberSession(project.root, session.session_id)
    return sessionId
  }

  const send = (prompt: string): void => {
    if (backend === null || state.kind === "sending") return
    setState({ kind: "sending" })
    void deliver(backend, prompt).then(
      (session) => {
        setState({ kind: "sent", session })
        announce(session)
      },
      (reason: unknown) => {
        setState({ kind: "failed", message: messageOf(reason) })
      },
    )
  }

  return { state, available: backend !== null, send }
}
