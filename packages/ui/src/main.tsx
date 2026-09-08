import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queries.ts";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import { bridge } from "./office/runtime.ts";
import { startSync } from "./sync.ts";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("missing #root");
}
createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
void startSync(bridge);
