import { z } from "zod";

export const compact = <T extends object>(
  patch: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } => {
  const kept = Object.entries(patch).filter(([, value]) => value !== undefined);
  /* oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries cannot express the mapped type */
  return Object.fromEntries(kept) as { [K in keyof T]?: Exclude<T[K], undefined> };
};

export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

export const patched = <T extends object>(current: T, patch: Patch<T> | undefined): T =>
  patch === undefined ? current : { ...current, ...compact(patch) };

type PatchSchema<Shape extends Record<string, z.ZodType>> = z.ZodObject<{
  [Key in keyof Shape]: z.ZodOptional<
    Shape[Key] extends z.ZodDefault<infer Inner extends z.ZodType> ? Inner : Shape[Key]
  >;
}>;

export const patchOf = <Shape extends Record<string, z.ZodType>>(
  schema: z.ZodObject<Shape>,
): PatchSchema<Shape> => {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [
      key,
      z.optional(
        field instanceof z.ZodDefault || field instanceof z.ZodPrefault ? field.unwrap() : field,
      ),
    ]),
  );
  /* oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries cannot express the mapped shape */
  return z.object(shape) as PatchSchema<Shape>;
};
