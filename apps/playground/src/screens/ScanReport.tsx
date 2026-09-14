import type { ApiClient } from "../api/index.js"

const FLOW_MASK = "**/*.flow.ts"

type Row = { label: string; value: string }

export function ScanReport({ client, scanned }: { client: ApiClient; scanned: number }) {
  const rows: Row[] = [
    { label: "источник", value: client.source === "api" ? `HTTP ${client.origin}` : `фикстура ${client.origin}` },
    { label: "эндпоинт", value: "GET /api/flows" },
    { label: "маска", value: FLOW_MASK },
    { label: "найдено воркфлоу", value: String(scanned) },
  ]
  return (
    <div className="max-w-2xl">
      <h2 className="mb-3 font-mono text-[13px] uppercase tracking-wide text-slate-400">Отчёт скана</h2>
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-slate-800">
              <td className="w-48 py-1.5 pr-4 text-slate-500">{row.label}</td>
              <td className="py-1.5 font-mono text-slate-200">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[12px] leading-relaxed text-slate-500">
        Воркфлоу — файл <code className="font-mono text-slate-400">*.flow.ts</code> с{" "}
        <code className="font-mono text-slate-400">export default defineFlow({"{...}"})</code>. Каталог просмотрен,
        подходящих файлов не найдено.
      </p>
    </div>
  )
}
