import { useEffect, useRef, useState } from "react";
import { startOffice, type OfficeHandle } from "./scene.ts";

/**
 * The running office, and the handle that lets the chrome above it drive the camera. The element it
 * fills carries no styling of its own: the stage around it draws the floor's frame.
 */
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
