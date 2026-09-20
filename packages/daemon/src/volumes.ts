import type { TaskId } from "@ho/protocol";

const SUFFIX_CHARS = 12;

export const taskVolumeFor = (taskId: TaskId): string => `ho-task-${taskId.slice(-SUFFIX_CHARS)}`;

export const reviewVolumeFor = (taskId: TaskId): string =>
  `ho-review-${taskId.slice(-SUFFIX_CHARS)}`;
