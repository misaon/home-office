import type { Doctor } from "@ho/protocol";
import type { TFunction } from "i18next";

/** Docker Engine API level the daemon relies on (Docker Desktop 4.27+ / Engine 25+). */
const MIN_DOCKER_API = 1.44;

type StepState = "ok" | "todo" | "error" | "unknown";
export type StepStatus = { state: StepState; text: string };

export const dockerStatus = (doctor: Doctor | null, t: TFunction): StepStatus => {
  if (doctor === null) {
    return { state: "unknown", text: t("common.checking") };
  }
  if (!doctor.provider.ok) {
    return { state: "error", text: doctor.provider.message };
  }
  const api = Number(doctor.provider.apiVersion);
  return api >= MIN_DOCKER_API
    ? {
        state: "ok",
        text: t("setup.dockerOk", {
          version: doctor.provider.version,
          api: doctor.provider.apiVersion,
          os: doctor.provider.os,
          arch: doctor.provider.arch,
        }),
      }
    : {
        state: "error",
        text: t("setup.dockerOld", {
          api: doctor.provider.apiVersion,
          min: String(MIN_DOCKER_API),
        }),
      };
};

export const imagesStatus = (doctor: Doctor | null, t: TFunction): StepStatus => {
  if (doctor === null) {
    return { state: "unknown", text: t("common.checking") };
  }
  if (!doctor.provider.ok) {
    return { state: "todo", text: t("setup.imagesWaiting") };
  }
  if (!doctor.imageContexts) {
    return { state: "todo", text: t("setup.imagesNoContexts") };
  }
  const missing = doctor.images.filter((i) => !i.present).map((i) => i.ref);
  const stale = doctor.images.filter((i) => i.present && !i.upToDate).map((i) => i.ref);
  if (missing.length > 0) {
    return { state: "todo", text: t("setup.imagesMissing", { refs: missing.join(", ") }) };
  }
  if (stale.length > 0) {
    return { state: "todo", text: t("setup.imagesStale", { refs: stale.join(", ") }) };
  }
  return { state: "ok", text: doctor.images.map((i) => i.ref).join(", ") };
};

export const tokenStatus = (doctor: Doctor | null, t: TFunction): StepStatus =>
  doctor === null
    ? { state: "unknown", text: t("common.checking") }
    : doctor.secrets.anthropicOauthToken
      ? { state: "ok", text: t("setup.tokenStored") }
      : { state: "todo", text: t("setup.tokenMissing") };

/**
 * True while any step a working office depends on is still open (floors and their teams are separate).
 * The states are what matters here, so the texts are asked for in the fallback language.
 */
export const setupNeeded = (doctor: Doctor, t: TFunction): boolean =>
  [dockerStatus(doctor, t), imagesStatus(doctor, t), tokenStatus(doctor, t)].some(
    (s) => s.state !== "ok",
  );
