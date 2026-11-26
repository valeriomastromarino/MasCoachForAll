// Answers that say the thing first, then the numbers (25 November 2026). «Com'è andata stanotte?», «come sta andando
// l'HRV questa settimana?», «la FC a riposo è alta?», «perché sono giallo?», «cosa ho domenica?», «sono recuperato per la
// soglia di domani?», «domenica posso fare 4 ore invece di 3?», «oggi ho fatto 2 ore di MTB, cambio qualcosa?», «non ho
// voglia». Every number comes from the app's data and engines.
import { type CalendarWorkout, isBikeSession, onTrainer } from "@/lib/calendar";
import { addDays, weekStart } from "@/lib/dates";
import { parseIntervalsText, sectionsFromBlocks } from "@/lib/training/build/intervalsText";
import { PHASE_INFO, weekFor } from "@/lib/training/season";
import { carbsFor, classifyWorkout, CLASS_SAY, parseCap, plannedFits, toleratedCarbs } from "@/lib/training/suggest";
import { sectionLines } from "./build";
import { type ChatContext, type ChatResult, type ChatState, type Reply, suggestInput } from "./context";
import { kindWord } from "./edits";
import { dayLabel, hoursText, minsText, n0, n1, suggestFor, suggestionReply, withOptions } from "./helpers";
import { pickPlanned, sayPlanned, upcoming } from "./refs";
import { normalize, parseDates, parseMinutes, sayDate } from "./text";

const done = (reply: Reply, state: ChatState, focus?: ChatState["focus"]): ChatResult => ({ reply, state: { ...state, pending: null, awaiting: null, focus: focus ?? state.focus } });
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const hm = (h: number | null | undefined) => (h == null ? "–" : hoursText(h * 3600));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ── The night ────────────────────────────────────────────────────────────────────────────────────

/** Last night (or the night named): sleep, HRV and resting HR against the athlete's own normal, with a verdict. */
export function notte(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const span = parseDates(text, ctx.today, { past: true });
  const day = span && span.from <= ctx.today ? span.from : ctx.today;
  const rec = ctx.data.recovery.find((r) => r.date === day);
  const sl = ctx.data.sleep.find((s) => s.date === day);
  const lines: string[] = [];
  const flags: string[] = [];
  if (sl?.hours != null) {
    const short = sl.hours < 6;
    lines.push(`Sonno: ${hm(sl.hours)}${sl.avg7 != null ? ` (media 7 notti ${hm(sl.avg7)})` : ""}${sl.score != null ? `, punteggio ${n0(sl.score)}` : ""}.`);
    if (short) flags.push("hai dormito poco");
  }
  if (rec?.rmssd != null) {
    const [lo, hi] = rec.hrvRange ?? [null, null];
    const v = Math.round(rec.rmssd);
    const pos = lo != null && hi != null ? (v < Math.round(lo) ? "sotto il tuo range" : v > Math.round(hi) ? "sopra il tuo range" : "nel tuo range") : "";
    lines.push(`HRV: ${n0(rec.rmssd)} ms${lo != null ? `, ${pos} ${n0(lo)}-${n0(hi)}` : ""}.`);
    if (lo != null && v < Math.round(lo)) flags.push("HRV bassa");
  }
  if (rec?.rhr != null) {
    const [lo, hi] = rec.rhrRange ?? [null, null];
    lines.push(`FC a riposo: ${n0(rec.rhr)} bpm${lo != null ? ` (range ${n0(lo)}-${n0(hi)})` : ""}.`);
    // Compared as shown (whole numbers): 49 bpm on a range «44-49» is not «high».
    if (hi != null && Math.round(rec.rhr) > Math.round(hi)) flags.push("FC a riposo alta");
  }
  if (!lines.length) return done({ text: `Per ${day === ctx.today ? "stanotte" : `la notte di ${sayDate(day)}`} non ho dati: l'orologio non li ha ancora mandati a Intervals.`, chips: ["Come sto?"] }, state);
  if (rec?.anomaly) lines.push("Per il metodo Altini è una notte anomala: HRV e FC a riposo insieme fuori dal tuo normale (stress, alcol, poco sonno o un malanno in arrivo).");
  const when = day === ctx.today ? "Stanotte" : day === addDays(ctx.today, -1) ? "La notte prima" : `La notte del ${Number(day.slice(8))}`;
  const text2 = flags.length ? `😴 ${when} non è andata benissimo: ${flags.join(", ")}.` : `😴 ${when} è andata bene: tutto nel tuo normale.`;
  if (day === ctx.today) lines.push(`Per oggi: prontezza ${ctx.data.status.readiness.level}, ${lower(ctx.data.status.readiness.advice)}`);
  return done({ text: text2, lines, chips: ["Come va l'HRV questa settimana?", "Cosa faccio oggi?"] }, state, { intent: "notte", date: day, term: "hrv" });
}

