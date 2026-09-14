import { defineFlow, defineComponent, tool, llm, code, call, human, map, branch, root, $const } from "@wf/dsl";
import type { Hotel, TourRequest } from "./types.js";
import { t, hotelsByFilters, pickTopK, renderPitch, scoreHotel, pitchGenFn, diverge, judge, criticLoop } from "./types.js";

const $p = root<{ hotels: Hotel[]; request: TourRequest }>("in");

const gen = llm("gen", {
  description: "Генерация питча по трём отелям", fn: pitchGenFn, modelRole: "writer",
  overrides: { maxOutputTokens: 1200 }, trustIn: "trusted",
  allowedSets: [{ type: t.FeatureId, from: $p.hotels.$all.features.$all.id }],
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { hotels: $p.hotels, request: $p.request },
});

export const pitchGen = defineComponent({
  name: "pitch_gen", in: { hotels: t.HotelArr, request: "TourRequest" },
  out: { type: "Pitch", from: gen.out }, nodes: [gen],
});

const $input = root<TourRequest>("input");

const load_hotels = tool("load_hotels", {
  description: "Отели по фильтрам заявки", tool: hotelsByFilters, effect: "read",
  ttlSeconds: 3600, timeoutMs: 10_000, out: t.HotelArr, in: { filters: $input.filters },
});

const score_hotels = map("score_hotels", {
  over: load_hotels.out, itemType: t.Hotel, concurrency: 8, onItemError: "skip",
  maxItems: 200, budget: { usdMicros: 80_000 },
  do: (hotel) => llm("score", {
    fn: scoreHotel, modelRole: "small_fast", overrides: { seed: 7, maxOutputTokens: 400 },
    outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
    trustIn: "trusted", in: { hotel, request: $input },
  }),
});

const top3 = code("top3", {
  description: "Топ-3 отеля по оценкам", fn: pickTopK, pure: true, timeoutMs: 5_000, out: t.HotelArr,
  in: { scores: score_hotels.out, hotels: load_hotels.out, k: $const(3) },
});

const pitches = call("pitches", {
  description: "Три питча с разной температурой", component: diverge, typeArgs: ["Pitch"],
  params: { body: pitchGen }, out: t.PitchArr,
  in: { hotels: top3.out, request: $input, n: $const(3), vary: $const({ temperature: [0.4, 0.8, 1.1] }) },
});

const pick = call("pick", {
  description: "Попарное сравнение с перестановкой позиций", component: judge,
  typeArgs: ["Pitch"], out: t.PitchVerdict,
  in: { candidates: pitches.out, request: $input, mode: $const("pairwise"),
    swapPositions: $const(true), modelRole: $const("judge_strong") },
});

const fix = call("fix", {
  description: "Критика и правка до порога оценки", component: criticLoop, typeArgs: ["Pitch"],
  out: t.Pitch, budget: { usdMicros: 100_000 },
  in: { pitch: pick.out.best, request: $input, maxIter: $const(2), threshold: $const(0.8),
    select: $const("best"), modelRole: $const("writer") },
});

const review = human("review", {
  description: "Ручной разбор конфликта фактов", form: t.PitchReviewForm,
  timeoutSeconds: 86_400, onTimeout: "escalate", out: t.Pitch,
  in: { pitch: pick.out.best, verdict: pick.out },
});

const final_pitch = branch("final_pitch", {
  description: "Решение судьи", on: pick.out.decision, onType: t.PitchDecision, default: null,
  cases: { accept: pick.out.best, revise: fix, escalate: review },
});

const render = code("render", {
  description: "Подстановка фактов отелей по FeatureId", fn: renderPitch, pure: true,
  timeoutMs: 5_000, out: t.PitchText, in: { pitch: final_pitch.out, hotels: load_hotels.out },
});

export default defineFlow({
  flow: "hotel_pitch", version: 7, input: "TourRequest",
  output: { type: "PitchText", from: render.out },
  context: ["date", "locale"],
  budget: { usdMicros: 400_000, seconds: 120, tokens: null },
  policies: { visibility: { divergeBranches: "isolated", judgeSeesProvenance: false },
    trust: { defaultIn: "trusted" }, pii: { maskInTraces: true, allowlistProfile: "pii_safe" },
    escalation: { role: "manager" } },
  defaults: { retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full",
      retryOn: ["timeout", "rate_limit", "server_error"] }, timeoutMs: 60_000 },
  components: { pitchGen },
  nodes: [load_hotels, score_hotels, top3, pitches, pick, fix, review, final_pitch, render],
});
