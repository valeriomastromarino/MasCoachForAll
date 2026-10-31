// Finished sessions → FIT → Intervals.icu (through the app's own API, so the key stays on the server).
// Sessions that could not be uploaded (no internet, demo data…) stay on the device and are retried later.
import { encodeFit } from "@/lib/player/fit";
import type { Recording } from "@/lib/player/recording";
import { listRecordings, saveRecording } from "@/lib/player/store";
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

/** Retries every finished session still on the device. */
export async function uploadPending(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  for (const r of await listRecordings()) if (r.status === "finished") await uploadRecording(r);
}

/** Saves the FIT file on the device (fallback when the upload is not possible). */
export function downloadFit(rec: Recording) {
  const blob = new Blob([encodeFit(rec) as BlobPart], { type: "application/vnd.ant.fit" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${rec.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "rulli"} ${new Date(rec.startedAt).toISOString().slice(0, 10)}.fit`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
