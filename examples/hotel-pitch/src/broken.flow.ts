import { tool, code, root, defineFlow } from "@wf/dsl"
import type { Fn } from "@wf/dsl"

type Input = { x: number }

const loadThing: Fn<{ x: number }, string> = { name: "loadThing" }
const formatThing: Fn<{ s: string }, string> = { name: "formatThing" }

const $input = root<Input>("input")

const loaded = tool("loaded", { tool: loadThing, effect: "read", in: { x: $input.x } })

const used = code("used", { fn: formatThing, pure: true, in: { s: loaded.out } })

export default defineFlow({
  flow: "broken_example",
  version: 1,
  input: "Input",
  output: { type: "String", from: used.out },
  nodes: [used],
})
