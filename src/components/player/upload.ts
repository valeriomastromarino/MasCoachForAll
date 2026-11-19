// Finished sessions → FIT → Intervals.icu (through the app's own API, so the key stays on the server), then Strava
// when it is connected (components/data/strava.ts). Sessions that could not be uploaded (no internet, demo data…) stay
// on the device and are retried later.
import { isApp, shareFile } from "@/lib/native";
import { encodeFit } from "@/lib/player/fit";
import type { Recording } from "@/lib/player/recording";
import { deleteRecording, listRecordings, saveRecording } from "@/lib/player/store";
// Relative path on purpose: the single-file build swaps "../data/transport" for the in-page API.
import { apiFetch } from "../data/transport";
import { sendToStrava, stravaAuto } from "../data/strava";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The name on Intervals.icu and Strava: a recalibrated session says so ("… · al 90%"). */
const uploadName = (rec: Recording) => (rec.scale && rec.scale < 1 ? `${rec.name} · al ${Math.round(rec.scale * 100)}%` : rec.name);

/**
 * Once on Intervals.icu, the same session goes to Strava (19 November 2026) when it is connected and wanted on this
 * device (`force`: «Riprova», whatever the switch says). Not connected: nothing waits for Strava.
 */
async function withStrava(rec: Recording, fit: string, force = false): Promise<Recording> {
  if (rec.status !== "uploaded" || rec.strava?.status === "ok" || (!force && !stravaAuto())) return rec;
  const r = await sendToStrava(fit, uploadName(rec), rec.id);
  if (r.ok) return { ...rec, strava: { status: "ok", id: r.id, error: null } };
  if (r.off) return rec.strava ? { ...rec, strava: undefined } : rec;
  return { ...rec, strava: { status: "error", error: r.error } };
}

/** Uploads one finished session; saves the outcome on the device and returns it. */
export async function uploadRecording(rec: Recording): Promise<Recording> {
  let next: Recording;
  const fit = toBase64(encodeFit(rec));
  try {
    const res = await apiFetch("/api/rulli/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fit, name: uploadName(rec), externalId: rec.id, eventId: rec.eventId }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string | null; error?: string };
    next = res.ok ? { ...rec, status: "uploaded", uploadedId: json.id ?? null, error: null } : { ...rec, error: json.error ?? res.statusText };
  } catch (e) {
    next = { ...rec, error: e instanceof Error ? e.message : "Nessuna connessione" };
  }
  next = await withStrava(next, fit);
  await saveRecording(next);
  return next;
}

/** «Riprova» for Strava: the session is already on Intervals.icu, only Strava is missing. */
export async function retryStrava(rec: Recording, force = true): Promise<Recording> {
  const next = await withStrava(rec, toBase64(encodeFit(rec)), force);
  await saveRecording(next);
  return next;
}

/**
 * Closes the sessions a crash or a killed app left half-recorded (too short ones are dropped), then retries
 * every finished session still on the device.
 */
export async function uploadPending(): Promise<void> {
  const online = typeof navigator === "undefined" || navigator.onLine;
  for (let r of await listRecordings()) {
    if (r.status === "recording") {
      if (r.samples.length < 5) {
        await deleteRecording(r.id);
        continue;
      }
      const last = r.pauses[r.pauses.length - 1];
      const pauses = last && last.to === null ? [...r.pauses.slice(0, -1), { ...last, to: r.samples[r.samples.length - 1].t }] : r.pauses;
      r = { ...r, pauses, status: "finished" };
      await saveRecording(r);
    }
    if (r.status === "finished" && online) await uploadRecording(r);
    // On Intervals.icu but not yet on Strava (no network at the end of the session): try again, as the switch says.
    else if (r.status === "uploaded" && r.strava?.status === "error" && online) await retryStrava(r, false);
  }
}

/** Saves the FIT file on the device (fallback when the upload is not possible): a download in the browser, the share sheet in the app. */
export async function downloadFit(rec: Recording): Promise<void> {
  const bytes = encodeFit(rec);
  const name = `${rec.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "rulli"} ${new Date(rec.startedAt).toISOString().slice(0, 10)}.fit`;
  if (isApp()) {
    // The Android WebView does not download blobs: hand the file to the share sheet (Drive, files, mail…).
    await shareFile(name, toBase64(bytes));
    return;
  }
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.ant.fit" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
