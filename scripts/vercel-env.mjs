// Copies the four variables from .env.local to the linked Vercel project (Production), as secrets.
// Values go through stdin, never on the command line. Needs `npx vercel login` and `npx vercel link` first.
//
//   node scripts/vercel-env.mjs
import { spawnSync } from "node:child_process";
import { readEnv, ROOT } from "./env.mjs";

const NAMES = ["INTERVALS_API_KEY", "INTERVALS_ATHLETE_ID", "APP_PASSWORD", "MCP_SECRET"];
const env = readEnv();
const missing = NAMES.filter((n) => !env[n]);
if (missing.length) {
  console.error(`Mancano in .env.local: ${missing.join(", ")}. Esegui prima scripts/setup-env.mjs.`);
  process.exit(1);
}

let failed = false;
for (const name of NAMES) {
  const r = spawnSync("npx", ["--yes", "vercel", "env", "add", name, "--environment", "production", "--sensitive", "--force", "--yes"], {
    cwd: ROOT,
    input: env[name],
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const ok = r.status === 0;
  failed ||= !ok;
  console.log(`${ok ? "ok    " : "ERRORE"} ${name}${ok ? "" : `\n${(r.stderr || r.stdout || "").trim().slice(-600)}`}`);
}
process.exit(failed ? 1 : 0);
