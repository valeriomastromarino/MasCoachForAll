// Finished sessions → FIT → Intervals.icu (through the app's own API, so the key stays on the server).
// Sessions that could not be uploaded (no internet, demo data…) stay on the device and are retried later.
import { isApp, shareFile } from "@/lib/native";
import { encodeFit } from "@/lib/player/fit";
import type { Recording } from "@/lib/player/recording";
import { deleteRecording, listRecordings, saveRecording } from "@/lib/player/store";
// Relative path on purpose: the single-file build swaps "../data/transport" for the in-page API.
import { apiFetch } from "../data/transport";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Uploads one finished session; saves the outcome on the device and returns it. */
export async function uploadRecording(rec: Recording): Promise<Recording> {
  let next: Recording;
  try {
    const res = await apiFetch("/api/rulli/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fit: toBase64(encodeFit(rec)), name: rec.name, externalId: rec.id, eventId: rec.eventId }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string | null; error?: string };
    next = res.ok ? { ...rec, status: "uploaded", uploadedId: json.id ?? null, error: null } : { ...rec, error: json.error ?? res.statusText };
  } catch (e) {
    next = { ...rec, error: e instanceof Error ? e.message : "Nessuna connessione" };
  }
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
