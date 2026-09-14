import { z } from "zod";

export type Id<Name extends string> = string & { readonly __id: Name };

export type TypeKind = "record" | "enum" | "id" | "list" | "value";
export type AllowedSetKind = "static" | "dynamic";
export type CodeFormat = "identity" | "prefixed_ordinal";

export type FieldInfo = {
  readonly name: string;
  readonly description: string;
  readonly nullable: boolean;
};

export type ViewDecl<N extends string = string, F extends string = string> = {
  readonly name: N;
  readonly fields: readonly F[];
  readonly labels?: Readonly<Record<F, string>>;
};

export type TypeDecl<T> = {
  readonly name: string;
  readonly kind: TypeKind;
  readonly description: string;
  readonly schema: z.ZodType<T>;
  readonly fields?: readonly FieldInfo[];
  readonly example?: T;
  readonly values?: Readonly<Record<string, string>>;
  readonly views?: Readonly<Record<string, ViewDecl>>;
  readonly viewOf?: string;
  readonly item?: string;
  readonly source?: string;
  readonly allowedSet?: AllowedSetKind;
  readonly codeFormat?: CodeFormat;
};

export type Type<T> = { readonly name: string; readonly __t?: (x: T) => T; readonly decl?: TypeDecl<T> };
export type IdType<T> = Type<T> & { readonly kind: "id" };
export type EnumType<V extends string> = Type<V> & {
  readonly kind: "enum";
  readonly values: readonly V[];
  readonly descriptions: Readonly<Record<V, string>>;
};
export type ListType<T> = Type<T[]> & { readonly kind: "list"; readonly item: Type<T> };

export type TypeOptions<T> = {
  readonly schema: z.ZodType<T>;
  readonly description: string;
  readonly example?: T;
  readonly kind?: TypeKind;
  readonly views?: readonly ViewDecl<string, Extract<keyof T, string>>[];
};

export type IdOptions = {
  readonly description?: string;
  readonly source?: string;
  readonly allowedSet?: AllowedSetKind;
  readonly codeFormat?: CodeFormat;
};

const registry = new Map<string, TypeDecl<unknown>>();

export const typeRegistry = {
  get: (name: string): TypeDecl<unknown> | undefined => registry.get(name),
  has: (name: string): boolean => registry.has(name),
  names: (): readonly string[] => [...registry.keys()],
  all: (): readonly TypeDecl<unknown>[] => [...registry.values()],
};

export type TypeValue<X> = X extends Type<infer T> ? T : never;

export const declOf = <T>(type: Type<T>): TypeDecl<T> | undefined => type.decl;
export const hasSchema = <T>(type: Type<T>): boolean => type.decl !== undefined;

const fail = (name: string, reason: string): never => {
  throw new Error(`тип «${name}»: ${reason}`);
};

export const schemaOf = <T>(type: Type<T>): z.ZodType<T> =>
  type.decl?.schema ?? fail(type.name, "схема не объявлена; тип создан заглушкой ty(...)");

export const ref = <T>(type: Type<T>, description?: string): z.ZodType<T> =>
  description ? schemaOf(type).describe(description) : schemaOf(type);

const register = <T>(decl: TypeDecl<T>): TypeDecl<T> => {
  registry.set(decl.name, decl);
  return decl;
};

const objectShape = (schema: z.ZodType): Readonly<Record<string, z.ZodType>> | undefined =>
  schema instanceof z.ZodObject ? (schema.shape as Readonly<Record<string, z.ZodType>>) : undefined;

const innerOf = (schema: z.ZodType): z.ZodType | undefined => (schema.def as { innerType?: z.ZodType }).innerType;

const describedText = (schema: z.ZodType): string => schema.description ?? innerOf(schema)?.description ?? "";

const isNullable = (schema: z.ZodType): boolean => schema.def.type === "nullable";

const checkField = (name: string, key: string, field: z.ZodType): FieldInfo => {
  if (field.def.type === "optional") fail(name, `поле «${key}» объявлено через .optional(); в реестре допустим только .nullable()`);
  const description = describedText(field);
  if (!description) fail(name, `поле «${key}» без описания; добавьте .describe(...)`);
  return { name: key, description, nullable: isNullable(field) };
};

const fieldsOf = (name: string, schema: z.ZodType): readonly FieldInfo[] | undefined => {
  const shape = objectShape(schema);
  if (!shape) return undefined;
  return Object.entries(shape).map(([key, field]) => checkField(name, key, field));
};

const checkViewFields = (name: string, viewName: string, fields: readonly string[], known: readonly FieldInfo[]): void => {
  const keys = new Set(known.map((field) => field.name));
  const unknown = fields.filter((field) => !keys.has(field));
  if (unknown.length > 0) fail(name, `представление «${viewName}» ссылается на несуществующие поля: ${unknown.join(", ")}`);
};

