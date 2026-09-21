import { useState } from "react"
import { API_BASE, type ApiProblem } from "@/api/client"
import { MediaOutput } from "@/components/studio/media-output"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { fieldIsVisible, getPath, initialManualInput, isRecord, nullableSchema, requiredAtPath, schemaProperties, schemaType, schemaVariants, setPath } from "./manual-input-model"

type Props = {
  readonly schema: unknown
  readonly paths: readonly string[]
  readonly value: Record<string, unknown>
  readonly onChange: (next: Record<string, unknown>) => void
  readonly disabled: boolean
  readonly onUploadChange: (path: string, busy: boolean) => void
  readonly problems: readonly ApiProblem[]
}

const titleOf = (name: string): string => name.replaceAll("_", " ")
const className = "mt-1.5 h-9 rounded-md border border-input bg-background px-3 text-sm"

const mediaTypeOf = (value: unknown): string | null =>
  isRecord(value) && typeof value["$media"] === "string" ? value["$media"] : null

const isMediaSchema = (schema: unknown): boolean => "$media" in schemaProperties(schema)

type RowProps = {
  readonly root: unknown
  readonly path: string
  readonly schema: unknown
  readonly paths: readonly string[]
  readonly value: Record<string, unknown>
  readonly onChange: Props["onChange"]
  readonly disabled: boolean
  readonly onUploadChange: Props["onUploadChange"]
  readonly problems: Props["problems"]
}

function MediaField({ id, path, value, onChange, disabled, onUploadChange }: Pick<RowProps, "path" | "value" | "onChange" | "disabled" | "onUploadChange"> & { readonly id: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const item = getPath(value, path)
  const mediaType = mediaTypeOf(item)
  const accept = path.includes("voice") || path.includes("audio") ? "audio/*" : path.includes("video") ? "video/*" : path.includes("image") || path.includes("photo") ? "image/*" : undefined

  const upload = async (file: File): Promise<void> => {
    setBusy(true)
    onUploadChange(path, true)
    setError(null)
    try {
      const body = new FormData()
      body.set("file", file)
      const response = await fetch(`${API_BASE}/blobs`, { method: "POST", body, credentials: "same-origin" })
      if (!response.ok) throw new Error(`Upload failed (${String(response.status)})`)
      const uploaded: unknown = await response.json()
      if (!isRecord(uploaded) || typeof uploaded["blob_id"] !== "string" || typeof uploaded["media_type"] !== "string" || typeof uploaded["size_bytes"] !== "number") throw new Error("Invalid upload response")
      onChange(setPath(value, path, { $media: uploaded["media_type"], blob_id: uploaded["blob_id"], size_bytes: uploaded["size_bytes"], name: file.name }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
      onUploadChange(path, false)
    }
  }

  return <div className="mt-2 space-y-2">
    {mediaType !== null && isRecord(item) ? <MediaOutput compact media={{ slot: path, mediaType, blobId: String(item["blob_id"]), bytes: Number(item["size_bytes"]), name: typeof item["name"] === "string" ? item["name"] : null }} /> : null}
    <div className="flex flex-wrap items-center gap-2">
      <Input id={id} type="file" aria-label={`Upload ${titleOf(path.split(".").at(-1) ?? path)}`} accept={accept} disabled={disabled || busy} className="max-w-md" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file) }} />
      {mediaType === null ? null : <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => { onChange(setPath(value, path, null)) }}>Remove</Button>}
    </div>
    {busy ? <p className="text-xs text-muted-foreground">Uploading…</p> : null}
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
  </div>
}

function StringListField({ id, value, disabled, onChange }: { readonly id: string; readonly value: unknown; readonly disabled: boolean; readonly onChange: (next: unknown) => void }) {
  const [raw, setRaw] = useState(() => Array.isArray(value) ? value.join(", ") : "")
  return <Input id={id} className="mt-1.5" placeholder="Separate values with commas" disabled={disabled} value={raw} onChange={(event) => { const next = event.target.value; setRaw(next); onChange(next.split(",").map((part) => part.trim()).filter(Boolean)) }} />
}

function JsonListField({ id, value, disabled, onChange }: { readonly id: string; readonly value: unknown; readonly disabled: boolean; readonly onChange: (next: unknown) => void }) {
  const [raw, setRaw] = useState(() => JSON.stringify(value ?? [], null, 2))
  const [invalid, setInvalid] = useState(false)
  return <><Textarea id={id} className="mt-1.5 min-h-20 font-mono" disabled={disabled} value={raw} onChange={(event) => {
    setRaw(event.target.value)
    try {
      const next: unknown = JSON.parse(event.target.value)
      if (!Array.isArray(next)) throw new Error("Expected an array")
      setInvalid(false)
      onChange(next)
    } catch {
      setInvalid(true)
      onChange(null)
    }
  }} />{invalid ? <p role="alert" className="mt-1 text-xs text-destructive">Enter a valid JSON array.</p> : null}</>
}

