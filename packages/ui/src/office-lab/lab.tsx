import { useState } from "react";
import { LabControls, LabFooter, LAB_BUTTON } from "./controls.tsx";
import { LabSession } from "./session.ts";
import { useLabRuntime } from "./use-lab-runtime.ts";
import { useLabReload } from "./live-reload.ts";

export function OfficeLab(): React.JSX.Element {
  const [session] = useState(() => new LabSession());
  const lab = useLabRuntime(session);
  const live = useLabReload();
  return (
    <main className="flex h-full flex-col bg-[#142326] text-[#e6dac7]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#385153] px-5 py-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">
            Home Office <span className="font-normal text-[#9db4af]">/ Layout Lab</span>
          </h1>
          <p className="text-xs text-[#9db4af]">
            Schválený půdorys · technický prototyp · grafika objektů je dočasná
          </p>
        </div>
        <span
          className={`rounded px-3 py-1 text-xs ${session.audit.issues.length === 0 ? "bg-[#244a3d] text-[#c2edbf]" : "bg-red-900 text-white"}`}
        >
          {session.audit.reachableAnchors}/{session.plan.template.anchors.length} cílů dostupných
        </span>
        {live ? (
          <a
            className={LAB_BUTTON}
            href="/assets/reference/office-base-v1.png"
            target="_blank"
            rel="noreferrer"
          >
            Schválený design ↗
          </a>
        ) : (
          <a className={LAB_BUTTON} href="/">
            Zpět do aplikace
          </a>
        )}
        {live ? <span className="text-xs text-[#9db4af]">Živé úpravy ●</span> : null}
      </header>
      <LabControls lab={lab} session={session} />
      <div className="relative min-h-0 flex-1" ref={lab.host}>
        {lab.error !== null ? (
          <p role="alert" className="absolute inset-x-0 top-0 z-10 bg-red-950 p-4 text-red-100">
            {lab.error}
          </p>
        ) : null}
        {session.audit.issues.length > 0 ? (
          <p role="alert">{session.audit.issues.join(" · ")}</p>
        ) : null}
      </div>
      <LabFooter lab={lab} session={session} />
    </main>
  );
}
