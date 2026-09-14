import { scan } from "./scan.js"
import { createServer, DEFAULT_PORT } from "./server.js"
import { publish } from "./events.js"
import { watch } from "./watch.js"

const DIM = "[2m"
const BOLD = "[1m"
const OFF = "[0m"

export type DevOptions = {
  root: string
  port: number
  open: boolean
}

async function resynthesize(root: string, apply: (r: Awaited<ReturnType<typeof scan>>, ms: number) => void): Promise<void> {
  const started = performance.now()
  const report = await scan(root)
  const ms = Math.round(performance.now() - started)
  apply(report, ms)

  const broken = report.flows.filter((f) => f.status === "fail")
  publish({ t: "synth", flows: report.flows.map((f) => f.id), ms })
  for (const f of broken) {
    publish({ t: "diagnostics", flow: f.id, diagnostics: f.diagnostics })
  }
  console.log(`${DIM}пересинтез ${report.found} воркфлоу за ${ms} мс${OFF}`)
}

export async function runDevServer(opts: DevOptions): Promise<void> {
  const server = await createServer({ root: opts.root, port: opts.port })

  const watcher = watch({
    root: opts.root,
    onChange: (files) => {
      console.log(`${DIM}изменено: ${files.length} файл(ов)${OFF}`)
      void resynthesize(opts.root, (report, ms) => server.setState(report, ms))
    },
  })

  console.log("")
  console.log(`  ${BOLD}wf dev${OFF}  ${server.url}`)
  console.log(`  ${DIM}каталог ${opts.root}${OFF}`)
  console.log(`  ${DIM}Ctrl+C — остановить${OFF}`)
  console.log("")

  const stop = async (): Promise<void> => {
    watcher.close()
    await server.close()
    process.exit(0)
  }
  process.on("SIGINT", () => void stop())
  process.on("SIGTERM", () => void stop())
}
