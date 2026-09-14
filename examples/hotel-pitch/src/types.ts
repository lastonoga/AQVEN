import { defineEnum, defineId, defineType, listType, view, viewType } from "@wf/dsl";
import type { Component, Fn, Id } from "@wf/dsl";
import { z } from "zod";
import { idValue, schemaOf } from "./schema.js";

export type FeatureId = Id<"FeatureId">;
export type HotelId = Id<"HotelId">;

const featureIdType = defineId<FeatureId>("FeatureId", {
  description: "Идентификатор проверенного факта об отеле; питч вправе ссылаться только на факты из входных данных",
  source: "hotels[].features[].id",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const hotelIdType = defineId<HotelId>("HotelId", {
  description: "Идентификатор отеля в каталоге туроператора",
  source: "db.hotels",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const beachEntryType = defineEnum(
  "BeachEntry",
  {
    sand: "Песчаный пологий вход: можно заходить с детьми без специальной обуви",
    pebble: "Галечный вход: нужна обувь для купания, вода прозрачнее",
    pontoon: "Вход только с понтона: у берега мелко или камни",
    rocks: "Скалы или риф: спуск по лестнице, для плавающих уверенно",
  },
  "Тип входа в море на пляже отеля",
);

const pitchDecisionType = defineEnum(
  "PitchDecision",
  {
    accept: "Питч готов к отправке клиенту: факты сходятся, тон уместен",
    revise: "Питч по сути верен, но требует правки текста или фактов перед отправкой",
    escalate: "Питч отправлять нельзя: конфликт фактов или риск обещания, которого отель не даёт",
  },
  "Решение судьи по лучшему питчу подборки",
);

export type BeachEntry = (typeof beachEntryType.values)[number];
export type PitchDecision = (typeof pitchDecisionType.values)[number];

export type Feature = { id: FeatureId; text: string };
export type Hotel = { id: HotelId; name: string; stars: number; beach_entry: BeachEntry; features: Feature[] };
export type HotelScore = { hotel_id: HotelId; score: number };
export type Filters = { city: string; nights: number };
export type TourRequest = { filters: Filters; nights: number; budget: number };
export type Pitch = { title: string; body: string; featureIds: FeatureId[] };
export type PitchText = { text: string };
export type PitchVerdict = { decision: PitchDecision; best: Pitch; why: string };
export type PitchReview = { verdict: PitchDecision; comment: string; publish: boolean };

const featureSchema: z.ZodType<Feature> = z.object({
  id: schemaOf(featureIdType).describe("Идентификатор факта, на который ссылается питч"),
  text: z.string().describe("Формулировка факта в том виде, в каком её можно показать клиенту"),
});

const featureExample: Feature = {
  id: idValue<FeatureId>("ft-heated-pool"),
  text: "Крытый бассейн с подогревом до 28 °C работает с ноября по апрель",
};

const featureType = defineType("Feature", {
  schema: featureSchema,
  description: "Проверенный факт об отеле: одна формулировка, на которую разрешено ссылаться в питче",
  example: featureExample,
});

const hotelSchema: z.ZodType<Hotel> = z.object({
  id: schemaOf(hotelIdType).describe("Идентификатор отеля"),
  name: z.string().describe("Название отеля с категорией, как в каталоге туроператора"),
  stars: z.int().describe("Категория отеля в звёздах, от 1 до 5"),
  beach_entry: schemaOf(beachEntryType).describe("Тип входа в море на собственном пляже отеля"),
  features: z.array(schemaOf(featureType)).describe("Проверенные факты об отеле, источник цитат для питча"),
});

const hotelExample: Hotel = {
  id: idValue<HotelId>("htl-lara-beach-01"),
  name: "Lara Beach Resort & Spa 5*",
  stars: 5,
  beach_entry: "sand",
  features: [
    featureExample,
    {
      id: idValue<FeatureId>("ft-kids-club"),
      text: "Детский клуб с русскоязычными аниматорами, возраст 4–12 лет, работает без перерыва",
    },
  ],
};

const hotelType = defineType("Hotel", {
  schema: hotelSchema,
  description: "Отель-кандидат подборки: карточка из каталога вместе с проверенными фактами",
  example: hotelExample,
});

const hotelBriefType = viewType(hotelType, view("brief", ["name", "stars", "beach_entry"] as const));

const hotelScoreSchema: z.ZodType<HotelScore> = z.object({
  hotel_id: schemaOf(hotelIdType).describe("Отель, которому выставлена оценка"),
  score: z.number().describe("Соответствие отеля заявке, от 0 до 1; 1 — попадает во все требования"),
});

const hotelScoreExample: HotelScore = { hotel_id: idValue<HotelId>("htl-lara-beach-01"), score: 0.87 };

const hotelScoreType = defineType("HotelScore", {
  schema: hotelScoreSchema,
  description: "Оценка одного отеля относительно заявки клиента",
  example: hotelScoreExample,
});

const filtersSchema: z.ZodType<Filters> = z.object({
  city: z.string().describe("Курорт или город, куда летит клиент"),
  nights: z.int().describe("Число ночей в отеле"),
});

const filtersExample: Filters = { city: "Анталия", nights: 7 };

const filtersType = defineType("Filters", {
  schema: filtersSchema,
  description: "Фильтры подбора отелей: куда и на сколько",
  example: filtersExample,
});

const tourRequestSchema: z.ZodType<TourRequest> = z.object({
  filters: schemaOf(filtersType).describe("Фильтры подбора отелей"),
  nights: z.int().describe("Число ночей в туре"),
  budget: z.int().describe("Бюджет клиента на весь тур в рублях, без учёта перелёта"),
});

const tourRequestExample: TourRequest = { filters: filtersExample, nights: 7, budget: 180_000 };

const tourRequestType = defineType("TourRequest", {
  schema: tourRequestSchema,
  description: "Заявка клиента на подбор тура: вход воркфлоу hotel_pitch",
  example: tourRequestExample,
});

const pitchSchema: z.ZodType<Pitch> = z.object({
  title: z.string().describe("Заголовок питча: одна строка, без восклицательных знаков"),
  body: z.string().describe("Текст питча для клиента: три-четыре предложения, только факты из featureIds"),
  featureIds: z
    .array(schemaOf(featureIdType))
    .describe("Факты, на которые опирается текст; допустимы только идентификаторы из входных отелей"),
});

const pitchExample: Pitch = {
  title: "Семь ночей в Ларе: песчаный вход и бассейн с подогревом",
  body: "Lara Beach Resort стоит на первой линии с пологим песчаным входом — заходить в море можно с детьми. Крытый бассейн греют до 28 °C с ноября по апрель, так что купаться получится и в межсезонье. Детский клуб работает без перерыва, аниматоры говорят по-русски.",
  featureIds: [idValue<FeatureId>("ft-heated-pool"), idValue<FeatureId>("ft-kids-club")],
};

const pitchType = defineType("Pitch", {
  schema: pitchSchema,
  description: "Питч подборки: текст для клиента и список фактов, на которые он опирается",
  example: pitchExample,
});

const pitchTextSchema: z.ZodType<PitchText> = z.object({
  text: z.string().describe("Готовый текст письма клиенту: факты уже подставлены по featureIds"),
});

const pitchTextExample: PitchText = {
  text: "Семь ночей в Ларе: песчаный вход и бассейн с подогревом\n\nLara Beach Resort & Spa 5* стоит на первой линии с пологим песчаным входом. Крытый бассейн греют до 28 °C с ноября по апрель. Детский клуб работает без перерыва, аниматоры говорят по-русски.",
};

const pitchTextType = defineType("PitchText", {
  schema: pitchTextSchema,
  description: "Отрендеренный питч: выход воркфлоу hotel_pitch",
  example: pitchTextExample,
});

const pitchVerdictSchema: z.ZodType<PitchVerdict> = z.object({
  decision: schemaOf(pitchDecisionType).describe("Решение судьи по лучшему питчу"),
  best: schemaOf(pitchType).describe("Питч, победивший в попарном сравнении"),
  why: z.string().describe("Обоснование решения: чем победитель лучше и что мешает принять его как есть"),
});

const pitchVerdictExample: PitchVerdict = {
  decision: "revise",
  best: pitchExample,
  why: "Текст точен по фактам, но обещает «тёплое море в ноябре» — этого нет ни в одном факте отеля, строку нужно убрать.",
};

const pitchVerdictType = defineType("PitchVerdict", {
  schema: pitchVerdictSchema,
  description: "Вердикт судейского сравнения питчей: решение, победитель и обоснование",
  example: pitchVerdictExample,
});

const pitchReviewSchema: z.ZodType<PitchReview> = z.object({
  verdict: schemaOf(pitchDecisionType).describe("Решение менеджера по питчу"),
  comment: z.string().describe("Комментарий менеджера: что именно поправить перед отправкой клиенту"),
  publish: z.boolean().describe("Отправлять ли питч клиенту сразу после правок"),
});

const pitchReviewExample: PitchReview = {
  verdict: "revise",
  comment: "Убрать обещание тёплого моря в ноябре, оставить бассейн с подогревом.",
  publish: false,
};

const pitchReviewFormType = defineType<unknown>("PitchReviewForm", {
  schema: pitchReviewSchema,
  description: "Форма ручного разбора питча: что менеджер решает и какой комментарий оставляет",
  example: pitchReviewExample,
});

const intType = defineType("Int", {
  schema: z.int().describe("Целое число"),
  description: "Целое число",
  example: 3,
  kind: "value",
});

const scoreType = defineType("Score", {
  schema: z.number().describe("Оценка от 0 до 1, где 1 — полное соответствие"),
  description: "Оценка от 0 до 1, где 1 — полное соответствие",
  example: 0.87,
  kind: "value",
});

export const t = {
  FeatureId: featureIdType,
  HotelId: hotelIdType,
  BeachEntry: beachEntryType,
  Feature: featureType,
  Hotel: hotelType,
  HotelBrief: hotelBriefType,
  HotelArr: listType(hotelType),
  HotelScore: hotelScoreType,
  HotelScoreArr: listType(hotelScoreType),
  Filters: filtersType,
  TourRequest: tourRequestType,
  Pitch: pitchType,
  PitchArr: listType(pitchType),
  PitchText: pitchTextType,
  PitchVerdict: pitchVerdictType,
  PitchDecision: pitchDecisionType,
  PitchReviewForm: pitchReviewFormType,
  Int: intType,
  Score: scoreType,
};

export const hotelsByFilters: Fn<{ filters: Filters }, Hotel[]> = { name: "hotelsByFilters" };
export const pickTopK: Fn<{ scores: HotelScore[]; hotels: Hotel[]; k: number }, Hotel[]> = { name: "pickTopK" };
export const renderPitch: Fn<{ pitch: Pitch; hotels: Hotel[] }, PitchText> = { name: "renderPitch" };
export const scoreHotel: Fn<{ hotel: Hotel; request: TourRequest }, HotelScore> = { name: "score_hotel" };
export const pitchGenFn: Fn<{ hotels: Hotel[]; request: TourRequest }, Pitch> = { name: "pitch_gen" };
export const diverge: Component<{ hotels: Hotel[]; request: TourRequest; n: number; vary: object }, Pitch[]> = { name: "diverge" };
export const judge: Component<{ candidates: Pitch[]; request: TourRequest; mode: string; swapPositions: boolean; modelRole: string }, PitchVerdict> = { name: "judge" };
export const criticLoop: Component<{ pitch: Pitch; request: TourRequest; maxIter: number; threshold: number; select: string; modelRole: string }, Pitch> = { name: "critic_loop" };
