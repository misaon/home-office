import { useEffect, useRef, useState } from "react";
import { startOffice, type OfficeHandle } from "./scene.ts";

export function useOffice(): {
  ref: React.RefObject<HTMLDivElement | null>;
  handle: OfficeHandle | null;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<OfficeHandle | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }
    const office = startOffice(element);
    setHandle(office);
    return () => {
      setHandle(null);
      office.stop();
    };
  }, []);

  return { ref, handle };
}
