import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import openapiTS, { astToString } from "openapi-typescript"

const here = dirname(fileURLToPath(import.meta.url))
const specPath = resolve(here, "../src/api/openapi.json")
const typesPath = resolve(here, "../src/api/schema.d.ts")
const record = process.env["AQVEN_SERVER_JSON"] ?? resolve(process.cwd(), ".aqven/server.json")
const checking = process.argv.includes("--check")

const HEADER = /^\/\*\*[\s\S]*?\*\/\s*/
const body = (source) => source.replace(HEADER, "").trim()

const pull = async () => {
  const server = JSON.parse(await readFile(record, "utf8"))
  const response = await fetch(`${server.url}/api/openapi.json`, { headers: { Authorization: `Bearer ${server.token}` } })
  if (!response.ok) throw new Error(`${server.url} answered ${String(response.status)}`)
  return await response.json()
}

const spec = checking ? JSON.parse(await readFile(specPath, "utf8")) : await pull()
const text = `${JSON.stringify(spec, null, 2)}\n`
const types = astToString(await openapiTS(JSON.parse(text), { rootTypes: true }))

if (checking) {
  const committed = await readFile(typesPath, "utf8")
  if (body(types) !== body(committed)) {
    console.error("schema.d.ts is stale: run pnpm gen:api with the project server running")
    process.exit(1)
  }
  console.log(`schema.d.ts matches openapi.json (${String(Object.keys(spec.paths).length)} paths)`)
  process.exit(0)
}

await writeFile(specPath, text)
await writeFile(typesPath, types)
console.log(`openapi.json + schema.d.ts ← ${record} (${String(Object.keys(spec.paths).length)} paths)`)
