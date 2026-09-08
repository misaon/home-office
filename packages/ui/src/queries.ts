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

export const secretsStatusQuery = queryOptions({
  queryKey: ["secrets-status"],
  queryFn: ({ signal }) => requireClient().secrets.status(undefined, { signal }),
});

export const intakeStatusQuery = queryOptions({
  queryKey: ["intake-status"],
  queryFn: ({ signal }) => requireClient().intake.status(undefined, { signal }),
});

export const resourcesQuery = queryOptions({
  queryKey: ["resources"],
  queryFn: ({ signal }) => requireClient().resources.inventory(undefined, { signal }),
});
