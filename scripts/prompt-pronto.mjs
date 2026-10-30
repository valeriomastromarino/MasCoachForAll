// Fills the coach prompt with the athlete's name and writes prompt-coach/prompt-pronto.txt (not on GitHub).
//
//   node scripts/prompt-pronto.mjs --nome Andrea     (without --nome: the first name on Intervals.icu)
import fs from "node:fs";
import path from "node:path";
import { argValue, icu, readEnv, ROOT } from "./env.mjs";

const env = readEnv();
let name = argValue("nome");
if (!name && env.INTERVALS_API_KEY) {
  const athlete = await icu(env.INTERVALS_API_KEY, `/athlete/${env.INTERVALS_ATHLETE_ID || "0"}`);
  name = athlete.firstname || athlete.name;
}
if (!name) {
  console.error("Indica il nome: node scripts/prompt-pronto.mjs --nome <Nome>");
  process.exit(1);
}
name = name.trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase());

const src = path.join(ROOT, "prompt-coach", "MasCoach_prompt.txt");
const out = path.join(ROOT, "prompt-coach", "prompt-pronto.txt");
const text = fs.readFileSync(src, "utf8");
const body = text.slice(text.indexOf("====="));
fs.writeFileSync(out, body.split("{{NOME}}").join(name));
console.log(JSON.stringify({ nome: name, file: "prompt-coach/prompt-pronto.txt", caratteri: body.length }));
