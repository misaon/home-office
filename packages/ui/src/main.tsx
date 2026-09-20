import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { App } from "./design/app.tsx";
import { warmHighlighter } from "./design/markdown.tsx";
import { startI18n } from "./i18n/index.ts";
import { bridge } from "./office/bridge.ts";
import { queryClient } from "./queries.ts";
import { startSync } from "./sync.ts";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("missing #root");
}
void warmHighlighter();
await startI18n();
createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
void startSync(bridge);
