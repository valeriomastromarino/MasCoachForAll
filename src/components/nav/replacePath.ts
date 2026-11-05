// Changes the address without a new history entry (swiping between pages must not fill the Back stack).
// The single-file build has its own copy for the hash router.
import { pathChanged } from "./useCurrentPath";

export function replacePath(href: string): void {
  window.history.replaceState(window.history.state, "", href);
  pathChanged();
}
