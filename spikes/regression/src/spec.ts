import { z } from "zod";

const Request = z.object({ key: z.string().min(1).max(40), text: z.string().min(1) });

export const Spec = z.object({ requests: z.array(Request).min(1) });
export type Spec = z.infer<typeof Spec>;

export async function readSpec(path: string): Promise<Spec> {
  const raw: unknown = await Bun.file(path).json();
  return Spec.parse(raw);
}
