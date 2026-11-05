import { useQuery } from "@tanstack/react-query";
import { fetchDashboard, fetchContracts } from "../api/dashboard";
import type { DateRange } from "../api/schema";

export function useDashboard(range: DateRange, idContrato: number | null) {
  return useQuery({
    queryKey: ["pfgp-dashboard", 99, range.inicio, range.final, idContrato],
    queryFn: ({ signal }) => fetchDashboard(range, idContrato!, signal),
    enabled: idContrato !== null,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useContracts(range: DateRange) {
  return useQuery({
    queryKey: ["pfgp-contracts", 99, range.inicio, range.final],
    queryFn: ({ signal }) => fetchContracts(range, signal),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