/** The sleep of the last nights. */
export function sonno(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  if (/\b(stanotte|ieri notte|questa notte|stamattina)\b/.test(t)) return notte(ctx, state, text);
  const nights = ctx.data.sleep.filter((s) => s.date <= ctx.today).slice(-7);
  const hours = nights.map((s) => s.hours).filter((h): h is number => h != null);
  if (!hours.length) return done({ text: "Non ho dati sul sonno delle ultime notti.", chips: ["Come sto?"] }, state);
  const mean = avg(hours)!;
  const short = hours.filter((h) => h < 6).length;
  const last = nights.at(-1);
  const prev = ctx.data.sleep.filter((s) => s.date < addDays(ctx.today, -6)).slice(-21).map((s) => s.hours).filter((h): h is number => h != null);
  const before = avg(prev);
  const lines = [
    `Ultime ${hours.length} notti: media ${hm(mean)}${before != null ? ` (le 3 settimane prima ${hm(before)})` : ""}.`,
    `Stanotte: ${hm(last?.hours)}${last?.score != null ? `, punteggio ${n0(last.score)}` : ""}.`,
    `Notte per notte: ${nights.map((s) => `${Number(s.date.slice(8))} ${s.hours == null ? "–" : n1(s.hours)}`).join(" · ")}.`,
  ];
  if (short >= 2) lines.push(`${short} notti sotto le 6 ore: è il fattore più economico da sistemare, e pesa sulla prontezza.`);
  const verdict = mean >= 7.5 ? "Dormi bene" : mean >= 7 ? "Dormi abbastanza" : mean >= 6.5 ? "Dormi un po' poco" : "Dormi poco";
  return done({ text: `😴 ${verdict}: in media ${hm(mean)} a notte.`, lines, chips: ["Com'è andata stanotte?", "Quanto dovrei dormire?"] }, state, { intent: "sonno" });
}

