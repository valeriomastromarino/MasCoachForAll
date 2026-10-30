// Stand-in for next/navigation on top of the hash router.
import { navigate, usePath } from "../router";

export function usePathname(): string {
  return usePath();
}

/** Only dynamic route of the app: /attivita/[id]. */
export function useParams<T extends Record<string, string>>(): T {
  const m = usePath().match(/^\/attivita\/([^/]+)$/);
  return (m ? { id: m[1] } : {}) as unknown as T;
}

export function useRouter() {
  return { push: navigate, replace: navigate, back: () => window.history.back() };
}
