import type { Id, IdType, Type } from "./types.js";

export const NODE = Symbol("node");
export const REF = Symbol("ref");

export type Prim = string | number | boolean | null | undefined | Date;
type Seg = string;
export type RefCore = { readonly [REF]: { node: unknown; path: Seg[] } };
type Lift<V> = V extends readonly (infer U)[] ? U[] : V[];
type Fields<T> = T extends readonly (infer E)[]
  ? { readonly $all: { readonly [K in keyof E]-?: Ref<Lift<E[K]>> } }
  : { readonly [K in keyof T]-?: Ref<T[K]> };
export type Ref<T> = RefCore & { readonly __t?: (x: T) => T } & (T extends Prim ? unknown : Fields<T>);

export type Const<T> = { readonly const: T };
export type In<T> = Ref<T> | Const<T>;
export type Slots<I> = { readonly [K in keyof I]: In<I[K]> };

export type Node<O> = { readonly [NODE]: Body; readonly out: Ref<O> };
export type AnyNode = { readonly [NODE]: Body; readonly out: RefCore };
export type Body = { kind: string; [k: string]: unknown };

const star = "[*]";
const seg = (p: PropertyKey): Seg => (p === "$all" ? star : String(p));

const mk = (node: unknown, path: Seg[]): any =>
  new Proxy(Object.create(null), {
    get: (_t, p) => (p === REF ? { node, path } : mk(node, [...path, seg(p)])),
    has: (_t, p) => p === REF,
  });

export const isRef = (v: unknown): v is RefCore => !!v && typeof v === "object" && REF in (v as object);

const node = <O>(body: Body): Node<O> => {
  const self = { [NODE]: body } as { [NODE]: Body; out: Ref<O> };
  (self as any).out = mk(self, ["out"]);
  return self as Node<O>;
};

export type Fn<I, O> = { readonly name: string; readonly __io?: (i: I) => O };
export const tool = <I, O>(id: string, s: { tool: Fn<I, O>; description?: string; effect?: string; ttlSeconds?: number; timeoutMs?: number; out?: Type<O>; in: Slots<I> }) => node<O>({ id, kind: "tool", ...s, tool: s.tool.name, out: s.out?.name });
type IdOf<T> = T extends Id<string> ? T : never;
export type IdsIn<T> = T extends Prim
  ? IdOf<T>
  : T extends readonly (infer E)[]
    ? IdsIn<E>
    : { [K in keyof T]-?: IdsIn<T[K]> }[keyof T];
export type AllowedSet<V> = V extends unknown ? { readonly type: IdType<V>; readonly from: Ref<V[]> } : never;
type AnyIdType = { readonly name: string; readonly kind: "id" };
export type AnyAllowedSet = { readonly type: AnyIdType; readonly from: RefCore };
export type AllowedSets<O> = [IdsIn<O>] extends [never] ? readonly AnyAllowedSet[] : readonly AllowedSet<IdsIn<O>>[];
type NamedType = { readonly name: string };
type SetLiteral = { readonly type: unknown; readonly from: unknown };
const isNamed = (v: unknown): v is NamedType => typeof v === "object" && v !== null && "name" in v;
const isSetLiteral = (v: unknown): v is SetLiteral => typeof v === "object" && v !== null && "type" in v && "from" in v;
const setBody = (v: unknown) => (isSetLiteral(v) ? { type: isNamed(v.type) ? v.type.name : v.type, from: v.from } : v);
const allowedSetBodies = (sets?: readonly unknown[]) => sets?.map(setBody);
export const llm = <I, O>(id: string, s: { fn: Fn<I, O>; description?: string; modelRole?: string; overrides?: object; trustIn?: string; outputContract?: object; allowedSets?: AllowedSets<O>; in: Slots<I> }) => node<O>({ id, kind: "llm", ...s, fn: s.fn.name, allowedSets: allowedSetBodies(s.allowedSets) });
export const code = <I, O>(id: string, s: { fn: Fn<I, O>; description?: string; pure?: boolean; timeoutMs?: number; out?: Type<O>; in: Slots<I> }) => node<O>({ id, kind: "code", ...s, fn: s.fn.name, out: s.out?.name });
export const human = <I, O>(id: string, s: { form: Type<unknown>; description?: string; timeoutSeconds?: number; onTimeout?: string; out: Type<O>; in: Slots<I> }) => node<O>({ id, kind: "human", ...s, form: s.form.name, out: s.out.name });
export type Component<I, O> = { readonly name: string; readonly __io?: (i: I) => O };
export type AnyComponent = Component<never, unknown>;
export type ComponentParams = Readonly<Record<string, AnyComponent | readonly AnyComponent[]>>;
export const call = <I, O>(id: string, s: { component: Component<I, O>; out?: Type<O>; description?: string; typeArgs?: string[]; budget?: object; params?: ComponentParams; in: Slots<I> }) => node<O>({ id, kind: "call", ...s, component: s.component.name, out: s.out?.name });

