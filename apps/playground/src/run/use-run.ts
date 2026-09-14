import { useEffect, useReducer, useRef } from "react"
import { foldRun } from "./events.js"
import type { ApiClient, Render, Run, RunDetail, RunEvent, ServerEvent } from "../api/index.js"
import type { RunView } from "./events.js"

type State = {
  run: Run | null
  events: Record<number, RunEvent>
  renders: Record<string, Render>
  error: string | null
  loading: boolean
}

type Action =
  | { t: "reset" }
  | { t: "loaded"; run: Run; events: RunEvent[]; renders: Record<string, Render> }
  | { t: "failed"; message: string }
  | { t: "event"; event: RunEvent }

const INITIAL: State = { run: null, events: {}, renders: {}, error: null, loading: true }

const indexed = (events: RunEvent[]): Record<number, RunEvent> =>
  Object.fromEntries(events.map((event) => [event.seq, event]))

const reducers: { [K in Action["t"]]: (state: State, action: Extract<Action, { t: K }>) => State } = {
  reset: () => INITIAL,
  loaded: (state, action) => ({
    run: action.run,
    events: { ...indexed(action.events), ...state.events },
    renders: action.renders,
    error: null,
    loading: false,
  }),
  failed: (state, action) => ({ ...state, error: action.message, loading: false }),
  event: (state, action) => ({ ...state, events: { ...state.events, [action.event.seq]: action.event } }),
}

const reduce = (state: State, action: Action): State => {
  const apply = reducers[action.t] as (s: State, a: Action) => State
  return apply(state, action)
}

const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

const loadedAction = (detail: RunDetail): Action => ({
  t: "loaded",
  run: detail.run,
  events: detail.events,
  renders: detail.renders ?? {},
})

export type RunState = {
  run: Run | null
  view: RunView
  renders: Record<string, Render>
  error: string | null
  loading: boolean
}

const TERMINAL = new Set(["run_finish"])

export const useRun = (client: ApiClient, runId: string | null): RunState => {
  const [state, dispatch] = useReducer(reduce, INITIAL)
  const rendersLoaded = useRef(false)

  useEffect(() => {
    rendersLoaded.current = false
    dispatch({ t: "reset" })
    if (runId === null) return
    let alive = true
    client
      .getRun(runId)
      .then((detail) => alive && dispatch(loadedAction(detail)))
      .catch((cause: unknown) => alive && dispatch({ t: "failed", message: messageOf(cause) }))
    return () => {
      alive = false
    }
  }, [client, runId])

  useEffect(() => {
    if (runId === null) return
    const onEvent = (event: ServerEvent): void => {
      if (event.t !== "run") return
      if (event.runId !== runId) return
      dispatch({ t: "event", event: event.event })
    }
    return client.subscribe(onEvent)
  }, [client, runId])

  const events = Object.values(state.events)
  const finished = events.some((event) => TERMINAL.has(event.type))

  useEffect(() => {
    if (runId === null) return
    if (!finished) return
    if (rendersLoaded.current) return
    rendersLoaded.current = true
    let alive = true
    client
      .getRun(runId)
      .then((detail) => alive && dispatch(loadedAction(detail)))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [client, runId, finished])

  return {
    run: state.run,
    view: foldRun(events, state.run?.status ?? "queued"),
    renders: state.renders,
    error: state.error,
    loading: state.loading,
  }
}
