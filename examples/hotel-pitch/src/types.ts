import type { Type, Fn, Component, Id, IdType } from "@wf/dsl";
import { idType } from "@wf/dsl";
export type FeatureId = Id<"FeatureId">;
export type Feature = { id: FeatureId; text: string };
export type Hotel = { id: string; name: string; stars: number; beach_entry: string; features: Feature[] };
export type HotelScore = { hotel_id: string; score: number };
export type Filters = { city: string; nights: number };
export type TourRequest = { filters: Filters; nights: number; budget: number };
export type Pitch = { title: string; body: string; featureIds: FeatureId[] };
export type PitchText = { text: string };
export type PitchDecision = "accept" | "revise" | "escalate";
export type PitchVerdict = { decision: PitchDecision; best: Pitch; why: string };
const ty = <T>(name: string): Type<T> => ({ name });
const featureId: IdType<FeatureId> = idType<FeatureId>("FeatureId");
export const t = { FeatureId: featureId, Hotel: ty<Hotel>("Hotel"), HotelArr: ty<Hotel[]>("Hotel[]"), HotelScoreArr: ty<HotelScore[]>("HotelScore[]"),
  Pitch: ty<Pitch>("Pitch"), PitchArr: ty<Pitch[]>("Pitch[]"), PitchText: ty<PitchText>("PitchText"),
  PitchVerdict: ty<PitchVerdict>("PitchVerdict"), PitchDecision: ty<PitchDecision>("PitchDecision"),
  PitchReviewForm: ty<unknown>("PitchReviewForm"), Int: ty<number>("Int"), Score: ty<number>("Score") };
export const hotelsByFilters: Fn<{ filters: Filters }, Hotel[]> = { name: "hotelsByFilters" };
export const pickTopK: Fn<{ scores: HotelScore[]; hotels: Hotel[]; k: number }, Hotel[]> = { name: "pickTopK" };
export const renderPitch: Fn<{ pitch: Pitch; hotels: Hotel[] }, PitchText> = { name: "renderPitch" };
export const scoreHotel: Fn<{ hotel: Hotel; request: TourRequest }, HotelScore> = { name: "score_hotel" };
export const pitchGenFn: Fn<{ hotels: Hotel[]; request: TourRequest }, Pitch> = { name: "pitch_gen" };
export const diverge: Component<{ hotels: Hotel[]; request: TourRequest; n: number; vary: object }, Pitch[]> = { name: "diverge" };
export const judge: Component<{ candidates: Pitch[]; request: TourRequest; mode: string; swapPositions: boolean; modelRole: string }, PitchVerdict> = { name: "judge" };
export const criticLoop: Component<{ pitch: Pitch; request: TourRequest; maxIter: number; threshold: number; select: string; modelRole: string }, Pitch> = { name: "critic_loop" };
