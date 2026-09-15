import type { UsageSummary } from "@ho/protocol";
import { QueryClient, queryOptions, type UseQueryOptions } from "@tanstack/react-query";
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

export const resourcesQuery = queryOptions({
  queryKey: ["resources"],
  queryFn: ({ signal }) => requireClient().resources.inventory(undefined, { signal }),
});

export const layoutsQuery = queryOptions({
  queryKey: ["layouts"],
  queryFn: ({ signal }) => requireClient().layouts.list(undefined, { signal }),
});

/** `hours` 0 means all time. */
export const usageQuery = (hours: number): UseQueryOptions<UsageSummary> => ({
  queryKey: ["usage", hours],
  queryFn: ({ signal }) =>
    requireClient().usage.summary(hours === 0 ? {} : { sinceHours: hours }, { signal }),
});