const viewsOf = (
  name: string,
  views: readonly ViewDecl[] | undefined,
  fields: readonly FieldInfo[] | undefined,
): Readonly<Record<string, ViewDecl>> | undefined => {
  if (!views || views.length === 0) return undefined;
  if (!fields) return fail(name, "представления объявлены у типа, который не является записью");
  views.forEach((v) => checkViewFields(name, v.name, v.fields, fields));
  return Object.fromEntries(views.map((v) => [v.name, v]));
};

const withExample = <T>(name: string, schema: z.ZodType<T>, example: T | undefined): z.ZodType<T> => {
  if (example === undefined) return schema;
  const checked = schema.safeParse(example);
  if (!checked.success) fail(name, `пример не проходит собственную схему\n${z.prettifyError(checked.error)}`);
  return schema.meta({ examples: [example] });
};

const defaultKind = (schema: z.ZodType): TypeKind => (schema.def.type === "array" ? "list" : "record");

export const defineType = <T>(name: string, options: TypeOptions<T>): Type<T> => {
  if (!name) fail("<без имени>", "имя типа обязательно");
  if (!options.description) fail(name, "описание типа обязательно");
  const fields = fieldsOf(name, options.schema);
  const schema = withExample(name, options.schema.describe(options.description), options.example);
  const decl = register<T>({
    name,
    kind: options.kind ?? defaultKind(options.schema),
    description: options.description,
    schema,
    fields,
    example: options.example,
    views: viewsOf(name, options.views, fields),
  });
  return { name, decl };
};

export const defineEnum = <V extends string>(
  name: string,
  values: Readonly<Record<V, string>>,
  description = "",
): EnumType<V> => {
  const options = Object.keys(values) as V[];
  if (options.length === 0) fail(name, "enum без значений");
  const undescribed = options.filter((value) => !values[value]);
  if (undescribed.length > 0) fail(name, `значения enum без описания: ${undescribed.join(", ")}`);
  const schema = z.enum(options).describe(description || name);
  const decl = register<V>({ name, kind: "enum", description, schema, values });
  return { name, kind: "enum", values: options, descriptions: values, decl };
};

export const defineId = <T extends Id<string>>(name: string, options: IdOptions = {}): IdType<T> => {
  const description = options.description ?? `Идентификатор «${name}»`;
  const schema = z.string().describe(description) as unknown as z.ZodType<T>;
  const decl = register<T>({
    name,
    kind: "id",
    description,
    schema,
    source: options.source,
    allowedSet: options.allowedSet ?? "dynamic",
    codeFormat: options.codeFormat ?? "identity",
  });
  return { name, kind: "id", decl };
};

export const idType = <T extends Id<string>>(name: string): IdType<T> => ({ name, kind: "id" });

export const view = <N extends string, F extends string>(
  name: N,
  fields: readonly F[],
  labels?: Readonly<Record<F, string>>,
): ViewDecl<N, F> => ({ name, fields, labels });

const pickMask = (fields: readonly string[]): Record<string, true> =>
  Object.fromEntries(fields.map((field) => [field, true as const]));

export const viewType = <T, F extends Extract<keyof T, string>>(type: Type<T>, v: ViewDecl<string, F>): Type<Pick<T, F>> => {
  const base = type.decl;
  const name = `${type.name}/${v.name}`;
  if (!base) return fail(name, `у типа «${type.name}» схема не объявлена, представление строить не из чего`);
  const shape = objectShape(base.schema);
  if (!shape) return fail(name, `тип «${type.name}» не запись, представление невозможно`);
  checkViewFields(name, v.name, v.fields, base.fields ?? []);
  const picked = (base.schema as z.ZodObject).pick(pickMask(v.fields)) as unknown as z.ZodType<Pick<T, F>>;
  const fields = (base.fields ?? []).filter((field) => v.fields.includes(field.name as F));
  const decl = register<Pick<T, F>>({
    name,
    kind: "record",
    description: base.description,
    schema: picked,
    fields: v.labels ? fields.map((field) => ({ ...field, description: v.labels?.[field.name as F] ?? field.description })) : fields,
    viewOf: type.name,
  });
  return { name, decl };
};

export const listType = <T>(item: Type<T>, name = `${item.name}[]`): ListType<T> => {
  const base = item.decl;
  if (!base) return { name, kind: "list", item };
  const decl = register<T[]>({
    name,
    kind: "list",
    description: `Список: ${base.description}`,
    schema: z.array(base.schema),
    item: item.name,
  });
  return { name, kind: "list", item, decl };
};