/** HRV over the last week: each night, the 7-day mean against the range, the direction. */
export function hrvSettimana(ctx: ChatContext, state: ChatState): ChatResult {
  const nights = ctx.data.recovery.filter((r) => r.date <= ctx.today).slice(-7);
  const vals = nights.map((r) => r.rmssd).filter((v): v is number => v != null);
  const h = ctx.data.status.hrv;
  const ms = (ln: number | null) => (ln == null ? null : Math.exp(ln));
  if (vals.length < 3 || h.baseline7 == null) return done({ text: "Non ho abbastanza notti con l'HRV per dirti l'andamento.", chips: ["Com'è andata stanotte?"] }, state);
  const lo = ms(h.low);
  const hi = ms(h.high);
  const base = ms(h.baseline7)!;
  const first = avg(vals.slice(0, Math.ceil(vals.length / 2)))!;
  const second = avg(vals.slice(Math.ceil(vals.length / 2)))!;
  const dir = second > first * 1.05 ? "in salita" : second < first * 0.95 ? "in calo" : "stabile";
  const anomalies = nights.filter((r) => r.anomaly).length;
  const where = lo != null && hi != null ? (base < lo ? "sotto il tuo range" : base > hi ? "sopra il tuo range" : "dentro il tuo range") : "";
  const lines = [
    `Media delle 7 notti: ${n0(base)} ms, ${where}${lo != null ? ` ${n0(lo)}-${n0(hi)}` : ""} (metodo Altini: media di 7 giorni contro il normale di 60).`,
    `Notte per notte: ${nights.map((r) => `${Number(r.date.slice(8))} ${r.rmssd == null ? "–" : n0(r.rmssd)}`).join(" · ")} — ${dir}.`,
    anomalies ? `${anomalies === 1 ? "Una notte anomala" : `${anomalies} notti anomale`} nella settimana.` : "Nessuna notte anomala.",
  ];
  if (h.sd7 != null && h.sd60 != null && h.sd7 > h.sd60 * 1.5) lines.push("Più ballerina del solito: con la media in calo è il segnale tipico della fatica che si accumula.");
  const rhr = ctx.data.status.rhr;
  if (rhr.baseline7 != null) lines.push(`FC a riposo media 7 giorni ${n1(rhr.baseline7)} bpm${rhr.low != null ? ` (range ${n0(rhr.low)}-${n0(rhr.high)})` : ""}.`);
  const good = where === "dentro il tuo range" || where === "sopra il tuo range";
  const text = good && dir !== "in calo" && !anomalies ? `💚 Bene: HRV ${where}, ${dir}.` : good ? `🟡 Nel range, ma ${dir === "in calo" ? "in calo" : "con qualche notte storta"}: tienila d'occhio.` : `🟠 HRV ${where}: il corpo sta faticando ad assorbire il carico.`;
  return done({ text, lines, chips: ["Com'è andata stanotte?", "Cosa faccio oggi?", "Cos'è l'HRV?"] }, state, { intent: "hrv", term: "hrv" });
}

export function fcRiposo(ctx: ChatContext, state: ChatState): ChatResult {
  const r = ctx.data.status.rhr;
  if (r.today == null) return done({ text: "Stanotte non ho la FC a riposo.", chips: ["Com'è andata stanotte?"] }, state);
  const high = r.high != null && Math.round(r.today) > Math.round(r.high);
  const low = r.low != null && Math.round(r.today) < Math.round(r.low);
  const text = high ? `Sì, è un po' alta: ${n0(r.today)} bpm, sopra il tuo range ${n0(r.low)}-${n0(r.high)}.` : low ? `No, anzi è bassa: ${n0(r.today)} bpm, sotto il range ${n0(r.low)}-${n0(r.high)}.` : `No: ${n0(r.today)} bpm, dentro il tuo range ${n0(r.low)}-${n0(r.high)}.`;
  const lines = [`Media 7 giorni ${n1(r.baseline7)} bpm.`];
  if (high) lines.push("Una FC a riposo alta per una notte sola dice poco; due o tre notti di fila, con l'HRV in calo, dicono fatica, stress o un malanno. Se hai anche gola o testa pesante, oggi facile.");
  if (low) lines.push("Bassa con l'HRV alta e gambe vuote può voler dire stanchezza profonda (raro); se ti senti bene è solo un'ottima notte.");
  return done({ text: `❤️ ${text}`, lines, chips: ["Come va l'HRV questa settimana?", "Come sto?"] }, state, { intent: "fc", term: "hrv" });
}

/** «perché sono giallo?»: the reasons of today's readiness, and a word if the color asked isn't today's. */
export function perColore(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const r = ctx.data.status.readiness;
  const asked = t.match(/\b(verde|giallo|gialla|rosso|rossa|grigio|grigia)\b/)?.[1]?.replace(/a$/, "o");
  const lines = r.reasons.slice(0, 5);
  const o = ctx.overrides.date === ctx.today ? ctx.overrides : null;
  if (o?.feeling?.drop) lines.push(`Mi hai detto che ${o.feeling.note}: per l'allenamento di oggi l'ho abbassata di un livello.`);
  const lead = asked && asked !== r.level ? `Oggi non sei ${asked}: sei ${r.level} (${lower(r.headline)}).` : `Sei ${r.level} per questo:`;
  return done({ text: lead, lines, chips: ["Cosa faccio oggi?", "Com'è andata stanotte?"] }, state, { intent: "stato", term: "prontezza" });
}

