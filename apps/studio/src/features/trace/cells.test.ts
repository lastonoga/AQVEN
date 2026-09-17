import { describe, expect, it } from "vitest"
import type { Attempt, AttemptLadder, CallColumn, InputCell, MatrixGroup } from "@/domain"
import type { CellBlock, Inline, Span } from "@/components/studio"
import { callId, columnId, nodeId } from "@/data/ids"
import { ROW_CELLS } from "./cells"
import { attemptLines, ladderHead, reopenOnArrival } from "./attempts"
import { describeStage, stageKindTag, stageTotals } from "./descriptions"
import { exitChips } from "./exit-condition"
import { inputBlocks } from "./io-cells"
import { droppedText } from "./join"
import { nestedHeading } from "./nested"
import { summaryCells } from "./summary"
import { DIVERGE_STAGE, LOAD_STAGE, LOOP_STAGE, MAP_STAGE, PERSONA_GROUP } from "./test-support"
import { openPaths, traceContext, traceT } from "./test-support"

const groupOf = (groups: readonly MatrixGroup[]): MatrixGroup => {
  const [group] = groups
  if (group === undefined) throw new Error("fixture without groups")
  return group
}

const columnOf = (group: MatrixGroup, index = 0): CallColumn => {
  const column = group.columns[index]
  if (column === undefined) throw new Error("fixture without column")
  return column
}

const isSpanList = (line: Inline): line is readonly Span[] => Array.isArray(line)

const inlineText = (line: Inline): string => {
  if (typeof line === "string") return line
  if (isSpanList(line)) return line.map((span) => span.text).join("")
  return line.text
}

const blockText = (block: CellBlock): string => {
  if (block.kind === "inline") return block.lines.map(inlineText).join("\n")
  if (block.kind === "heading") return [block.title, ...(block.subtitle === undefined ? [] : [block.subtitle])].map(inlineText).join("\n")
  if (block.kind === "tags") return [...block.tags.map((tag) => tag.children), block.text === undefined ? "" : inlineText(block.text)].join(" ")
  if (block.kind === "meter") return [inlineText(block.value), block.trail === undefined ? "" : inlineText(block.trail)].join(" ")
  if (block.kind === "refs") return [...block.items.map((item) => item.text), ...(block.text === undefined ? [] : [inlineText(block.text)])].join(" ")
  return block.kind
}

const texts = (blocks: readonly CellBlock[]): readonly string[] => blocks.map(blockText)

describe("ROW_CELLS call", () => {
  const diverge = groupOf(DIVERGE_STAGE.groups)
  const loop = groupOf(LOOP_STAGE.groups)

  it("renders the status dot, name, menu and variant tag style", () => {
    const [heading, tags] = ROW_CELLS.call(columnOf(diverge, 1), traceContext(diverge, "trace"))
    expect(heading).toMatchObject({ kind: "heading", size: "item", title: "pitch_gen_b", menu: true, dots: ["destructive"] })
    expect(tags).toMatchObject({ kind: "tags", tags: [{ children: "LLM", tone: "llm", fill: "soft", size: "sm" }] })
  })

  it("orders kind, flags and status tags before the cached subtitle", () => {
    const cached = ROW_CELLS.call(columnOf(groupOf(MAP_STAGE.groups), 3), traceContext(groupOf(MAP_STAGE.groups)))
    expect(texts(cached)).toEqual(["score_hotel[3]", "LLM Marins · cached"])
    const aborted: CallColumn = { ...columnOf(loop), status: "aborted" }
    expect(texts(ROW_CELLS.call(aborted, traceContext(loop)))).toEqual(["iteration 1", "LOOP BODY ABORTED "])
  })

  it("uses the tiny call text with a BEST tag in headed groups", () => {
    const nested = columnOf(PERSONA_GROUP, 1).child?.block.group ?? PERSONA_GROUP
    expect(ROW_CELLS.call(columnOf(nested, 2), traceContext(nested, "run", 2))).toEqual([
      { kind: "heading", size: "tiny", title: "fix_draft", tags: [{ tone: "success", fill: "soft", size: "sm", children: "BEST" }] },
    ])
  })
})

