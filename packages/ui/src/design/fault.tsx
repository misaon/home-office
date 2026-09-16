import type { Doctor } from "@ho/protocol";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { doctorQuery } from "../queries.ts";
import { useUi } from "../store.ts";
import { FaultBody, type Fault } from "./fault-body.tsx";
import { useDesign } from "./store.ts";

const GRACE_MS = 12_000;

const refused = (rejected: boolean): Fault => ({
  variant: "config",
  kind: "fault.tokenKind",
  title: "fault.tokenTitle",
  body: "fault.tokenBody",
  primary: "fault.tokenPrimary",
  glow: "--color-accent-a10",
  tile: "bg-accent-a12 text-accent-soft border-accent-a28",
  ink: "text-accent-soft",
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
  glow: "--color-bad-a10",
  tile: "bg-bad-a12 text-bad-soft border-bad-a28",
  ink: "text-bad-soft",
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
    glow: "--color-accent-a09",
    tile: "bg-accent-a12 text-accent-soft border-accent-a28",
    ink: "text-accent-soft",
    checks: [
      { name: "fault.checkData", state: "fault.stateLoaded", ok: true },
      { name: "fault.checkSocket", state: "fault.stateNotFound", ok: false },
      { name: "fault.checkImages", state: "fault.stateCannotVerify", ok: false },
    ],
    log: doctor.provider.message,
  };
};

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

const referenceOf = (log: string): string => {
  let hash = 0x811c9dc5;
  for (const character of log) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 0x01_00_01_93) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

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
