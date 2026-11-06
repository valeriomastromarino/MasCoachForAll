// A request written for the coach by another page (for example the calendar's "Chiedi al coach una tabella"):
// the chat finds it in the message box, ready to read and send.
const KEY = "mascoach-coach-prefill";
export const COACH_PREFILL_EVENT = "mascoach-coach-prefill";

export function setCoachPrefill(text: string): void {
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    // Storage blocked: the chat just opens empty.
  }
  window.dispatchEvent(new Event(COACH_PREFILL_EVENT));
}

/** The waiting request, once: reading it removes it. */
export function takeCoachPrefill(): string | null {
  try {
    const t = sessionStorage.getItem(KEY);
    if (t) sessionStorage.removeItem(KEY);
    return t;
  } catch {
    return null;
  }
}
