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
    <div className="relative h-full w-full overflow-hidden bg-white">
      <div ref={host} className="h-full w-full" />
      {lastError !== null ? (
        <div className="absolute inset-x-0 top-0 bg-red-900/80 px-3 py-1 font-mono text-xs text-red-100">
          {lastError}
        </div>
      ) : null}
      {connection !== "online" ? (
        <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-1 text-xs text-amber-200">
          {t(CONNECTION_KEY[connection])}
        </div>
      ) : null}
    </div>
  );
}
