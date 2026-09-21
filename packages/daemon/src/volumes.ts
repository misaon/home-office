import type { ProjectId, TaskId } from "@ho/protocol";

const SUFFIX_CHARS = 12;

export const CACHE_IN_VOLUME = "/work/.cache";

export const cacheVolumeFor = (projectId: ProjectId): string =>
  `ho-cache-${projectId.slice(-SUFFIX_CHARS)}`;

export const taskVolumeFor = (taskId: TaskId): string => `ho-task-${taskId.slice(-SUFFIX_CHARS)}`;

export const reviewVolumeFor = (taskId: TaskId): string =>
  `ho-review-${taskId.slice(-SUFFIX_CHARS)}`;
