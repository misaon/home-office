import { QueryClient, queryOptions } from "@tanstack/react-query";
import { requireClient } from "./rpc.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 60_000,
      retry: 1,
      refetchIntervalInBackground: false,
      networkMode: "always",
    },
  },
});

export const doctorQuery = queryOptions({
  queryKey: ["doctor"],
  queryFn: ({ signal }) => requireClient().system.doctor(undefined, { signal }),
});
