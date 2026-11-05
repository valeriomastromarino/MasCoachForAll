// The five pages of the phone app that live side by side in the pager: swipe sideways or tap the bottom bar.
export const TAB_PATHS = ["/", "/calendario", "/coach", "/rulli", "/altro"] as const;

export const tabIndex = (path: string): number => TAB_PATHS.indexOf(path as (typeof TAB_PATHS)[number]);

/** Title of the page, shown in the pill under the logo (phone app). */
const LABELS: [string, string][] = [
  ["/calendario", "Calendario"],
  ["/coach", "Coach"],
  ["/rulli", "Rulli"],
  ["/altro", "Altro"],
  ["/analisi", "Analisi"],
  ["/stagione", "Stagione"],
  ["/attivita", "Uscite"],
  ["/test", "Test"],
  ["/impostazioni", "Impostazioni"],
];

export function pageLabel(path: string): string {
  if (path === "/" || path === "") return "Oggi";
  return LABELS.find(([p]) => path === p || path.startsWith(p + "/"))?.[1] ?? "";
}

/** Pages that take the whole screen with their own header (a ride, the trainer player). */
export const isDetailPath = (path: string): boolean => /^\/(attivita|rulli)\/[^/]+/.test(path);
