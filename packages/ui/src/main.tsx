import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queries.ts";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import { startI18n } from "./i18n/index.ts";
import { bridge } from "./office/runtime.ts";
import { startSync } from "./sync.ts";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("missing #root");
}
// The dictionaries are in the bundle, so this settles in a microtask; rendering after it keeps the
// first paint from flashing raw keys.
await startI18n();
createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
void startSync(bridge);
