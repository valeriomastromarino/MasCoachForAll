// Sessions saved on the device (IndexedDB) while riding and until they reach Intervals.icu,
// so a closed tab or no internet loses nothing.
import type { Recording } from "./recording";

const DB_NAME = "mascoach-rulli";
const STORE = "sessions";

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function saveRecording(r: Recording): Promise<void> {
  await run("readwrite", (s) => s.put(r));
}

export async function listRecordings(): Promise<Recording[]> {
  const all = (await run("readonly", (s) => s.getAll() as IDBRequest<Recording[]>)) ?? [];
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export async function deleteRecording(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}
