// Shared by the setup scripts: read and update .env.local without losing what is already there.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ENV_FILE = path.join(ROOT, ".env.local");
export const CREDENTIALS_FILE = path.join(ROOT, "credenziali-mascoach.txt");

export function readEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(ENV_FILE, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

export function writeEnv(values) {
  const lines = [
    "# Creato da scripts/setup-env.mjs. Non va su GitHub (.gitignore).",
    ...Object.entries(values)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${v}`),
    "",
  ];
  fs.writeFileSync(ENV_FILE, lines.join("\n"));
}

/** Intervals.icu GET with the athlete's key; throws a readable error. */
export async function icu(key, pathAndQuery) {
  const res = await fetch(`https://intervals.icu/api/v1${pathAndQuery}`, {
    headers: { Authorization: `Basic ${Buffer.from(`API_KEY:${key}`).toString("base64")}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Intervals.icu rifiuta la chiave: controlla di averla copiata tutta.");
  if (!res.ok) throw new Error(`Intervals.icu ha risposto ${res.status} su ${pathAndQuery}`);
  return res.json();
}

export function argValue(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
