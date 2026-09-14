import { useResource } from "../hooks/use-resource.js"
import { DiagnosticList } from "../components/DiagnosticList.js"
import { StatusPill } from "../components/StatusPill.js"
import { ScanReport } from "./ScanReport.js"
import { flowHref } from "../routing/route.js"
import type { ApiClient, Diagnostic, FlowSummary } from "../api/index.js"

type Props = { client: ApiClient; revision: number }

const HEADERS = ["", "id", "версия", "узлов", "ir hash", "файл"]

function FlowRow({ flow, diagnostics }: { flow: FlowSummary; diagnostics: readonly Diagnostic[] }) {
  return (
    <>
      <tr className="border-b border-slate-800/70 hover:bg-slate-900/60">
        <td className="py-2 pr-3 align-top">
          <StatusPill status={flow.status} />
        </td>
        <td className="py-2 pr-4 align-top">
          <a className="font-mono text-[13px] text-sky-400 hover:underline" href={flowHref(flow.id)}>
            {flow.id}
          </a>
        </td>
        <td className="py-2 pr-4 align-top font-mono text-[13px] text-slate-300">v{flow.version}</td>
        <td className="py-2 pr-4 align-top font-mono text-[13px] text-slate-300">{flow.nodes}</td>
        <td className="py-2 pr-4 align-top font-mono text-[12px] text-slate-500">{flow.irHash ?? "—"}</td>
        <td className="py-2 align-top font-mono text-[12px] text-slate-500">{flow.file}</td>
      </tr>
      {diagnostics.length > 0 && (
        <tr className="border-b border-slate-800/70 bg-red-950/10">
          <td />
          <td colSpan={5} className="pb-2.5">
            <DiagnosticList diagnostics={diagnostics} />
          </td>
        </tr>
      )}
    </>
  )
}

export function FlowListScreen({ client, revision }: Props) {
  const flows = useResource(() => client.listFlows(), `flows:${revision}`)
  const diagnostics = useResource(async () => {
    const list = await client.listFlows()
    const failing = list.filter((flow) => flow.status === "fail")
    const loaded = await Promise.all(failing.map((flow) => client.getDiagnostics(flow.id)))
    return Object.fromEntries(failing.map((flow, index) => [flow.id, loaded[index] ?? []]))
  }, `diagnostics:${revision}`)

  if (flows.error !== null) {
    return <p className="font-mono text-[13px] text-red-400">{flows.error}</p>
  }
  if (flows.data === null) {
    return <p className="font-mono text-[13px] text-slate-500">загрузка…</p>
  }
  if (flows.data.length === 0) {
    return <ScanReport client={client} scanned={0} />
  }

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-slate-700 text-left">
          {HEADERS.map((header, index) => (
            <th key={index} className="pb-2 font-mono text-[11px] font-normal uppercase tracking-wide text-slate-500">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {flows.data.map((flow) => (
          <FlowRow key={flow.id} flow={flow} diagnostics={diagnostics.data?.[flow.id] ?? []} />
        ))}
      </tbody>
    </table>
  )
}