describe("ROW_CELLS columns", () => {
  it("adds the family dot and the child expander bound to the column path", () => {
    const toggled: string[] = []
    const ctx = { ...traceContext(PERSONA_GROUP, "run", 1, openPaths(["personas/persona_b2b"])) }
    const scoped = { ...ctx, open: { isOpen: ctx.open.isOpen, toggle: (path: string) => { toggled.push(path) } } }
    const blocks = ROW_CELLS.columns(columnOf(PERSONA_GROUP, 1), scoped)
    const [heading] = blocks
    expect(blocks).toHaveLength(1)
    expect(heading).toMatchObject({ kind: "heading", size: "cell", title: "persona_b2b", subtitle: "B2B · corporate · gpt-5.1", dots: ["openai"], dotShape: "round" })
    expect(heading?.kind === "heading" ? heading.expander : undefined).toMatchObject({ label: "loop ×4", open: true, controls: "personas/persona_b2b" })
    if (heading?.kind === "heading") heading.expander?.onToggle()
    expect(toggled).toEqual(["personas/persona_b2b"])
  })

  it("derives nested subtitles by group kind", () => {
    const nestedLoop = columnOf(PERSONA_GROUP, 1).child?.block.group ?? PERSONA_GROUP
    const judges = columnOf(nestedLoop, 2).child?.block.group ?? PERSONA_GROUP
    expect(texts(ROW_CELLS.columns(columnOf(nestedLoop, 2), traceContext(nestedLoop, "run", 2)))).toEqual(["iteration 3\n$0.0301 · 2.6 s"])
    expect(texts(ROW_CELLS.columns(columnOf(judges, 1), traceContext(judges, "run", 3)))).toEqual(["judge_facts\ngpt-5.1-mini"])
    expect(ROW_CELLS.columns(columnOf(judges, 1), traceContext(judges, "run", 3))[0]).toMatchObject({ dotShape: "square" })
  })
})

describe("ROW_CELLS agent and model", () => {
  it("prefixes the family only when the group mixes families", () => {
    const diverge = groupOf(DIVERGE_STAGE.groups)
    expect(texts(ROW_CELLS.agent(columnOf(diverge), traceContext(diverge)))).toEqual([
      "Anthropic · sonnet-4.5",
      "$0.0126 · 2.4 s · 1,998/604",
      "agent pitch_gen_a · t 0.9 · reasoning medium",
    ])
    const map = groupOf(MAP_STAGE.groups)
    expect(texts(ROW_CELLS.agent(columnOf(map), traceContext(map)))).toEqual(["haiku-4.5", "$0.0019 · 0.31 s · 812/104", "agent score_hotel[0] · t 0.2 · reasoning off"])
  })

  it("mutes cached cost and reads tokens from the cassette", () => {
    const map = groupOf(MAP_STAGE.groups)
    const [, stats] = ROW_CELLS.agent(columnOf(map, 3), traceContext(map))
    expect(stats).toMatchObject({ kind: "inline", role: "small", lines: [[{ text: "$0.0000", strong: true, tone: "neutral" }, { text: " · " }, { text: "0.02 s" }, { text: " · " }, { text: "from cassette" }]] })
  })

  it("describes deterministic calls", () => {
    const load = groupOf(LOAD_STAGE.groups)
    expect(texts(ROW_CELLS.agent(columnOf(load), traceContext(load)))).toEqual(["no model", "$0.0000 · 1.9 s · — tokens", "no agent · deterministic call"])
  })

  it("renders the judge panel with its cost breakdown", () => {
    const loop = groupOf(LOOP_STAGE.groups)
    expect(texts(ROW_CELLS.agent(columnOf(loop, 2), traceContext(loop, "trace")))).toEqual([
      "3 judges + fix",
      "judge $0.0124 / $0.0043 / $0.0038 · fix —",
      "$0.0205 · 1.4 s · 3 calls",
      "agent iteration · t 0.9 · reasoning medium",
    ])
  })

  it("names the fix node when the panel knows it", () => {
    const loop = groupOf(LOOP_STAGE.groups)
    const judged: CallColumn = { ...columnOf(loop), agent: { costUsd: 0.0512, title: { kind: "panel", families: ["anthropic", "openai", "google"], judges: 3, fix: true, fixNode: nodeId("fix_draft") } } }
    const skipped: CallColumn = { ...judged, agent: { costUsd: 0.055, title: { kind: "panel", families: ["anthropic"], judges: 3, fix: false, fixNode: nodeId("fix_draft") } } }
    expect(texts(ROW_CELLS.agent(judged, traceContext(loop)))[0]).toBe("3 judges + fix_draft")
    expect(texts(ROW_CELLS.agent(skipped, traceContext(loop)))[0]).toBe("3 judges · fix not run")
  })

  it("drops the title and renders a body stat line in headed groups", () => {
    expect(ROW_CELLS.agent(columnOf(PERSONA_GROUP, 1), traceContext(PERSONA_GROUP))).toEqual([
      { kind: "inline", lines: ["$0.1043 · 9.1 s"], role: "body", tone: "default" },
    ])
    expect(texts(ROW_CELLS.model(columnOf(PERSONA_GROUP, 1), traceContext(PERSONA_GROUP)))).toEqual(["$0.1043 · 9.1 s"])
  })

  it("says not called and waiting", () => {
    const base = columnOf(groupOf(LOAD_STAGE.groups))
    const idle: CallColumn = { ...base, status: "idle", agent: { title: { kind: "text", text: "deck.publish · write" }, costUsd: 0 } }
    const waiting: CallColumn = { ...base, status: "waiting", agent: { title: { kind: "text", text: "@lead" }, costUsd: 0, waitingMinutes: 12 } }
    const ctx = traceContext(groupOf(LOAD_STAGE.groups))
    expect(texts(ROW_CELLS.agent(idle, ctx))).toEqual(["deck.publish · write", "$0.0000 · not called"])
    expect(texts(ROW_CELLS.agent(waiting, ctx))).toEqual(["@lead", "$0.0000 · waiting 12 m"])
  })
})

