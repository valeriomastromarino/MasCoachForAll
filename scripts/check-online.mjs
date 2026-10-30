// Checks the published app: login required, data locked without it, connector answering with real data.
//
//   node scripts/check-online.mjs https://mio.vercel.app      (or without argument: MASCOACH_URL in .env.local)
import { readEnv } from "./env.mjs";

const env = readEnv();
const base = (process.argv[2] ?? env.MASCOACH_URL ?? "").replace(/\/+$/, "");
if (!base.startsWith("https://")) {
  console.error("Indica l'indirizzo: node scripts/check-online.mjs https://...vercel.app");
  process.exit(1);
}

const results = [];
const check = (name, ok, detail = "") => results.push({ controllo: name, esito: ok ? "ok" : "PROBLEMA", dettaglio: detail });

const home = await fetch(base, { redirect: "manual" });
check("Le pagine chiedono la password", home.status === 307 || home.status === 308, `stato ${home.status} → ${home.headers.get("location") ?? ""}`);
const api = await fetch(`${base}/api/dashboard`);
check("I dati sono chiusi senza password", api.status === 401, `stato ${api.status}`);
const login = await fetch(`${base}/login`);
const loginText = await login.text();
check("Pagina di login", login.ok && !loginText.includes("App bloccata"), loginText.includes("App bloccata") ? "manca APP_PASSWORD su Vercel" : `stato ${login.status}`);
const manifest = await fetch(`${base}/manifest.webmanifest`);
check("Installabile sul telefono (manifest)", manifest.ok, `stato ${manifest.status}`);

if (!env.MCP_SECRET) check("Connettore", false, "MCP_SECRET non è in .env.local");
else {
  const mcp = async (method, params) =>
    (
      await fetch(`${base}/api/mcp/${env.MCP_SECRET}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })
    ).json();
  try {
    const list = await mcp("tools/list");
    check("Connettore: attrezzi", (list.result?.tools?.length ?? 0) >= 15, `${list.result?.tools?.length ?? 0} attrezzi`);
    const today = await mcp("tools/call", { name: "stato_di_oggi", arguments: {} });
    const s = JSON.parse(today.result?.content?.[0]?.text ?? "{}");
    check(
      "Connettore: dati veri",
      s.dati === "Intervals.icu",
      s.dati === "Intervals.icu" ? `${s.atleta?.nome} · prontezza ${s.prontezza?.headline} · FTP ${s.atleta?.ftp_impostata_W ?? "?"} W` : "dati DEMO: INTERVALS_API_KEY non arriva a Vercel",
    );
  } catch (e) {
    check("Connettore", false, `non risponde (${e.message}): MCP_SECRET su Vercel diverso da quello in .env.local?`);
  }
}

console.table(results);
process.exit(results.every((r) => r.esito === "ok") ? 0 : 1);
