import { createJiti } from "jiti"
import type { Jiti } from "jiti"

export type LoadFailure = {
  code: string
  message: string
  file: string
  line?: number
  column?: number
}

const LOCATION = /^(?<file>.*?):(?<line>\d+):(?<column>\d+)$/
const PARSE_MARKERS = ["ParseError", "SyntaxError", "TransformError"]

let shared: Jiti | undefined

function loader(): Jiti {
  shared ??= createJiti(import.meta.url, { moduleCache: false, fsCache: false })
  return shared
}

export function loadFlowModule(file: string): Promise<unknown> {
  return loader().import(file)
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function locate(message: string): { file: string; line: number; column: number } | null {
  for (const raw of message.split("\n")) {
    const match = LOCATION.exec(raw.trim())
    if (!match?.groups) continue
    return {
      file: match.groups["file"] ?? "",
      line: Number(match.groups["line"]),
      column: Number(match.groups["column"]),
    }
  }
  return null
}

function codeOf(message: string): string {
  const parse = PARSE_MARKERS.some((marker) => message.includes(marker))
  if (parse) return "WF_FLOW_COMPILE_ERROR"
  if (message.includes("Cannot find")) return "WF_FLOW_IMPORT_FAILED"
  return "WF_LOAD_FAILED"
}

function headline(message: string): string {
  const first = message.split("\n").find((raw) => raw.trim().length > 0)
  return (first ?? message).trim()
}

export function describeLoadFailure(file: string, error: unknown): LoadFailure {
  const message = messageOf(error)
  const at = locate(message)
  if (!at) return { code: codeOf(message), message: `${file}: ${headline(message)}`, file }
  return {
    code: codeOf(message),
    message: `${at.file}:${at.line}:${at.column} ${headline(message)}`,
    file: at.file || file,
    line: at.line,
    column: at.column,
  }
}
