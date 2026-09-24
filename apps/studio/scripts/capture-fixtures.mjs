import { readFile, writeFile } from "node:fs/promises"
import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const record = process.env["AQVEN_SERVER_JSON"] ?? resolve(process.cwd(), ".aqven/server.json")
const server = JSON.parse(await readFile(record, "utf8"))
const BASE = server.url
const TOKEN = server.token
const OUT = resolve(here, "../src/mocks/data")

const get = async (path) => {
  const response = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  const body = await response.json()
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${JSON.stringify(body)}`)
  return body
}

const failing = async (path, init) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } })
  return { status: response.status, body: await response.json() }
}

const lit = (value) => JSON.stringify(value, null, 2)

const FLOWS = ['support_case', 'judge_panel']

const project = await get('/api/project')
const flows = (await get('/api/flows?limit=200')).items
const flowDetails = Object.fromEntries(await Promise.all(FLOWS.map(async (id) => [id, await get(`/api/flows/${id}`)])))
const types = (await get('/api/types?limit=200')).items
const FORM_TYPES = ['ReplyApproval', 'MediaApproval']
const typeDetails = Object.fromEntries(await Promise.all(FORM_TYPES.map(async (id) => [id, await get(`/api/types/${id}`)])))
const prompts = (await get('/api/prompts?limit=200')).items
const providers = await get('/api/settings/providers')
const secrets = await get('/api/settings/secrets')
const projectSettings = await get('/api/settings/project')
const files = (await get('/api/files?limit=200')).items

writeFileSync(`${OUT}/project.ts`, [
  'import type { ApiFileEntry, ApiFlow, ApiFlowDetail, ApiProject, ApiPrompt, ApiProviderKey, ApiSecret, ApiSetting, ApiType, ApiTypeDetail } from "@/domain"',
  '',
  `export const liveProject: ApiProject = ${lit(project)}`,
  '',
  `export const liveFlows: readonly ApiFlow[] = ${lit(flows)}`,
  '',
  `export const liveFlowDetails: Readonly<Record<string, ApiFlowDetail>> = ${lit(flowDetails)}`,
  '',
  `export const liveTypes: readonly ApiType[] = ${lit(types)}`,
  '',
  `export const liveTypeDetails: Readonly<Record<string, ApiTypeDetail>> = ${lit(typeDetails)}`,
  '',
  `export const livePrompts: readonly ApiPrompt[] = ${lit(prompts)}`,
  '',
  `export const liveProviders: readonly ApiProviderKey[] = ${lit(providers)}`,
  '',
  `export const liveSecrets: readonly ApiSecret[] = ${lit(secrets)}`,
  '',
  `export const liveProjectSettings: readonly ApiSetting[] = ${lit(projectSettings)}`,
  '',
  `export const liveFiles: readonly ApiFileEntry[] = ${lit(files)}`,
  '',
].join('\n'))

const nodes = Object.fromEntries(await Promise.all(FLOWS.map(async (id) => [id, await get(`/api/flows/${id}/nodes`)])))
const DETAIL_NODES = [
  ['support_case', 'prepare'],
  ['support_case', 'triage'],
  ['support_case', 'approvals__lead'],
  ['judge_panel', 'decide'],
]
const nodeDetails = Object.fromEntries(
  await Promise.all(DETAIL_NODES.map(async ([flow, node]) => [`${flow}/${node}`, await get(`/api/flows/${flow}/nodes/${node}`)])),
)
const PROMPT_NODES = FLOWS.flatMap((flow) =>
  nodes[flow].filter((node) => node.prompt_level !== null).map((node) => [flow, node.node_id]),
)
const nodePrompts = Object.fromEntries(
  await Promise.all(PROMPT_NODES.map(async ([flow, node]) => [`${flow}/${node}`, await get(`/api/flows/${flow}/nodes/${node}/prompt`)])),
)

writeFileSync(`${OUT}/nodes.ts`, [
  'import type { ApiNode, ApiNodeDetail, ApiPromptDetail } from "@/domain"',
  '',
  `export const liveNodes: Readonly<Record<string, readonly ApiNode[]>> = ${lit(nodes)}`,
  '',
  `export const liveNodeDetails: Readonly<Record<string, ApiNodeDetail>> = ${lit(nodeDetails)}`,
  '',
  `export const liveNodePrompts: Readonly<Record<string, ApiPromptDetail>> = ${lit(nodePrompts)}`,
  '',
].join('\n'))

const runs = (await get('/api/runs?limit=200')).items
const COMPLETED = '01a0b104-4658-70aa-b49b-7c2586b56d92'
const FAILED = '01a0b10f-c0bb-71b5-ab91-723388054f73'
const snapshots = Object.fromEntries(await Promise.all([COMPLETED, FAILED].map(async (id) => [id, await get(`/api/runs/${id}`)])))
const part = (value) => (value === null ? '' : String(value))
const addressKey = (runId, address) =>
  [runId, address.node_id, part(address.branch_key), part(address.iteration), part(address.item_index)].join('|')
const addressQuery = (address) =>
  new URLSearchParams([
    ['node_id', address.node_id],
    ...(address.branch_key === null ? [] : [['branch_key', address.branch_key]]),
    ...(address.iteration === null ? [] : [['iteration', String(address.iteration)]]),
    ...(address.item_index === null ? [] : [['item_index', String(address.item_index)]]),
    ['include_payloads', 'full'],
  ]).toString()
const detailAddresses = Object.entries(snapshots).flatMap(([runId, snapshot]) =>
  snapshot.executions.map((execution) => [runId, execution.address]),
)
const executionDetails = Object.fromEntries(
  await Promise.all(
    detailAddresses.map(async ([runId, address]) => [
      addressKey(runId, address),
      await get(`/api/runs/${runId}/executions/detail?${addressQuery(address)}`),
    ]),
  ),
)
const runEvents = Object.fromEntries(
  await Promise.all(
    Object.keys(snapshots).map(async (id) => [id, (await get(`/api/runs/${id}/events/log?after_seq=0&limit=200`)).items]),
  ),
)

writeFileSync(`${OUT}/runs.ts`, [
  'import type { ApiExecutionDetail, ApiRun, ApiRunEvent, ApiRunSnapshot } from "@/domain"',
  '',
  `export const COMPLETED_RUN_ID = ${lit(COMPLETED)}`,
  `export const FAILED_RUN_ID = ${lit(FAILED)}`,
  '',
  `export const liveRuns: readonly ApiRun[] = ${lit(runs)}`,
  '',
  `export const liveRunSnapshots: Readonly<Record<string, ApiRunSnapshot>> = ${lit(snapshots)}`,
  '',
  `export const liveExecutionDetails: Readonly<Record<string, ApiExecutionDetail>> = ${lit(executionDetails)}`,
  '',
  `export const liveRunEvents: Readonly<Record<string, readonly ApiRunEvent[]>> = ${lit(runEvents)}`,
  '',
].join('\n'))

const chatStatus = await get('/api/chat/status')
const chatSessions = (await get('/api/chat/sessions')).items
writeFileSync(`${OUT}/chat.ts`, [
  'import type { ApiChatSession, ApiChatStatus } from "@/domain"',
  '',
  `export const liveChatStatus: ApiChatStatus = ${lit(chatStatus)}`,
  '',
  `export const liveChatSessions: readonly ApiChatSession[] = ${lit(chatSessions)}`,
  '',
].join('\n'))

const experimentIds = (await get('/api/experiments?limit=200')).items.map((item) => item.experiment_id)
const experiments = await Promise.all(experimentIds.map(async (id) => ({
  ...(await get(`/api/experiments/${id}`)),
  latest: null,
  series_count: 0,
  spent_usd: '0',
})))
writeFileSync(`${OUT}/experiments.ts`, [
  'import type { ApiExperimentDetail } from "@/domain"',
  '',
  `export const liveExperiments: readonly ApiExperimentDetail[] = ${lit(experiments)}`,
  '',
].join('\n'))

const notFound = await failing('/api/flows/no_such_flow')
const conflict = await failing(`/api/runs/${COMPLETED}/resume`, {
  method: 'POST',
  body: JSON.stringify({
    address: { node_id: 'approvals__lead', branch_key: 'lead', iteration: null, item_index: null },
    attempt: 1,
    payload: { decision: 'approve', edited_text: null, note: null },
    client_op_id: 'fixture-capture',
  }),
})
const invalid = await failing(`/api/runs/${COMPLETED}/resume`, { method: 'POST', body: JSON.stringify({ attempt: 1 }) })

writeFileSync(`${OUT}/errors.ts`, [
  'export type LiveErrorFixture = { readonly status: number; readonly body: unknown }',
  '',
  `export const liveNotFoundError: LiveErrorFixture = ${lit(notFound)}`,
  '',
  `export const liveConflictError: LiveErrorFixture = ${lit(conflict)}`,
  '',
  `export const liveInvalidRequestError: LiveErrorFixture = ${lit(invalid)}`,
  '',
].join('\n'))

console.log('captured', { flows: flows.length, types: types.length, prompts: prompts.length, runs: runs.length })
