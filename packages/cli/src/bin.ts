#!/usr/bin/env node
import { relative } from "node:path"
import { scan } from "./scan.js"
import { runDevServer } from "./dev.js"
import { DEFAULT_PORT } from "./server.js"
import type { ScanReport } from "./scan.js"

const DIM = "[2m"
const RED = "[31m"
const GREEN = "[32m"
const BOLD = "[1m"
const OFF = "[0m"

function renderEmpty(report: ScanReport): void {
  console.log(`${BOLD}Воркфлоу не найдены${OFF}`)
  console.log(`  каталог   ${report.root}`)
  console.log(`  маска     ${report.pattern}`)
  console.log(`  просмотрено файлов: ${report.scanned}`)
  console.log("")
  console.log(`${DIM}Воркфлоу — это файл *.flow.ts с export default defineFlow({...}).${OFF}`)
}

function renderFlows(report: ScanReport): void {
  console.log(`${BOLD}Воркфлоу: ${report.found}${OFF}  ${DIM}${report.root}${OFF}`)
  console.log("")
  for (const f of report.flows) {
    const where = relative(report.root, f.file)
    if (f.status === "ok") {
      console.log(
        `  ${GREEN}ok${OFF}    ${BOLD}${f.id}${OFF}  v${f.version}  узлов ${f.nodeCount}  ${DIM}${f.irHash}  ${where}${OFF}`,
      )
      continue
    }
    console.log(`  ${RED}FAIL${OFF}  ${BOLD}${f.id}${OFF}  ${DIM}${where}${OFF}`)
    for (const d of f.diagnostics) {
      console.log(`        ${RED}${d.code}${OFF} ${d.message}`)
    }
  }
  console.log("")
  const bad = report.flows.filter((f) => f.status === "fail").length
  const good = report.flows.length - bad
  console.log(`${DIM}просмотрено файлов ${report.scanned} · собрано ${good} · с ошибками ${bad}${OFF}`)
}

async function dev(dir: string, once: boolean): Promise<number> {
  const started = performance.now()
  const report = await scan(dir)
  const ms = Math.round(performance.now() - started)

  if (report.found === 0) renderEmpty(report)
  else renderFlows(report)

  console.log(`${DIM}синтез ${ms} мс${OFF}`)
  return report.flows.some((f) => f.status === "fail") ? 1 : 0
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const command = argv[0] ?? "dev"
  const once = argv.includes("--once")
  const dir = argv.find((a) => !a.startsWith("-") && a !== command) ?? process.cwd()

  if (command !== "dev") {
    console.error(`неизвестная команда: ${command}`)
    console.error("использование: wf dev [каталог] [--once] [--port N]")
    process.exit(2)
  }
  if (once) {
    process.exit(await dev(dir, true))
    return
  }
  const portArg = argv.indexOf("--port")
  const port = portArg >= 0 ? Number(argv[portArg + 1]) : DEFAULT_PORT
  await dev(dir, true)
  await runDevServer({ root: dir, port, open: !argv.includes("--no-open") })
}

await main()
