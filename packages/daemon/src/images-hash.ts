import { HASH_LABEL, type createDockerApi } from "@ho/sandbox-docker";
import { z } from "zod";

/** Images built outside HO (or by hand) may carry no labels at all; the key is then absent, not null. */
const ImageInspect = z.object({
  Config: z.object({ Labels: z.record(z.string(), z.string()).nullish() }).nullish(),
});

/** Content hash recorded on a local image, "" when the image exists without one, null when absent. */
export async function imageHash(
  api: ReturnType<typeof createDockerApi>,
  ref: string,
): Promise<string | null> {
  const res = await api.maybe("GET", `/images/${encodeURIComponent(ref)}/json`);
  if (res === null) {
    return null;
  }
  return ImageInspect.parse(await res.json()).Config?.Labels?.[HASH_LABEL] ?? "";
}
