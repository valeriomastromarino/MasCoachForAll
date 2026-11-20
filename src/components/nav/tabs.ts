// The pages of the phone app that live side by side in the pager: swipe sideways or tap the bottom bar.
// Design D «Azione» (chosen by the athlete on 19 November 2026): the bar is Oggi · Piano · [Pedala] · Coach · Uscite; «Pedala»
// opens the trainer and is not a page of the pager; what was under «Altro» opens from the menu at the top.
export const TAB_PATHS = ["/", "/calendario", "/coach", "/attivita"] as const;

/** «Piano» is the week (the calendar) and the season of the same plan: both addresses are its page. */
const PIANO = ["/calendario", "/stagione"];
let lastPiano = "/calendario";

export const tabIndex = (path: string): number => (PIANO.includes(path) ? 1 : TAB_PATHS.indexOf(path as (typeof TAB_PATHS)[number]));

/** Address of a page of the pager: «Piano» opens on the view used last (week or season). */
export function tabPath(i: number): string {
  return i === 1 ? lastPiano : TAB_PATHS[i];
}

/** The «Piano» page tells which view is open, so a swipe away and back finds it again. */
export function rememberPiano(path: string): void {
  if (PIANO.includes(path)) lastPiano = path;
}

/** Name of a page: the title of the pages that open from the menu, and what «Indietro» leaves. */
const LABELS: [string, string][] = [
  ["/calendario", "Piano"],
  ["/stagione", "Piano"],
  ["/coach", "Coach"],
  ["/rulli", "Pedala"],
  ["/altro", "Altro"],
  ["/analisi", "Analisi"],
  ["/attivita", "Uscite"],
  ["/test", "Test"],
  ["/impostazioni", "Impostazioni"],
];

export function pageLabel(path: string): string {
  if (path === "/" || path === "") return "Oggi";
  return LABELS.find(([p]) => path === p || path.startsWith(p + "/"))?.[1] ?? "";
}

/** The trainer player: it takes the whole screen with its own header. */
export const isDetailPath = (path: string): boolean => /^\/rulli\/[^/]+/.test(path);

/** A ride opened from Uscite or from Oggi: the top bar's «Indietro» leaves it (before it had a small «← Uscite» of its own). */
export const isRidePath = (path: string): boolean => /^\/attivita\/[^/]+/.test(path);
