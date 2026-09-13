import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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
      {lastError !== null ? (
        <div className="animate-rise absolute inset-x-0 top-0 border-b border-bad/30 bg-ink/90 px-3 py-1.5 font-mono text-xs text-bad">
          {lastError}
        </div>
      ) : null}
      {connection !== "online" ? (
        <div className="animate-rise absolute inset-x-0 bottom-0 border-t border-warn/30 bg-ink/90 px-3 py-1.5 text-xs text-warn">
          {t(CONNECTION_KEY[connection])}
        </div>
      ) : null}
    </div>
  );
}