describe("ROW_CELLS input, prompt and output", () => {
  const load = groupOf(LOAD_STAGE.groups)
  const loop = groupOf(LOOP_STAGE.groups)

  it("renders provenance chips, and glyph lines inside loops", () => {
    expect(ROW_CELLS.input(columnOf(load), traceContext(load))[0]).toMatchObject({ kind: "refs", items: [{ provenance: "static", text: "city:\"Sochi\"" }, { provenance: "static", text: "nights:3" }, { provenance: "human", text: "“no nightclubs”" }] })
    expect(ROW_CELLS.input(columnOf(loop, 1), traceContext(loop, "trace"))).toEqual([
      { kind: "inline", lines: [{ glyph: "✦", text: "draft·v2 ← fix_draft it.1" }], role: "small", tone: "neutral" },
    ])
  })

  it("trails the shared hash, frozen note and expand link inside the chip row", () => {
    const diverge = groupOf(DIVERGE_STAGE.groups)
    const shared: InputCell = { kind: "refs", refs: [{ provenance: "generated", label: "ranked·3", value: "rank_hotels" }], hash: "9f3c…" }
    expect(inputBlocks(shared, traceContext(diverge), true)).toEqual([
      { kind: "refs", items: [{ provenance: "generated", text: "ranked·3 ← rank_hotels" }], text: "hash 9f3c… — identical across all four branches" },
    ])
    const frozen = diverge.shared?.input
    if (frozen === undefined) throw new Error("fixture without shared input")
    expect(inputBlocks(frozen, traceContext(diverge, "trace"), true)).toMatchObject([
      { kind: "refs", text: "from the dataset · ancestors frozen", link: "expand the whole input" },
    ])
    expect(texts(inputBlocks(shared, traceContext(loop), false))).toEqual(["ranked·3 ← rank_hotels", "hash 9f3c… — identical across all three branches"])
  })

  it("adds the map input note below the chips", () => {
    const map = groupOf(MAP_STAGE.groups)
    expect(texts(ROW_CELLS.input(columnOf(map), traceContext(map)))).toEqual(["hotel · Hotel", "rating 4.8 · 240 m"])
  })

  it("explains missing prompts of non-model calls that ran", () => {
    expect(texts(ROW_CELLS.prompt(columnOf(load), traceContext(load)))).toEqual(["none — not a model call"])
    expect(ROW_CELLS.prompt({ ...columnOf(load), status: "idle" }, traceContext(load))).toEqual([])
  })

  it("adds decorative links by variant", () => {
    expect(texts(ROW_CELLS.output(columnOf(load), traceContext(load, "run")))).toEqual(["text", "expand"])
    const failed = columnOf(groupOf(DIVERGE_STAGE.groups), 1)
    const ctx = traceContext(groupOf(DIVERGE_STAGE.groups), "trace")
    expect(texts(ROW_CELLS.output(failed, ctx))).toEqual(["text", "raw response and parse"])
    expect(texts(ROW_CELLS.prompt(failed, ctx))).toEqual(["text", "template and rendered prompt"])
    expect(texts(ROW_CELLS.output(columnOf(groupOf(DIVERGE_STAGE.groups)), ctx))).toEqual(["text"])
  })

  it("renders output states and verdicts", () => {
    const column: CallColumn = { id: columnId("human_review"), callId: callId("call_h"), name: "human_review" }
    const ctx = traceContext(load)
    expect(texts(ROW_CELLS.output({ ...column, output: { kind: "status", status: "skipped", case: "approved" } }, ctx))).toEqual(["skipped · verdict ≠ approved"])
    expect(texts(ROW_CELLS.output({ ...column, output: { kind: "status", status: "awaiting", deadlineMinutes: 192 } }, ctx))).toEqual(["awaiting a human decision\ndeadline in 3 h 12 m"])
    expect(texts(ROW_CELLS.output({ ...column, output: { kind: "verdict", verdict: "approved", remark: "third hook empty", score: 0.88 } }, ctx))).toEqual(["approved · third hook empty", "0.88"])
    expect(ROW_CELLS.output({ ...column, output: { kind: "verdict", verdict: "invented" } }, ctx)).toEqual([
      { kind: "inline", lines: [[{ glyph: "cross", tone: "destructive", text: "invented" }]], role: "body", tone: "default" },
    ])
  })
})

