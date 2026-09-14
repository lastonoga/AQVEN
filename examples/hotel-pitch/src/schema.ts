import { declOf } from "@wf/dsl";
import type { Id, Type } from "@wf/dsl";
import type { z } from "zod";

export const schemaOf = <T>(type: Type<T>): z.ZodType<T> => {
  const decl = declOf(type);
  if (!decl) throw new Error(`тип «${type.name}» объявлен без схемы`);
  return decl.schema;
};

export const idValue = <T extends Id<string>>(value: string): T => value as T;
