import type { Ir } from "../api/types.js"
import type { RunSnapshot } from "./types.js"

export const testIr: Ir = {
  flow: "hotel_pitch",
  version: 1,
  input: "Request",
  output: { type: "Pitch", from: "$render.out" },
  components: {
    ticket_cascade: {
      name: "ticket_cascade",
      out: { type: "Answer", from: "$cheap.out" },
      nodes: { cheap: { kind: "llm", out: "Answer", description: "дешёвая модель" } },
    },
  },
  nodes: {
    load_hotels: { kind: "tool", out: "Hotel[]", description: "загрузка отелей" },
    triage: {
      kind: "map",
      over: "$load_hotels.out",
      itemType: "Hotel",
      out: "Score[]",
      do: { kind: "call", component: "ticket_cascade", out: "Score", in: { hotel: "$item" } },
    },
    pick: { kind: "code", out: "Choice", description: "выбор лучшего", in: { scores: "$triage.out" } },
    render: {
      kind: "llm",
      out: "Pitch",
      in: {
        best: "$pick.out.best",
        ids: "$load_hotels.out[*].id",
        locale: "$input.locale",
        limit: { const: 3 },
      },
    },
    polish: { kind: "call", component: "critic_revise", out: "Polished", in: { until: "$iter.clean" } },
  },
}

export const testRun: RunSnapshot = {
  input: { locale: "ru", topic: "море" },
  renders: {
    load_hotels: {
      input: {},
      output: [
        { id: "h1", name: "Азимут", price: 5000 },
        { id: "h2", name: "Бриз", price: 7000 },
      ],
    },
    triage: {
      input: {},
      output: [{ score: 0.7 }, { score: 0.9 }],
    },
    pick: {
      input: { scores: [{ score: 0.7 }, { score: 0.9 }] },
      output: { best: { id: "h2", name: "Бриз" }, runnerUp: null },
    },
  },
}