function SchemaRow({ root, path, schema, paths, value, onChange, disabled, onUploadChange, problems }: RowProps) {
  if (!fieldIsVisible(path, paths)) return null
  const current = getPath(value, path)
  const variants = schemaVariants(schema).filter((variant) => variant["type"] !== "null")
  const choices = variants.flatMap((variant, index) => {
    const kind = schemaProperties(variant)["kind"]
    return isRecord(kind) && typeof kind["const"] === "string" ? [{ index, kind: kind["const"] }] : []
  })
  const selectedKind = isRecord(current) && typeof current["kind"] === "string" ? current["kind"] : choices[0]?.kind ?? ""
  const selected = choices.length > 1 ? variants[choices.find((choice) => choice.kind === (isRecord(current) ? current["kind"] : undefined))?.index ?? 0] : schemaType(schema)
  const typed = selected ?? schemaType(schema)
  const properties = schemaProperties(typed)
  const required = requiredAtPath(root, path) && !nullableSchema(schema)
  const label = titleOf(path.split(".").at(-1) ?? path)
  const id = `manual-input-${path.replaceAll(".", "-")}`
  const issue = problems.find((problem) => problem.path[0] === "input" && problem.path.slice(1).join(".") === path)

  if (isMediaSchema(schema)) return <div className="space-y-1 py-2"><Label htmlFor={id} className="text-sm font-medium">{label}{required ? " *" : ""}</Label><MediaField id={id} path={path} value={value} onChange={onChange} disabled={disabled} onUploadChange={onUploadChange} /></div>

  if (choices.length > 1) return <fieldset className="mt-4 min-w-0 rounded-md border border-border p-4">
    <legend className="px-1 text-sm font-medium">{label}</legend>
    <Label htmlFor={`${id}-kind`} className="text-xs text-muted-foreground">Kind</Label>
    <select id={`${id}-kind`} className={`${className} block w-full max-w-xs`} disabled={disabled} value={selectedKind} onChange={(event) => { onChange(setPath(value, path, { kind: event.target.value })) }}>
      {choices.map((choice) => <option key={choice.kind} value={choice.kind}>{titleOf(choice.kind)}</option>)}
    </select>
    <div className="mt-3 grid gap-x-4 gap-y-3 md:grid-cols-2">{Object.entries(properties).filter(([key]) => key !== "kind").map(([key, child]) => <SchemaRow key={key} root={root} path={`${path}.${key}`} schema={child} paths={paths} value={value} onChange={onChange} disabled={disabled} onUploadChange={onUploadChange} problems={problems} />)}</div>
  </fieldset>

  if (typed?.["type"] === "object") return <fieldset className="mt-4 min-w-0 rounded-md border border-border p-4">
    <legend className="px-1 text-sm font-medium">{label}{required ? " *" : ""}</legend>
    {nullableSchema(schema) ? <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => { onChange(setPath(value, path, current === null ? initialManualInput(typed) : null)) }}>{current === null ? `Add ${label}` : `Remove ${label}`}</Button> : null}
    {current === null ? null : <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">{Object.entries(properties).map(([key, child]) => <SchemaRow key={key} root={root} path={`${path}.${key}`} schema={child} paths={paths} value={value} onChange={onChange} disabled={disabled} onUploadChange={onUploadChange} problems={problems} />)}</div>}
  </fieldset>

  const options = Array.isArray(typed?.["enum"]) ? typed["enum"].filter((item): item is string => typeof item === "string") : []
  const update = (next: unknown): void => { onChange(setPath(value, path, next)) }
  return <div className="min-w-0 py-1">
    <Label htmlFor={id} className="text-sm font-medium">{label}{required ? " *" : ""}</Label>
    {typeof typed?.["description"] === "string" ? <p className="text-xs text-muted-foreground">{typed["description"]}</p> : null}
    {options.length > 0 ? <select id={id} className={`${className} block w-full`} disabled={disabled} value={typeof current === "string" ? current : ""} onChange={(event) => { update(event.target.value) }}><option value="">Select…</option>{options.map((option) => <option key={option} value={option}>{titleOf(option)}</option>)}</select>
      : typed?.["type"] === "boolean" ? <select id={id} className={`${className} block w-full`} disabled={disabled} value={current === true ? "true" : "false"} onChange={(event) => { update(event.target.value === "true") }}><option value="false">No</option><option value="true">Yes</option></select>
        : typed?.["type"] === "array" && isRecord(typed["items"]) && typed["items"]["type"] === "string" ? <StringListField id={id} value={current} disabled={disabled} onChange={update} />
          : typed?.["type"] === "array" ? <JsonListField id={id} value={current} disabled={disabled} onChange={update} />
          : <Input id={id} type={typed?.["type"] === "integer" || typed?.["type"] === "number" ? "number" : "text"} className="mt-1.5" disabled={disabled} value={typeof current === "string" || typeof current === "number" ? String(current) : ""} onChange={(event) => { const raw = event.target.value; update(typed?.["type"] === "integer" || typed?.["type"] === "number" ? raw === "" ? null : Number(raw) : raw === "" && nullableSchema(schema) ? null : raw) }} />}
    {issue ? <p role="alert" className="mt-1 text-xs text-destructive">{issue.message}</p> : null}
  </div>
}

export function ManualInputEditor({ schema, paths, value, onChange, disabled, onUploadChange, problems }: Props) {
  const properties = schemaProperties(schema)
  const visible = Object.entries(properties).filter(([name]) => fieldIsVisible(name, paths))
  if (visible.length === 0) return <p className="text-sm text-muted-foreground">The selected nodes do not read flow input.</p>
  return <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">{visible.map(([name, member]) => <SchemaRow key={name} root={schema} path={name} schema={member} paths={paths} value={value} onChange={onChange} disabled={disabled} onUploadChange={onUploadChange} problems={problems} />)}</div>
}
