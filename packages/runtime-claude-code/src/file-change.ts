import { fileChangeEvent, type RuntimeEvent } from "@ho/protocol";
import { z } from "zod";

const EditResult = z.object({
  filePath: z.string(),
  oldString: z.string(),
  newString: z.string(),
  originalFile: z.string(),
  replaceAll: z.boolean().optional(),
});

const WriteResult = z.object({
  filePath: z.string(),
  content: z.string(),
  originalFile: z.string().nullable().optional(),
});

const applyEdit = (edit: z.infer<typeof EditResult>): string =>
  edit.replaceAll === true
    ? edit.originalFile.replaceAll(edit.oldString, () => edit.newString)
    : edit.originalFile.replace(edit.oldString, () => edit.newString);

export function fileChangeOf(toolUseId: string, result: unknown): RuntimeEvent | null {
  if (typeof result !== "object" || result === null) {
    return null;
  }
  const edit = EditResult.safeParse(result);
  if (edit.success) {
    return fileChangeEvent(
      toolUseId,
      edit.data.filePath,
      edit.data.originalFile,
      applyEdit(edit.data),
    );
  }
  const write = WriteResult.safeParse(result);
  if (write.success) {
    const before = write.data.originalFile ?? null;
    return fileChangeEvent(
      toolUseId,
      write.data.filePath,
      before === "" ? null : before,
      write.data.content,
    );
  }
  return null;
}
