// Prepares .env.local: checks the Intervals.icu key on the real account, creates the app password and the
// connector secret (only the first time), and writes them in credenziali-mascoach.txt. Never prints secrets.
//
//   INTERVALS_API_KEY=... node scripts/setup-env.mjs     first run (or with the key already in .env.local)
//   node scripts/setup-env.mjs --url https://mio.vercel.app   adds the online address to the credentials file
import crypto from "node:crypto";
import fs from "node:fs";
import { argValue, CREDENTIALS_FILE, icu, readEnv, writeEnv } from "./env.mjs";

const env = readEnv();
const key = process.env.INTERVALS_API_KEY?.trim() || env.INTERVALS_API_KEY;
const athleteId = process.env.INTERVALS_ATHLETE_ID?.trim() || env.INTERVALS_ATHLETE_ID || "0";
const url = (argValue("url") ?? env.MASCOACH_URL ?? "").replace(/\/+$/, "");

if (!key) {
  console.error("Manca la chiave: INTERVALS_API_KEY=<chiave> node scripts/setup-env.mjs");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
const [athlete, wellness, activities] = await Promise.all([
  icu(key, `/athlete/${athleteId}`),
  icu(key, `/athlete/${athleteId}/wellness?oldest=${monthAgo}&newest=${today}`),
  icu(key, `/athlete/${athleteId}/activities?oldest=${monthAgo}&newest=${today}`),
]);
const ride = (athlete.sportSettings ?? []).find((s) => s.types?.includes("Ride"));

// Readable password: 4 groups of 4 letters/digits without look-alike characters.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const password = () =>
  Array.from({ length: 4 }, () => Array.from(crypto.randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join("")).join("-");

const next = {
  INTERVALS_API_KEY: key,
  INTERVALS_ATHLETE_ID: athleteId,
  APP_PASSWORD: env.APP_PASSWORD || password(),
  MCP_SECRET: env.MCP_SECRET || crypto.randomBytes(24).toString("base64url"),
  MASCOACH_URL: url || undefined,
};
writeEnv(next);

const connector = url ? `${url}/api/mcp/${next.MCP_SECRET}` : "(si completa dopo la pubblicazione su Vercel)";
fs.writeFileSync(
  CREDENTIALS_FILE,
  [
    "MASCOACH — CREDENZIALI PERSONALI (non condividerle, non vanno su GitHub)",
    "",
    `Indirizzo dell'app:       ${url || "(dopo la pubblicazione su Vercel)"}`,
    `Password per entrare:     ${next.APP_PASSWORD}`,
    "",
    "Connettore per Claude (claude.ai > Impostazioni > Connettori > Aggiungi connettore personalizzato):",
    `  Nome: MasCoach`,
    `  URL:  ${connector}`,
    "",
    "Chi ha l'URL del connettore può leggere i tuoi dati e scrivere allenamenti: tienilo per te.",
    "",
  ].join("\n"),
);

const hrvNights = wellness.filter((w) => w.hrv > 0).length;
const rides = activities.filter((a) => /Ride/.test(a.type ?? "")).length;
console.log(
  JSON.stringify(
    {
      chiave_valida: true,
      atleta: athlete.name || athlete.firstname || "(senza nome)",
      nome: athlete.firstname || null,
      ftp_bici_W: ride?.ftp ?? null,
      ftp_rulli_W: ride?.indoor_ftp ?? null,
      fc_soglia: ride?.lthr ?? null,
      w_prime_J: ride?.w_prime ?? null,
      ultimi_30_giorni: { uscite_bici: rides, attivita_totali: activities.length, notti_con_hrv: hrvNights },
      avvisi: [
        ...(ride?.ftp ? [] : ["Nessuna FTP impostata su Intervals per la bici: zone e allenamenti in % non funzionano finché non la imposti."]),
        ...(hrvNights >= 10 ? [] : ["Poche notti con HRV: la parte Altini (prontezza, notti anomale) avrà dati insufficienti finché il dispositivo non le manda a Intervals."]),
        ...(rides ? [] : ["Nessuna uscita in bici negli ultimi 30 giorni: la dashboard sarà quasi vuota."]),
      ],
      file: { env: ".env.local", credenziali: "credenziali-mascoach.txt" },
      indirizzo_online: url || null,
    },
    null,
    2,
  ),
);