// ── The sessions of a day ────────────────────────────────────────────────────────────────────────

const stepsOf = (ctx: ChatContext, w: CalendarWorkout) => {
  const ftp = onTrainer(w) ? (ctx.data.athlete.indoorFtp ?? ctx.data.athlete.ftp) : ctx.data.athlete.ftp;
  const s = parseIntervalsText(w.description, ftp) ?? sectionsFromBlocks(w.blocks);
  return sectionLines(s, ftp).slice(0, 5);
};

/** The engine's check of a planned session on its day. Another day than today is judged with the readiness of today. */
function check(ctx: ChatContext, w: CalendarWorkout) {
  const input = suggestInput(ctx, w.date === ctx.today ? { date: w.date } : { date: w.date, readiness: ctx.data.status.readiness.level === "rosso" ? "giallo" : ctx.data.status.readiness.level, tsbYesterday: null, feeling: null });
  return plannedFits({ ...input, recent: input.recent.filter((a) => !a.planned) }, { ...w, id: 0 });
}

/** «cosa ho domenica?»: what is on the calendar that day, its steps and whether it fits; an empty day gets a proposal. */
export function sedutaDi(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const span = parseDates(text, ctx.today);
  const date = span && span.from >= ctx.today ? span.from : ctx.today;
  const p = pickPlanned(ctx, state, text);
  const named = p.by === "kind" || p.by === "name" ? p.list : [];
  const day = named.length ? named : ctx.planned.filter((w) => w.date === date && isBikeSession(w));
  if (!day.length) {
    const s = suggestFor(ctx, date);
    const reply = suggestionReply(ctx, s, date, `${dayLabel(ctx, date)} in calendario non c'è nulla.`);
    reply.text = reply.text.replace(`${dayLabel(ctx, date)} in calendario non c'è nulla. ${dayLabel(ctx, date)}:`, `${dayLabel(ctx, date)} in calendario non c'è nulla. Ti proporrei:`);
    return { reply, state: s.kind === "workout" ? { ...withOptions(state, [s.main, ...s.alternatives], date), focus: { intent: "oggi", date } } : { ...state, focus: { intent: "oggi", date } } };
  }
  const w = day[0];
  const fit = check(ctx, w);
  const mins = Math.round((w.secs ?? 0) / 60);
  const lines = [...stepsOf(ctx, w), `${onTrainer(w) ? "Sui rulli" : "Fuori"}, carboidrati ${carbsFor({ mins, cls: classifyWorkout({ ...w, id: 0 }).cls }, toleratedCarbs(ctx.profile?.carboTollerati))}.`];
  lines.push(fit.ok ? "✓ Con i dati di oggi va bene." : `Attenzione: ${fit.why}`);
  if (day.length > 1) lines.push(`Lo stesso giorno c'è anche: ${day.slice(1).map((x) => x.name).join(", ")}.`);
  return done({ text: `🚴 ${dayLabel(ctx, w.date)}: «${w.name}» — ${minsText(mins)}${w.tss ? `, TSS ${n0(w.tss)}` : ""}.`, lines, chips: ["Spostala", "Accorciala", "Perché questa?"] }, state, { intent: "seduta", eventId: w.id, date: w.date });
}

