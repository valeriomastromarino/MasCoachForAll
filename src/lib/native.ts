// What only the Android app can do (screen on, background service, system-bar colours, Back button).
// Every function does nothing in a browser, so callers never check the platform.
import { Capacitor, registerPlugin } from "@capacitor/core";

interface MasCoachNativePlugin {
  keepAwake(o: { on: boolean }): Promise<void>;
  sessionService(o: { on: boolean }): Promise<void>;
  setBars(o: { color: string; lightIcons: boolean }): Promise<void>;
  shareFile(o: { name: string; data: string }): Promise<void>;
  widgetSetup(o: { url: string; password: string }): Promise<void>;
  takeRoute(): Promise<{ route: string | null }>;
}

const Native = registerPlugin<MasCoachNativePlugin>("MasCoachNative");
const quiet = () => {
  // The call is a nicety: a failure must never stop a session.
};

export const isApp = () => Capacitor.isNativePlatform();

/** Screen always on while the trainer player is open. */
export function keepScreenOn(on: boolean): void {
  if (isApp()) Native.keepAwake({ on }).catch(quiet);
}

/** Background service for the session (Bluetooth and clock keep running with the screen off). */
export function sessionService(on: boolean): void {
  if (isApp()) Native.sessionService({ on }).catch(quiet);
}

/** Paints the system bars with the page's background and picks light or dark icons. */
export function paintSystemBars(color: string, lightIcons: boolean): void {
  if (isApp()) Native.setBars({ color, lightIcons }).catch(quiet);
}

/** Opens Android's share sheet on a file (base64 data); the WebView cannot download blobs. Rejects when it cannot. */
export function shareFile(name: string, base64: string): Promise<void> {
  return Native.shareFile({ name, data: base64 });
}

// ── Home-screen widget ──────────────────────────────────────────────────────────────────────────────

/** Gives the widget the server and the app password (it refreshes by itself every morning at 8:00). */
export function widgetSetup(url: string, password: string): void {
  if (isApp() && password) Native.widgetSetup({ url, password }).catch(quiet);
}

/** Page a widget tap asked for, if any (cold start), once. */
export async function takeLaunchRoute(): Promise<string | null> {
  if (!isApp()) return null;
  try {
    return (await Native.takeRoute()).route ?? null;
  } catch {
    return null;
  }
}

// ── Back button ─────────────────────────────────────────────────────────────────────────────────────

let guard: (() => boolean) | null = null;

/** The screen on top handles Back first: return true when it did. Returns the function that removes the guard. */
export function guardBack(fn: () => boolean): () => void {
  guard = fn;
  return () => {
    if (guard === fn) guard = null;
  };
}

/** Called by the app shell for each press of Android's Back button. */
export function handleBack(canGoBack: boolean, exit: () => void): void {
  if (guard?.()) return;
  if (canGoBack) window.history.back();
  else exit();
}
