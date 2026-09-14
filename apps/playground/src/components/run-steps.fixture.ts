import type { Render, Run, RunEvent } from "../api/index.js"

const HOTELS = [
  { id: "h1", name: "Азимут", price: 5000 },
  { id: "h2", name: "Бриз", price: 7000 },
]

const CHOICE = { best: { id: "h2", name: "Бриз" }, runnerUp: null }

const PITCH = { text: "Бриз — лучший вариант по цене и морю", tone: "нейтральный" }

export const PROMPT_TEXT = "# узел render\nроль модели: writer\n\n## слоты\n- best ← $pick.out.best"

export const RAW_TEXT = '{"text":"Бриз — лучший вариант по цене и морю","tone":"нейтральный"}'

export const runFixture: Run = {
  id: "run-1",
  flow: "hotel_pitch",
  input: { locale: "ru", topic: "море" },
  status: "ok",
  irHash: "198f8c3e",
  startedAt: 1_000,
  endedAt: 1_700,
}

export const startedEvents: readonly RunEvent[] = [
  {
    seq: 1,
    at: 1_000,
    type: "run_start",
    payload: {
      flow: "hotel_pitch",
      order: ["load_hotels", "pick", "render"],
      input: runFixture.input,
      simplifications: ["узлы исполнены последовательно, параллелизма нет", "ретраи выключены"],
    },
  },
  { seq: 2, at: 1_010, type: "node_start", nodeId: "load_hotels", payload: { kind: "tool", slots: null, inputs: {} } },
]

export const finishedEvents: readonly RunEvent[] = [
  ...startedEvents,
  {
    seq: 3,
    at: 1_100,
    type: "node_finish",
    nodeId: "load_hotels",
    payload: {
      kind: "tool",
      status: "ok",
      ms: 90,
      outputType: "Hotel[]",
      output: HOTELS,
      simplifications: [
        "инструмент «hotels.search» не вызван: результат сгенерирован по типу выхода Hotel[]",
        "ретраи выключены",
      ],
    },
  },
  {
    seq: 4,
    at: 1_110,
    type: "node_start",
    nodeId: "pick",
    payload: { kind: "code", slots: { scores: "$triage.out" }, inputs: { scores: [{ score: 0.7 }, { score: 0.9 }] } },
  },
  {
    seq: 5,
    at: 1_200,
    type: "node_finish",
    nodeId: "pick",
    payload: {
      kind: "code",
      status: "ok",
      ms: 90,
      outputType: "Choice",
      output: CHOICE,
      simplifications: ["функция «pick_best» не исполнена: результат сгенерирован по типу выхода Choice"],
    },
  },
  {
    seq: 6,
    at: 1_210,
    type: "node_start",
    nodeId: "render",
    payload: {
      kind: "llm",
      slots: { best: "$pick.out.best", locale: "$input.locale", limit: { const: 3 } },
      inputs: { best: CHOICE.best, locale: "ru", limit: 3 },
    },
  },
  {
    seq: 7,
    at: 1_420,
    type: "node_finish",
    nodeId: "render",
    payload: {
      kind: "llm",
      status: "ok",
      ms: 210,
      outputType: "Pitch",
      output: PITCH,
      tokens: { input: 1_200, output: 300 },
      costUsd: 0.0123,
      raw: RAW_TEXT,
      checks: [{ name: "schema", ok: true, message: "выход валиден по схеме Pitch" }],
      simplifications: [
        "модель не вызвана: ответ сгенерирован по типу выхода Pitch",
        "промт собран заглушкой, компилятор промтов не подключён",
        "ретраи выключены",
      ],
    },
  },
  { seq: 8, at: 1_700, type: "run_finish", payload: { status: "ok", ms: 700, output: PITCH, outputType: "Pitch" } },
]

export const rendersFixture: Readonly<Record<string, Render>> = {
  render: {
    runId: runFixture.id,
    nodeId: "render",
    input: { best: CHOICE.best, locale: "ru", limit: 3 },
    output: PITCH,
    prompt: PROMPT_TEXT,
  },
}