export const map = <E, O>(id: string, s: { over: Ref<E[]>; itemType: Type<E>; concurrency?: number; onItemError?: string; maxItems?: number; budget?: object; do: (item: Ref<E>) => Node<O> }) => node<O[]>({ id, kind: "map", ...s, itemType: s.itemType.name });
export const branch = <E extends string, O>(id: string, s: { on: Ref<E>; onType: Type<E>; description?: string; cases: { [K in E]: In<O> | Node<O> }; default?: null }) => node<O>({ id, kind: "switch", ...s, onType: s.onType.name });
export const loop = <A, O>(id: string, s: { body: (acc: Ref<A>, iter: Ref<O>) => Node<O>; carry?: In<A>; maxIter: number; select?: string; stopWhen?: (iter: Ref<O>) => Ref<boolean> }) => node<O>({ id, kind: "loop", ...s });

export type Branches<B> = { readonly [K in keyof B]: Node<B[K]> };
export type Join = "all" | "any" | "quorum" | "first_success";
export type JoinOut<J extends Join, B> = J extends "all"
  ? { readonly [K in keyof B]: B[K] }
  : J extends "quorum"
    ? B[keyof B][]
    : B[keyof B];
export type QuorumSize<J extends Join> = J extends "quorum" ? { k: number } : { k?: undefined };
export type OnBranchError<T> =
  | { onBranchError: "fail" | "skip" }
  | { onBranchError: "default"; branchDefault: In<T> };
export type ParallelSpec<B> = { description?: string; branches: Branches<B>; concurrency?: number; budget?: object };
export const parallel = <B extends Record<string, unknown>, J extends Join>(
  id: string,
  s: ParallelSpec<B> & { join: J } & QuorumSize<J> & OnBranchError<B[keyof B]>,
): Node<JoinOut<J, B>> => node<JoinOut<J, B>>({ id, kind: "parallel", ...s });

export type RaceOut<B> = { source: keyof B; value: B[keyof B] };
export const race = <B extends Record<string, unknown>>(id: string, s: { description?: string; branches: Branches<B>; timeoutMs: number; budget?: object }) =>
  node<RaceOut<B>>({ id, kind: "race", ...s });

export type GateWait =
  | { waitFor: "event"; event: string }
  | { waitFor: "human"; assignee: string }
  | { waitFor: "time"; sleepMs: number };
export type OnTimeout<O> =
  | { onTimeout: "fail" }
  | { onTimeout: "default"; timeoutDefault: In<O> }
  | { onTimeout: "escalate"; role: string };
export const gate = <I, O>(
  id: string,
  s: { description?: string; timeoutMs: number; out: Type<O>; in: Slots<I> } & GateWait & OnTimeout<O>,
): Node<O> => node<O>({ id, kind: "gate", ...s, out: s.out.name });

export const attempt = <O, E>(id: string, s: { description?: string; run: Node<O>; errorType: Type<E>; catch: (error: Ref<E>) => Node<O>; retry?: object; finally?: AnyNode }): Node<O> =>
  node<O>({ id, kind: "try", ...s, errorType: s.errorType.name });

export type Flow = { flow: string; version: number; input: string; output: { type: string; from: RefCore }; context?: string[]; budget?: object; policies?: object; defaults?: object; components?: object; nodes: readonly AnyNode[] };
export const defineFlow = (f: Flow) => f;
export type SlotType = { readonly name: string };
export type SlotTypes<D> = { readonly [K in keyof D]: D[K] extends Type<infer T> ? T : unknown };
export type ComponentBody<D, O> = { name: string; in: D; out: { type: string; from: Ref<O> }; nodes: readonly AnyNode[] };
export const defineComponent = <D extends Readonly<Record<string, SlotType | string>>, O>(
  c: ComponentBody<D, O>,
): ComponentBody<D, O> & Component<SlotTypes<D>, O> => c;
export const $const = <T>(v: T): Const<T> => ({ const: v });
export const root = <T>(name: string): Ref<T> => mk(null, [name]);

export { z } from "zod";
export type { Id, IdType, Type, TypeDecl, TypeKind, TypeValue, TypeOptions, EnumType, ListType, ViewDecl, FieldInfo, AllowedSetKind, CodeFormat, IdOptions } from "./types.js";
export { idType, defineType, defineEnum, defineId, view, viewType, listType, ref, schemaOf, declOf, hasSchema, typeRegistry } from "./types.js";
