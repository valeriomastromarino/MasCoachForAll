// Stand-in for next/navigation on top of the hash router.
import { navigate, usePath } from "../router";

export function usePathname(): string {
  return usePath();
}

/** Dynamic routes of the app: /attivita/[id] and /rulli/[id]. */
export function useParams<T extends Record<string, string>>(): T {
  const m = usePath().match(/^\/(?:attivita|rulli)\/([^/]+)$/);
  return (m ? { id: m[1] } : {}) as unknown as T;
}

export function useRouter() {
  return { push: navigate, replace: navigate, back: () => window.history.back() };
}
