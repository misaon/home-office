import { useEffect, useRef } from "react";
import { useKindName } from "../i18n/kinds.ts";
import { type EditorProps, EditorScene } from "./scene.ts";

/** The Pixi canvas, wired to the draft: it redraws on every edit and reports what a drag covered. */
export function EditorCanvas(props: Omit<EditorProps, "kindName">): React.JSX.Element {
  const kindName = useKindName();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<EditorScene | null>(null);
  // The scene is built asynchronously, so it reads the latest props through a ref once it exists.
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
  return <div ref={host} style={{ height: "100%", width: "100%" }} />;
}