/** «sono recuperato per la soglia di domani?», «riesco a fare la lunga domenica?»: yes or no first. */
export function prontoPer(ctx: ChatContext, state: ChatState, text: string): ChatResult | null {
  const p = pickPlanned(ctx, state, text);
  if (p.by === "none" || p.list.length !== 1) return null;
  const w = p.list[0];
  const fit = check(ctx, w);
  const r = ctx.data.status.readiness;
  const future = w.date !== ctx.today;
  const lines: string[] = [];
  if (future) lines.push(`Lo saprò per certo ${w.date === addDays(ctx.today, 1) ? "domattina" : `la mattina di ${sayDate(w.date)}`}, con l'HRV della notte: oggi sei ${r.level}.`);
  lines.push(...r.reasons.slice(0, 2));
  const name = sayPlanned(w, kindWord(w) ?? p.kind);
  if (fit.ok) return done({ text: `✅ Sì: ${name} ci sta.`, lines: [...lines, "Se la notte prima dormi male o hai le gambe vuote, dimmelo: la adatto."], chips: ["Cosa faccio oggi?", "Com'è andata stanotte?"] }, state, { intent: "seduta", eventId: w.id, date: w.date });
  lines.unshift(fit.why);
  return done({ text: `⚠️ Non del tutto: per ${name} ${fit.rule === "safety" ? "oggi non ci sono le condizioni" : "il piano ha un dubbio"}.`, lines, chips: [`Sposta ${name}`, "Cosa faccio oggi?"] }, state, { intent: "seduta", eventId: w.id, date: w.date });
}

/** «perché mi hai messo la soglia domani?»: why that session on that day. */
export function perSeduta(ctx: ChatContext, state: ChatState, text: string): ChatResult | null {
  const p = pickPlanned(ctx, state, text);
  const span = parseDates(text, ctx.today);
  const w = p.by !== "none" && p.list.length === 1 ? p.list[0] : span ? ctx.planned.find((x) => x.date === span.from && isBikeSession(x)) : undefined;
  if (!w) return null;
  const cls = classifyWorkout({ ...w, id: 0 }).cls;
  const week = weekFor(ctx.plan, w.date);
  const lines: string[] = [];
  const who = w.coach ? "L'ha scritta il coach" : /^mascoach-app/.test(String(w.id)) ? "L'ha scritta l'app" : "È sul tuo calendario di Intervals";
  lines.push(`${who}: io la controllo con le regole del piano.`);
  if (week) {
    const info = PHASE_INFO[week.phase];
    lines.push(`Siamo in ${info.label} (${lower(info.focus)}): ${info.classes.includes(cls) ? `${CLASS_SAY[cls]} fa parte di questa fase` : `${CLASS_SAY[cls]} non è tipico di questa fase`}. Settimana ${week.kind === "carico" ? "di carico" : week.kind === "scarico" ? "leggera" : week.kind}, al massimo ${week.qualityMax} sedute di qualità.`);
  }
  const prev = ctx.planned.filter((x) => x.date === addDays(w.date, -1) && isBikeSession(x));
  const next = ctx.planned.filter((x) => x.date === addDays(w.date, 1) && isBikeSession(x));
  const hard = (x: CalendarWorkout) => classifyWorkout({ ...x, id: 0 }).quality;
  if (prev.length || next.length) lines.push(`Il giorno prima: ${prev.map((x) => x.name).join(", ") || "riposo"}; il giorno dopo: ${next.map((x) => x.name).join(", ") || "riposo"}${[...prev, ...next].some(hard) && classifyWorkout({ ...w, id: 0 }).quality ? " — due qualità attaccate: io le staccherei" : ""}.`);
  const fit = check(ctx, w);
  lines.push(fit.ok ? "Con la prontezza di oggi e il carico della settimana, va bene." : `Però: ${fit.why}`);
  return done({ text: `${dayLabel(ctx, w.date)} «${w.name}» (${CLASS_SAY[cls]}):`, lines, chips: ["Spostala", "Cosa faccio oggi?"] }, state, { intent: "seduta", eventId: w.id, date: w.date });
}

