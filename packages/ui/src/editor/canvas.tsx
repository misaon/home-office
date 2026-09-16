import { useEffect, useRef } from "react";
import { useKindName } from "../i18n/kinds.ts";
import { type EditorProps, EditorScene } from "./scene.ts";

export function EditorCanvas(props: Omit<EditorProps, "kindName">): React.JSX.Element {
  const kindName = useKindName();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<EditorScene | null>(null);
  const latest = useRef<EditorProps>({ ...props, kindName });
  useEffect(() => {
    latest.current = { ...props, kindName };
    scene.current?.sync(latest.current);
  }, [props, kindName]);
  useEffect(() => {
    const element = host.current;
    if (element === null) {
      return undefined;
    }
    const created = new EditorScene();
    let disposed = false;
    void created.init(element).then(() => {
      if (!disposed) {
        scene.current = created;
        created.sync(latest.current);
      }
    });
    return () => {
      disposed = true;
      scene.current = null;
      created.destroy();
    };
  }, []);
  return <div ref={host} className="h-full w-full" />;
}