describe("ROW_CELLS checks", () => {
  const loop = groupOf(LOOP_STAGE.groups)
  const diverge = groupOf(DIVERGE_STAGE.groups)

  it("renders the score meter, delta and threshold line", () => {
    const blocks = ROW_CELLS.postCheck(columnOf(loop, 1), traceContext(loop, "trace"))
    expect(blocks[0]).toEqual({ kind: "meter", value: "0.77", bar: { value: 0.77, tone: "success" }, trail: [{ text: "+0.19", tone: "success" }] })
    expect(texts(blocks)).toEqual(["0.77 +0.19", "< 0.90"])
    expect(texts(ROW_CELLS.postCheck(columnOf(loop, 2), traceContext(loop, "trace")))).toEqual(["0.88 +0.11", "expected matched · Δ 0.04"])
  })

  it("marks a stopped score with the loop tone", () => {
    const stopped: CallColumn = { ...columnOf(loop), check: { score: { value: 0.814, previous: 0.81, threshold: 0.9, stopped: true } } }
    expect(ROW_CELLS.postCheck(stopped, traceContext(loop))[0]).toEqual({
      kind: "meter",
      value: "0.814",
      bar: { value: 0.814, tone: "loop" },
      trail: [{ text: "+0.004", tone: "loop" }, { text: " → stop", tone: "loop" }],
    })
  })

  it("renders comparisons with findings, divider, checks and the judge link", () => {
    expect(texts(ROW_CELLS.postCheck(columnOf(diverge), traceContext(diverge, "trace")))).toEqual([
      "actual: “Park, spa and quiet”\nexpected: “A holiday next to the park”",
      "close · Δ 0.12 ",
      "divider",
      "3 of 3 assertions",
    ])
    expect(texts(ROW_CELLS.postCheck(columnOf(diverge, 1), traceContext(diverge, "trace")))).toEqual([
      "actual: —\nexpected: “A holiday next to the park”",
      "hooks[2] = \"\" → assertion failed ",
      "divider",
      "hooks[*] non-empty\nno superlatives\ntitle ≤ 90",
      "verdicts of 3 judges",
    ])
    expect(texts(ROW_CELLS.postCheck(columnOf(diverge, 1), traceContext(diverge, "run")))).not.toContain("verdicts of 3 judges")
  })

  it("renders judge trails, per-modality checks and toned notes", () => {
    const column: CallColumn = {
      ...columnOf(diverge),
      check: { score: { value: 0.71, judges: [0.83, 0.52, 0.78] }, checks: [{ name: "no faces", pass: true }, { name: "3:2 ratio", pass: true }], note: { text: "facts: unsupported superlative", pass: false } },
    }
    const blocks = ROW_CELLS.postCheck(column, traceContext(diverge))
    expect(texts(blocks)).toEqual(["0.71 0.83 / 0.52 / 0.78", "no faces · 3:2 ratio", "facts: unsupported superlative"])
    expect(blocks[2]).toEqual({ kind: "inline", lines: [{ text: "facts: unsupported superlative", tone: "destructive" }], role: "caption" })
    expect(texts(ROW_CELLS.assertions(columnOf(PERSONA_GROUP, 1), traceContext(PERSONA_GROUP)))).toEqual(["2 of 3 assertions", "score 0.84 · stop on stagnation"])
  })
})