/** «domenica posso fare 4 ore invece di 3?»: the scheda, the week, the phase, the fueling. */
export function durataCheck(ctx: ChatContext, state: ChatState, text: string): ChatResult | null {
  const t = normalize(text);
  const mins = parseMinutes(t.split(/\binvece\b/)[0]) ?? parseMinutes(t);
  if (!mins) return null;
  const span = parseDates(t, ctx.today);
  const date = span && span.from >= ctx.today ? span.from : ctx.today;
  const dow = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  const weekend = dow >= 5;
  const cap = parseCap(weekend ? ctx.profile?.durataWeekend : ctx.profile?.durataFeriali);
  const week = weekFor(ctx.plan, date);
  const planned = ctx.planned.find((w) => w.date === date && isBikeSession(w));
  const lines: string[] = [];
  let ok = true;
  if (cap && mins > cap) {
    ok = false;
    lines.push(`La tua scheda dice al massimo ${minsText(cap)} ${weekend ? "nel weekend" : "nei feriali"}: se puoi davvero, cambiala in Impostazioni.`);
  }
  if (week) {
    const long = PHASE_INFO[week.phase].long;
    if (mins > long.max + 30) {
      ok = false;
      lines.push(`In ${PHASE_INFO[week.phase].label} la lunga va da ${minsText(long.min)} a ${minsText(long.max)}: ${minsText(mins)} è un salto, meglio crescere di 20-30 minuti a settimana.`);
    } else lines.push(`In ${PHASE_INFO[week.phase].label} la lunga va da ${minsText(long.min)} a ${minsText(long.max)}.`);
    if (week.kind === "scarico") {
      ok = false;
      lines.push("È una settimana leggera: allungare adesso toglie il recupero che serve.");
    }
  }
  const r = ctx.data.status.readiness;
  if (r.level !== "verde") {
    ok = false;
    lines.push(`Oggi sei ${r.level}: decido meglio la mattina stessa.`);
  }
  const cap2 = toleratedCarbs(ctx.profile?.carboTollerati);
  lines.push(`Per ${minsText(mins)} servono ${mins > 150 ? "60-90" : "30-60"} g/h di carboidrati${cap2 ? `, ma tu ne tolleri ${cap2}: resta lì` : ""} — circa ${Math.round(((mins > 150 ? 70 : 45) * mins) / 60 / 10) * 10} g in tutto, e borracce per 500-750 ml l'ora.`);
  const chips = planned ? [`Allunga ${sayPlanned(planned, kindWord(planned))} a ${minsText(mins).replace(" h ", " ore e ").replace(/ e 00$/, "")}`] : [`${dayLabel(ctx, date)} ${mins}' z2`];
  return done({ text: ok ? `✅ Sì, ${minsText(mins)} ci stanno.` : `🟡 Si può, ma con qualche riserva:`, lines, chips: [...chips, "Cosa faccio oggi?"] }, state, { intent: "durata", date, eventId: planned?.id });
}

/** «oggi ho fatto 2 ore di MTB»: what it weighs, and whether tomorrow still fits. */
export function altroSport(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const done2 = ctx.data.activities.filter((a) => a.date.slice(0, 10) === ctx.today);
  const tss = done2.reduce((s, a) => s + (a.tss ?? 0), 0);
  const mins = parseMinutes(t) ?? (Math.round(done2.reduce((s, a) => s + a.movingTime, 0) / 60) || 60);
  const sport = t.match(/\b(mtb|mountain bike|corsa|corso|nuoto|palestra|pesi|calcio|calcetto|tennis|padel|sci|camminata|trekking|escursione|gravel)\b/)?.[1]?.replace(/^corso$/, "corsa") ?? "attività";
  const perHour = /mtb|mountain|gravel/.test(sport) ? 60 : /corsa|corso|calcio|calcetto|tennis|padel/.test(sport) ? 65 : /pesi|palestra/.test(sport) ? 35 : /cammin|trekking|escurs/.test(sport) ? 25 : 45;
  const est = tss > 0 ? tss : Math.round((mins / 60) * perHour);
  const lines = [tss > 0 ? `Su Intervals oggi vedo ${done2.map((a) => a.name).join(", ")}: TSS ${n0(tss)}.` : `Su Intervals non la vedo ancora: a occhio ${minsText(mins)} di ${sport} valgono circa ${est} TSS.`];
  const tomorrow = ctx.planned.filter((w) => w.date === addDays(ctx.today, 1) && isBikeSession(w));
  const w = tomorrow[0];
  let text2 = "Domani niente di particolare: riposa bene e mangia carboidrati stasera.";
  if (w) {
    const c = classifyWorkout({ ...w, id: 0 });
    if (c.quality && est >= 80) {
      text2 = `Domani c'è «${w.name}»: dopo ${est} TSS oggi la sposterei di un giorno, o la farei più corta.`;
      lines.push("Due giorni duri di fila: la seconda seduta di qualità rende meno e costa di più.");
    } else if (c.quality) text2 = `Domani «${w.name}» ci sta: oggi è stato un carico moderato.`;
    else text2 = `Domani «${w.name}» è facile: va bene così.`;
  }
  if (/pesi|palestra/.test(sport)) lines.push("Dopo i pesi di gambe, il giorno dopo niente qualità: la forza ne risente per 24-48 ore.");
  lines.push("Conta tutto nella fatica (ATL): il piano lo vede quando arriva su Intervals.");
  return done({ text: text2, lines, chips: w ? [`Sposta ${sayPlanned(w, kindWord(w))} di un giorno`, `Accorcia ${sayPlanned(w, kindWord(w))}`] : ["Cosa faccio domani?"] }, state, { intent: "altro_sport", eventId: w?.id });
}

