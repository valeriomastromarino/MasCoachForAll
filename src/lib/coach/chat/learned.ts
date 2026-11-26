// What the athlete taught the chat (26 November 2026): when a message was not understood and they tapped one of the
// «Intendevi…?» buttons, that phrase is remembered for the same words, on this device (localStorage), so the next time
// the chat answers at once. «Non era questo» takes a wrong guess back. Nothing leaves the phone.
const KEY = "mascoach-chat-learned";
const MAX = 300;

let memory: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (memory) return memory;
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    memory = parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    memory = {};
  }
  return memory;
}

function save(m: Record<string, string>) {
  memory = m;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // Storage blocked: it is remembered until the app closes.
  }
}

/** The phrase the athlete chose for these (normalized) words, if any. */
export function learnedFor(t: string): string | null {
  return load()[t] ?? null;
}

export function learn(t: string, phrase: string): void {
  if (!t || !phrase || t === phrase) return;
  const m = { ...load() };
  delete m[t];
  m[t] = phrase;
  const keys = Object.keys(m);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) delete m[k];
  save(m);
}

export function forget(t: string): void {
  const m = { ...load() };
  if (!(t in m)) return;
  delete m[t];
  save(m);
}

/** For the tests: an empty memory. */
export function resetLearned(): void {
  memory = {};
}