describe("stage presenters", () => {
  it("describes stages and totals", () => {
    expect(describeStage(DIVERGE_STAGE, traceT)).toBe("4 model families on row #07 input · join all")
    expect(describeStage(LOOP_STAGE, traceT)).toBe("body: judge_panel quorum(2) + fix_draft · exit at threshold 0.90")
    expect(describeStage(MAP_STAGE, traceT)).toBe("parallel · concurrency 8 · N ← load_hotels.out.length")
    expect(describeStage(LOAD_STAGE, traceT)).toBe("1 tool call")
    expect(stageTotals(DIVERGE_STAGE, traceT)).toBe("$0.0471 · 2.4 s")
    expect(stageTotals({ ...LOAD_STAGE, durationS: null }, traceT)).toBe("$0.0000 · waiting")
  })

  it("styles the kind tag by variant", () => {
    expect(stageKindTag(DIVERGE_STAGE, "run", traceT)).toEqual({ fill: "tint", size: "micro", tone: "llm", children: "DIVERGE ×4" })
    expect(stageKindTag(LOAD_STAGE, "trace", traceT)).toEqual({ fill: "soft", size: "sm", tone: "neutral", children: "SEQ" })
  })

  it("builds exit chips with the fired tone and suffix", () => {
    expect(exitChips(LOOP_STAGE.exit ?? { conditions: [] }, traceT)).toEqual([
      { key: "threshold", label: "threshold 0.88 ≥ 0.90 after fix · FIRED", tone: "success", fill: "soft", fired: true },
      { key: "iterations", label: "iterations 3 / 8", tone: "neutral", fill: "outline", fired: false },
      { key: "budget", label: "budget $0.120 / $0.50", tone: "neutral", fill: "outline", fired: false },
    ])
    expect(exitChips({ conditions: [{ kind: "stagnation", delta: 0.004, epsilon: 0.01, fired: true }] }, traceT)[0]).toMatchObject({ label: "stagnation Δ0.004 < 0.01 · FIRED", tone: "loop" })
  })

  it("summarises map stages in the trailing column", () => {
    const summary = groupOf(MAP_STAGE.groups).summary
    if (summary === undefined) throw new Error("fixture without summary")
    expect(texts(summaryCells(summary, "call", traceT))).toEqual(["+ 6 calls\nexpand"])
    expect(texts(summaryCells(summary, "agent", traceT))).toEqual(["$0.0192 total\nmedian 0.31 s"])
    expect(texts(summaryCells(summary, "input", traceT))).toEqual(["one type\nHotel"])
    expect(texts(summaryCells(summary, "output", traceT))).toEqual(["spread\n0.44 … 0.93", "10/10 ok"])
    expect(summaryCells(summary, "prompt", traceT)).toEqual([])
  })

  it("heads nested blocks with depth, kind and hint", () => {
    const loopBlock = columnOf(PERSONA_GROUP, 1).child?.block
    const judgesBlock = loopBlock === undefined ? undefined : columnOf(loopBlock.group, 2).child?.block
    if (loopBlock === undefined || judgesBlock === undefined) throw new Error("fixture without nested blocks")
    expect(nestedHeading(loopBlock, 2, traceT)).toEqual({ depthLabel: "L2", kindLabel: "LOOP ×4", tone: "loop", title: "critic_loop · persona_b2b", hint: "iterations run as columns — scroll right" })
    expect(nestedHeading(judgesBlock, 3, traceT)).toMatchObject({ kindLabel: "PARALLEL ×3", hint: "quorum 2 of 3" })
  })

  it("presents the attempts ladder and the join narrative", () => {
    const attempt: Attempt = { n: 2, durationS: 1.8, outcome: "schema failed · 2 issues", link: "repair · issues into prompt", tokens: { input: 2104, output: 318 }, costUsd: 0.004, result: "degraded" }
    const ladder: AttemptLadder = { columnId: columnId("pitch_gen_b"), callLabel: "pitch_gen_b", chain: "429 → schema failed", billedUsd: 0.0611, failedUsd: 0.01, attempts: [attempt] }
    expect(ladderHead(ladder, traceT)).toMatchObject({ id: "attempts-pitch_gen_b", status: "DEGRADED", tone: "warning", title: "pitch_gen_b · 1 attempt" })
    expect(ladderHead(ladder, traceT).toggle(false)).toBe("expand 1 attempt")
    expect(attemptLines(attempt, traceT).map(inlineText)).toEqual(["schema failed · 2 issues", "link: repair · issues into prompt", "2,104 / 318 · $0.0040"])
    expect(reopenOnArrival("attempts-pitch_gen_b", "")(false)).toBe(false)
    expect(reopenOnArrival("attempts-pitch_gen_b", "")(true)).toBe(true)
    expect(reopenOnArrival("attempts-pitch_gen_b", "attempts-pitch_gen_b")(false)).toBe(true)
    const join = DIVERGE_STAGE.join
    if (join === undefined) throw new Error("fixture without join")
    expect(droppedText(join, traceT)).toBe(" — branch b dropped on an assertion, but its tokens were billed")
    expect(droppedText({ ...join, dropped: [{ branch: "a", billed: false }] }, traceT)).toBe(" — branch a dropped on an assertion")
  })
})
