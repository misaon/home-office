import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import { bridge } from "./office/runtime.ts";
import { startSync } from "./sync.ts";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("missing #root");
}
createRoot(root).render(<App />);
void startSync(bridge);
