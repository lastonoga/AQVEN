import type { Severity, WriteDiagnostic } from "@/domain"
import { ApiError, type ApiProblem } from "@/api/client"
import { messageOf } from "@/lib/errors"

export const WRITE_FAILURE_KINDS = ["stale", "exists", "invalid", "failed"] as const
export type WriteFailureKind = (typeof WRITE_FAILURE_KINDS)[number]

export type WriteFailure = { readonly kind: WriteFailureKind; readonly message: string; readonly problems: readonly ApiProblem[] }

export type ReportRow = {
  readonly key: string
  readonly severity: Severity
  readonly code: string
  readonly message: string
  readonly where: string
  readonly hint: string | null
}

const FAILURE_BY_CODE: Readonly<Partial<Record<string, WriteFailureKind>>> = {
  STALE_FILE: "stale",
  FILE_VANISHED: "stale",
  FILE_EXISTS: "exists",
  REQUEST_INVALID: "invalid",
  INPUT_INVALID: "invalid",
  BLOCKING_PROBLEMS: "invalid",
}

const PATH_JOIN = "."

const REQUEST_BODY = "body"

const kindOf = (error: ApiError): WriteFailureKind => FAILURE_BY_CODE[error.code] ?? "failed"

export const writeFailureOf = (reason: unknown): WriteFailure => {
  if (!(reason instanceof ApiError)) return { kind: "failed", message: messageOf(reason), problems: [] }
  return { kind: kindOf(reason), message: reason.message, problems: reason.problems }
}

const lineOf = (diagnostic: WriteDiagnostic): string => (diagnostic.line === null ? "" : `:${String(diagnostic.line)}`)

const pathOf = (path: readonly (string | number)[]): string => path.map(String).join(PATH_JOIN)

const bodyPath = (path: readonly (string | number)[]): readonly (string | number)[] => (path[0] === REQUEST_BODY ? path.slice(1) : path)

const WHERE_JOIN = " · "

const FILE_STEP = "/"

const placeOf = (file: string, path: readonly (string | number)[]): string => [file, pathOf(path)].filter((part) => part.length > 0).join(WHERE_JOIN)

const problemPlace = (path: readonly (string | number)[]): string => {
  const [first, ...rest] = bodyPath(path)
  if (typeof first === "string" && first.includes(FILE_STEP)) return placeOf(first, rest)
  return pathOf(bodyPath(path))
}

export const diagnosticRows = (diagnostics: readonly WriteDiagnostic[]): readonly ReportRow[] =>
  diagnostics.map((diagnostic, index) => ({
    key: `${String(index)}:${diagnostic.code}`,
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    where: placeOf(`${diagnostic.file}${lineOf(diagnostic)}`, diagnostic.path),
    hint: diagnostic.hint,
  }))

export const problemRows = (problems: readonly ApiProblem[]): readonly ReportRow[] =>
  problems.map((problem, index) => ({
    key: `${String(index)}:${problem.code}`,
    severity: "error",
    code: problem.code,
    message: problem.message,
    where: problemPlace(problem.path),
    hint: null,
  }))

export const hasErrors = (diagnostics: readonly WriteDiagnostic[]): boolean => diagnostics.some((diagnostic) => diagnostic.severity === "error")
