import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import { bridge } from "./office/runtime.ts";
import { startSync } from "./sync.ts";
import { OfficeLab } from "./office-lab/lab.tsx";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("missing #root");
}
if (window.location.pathname === "/office-lab") {
  createRoot(root).render(<OfficeLab />);
} else {
  createRoot(root).render(<App />);
  void startSync(bridge);
}
