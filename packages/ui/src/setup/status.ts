import type { Doctor } from "@ho/protocol";
import type { Snapshot } from "../store.ts";

/** Docker Engine API level the daemon relies on (Docker Desktop 4.27+ / Engine 25+). */
const MIN_DOCKER_API = 1.44;

type StepState = "ok" | "todo" | "error" | "unknown";
export type StepStatus = { state: StepState; text: string };

export const dockerStatus = (doctor: Doctor | null): StepStatus => {
  if (doctor === null) {
    return { state: "unknown", text: "checking…" };
  }
  if (!doctor.provider.ok) {
    return { state: "error", text: doctor.provider.message };
  }
  const api = Number(doctor.provider.apiVersion);
  return api >= MIN_DOCKER_API
    ? {
        state: "ok",
        text: `Docker ${doctor.provider.version}, API ${doctor.provider.apiVersion}, ${doctor.provider.os}/${doctor.provider.arch}`,
      }
    : {
        state: "error",
        text: `Docker API ${doctor.provider.apiVersion} is too old; ${String(MIN_DOCKER_API)} or newer is required`,
      };
};

export const imagesStatus = (doctor: Doctor | null): StepStatus => {
  if (doctor === null) {
    return { state: "unknown", text: "checking…" };
  }
  if (!doctor.provider.ok) {
    return { state: "todo", text: "waiting for Docker" };
  }
  const missing = doctor.images.filter((i) => !i.present).map((i) => i.ref);
  const stale = doctor.images.filter((i) => i.present && !i.upToDate).map((i) => i.ref);
  if (missing.length > 0) {
    return { state: "todo", text: `missing: ${missing.join(", ")}` };
  }
  if (stale.length > 0) {
    return { state: "todo", text: `out of date: ${stale.join(", ")}` };
  }
  return { state: "ok", text: doctor.images.map((i) => i.ref).join(", ") };
};

export const tokenStatus = (doctor: Doctor | null): StepStatus =>
  doctor === null
    ? { state: "unknown", text: "checking…" }
    : doctor.secrets.anthropicOauthToken
      ? { state: "ok", text: "stored in the Keychain" }
      : { state: "todo", text: "no Claude subscription token yet" };

export const teamStatus = (snapshot: Snapshot): StepStatus => {
  const agents = [...snapshot.agents.values()];
  const boss = agents.find((a) => a.role === "boss");
  return boss === undefined
    ? { state: "todo", text: "the office has no boss" }
    : {
        state: "ok",
        text: `${boss.name} runs the office with ${String(agents.length - 1)} colleague(s)`,
      };
};

/** True while any step a working office depends on is still open. */
export const setupNeeded = (doctor: Doctor, snapshot: Snapshot): boolean =>
  [dockerStatus(doctor), imagesStatus(doctor), tokenStatus(doctor), teamStatus(snapshot)].some(
    (s) => s.state !== "ok",
  );
