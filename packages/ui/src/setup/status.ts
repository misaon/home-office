import type { Doctor } from "@ho/protocol";

/** Docker Engine API level the daemon relies on (Docker Desktop 4.27+ / Engine 25+). */
export const MIN_DOCKER_API = 1.44;

export type StepState = "ok" | "todo" | "error" | "unknown";

export const dockerState = (doctor: Doctor | null): StepState => {
  if (doctor === null) {
    return "unknown";
  }
  if (!doctor.provider.ok) {
    return "error";
  }
  return Number(doctor.provider.apiVersion) >= MIN_DOCKER_API ? "ok" : "error";
};

export const missingImages = (doctor: Doctor): string[] =>
  doctor.images.filter((i) => !i.present).map((i) => i.ref);

export const staleImages = (doctor: Doctor): string[] =>
  doctor.images.filter((i) => i.present && !i.upToDate).map((i) => i.ref);

export const imagesState = (doctor: Doctor | null): StepState => {
  if (doctor === null) {
    return "unknown";
  }
  if (!doctor.provider.ok || !doctor.imageContexts) {
    return "todo";
  }
  return missingImages(doctor).length > 0 || staleImages(doctor).length > 0 ? "todo" : "ok";
};

export const tokenState = (doctor: Doctor | null): StepState => {
  if (doctor === null) {
    return "unknown";
  }
  return doctor.secrets.anthropicOauthToken ? "ok" : "todo";
};

/** True while any step a working office depends on is still open (floors and their teams are separate). */
export const setupNeeded = (doctor: Doctor): boolean =>
  [dockerState, imagesState, tokenState].some((state) => state(doctor) !== "ok");

/** The office can start its first sandbox: the doctor answered and every environment step is done. */
export const setupReady = (doctor: Doctor | null): boolean =>
  doctor !== null && !setupNeeded(doctor);
