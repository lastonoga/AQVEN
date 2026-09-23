import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Plus, Save, Sparkles, Trash2 } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiDatasetCase, ApiDatasetCreateRequest, ApiDatasetFile, FlowId } from "@/domain"
import { Page, Text, TitledPanel } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import * as ids from "@/data/ids"
import { useChatBackend } from "@/features/chat-backend"
import { datasetsRouteApi, ROUTE_PATH } from "@/lib/routes"

type CaseDraft = {
  readonly id: number
  readonly name: string
  readonly inputText: string
  readonly contextText: string
  readonly nodeOutputsText: string
}

const INPUT_CLASS = "mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
const CODE_CLASS = `${INPUT_CLASS} min-h-32 resize-y font-mono text-xs leading-relaxed`
const NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const jsonRecord = (text: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

const initialCases = (file: ApiDatasetFile): readonly CaseDraft[] => file.cases.map((item, index) => ({
  id: index + 1,
  name: item.name,
  inputText: JSON.stringify(item.inputs, null, 2),
  contextText: JSON.stringify(item.context ?? {}, null, 2),
  nodeOutputsText: JSON.stringify(item.node_outputs ?? {}, null, 2),
}))

type CreateDatasetProps = { readonly flowId: FlowId; readonly draft: ApiDatasetFile }

export function CreateDataset({ flowId, draft }: CreateDatasetProps) {
  const { api } = datasetsRouteApi.useRouteContext()
  const params = datasetsRouteApi.useParams()
  const navigate = useNavigate()
  const t = useTranslations("datasets")
  const agent = useTranslations("setup.agent")
  const { backend, retry } = useChatBackend()
  const generationTimeout = t("generationTimeout")
  const [datasetId, setDatasetId] = useState("")
  const [cases, setCases] = useState<readonly CaseDraft[]>(() => initialCases(draft))
  const [pending, setPending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [brief, setBrief] = useState("")
  const [count, setCount] = useState(3)
  const [generating, setGenerating] = useState(false)
  const [generatedId, setGeneratedId] = useState<string | null>(null)

  useEffect(() => {
    if (generatedId === null) return
    let active = true
    const deadline = Date.now() + 300_000
    const check = async (): Promise<void> => {
      if (Date.now() > deadline) {
        window.clearInterval(interval)
        if (active) {
          setGeneratedId(null)
          setGenerateError(generationTimeout)
        }
        return
      }
      try {
        const datasets = await api.datasets.list()
        if (!active || !datasets.some((item) => item.dataset_id === generatedId)) return
        window.clearInterval(interval)
        void navigate({ to: ROUTE_PATH.datasets, params, search: { dataset: generatedId } })
      } catch {
        return
      }
    }
    const interval = window.setInterval(() => { void check() }, 2_000)
    void check()
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [api, generatedId, generationTimeout, navigate, params])

  const update = (id: number, values: Partial<CaseDraft>): void => {
    setCases((current) => current.map((item) => item.id === id ? { ...item, ...values } : item))
  }

  const add = (): void => {
    const id = Math.max(0, ...cases.map((item) => item.id)) + 1
    const template = initialCases(draft)[0]
    if (template === undefined) return
    setCases((current) => [...current, { ...template, id, name: `case_${String(id)}` }])
  }

  const save = async (): Promise<void> => {
    const name = datasetId.trim()
    if (!NAME_PATTERN.test(name)) {
      setSaveError(t("invalidId"))
      return
    }
    const names = cases.map((item) => item.name.trim())
    if (names.some((item) => item.length === 0) || new Set(names).size !== names.length) {
      setSaveError(t("invalidName"))
      return
    }
    const values = cases.map((item) => ({ item, input: jsonRecord(item.inputText), context: jsonRecord(item.contextText), nodeOutputs: jsonRecord(item.nodeOutputsText) }))
    if (values.some(({ input, context, nodeOutputs }) => input === null || context === null || nodeOutputs === null)) {
      setSaveError(t("invalidJson"))
      return
    }
    const parsed: ApiDatasetCase[] = values.flatMap(({ item, input, context, nodeOutputs }) => {
      if (input === null || context === null || nodeOutputs === null) return []
      return [{
        name: item.name.trim(),
        inputs: input,
        context,
        node_outputs: Object.keys(nodeOutputs).length > 0 ? nodeOutputs : null,
        metadata: null,
      }]
    })
    const request: ApiDatasetCreateRequest = { dataset_id: name, flow_id: flowId, cases: parsed }
    setPending(true)
    setSaveError(null)
    try {
      const created = await api.datasets.create(request)
      void navigate({ to: ROUTE_PATH.datasets, params, search: { dataset: created.dataset_id } })
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setPending(false)
    }
  }

  const generate = async (): Promise<void> => {
    if (backend === null) return
    const name = datasetId.trim()
    if (!NAME_PATTERN.test(name)) {
      setGenerateError(t("invalidId"))
      return
    }
    if (brief.trim().length === 0) {
      setGenerateError(t("scenarioRequired"))
      return
    }
    setGenerating(true)
    setGenerateError(null)
    setGeneratedId(null)
    try {
      const datasets = await api.datasets.list()
      if (datasets.some((item) => item.dataset_id === name)) {
        setGenerateError(t("alreadyExists"))
        return
      }
      const status = await api.chat.status()
      if (status.backend !== backend) {
        setGenerateError(t("selectedAgentChanged"))
        retry()
        return
      }
      if (status.state !== "logged_in") {
        setGenerateError(status.detail ?? t("agentSignedOut", { agent: agent(`names.${backend}`) }))
        return
      }
      const sessions = await api.chat.sessions()
      const session = sessions.filter((item) => item.backend === backend).sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0]
        ?? await api.chat.create({ flow_id: flowId, model: null, permission_mode: "default", resume_session_id: null })
      if (session.backend !== backend) {
        setGenerateError(t("selectedAgentChanged"))
        retry()
        return
      }
      const prompt = [
        `Create the project dataset file datasets/${name}.yaml for flow ${flowId}.`,
        `Generate ${String(count)} distinct, realistic cases for these scenarios: ${brief.trim()}`,
        "Use apiVersion aqven/v1, kind Dataset, and the flow field. For full-flow runs, include a complete flow input and required context. For middle-stage runs, inputs/context may contain only the needed values; add node_outputs fixtures for referenced earlier top-level nodes.",
        "Read the flow, node references, and related types. Check that each intended stage range has its required input fields and prior node outputs, then run aqven check. Keep changes limited to the dataset file. Report the created cases and any validation problems in this chat.",
      ].join("\n")
      await api.chat.send(ids.chatSessionId(session.session_id), { text: prompt, client_op_id: ids.clientOpId() })
      setGeneratedId(name)
    } catch (reason) {
      setGenerateError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Page width="lg">
      <TitledPanel size="section" title={t("aiTitle")} description={t("aiSubtitle")} surface="raised">
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_150px]">
          <label className="block lg:col-span-2">
            <Text as="span" role="label">{t("datasetId")}</Text>
            <input className={INPUT_CLASS} value={datasetId} onChange={(event) => { setDatasetId(event.target.value) }} autoComplete="off" placeholder="support_cases" />
          </label>
          <label className="block">
            <Text as="span" role="label">{t("scenarioBrief")}</Text>
            <textarea className={CODE_CLASS} rows={4} value={brief} placeholder={t("scenarioPlaceholder")} onChange={(event) => { setBrief(event.target.value) }} />
          </label>
          <label className="block">
            <Text as="span" role="label">{t("caseCount")}</Text>
            <input className={INPUT_CLASS} type="number" min={1} max={20} value={count} onChange={(event) => { setCount(Math.min(20, Math.max(1, Number(event.target.value) || 1))) }} />
          </label>
          <div className="lg:col-span-2">
            <Button type="button" disabled={generating || generatedId !== null || backend === null} aria-busy={generating} onClick={() => { void generate() }}>
              {generating ? <Spinner aria-hidden="true" /> : <Sparkles aria-hidden className="size-3.5" />}
              {generating ? t("generating") : t("generate")}
            </Button>
            {generatedId !== null ? <div role="status" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{t("generationSent")}</div> : null}
            {generateError === null ? null : <p role="alert" className="mt-2 text-sm text-destructive">{generateError}</p>}
          </div>
        </div>
      </TitledPanel>
      <TitledPanel size="section" title={t("manualTitle")} description={t("createSubtitle")} className="mt-7" surface="raised">
        <div className="space-y-6 p-5">
          <div className="space-y-4">
            {cases.map((item, index) => (
              <section key={item.id} className="rounded-lg border border-border bg-background-subtle p-4">
                <div className="mb-4 flex items-center gap-3">
                  <Text role="label" as="h3">{t("caseTitle")} {index + 1}</Text>
                  <div className="flex-1" />
                  {cases.length > 1 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setCases((current) => current.filter((row) => row.id !== item.id)) }}>
                      <Trash2 aria-hidden className="size-3.5" />{t("removeCase")}
                    </Button>
                  ) : null}
                </div>
                <label className="block">
                  <Text as="span" role="label">{t("caseName")}</Text>
                  <input className={INPUT_CLASS} value={item.name} onChange={(event) => { update(item.id, { name: event.target.value }) }} />
                </label>
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
                  <label className="block min-w-0">
                    <Text as="span" role="label">{t("caseInputEdit")}</Text>
                    <textarea className={CODE_CLASS} rows={12} spellCheck={false} value={item.inputText} onChange={(event) => { update(item.id, { inputText: event.target.value }) }} />
                  </label>
                  <label className="block min-w-0">
                    <Text as="span" role="label">{t("contextEdit")}</Text>
                    <textarea className={CODE_CLASS} rows={12} spellCheck={false} value={item.contextText} onChange={(event) => { update(item.id, { contextText: event.target.value }) }} />
                  </label>
                </div>
                <label className="mt-4 block min-w-0">
                  <Text as="span" role="label">{t("nodeOutputsEdit")}</Text>
                  <textarea className={CODE_CLASS} rows={8} spellCheck={false} value={item.nodeOutputsText} onChange={(event) => { update(item.id, { nodeOutputsText: event.target.value }) }} />
                </label>
              </section>
            ))}
          </div>
          <Button type="button" variant="outline" onClick={add}><Plus aria-hidden className="size-3.5" />{t("addCase")}</Button>
          {saveError === null ? null : <Text as="p" role="hint" tone="destructive"><span role="alert">{saveError}</span></Text>}
          <div className="flex gap-2 border-t border-border pt-4">
            <Button type="button" disabled={pending || generating} aria-busy={pending} onClick={() => { void save() }}>
              {pending ? <Spinner aria-hidden="true" /> : <Save aria-hidden className="size-3.5" />}
              {pending ? t("saving") : t("save")}
            </Button>
            <Button type="button" variant="ghost" disabled={pending || generating} onClick={() => { void navigate({ to: ROUTE_PATH.datasets, params, search: {} }) }}>{t("cancel")}</Button>
          </div>
        </div>
      </TitledPanel>
    </Page>
  )
}
