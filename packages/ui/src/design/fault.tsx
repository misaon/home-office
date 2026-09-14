import type { Doctor } from "@ho/protocol";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { doctorQuery } from "../queries.ts";
import { useUi } from "../store.ts";
import { FaultBody, type Fault } from "./fault-body.tsx";
import { useDesign } from "./store.ts";

/**
 * The screen the office shows when it cannot work at all. The drawing has three of these and each one
 * is wired to a condition the office can actually detect: the daemon refuses this page, the daemon
 * stopped answering, or no container engine is running. Nothing here is shown on a hunch.
 */

/** How long the daemon may be unreachable before the office stops pretending. */
const GRACE_MS = 12_000;

const refused = (rejected: boolean): Fault => ({
  variant: "config",
  kind: "fault.tokenKind",
  title: "fault.tokenTitle",
  body: "fault.tokenBody",
  primary: "fault.tokenPrimary",
  glow: "rgba(255,197,49,.1)",
  iconBg: "rgba(255,197,49,.12)",
  iconFg: "#FFD666",
  iconBd: "rgba(255,197,49,.28)",
  checks: [
    { name: "fault.checkDaemon", state: "fault.stateAnswering", ok: true },
    {
      name: "fault.checkToken",
      state: rejected ? "fault.stateRefused" : "fault.stateMissing",
      ok: false,
    },
  ],
  log: rejected
    ? "the daemon refused this page's token"
    : "no daemon token in this page's storage or launch URL",
});

const unreachable = (): Fault => ({
  variant: "crash",
  kind: "fault.crashKind",
  title: "fault.crashTitle",
  body: "fault.crashBody",
  primary: "fault.crashPrimary",
  glow: "rgba(255,122,122,.1)",
  iconBg: "rgba(255,122,122,.12)",
  iconFg: "#FFB3B3",
  iconBd: "rgba(255,122,122,.28)",
  checks: [
    { name: "fault.checkOnDisk", state: "fault.stateIntact", ok: true },
    { name: "fault.checkStream", state: "fault.stateClosed", ok: false },
  ],
  log: "the daemon stopped answering this page, and every retry since has failed",
});

const noEngine = (doctor: Doctor): Fault | null => {
  if (doctor.provider.ok) {
    return null;
  }
  return {
    variant: "offline",
    kind: "fault.engineKind",
    title: "fault.engineTitle",
    body: "fault.engineBody",
    primary: "fault.enginePrimary",
    glow: "rgba(255,197,49,.09)",
    iconBg: "rgba(255,197,49,.12)",
    iconFg: "#FFD666",
    iconBd: "rgba(255,197,49,.28)",
    checks: [
      { name: "fault.checkData", state: "fault.stateLoaded", ok: true },
      { name: "fault.checkSocket", state: "fault.stateNotFound", ok: false },
      { name: "fault.checkImages", state: "fault.stateCannotVerify", ok: false },
    ],
    log: doctor.provider.message,
  };
};

/** True once the daemon has been gone long enough that a reconnect is no longer the likely story. */
function useGone(since: number | null): boolean {
  const [waited, setWaited] = useState<number | null>(null);
  useEffect(() => {
    if (since === null) {
      return () => undefined;
    }
    const timer = setTimeout(() => {
      setWaited(since);
    }, GRACE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [since]);
  return since !== null && waited === since;
}

/** Eight characters that identify one report: the same fault copies under the same name twice. */
const referenceOf = (log: string): string => {
  let hash = 0x811c9dc5;
  for (const character of log) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/** Whichever of the three the office is actually in, or nothing at all. */
export function FaultScreen(): React.JSX.Element | null {
  const { t } = useTranslation();
  const [at] = useState(() => new Date().toLocaleString());
  const connection = useUi((s) => s.connection);
  const offlineSince = useUi((s) => s.offlineSince);
  const setupOpen = useUi((s) => s.setupOpen);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  const flash = useDesign((s) => s.flash);
  const gone = useGone(offlineSince);
  const { data: doctor } = useQuery({ ...doctorQuery, enabled: connection === "online" });

  const fault =
    connection === "unauthorized" || connection === "rejected"
      ? refused(connection === "rejected")
      : gone
        ? unreachable()
        : doctor === undefined
          ? null
          : noEngine(doctor);

  // The first-run checklist says the same things with more to do about them, and it opens over the
  // office rather than replacing it; while it is up, the fault screen stays out of its way.
  if (fault === null || setupOpen) {
    return null;
  }
  const reference = `Report ${referenceOf(fault.log)} · ${at}`;
  return (
    <FaultBody
      fault={fault}
      reference={reference}
      onSetup={() => {
        setSetupOpen(true);
      }}
      onCopy={() => {
        void navigator.clipboard.writeText(`${reference}\n\n${fault.log}\n`);
        flash(t("fault.copied"));
      }}
    />
  );
}
