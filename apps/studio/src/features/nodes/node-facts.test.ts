import { describe, expect, it } from "vitest"
import { NODE_KINDS } from "@/domain"
import { liveNodeDetails } from "@/mocks/data/nodes"
import { nodeFacts, NODE_FACTS, type NodeSpec } from "./node-facts"

type SpecHead = { readonly apiVersion: "aqven/v1"; readonly kind: "Node"; readonly description: string }

const HEAD: SpecHead = { apiVersion: "aqven/v1", kind: "Node", description: "" }

const keysOf = (spec: NodeSpec): readonly string[] => nodeFacts(spec).map((fact) => fact.key)

const textOf = (spec: NodeSpec, key: string): string | undefined => nodeFacts(spec).find((fact) => fact.key === key)?.text

describe("NODE_FACTS", () => {
  it("covers every engine node kind", () => {
    expect(Object.keys(NODE_FACTS).sort()).toEqual([...NODE_KINDS].sort())
  })
})

describe("nodeFacts", () => {
  it("names the agent and inference of an llm node", () => {
    const spec: NodeSpec = { ...HEAD, node: "llm", agent: "gemini", inference: "triage" }
    expect(keysOf(spec)).toEqual(["agent", "inference"])
  })

  it("names the function of the recorded code node", () => {
    const spec = liveNodeDetails["support_case/prepare"]?.spec
    expect(spec === undefined ? [] : keysOf(spec)).toEqual(["run"])
  })

  it("names the tool of a tool node", () => {
    const spec: NodeSpec = { ...HEAD, node: "tool", tool: "search_kb" }
    expect(textOf(spec, "tool")).toBe("search_kb")
  })

  it("names assignee, form and timeout policy of the recorded human node", () => {
    const spec = liveNodeDetails["support_case/approvals__lead"]?.spec
    expect(spec === undefined ? [] : keysOf(spec)).toEqual(["assignee", "form", "timeout", "onTimeout"])
  })

  it("names the branches and join policy of a parallel node", () => {
    const spec: NodeSpec = {
      ...HEAD,
      node: "parallel",
      body: { gpt: "gpt", mistral: "mistral", gemini: "gemini" },
      join: { use: "quorum", run: null, with: { min_ok: 2, on_error: "skip" } },
      out: [],
    }
    expect(keysOf(spec)).toEqual(["branches", "join"])
    expect(textOf(spec, "branches")).toBe("gpt, mistral, gemini")
    expect(textOf(spec, "join")).toBe("quorum(min_ok=2, on_error=skip)")
  })

  it("names the source, body and concurrency of a map node", () => {
    const spec: NodeSpec = {
      ...HEAD,
      node: "map",
      over: "$prepare.out.perspectives",
      body: "ballot",
      concurrency: 3,
      on_item_error: { use: "skip", run: null, with: null },
      out: [],
    }
    expect(keysOf(spec)).toEqual(["over", "body", "concurrency", "onItemError"])
    expect(textOf(spec, "concurrency")).toBe("3")
  })

  it("names the body, bound and policies of a loop node", () => {
    const spec: NodeSpec = {
      ...HEAD,
      node: "loop",
      body: ["extract", "validate"],
      max_iter: 3,
      stop: [{ use: null, run: "@root/flows/support_case/nodes/record/record.py:no_issues", with: { path: "$iter.validate.out.issues" } }],
      select: { use: "last", run: null, with: null },
      out: [],
    }
    expect(keysOf(spec)).toEqual(["body", "maxIter", "stop", "select"])
    expect(textOf(spec, "stop")).toBe("no_issues(path=$iter.validate.out.issues)")
  })

  it("names the selector and cases of a switch node", () => {
    const spec: NodeSpec = {
      ...HEAD,
      node: "switch",
      on: "$tally.out.agreement",
      cases: { agreed: { node: null, bind: [] }, split: { node: "escalate", bind: [] } },
      out: [],
    }
    expect(keysOf(spec)).toEqual(["on", "cases"])
    expect(textOf(spec, "cases")).toBe("agreed, split")
  })

  it("names the called flow of a call node", () => {
    const spec: NodeSpec = { ...HEAD, node: "call", flow: "judge_panel" }
    expect(textOf(spec, "flow")).toBe("judge_panel")
  })

  it("names the source and target type of a narrow node", () => {
    const spec: NodeSpec = { ...HEAD, node: "narrow", from: "$record.out.record", to: "CaseRecord" }
    expect(keysOf(spec)).toEqual(["from", "to"])
  })

  it("reads an escalating timeout policy", () => {
    const spec: NodeSpec = {
      ...HEAD,
      node: "human",
      form: "MediaApproval",
      assignee: "brand_editor",
      timeout_seconds: 86400,
      on_timeout: { policy: "escalate", assignee: "lead", timeout_seconds: 3600 },
    }
    expect(textOf(spec, "onTimeout")).toBe("escalate(lead)")
  })
})
