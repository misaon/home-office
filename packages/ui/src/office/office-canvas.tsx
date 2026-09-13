import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Reveal } from "../kit/reveal.tsx";
import { CONNECTION_KEY, useUi } from "../store.ts";
import { startOffice } from "./scene.ts";

export function OfficeCanvas(): React.JSX.Element {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const connection = useUi((s) => s.connection);
  const lastError = useUi((s) => s.lastError);

  useEffect(() => {
    const element = host.current;
    return element === null ? undefined : startOffice(element);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#eceae4]">
      <div ref={host} className="h-full w-full" />
      <Reveal open={lastError !== null} className="absolute inset-x-0 top-0">
        <div className="border-b border-bad/30 bg-ink/90 px-3 py-1.5 font-mono text-xs text-bad">
          {lastError}
        </div>
      </Reveal>
      <Reveal open={connection !== "online"} className="absolute inset-x-0 bottom-0">
        <div className="border-t border-warn/30 bg-ink/90 px-3 py-1.5 text-xs text-warn">
          {t(CONNECTION_KEY[connection])}
        </div>
      </Reveal>
    </div>
  );
}
