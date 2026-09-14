import { useEffect, useReducer } from "react"
import type { ApiClient, ServerEvent } from "../api/index.js"

export type EventState = {
  revision: number
  synthMs: number | null
  synthError: { flow: string; file: string; message: string } | null
}

const INITIAL: EventState = { revision: 0, synthMs: null, synthError: null }

type Reducers = { [K in ServerEvent["t"]]: (state: EventState, event: Extract<ServerEvent, { t: K }>) => EventState }

const reducers: Reducers = {
  synth: (state, event) => ({ revision: state.revision + 1, synthMs: event.ms, synthError: null }),
  diagnostics: (state) => state,
  run: (state) => state,
  synth_error: (state, event) => ({
    ...state,
    synthError: { flow: event.flow, file: event.file, message: event.message },
  }),
}

const reduce = (state: EventState, event: ServerEvent): EventState => {
  const apply = reducers[event.t] as (s: EventState, e: ServerEvent) => EventState
  return apply(state, event)
}

export const useServerEvents = (client: ApiClient): EventState => {
  const [state, dispatch] = useReducer(reduce, INITIAL)
  useEffect(() => client.subscribe(dispatch), [client])
  return state
}