/** «non ho voglia»: a coach's answer, by the day's readiness and session. */
export function voglia(ctx: ChatContext, state: ChatState): ChatResult {
  const r = ctx.data.status.readiness;
  const s = suggestFor(ctx, ctx.today);
  const lines: string[] = [];
  if (r.level === "rosso" || r.level === "giallo") lines.push(`E i dati ti danno ragione: oggi sei ${r.level}. Riposo o 30-45' facilissimi, senza sensi di colpa.`);
  else {
    lines.push("Capita. Prova la regola dei 15 minuti: parti piano; se dopo 15' non ti va ancora, torni a casa e va bene così.");
    if (s.kind === "workout" && s.main.cls !== "recupero" && s.main.cls !== "z2") lines.push(`Oggi c'è ${CLASS_SAY[s.main.cls]}: se proprio no, la sposto a domani e oggi fai solo Z2.`);
    lines.push("Se la voglia manca da giorni, insieme a sonno peggiore e gambe vuote, è un segnale di fatica: dimmelo.");
  }
  return done({ text: "Va bene anche una giornata no.", lines, chips: ["Oggi riposo", "Dammi 45 minuti facili", "Spostala a domani"] }, state, { intent: "voglia" });
}

/** Weekly volume so far, compared with the weeks before and the plan («sto facendo abbastanza?»). */
export function volume(ctx: ChatContext, state: ChatState): ChatResult {
  const weeks = ctx.data.weekly.slice(-5);
  const cur = weeks.at(-1);
  const prev = weeks.slice(0, -1);
  const pw = weekFor(ctx.plan, ctx.today);
  const lines = prev.map((w) => `Settimana del ${Number(w.week.slice(8))}/${w.week.slice(5, 7)}: ${n1(w.hours)} h, TSS ${n0(w.load)}.`);
  if (cur) lines.push(`Questa settimana finora: ${n1(cur.hours)} h, TSS ${n0(cur.load)}${pw ? ` su ${pw.tssTarget} di riferimento` : ""}.`);
  const mean = avg(prev.map((w) => w.load));
  const text = pw && cur ? (cur.load >= pw.tssTarget * 0.9 ? "Sì, stai facendo quello che serve." : `Sei a ${Math.round((cur.load / pw.tssTarget) * 100)}% della settimana: ${weekStart(ctx.today) === ctx.today ? "è appena cominciata" : "c'è ancora margine nei prossimi giorni"}.`) : mean != null ? `In media ${n0(mean)} TSS a settimana nelle ultime 4.` : "Ecco il volume delle ultime settimane.";
  return done({ text, lines, chips: ["A che punto sono col piano?", "Com'è andata la settimana?"] }, state, { intent: "volume" });
}

export { upcoming };
