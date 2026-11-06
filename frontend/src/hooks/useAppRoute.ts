import { useSyncExternalStore } from "react";

export type AppRoute = "dashboard" | "new-contract";
export function routeForHash(hash: string): AppRoute {
  return /^#\/contratos\/nuevo\/?$/.test(hash) ? "new-contract" : "dashboard";
}
function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
export function useAppRoute(): AppRoute {
  return useSyncExternalStore(subscribe, () => routeForHash(window.location.hash), () => "dashboard");
}
