// Hash-router version of components/nav/replacePath.ts.
export function replacePath(href: string): void {
  window.history.replaceState(null, "", `#${href}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
