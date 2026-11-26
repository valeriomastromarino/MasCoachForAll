// Answers added on 26 November 2026, after running the chat on real data: what a planned session is (how long,
// which watts, how much to eat, what it is for), calories, «sono migliorato?», «ho fatto bene ieri?», the weather of a
// day, gym and bike on the same days, races, a light week, a group ride. Every number comes from the app's data.
import { type CalendarWorkout, isBikeSession, onTrainer } from "@/lib/calendar";
import { addDays, weekStart } from "@/lib/dates";
import { classifyWorkout, CLASS_SAY, type WorkoutClass } from "@/lib/training/classify";
import { PHASE_INFO, weekFor } from "@/lib/training/season";
import { carbsFor, toleratedCarbs } from "@/lib/training/suggest";
import { compass, type DayWeather } from "@/lib/weather";
import { buildChat } from "./build";
import type { Action, ChatContext, ChatResult, ChatState, Reply } from "./context";
import { choose } from "./edits";
import { dayLabel, hoursText, minsText, n0, planImpact } from "./helpers";
import { NOTIONS } from "./knowledge";
import { sayPlanned, upcoming } from "./refs";
import { check, stepsOf } from "./smart";
import { normalize, parseDates, parseMinutes, sayDate } from "./text";

const done = (reply: Reply, state: ChatState, focus?: ChatState["focus"]): ChatResult => ({ reply, state: { ...state, pending: null, awaiting: null, focus: focus ?? state.focus } });
const ask = (state: ChatState, action: Action, text: string, lines: string[] = []): ChatResult => ({ reply: { text, lines, chips: ["Sì", "No"], confirm: action }, state: { ...state, pending: action, awaiting: null } });
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const weekday = (date: string) => new Intl.DateTimeFormat("it-IT", { weekday: "long" }).format(new Date(`${date}T12:00:00`));
const clsOf = (w: CalendarWorkout): WorkoutClass => classifyWorkout({ ...w, id: 0 }).cls;

// ── A planned session, explained ─────────────────────────────────────────────────────────────────

export type Aspect = "dura" | "watt" | "carbo" | "spiega";

/** What each kind of session is for, said in two lines. */
const PURPOSE: Partial<Record<WorkoutClass, string[]>> = {
  vo2: ["Serve ad alzare il «tetto» del motore, il massimo consumo di ossigeno: è quello che poi ti fa reggere salite e cambi di ritmo.", "Le ripetute vanno tenute uguali: l'ultima dura ma alla stessa potenza della prima. Se cali più di 10 W, fermati lì."],
  soglia: ["Alza la potenza che tieni a lungo (FTP): è la seduta che sposta di più salite lunghe e cronometro.", "Ritmo costante dall'inizio alla fine di ogni ripetuta; respiro pesante ma controllato."],
  sweetspot: ["Tanto lavoro appena sotto la soglia con poca fatica in cambio: costruisce resistenza alla potenza alta.", "Si parla a fatica ma si parla; cadenza 85-95."],
  tempo: ["Ritmo sostenuto da granfondo: allena la resistenza muscolare e il consumo dei carboidrati a ritmo gara.", "Costante, senza strappi."],
  z2: ["Fondo aerobico: costruisce mitocondri, capillari e resistenza, e si recupera in fretta.", "Deve restare facile: se sali in Z3 non diventa più utile, solo più stancante."],
  recupero: ["Serve solo a far girare le gambe dopo un lavoro duro: non allena, fa recuperare.", "Agilissimo, sotto il 55% della FTP."],
  sprint: ["Allena lo spunto e la forza esplosiva, con recuperi lunghi: ogni sprint deve essere a tutta.", "Recupero completo tra uno e l'altro, se no diventa un lavoro di VO2."],
  anaerobico: ["Sforzi brevi oltre il VO2max: allena la capacità di reggere i cambi di ritmo.", "Recuperi lunghi e qualità prima della quantità."],
};

/** «quanto dura il VO2 di martedì?», «quanti watt nel VO2?», «quanti carbo per la Z2 di domenica?», «spiegami il VO2 4x4». */
export function infoSeduta(ctx: ChatContext, state: ChatState, w: CalendarWorkout, aspect: Aspect): ChatResult {
  const cls = clsOf(w);
  const mins = Math.round((w.secs ?? 0) / 60);
  const indoor = onTrainer(w);
  const ftp = indoor ? (ctx.data.athlete.indoorFtp ?? ctx.data.athlete.ftp) : ctx.data.athlete.ftp;
  const head = `«${w.name}» di ${lower(dayLabel(ctx, w.date))}`;
  const focus = { intent: "seduta", eventId: w.id, date: w.date };
  const chips = ["Spostala", "Rendila più facile", "Perché questa?"];
  const steps = stepsOf(ctx, w);
  const carbs = carbsFor({ mins, cls }, toleratedCarbs(ctx.profile?.carboTollerati));
  if (aspect === "dura") return done({ text: `${head} dura ${minsText(mins)}${w.tss ? `, TSS ${n0(w.tss)}` : ""}, ${indoor ? "sui rulli" : "fuori"}.`, lines: steps, chips: ["Accorciala", "Quanti watt?", "Perché questa?"] }, state, focus);
  if (aspect === "watt") {
    const lines = steps.length ? steps : ["Non ho i passi della seduta: guardala sul calendario."];
    return done({ text: `I watt di ${head}, sulla FTP ${indoor ? "dei rulli" : "di strada"}${ftp ? ` (${ftp} W)` : ""}:`, lines: [...lines, ...(PURPOSE[cls]?.slice(1) ?? [])], chips }, state, focus);
  }
  if (aspect === "carbo") {
    const lines = [`Dura ${minsText(mins)}, ${CLASS_SAY[cls]}.`, mins < 60 ? "Sotto l'ora basta l'acqua; se esci a stomaco vuoto, una banana prima." : "Comincia a mangiare dal primo quarto d'ora, poco e spesso (ogni 20 minuti), senza aspettare la fame.", "Bevi 500-750 ml all'ora, di più col caldo."];
    if (ctx.profile?.carboTollerati) lines.push(`Non oltre i ${ctx.profile.carboTollerati} che hai detto di tollerare.`);
    return done({ text: `Per ${head}: ${carbs}.`, lines, chips: ["Cosa mangio prima?", "Perché questa?"] }, state, focus);
  }
  const fit = check(ctx, w);
  const pw = weekFor(ctx.plan, w.date);
  const lines = [...(PURPOSE[cls] ?? []), ...steps, `${indoor ? "Sui rulli" : "Fuori"}, ${minsText(mins)}${w.tss ? `, TSS ${n0(w.tss)}` : ""}, carboidrati ${carbs}.`];
  if (pw) lines.push(`${PHASE_INFO[pw.phase].label}: ${PHASE_INFO[pw.phase].focus.toLowerCase()}.`);
  lines.push(fit.ok ? "✓ Con i dati di oggi ci sta." : `Attenzione: ${fit.why}`);
  return done({ text: `🚴 ${head}, ${CLASS_SAY[cls]}:`, lines, chips }, state, focus);
}

// ── Numbers of the rides ─────────────────────────────────────────────────────────────────────────

/** Mechanical work of a ride in kJ: on the bike it is about the kcal burned (the body is ~22-25% efficient). */
const kjOf = (a: { avgWatts: number | null; movingTime: number }) => (a.avgWatts ? (a.avgWatts * a.movingTime) / 1000 : 0);

/** «quante calorie ho bruciato questa settimana?», «quante kcal ieri?» */
export function calorie(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const rides = ctx.data.activities.filter((a) => a.type && a.category !== "altro" && a.category !== "nascosta");
  let from = weekStart(ctx.today);
  let to = ctx.today;
  let label = "questa settimana";
  const span = parseDates(t, ctx.today, { past: true });
  if (/\bmese\b/.test(t)) {
    from = `${ctx.today.slice(0, 7)}-01`;
    label = "questo mese";
  } else if (/\bsettimana scorsa\b/.test(t)) {
    from = addDays(weekStart(ctx.today), -7);
    to = addDays(from, 6);
    label = "la settimana scorsa";
  } else if (span && span.from <= ctx.today && !/\bsettimana\b/.test(t)) {
    from = span.from;
    to = span.to > ctx.today ? ctx.today : span.to;
    label = from === to ? sayDate(from) : `dal ${sayDate(from)} al ${sayDate(to)}`;
  }
  const these = rides.filter((a) => a.date.slice(0, 10) >= from && a.date.slice(0, 10) <= to);
  if (!these.length) return done({ text: `Non vedo uscite ${label}.`, chips: ["Com'è andata la settimana?"] }, state);
  const withPower = these.filter((a) => a.avgWatts);
  const kj = Math.round(withPower.reduce((s, a) => s + kjOf(a), 0));
  const secs = these.reduce((s, a) => s + a.movingTime, 0);
  const lines = [`${these.length} ${these.length === 1 ? "uscita" : "uscite"}, ${hoursText(secs)} in bici: ${kj.toLocaleString("it-IT")} kJ di lavoro.`, "In bici i kJ e le kcal spese sono quasi lo stesso numero: il corpo rende il 22-25% e 1 kcal vale 4,18 kJ.", "Il metabolismo del resto della giornata è in più (circa 1.500-1.800 kcal al giorno)."];
  if (withPower.length < these.length) lines.push(`${these.length - withPower.length} senza potenza non ${these.length - withPower.length === 1 ? "è contata" : "sono contate"}.`);
  return done({ text: `🔥 ${label.charAt(0).toUpperCase() + label.slice(1)} in bici circa ${kj.toLocaleString("it-IT")} kcal.`, lines, chips: ["Quanto devo mangiare?", "Com'è andata la settimana?"] }, state);
}

/** «sono migliorato?», «ultimamente vado più forte?»: eFTP, records, aerobic efficiency and fitness against a few weeks ago. */
export function progressi(ctx: ChatContext, state: ChatState): ChatResult {
  const d = ctx.data;
  const lines: string[] = [];
  let up = 0;
  let down = 0;
  const e = d.eftp;
  const now = e.at(-1);
  const before = now ? [...e].reverse().find((p) => p.date <= addDays(now.date, -42)) : undefined;
  if (now && before) {
    const diff = now.eftp - before.eftp;
    lines.push(`eFTP di Intervals: ${n0(now.eftp)} W, ${Math.abs(diff) < 3 ? "come" : diff > 0 ? `+${n0(diff)} W rispetto a` : `${n0(diff)} W rispetto a`} 6 settimane fa (${n0(before.eftp)} W).`);
    if (diff >= 3) up++;
    if (diff <= -3) down++;
  }
  const rec = d.records.rows.filter((r) => r.current != null && r.previous != null);
  const better = rec.filter((r) => r.current! > r.previous! * 1.02);
  const worse = rec.filter((r) => r.current! < r.previous! * 0.98);
  const dur = (s: number) => (s < 60 ? `${s}"` : s < 3600 ? `${Math.round(s / 60)}'` : `${s / 3600} h`);
  if (rec.length) {
    lines.push(better.length ? `Questo mese meglio del mese scorso su ${better.map((r) => dur(r.secs)).join(", ")}${worse.length ? `; peggio su ${worse.map((r) => dur(r.secs)).join(", ")}` : ""}.` : worse.length ? `Questo mese sotto il mese scorso su ${worse.map((r) => dur(r.secs)).join(", ")}: spesso è solo che non hai fatto sforzi così.` : "I migliori sforzi del mese sono in linea con il mese scorso.");
    up += better.length >= 2 ? 1 : 0;
    down += worse.length >= 2 ? 1 : 0;
  }
  const ef = d.efficiency.filter((x) => x.ef != null);
  if (ef.length >= 8) {
    const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const recent = mid(ef.slice(-5).map((x) => x.ef as number));
    const old = mid(ef.slice(0, 5).map((x) => x.ef as number));
    const pct = ((recent - old) / old) * 100;
    lines.push(`Efficienza aerobica (watt per battito nelle uscite facili): ${Math.abs(pct) < 2 ? "stabile" : pct > 0 ? `+${n0(pct)}%` : `${n0(pct)}%`} dall'inizio del periodo.`);
    if (pct >= 2) up++;
    if (pct <= -2) down++;
  }
  const pmc = d.pmc;
  const ctl = pmc.at(-1)?.ctl;
  const ctlBefore = pmc.length > 42 ? pmc[pmc.length - 43].ctl : null;
  if (ctl != null && ctlBefore != null) lines.push(`Fitness (CTL) ${n0(ctl)}, ${Math.abs(ctl - ctlBefore) < 2 ? "come" : ctl > ctlBefore ? "più alta di" : "più bassa di"} 6 settimane fa (${n0(ctlBefore)}).`);
  const text = !lines.length ? "Mi servono qualche settimana di uscite con la potenza per dirtelo." : up > down ? "📈 Sì, stai migliorando." : down > up ? "📉 In questo momento no: i numeri sono un po' sotto." : "➡️ Stai tenendo: nessun salto, né in su né in giù.";
  if (down > up) lines.push("Prima di preoccuparti: dopo una settimana leggera o con poca intensità è normale. Conta la tendenza di 2-3 mesi.");
  return done({ text, lines, chips: ["I miei record", "Rispetto a un anno fa?", "Devo cambiare l'FTP?"] }, state);
}

/** «ho fatto bene ieri?»: the ride against what was planned that day, and what the night said after it. */
export function giudizio(ctx: ChatContext, state: ChatState, text: string): ChatResult | null {
  const span = parseDates(text, ctx.today, { past: true });
  const day = span?.from ?? addDays(ctx.today, -1);
  const rides = ctx.data.activities.filter((a) => a.date.slice(0, 10) === day && a.type && a.category !== "altro" && a.category !== "nascosta" && a.movingTime >= 600);
  if (!rides.length) return done({ text: `${dayLabel(ctx, day)} non vedo uscite.`, chips: ["Com'è andata la settimana?"] }, state);
  const ride = rides.sort((a, b) => b.movingTime - a.movingTime)[0];
  const plan = ctx.data.plan.days.find((p) => p.date === day)?.planned.find((p) => p.secs);
  const lines: string[] = [];
  let good = true;
  if (plan?.secs) {
    const diff = ride.movingTime / plan.secs;
    lines.push(`In programma c'era «${plan.name}» (${minsText(Math.round(plan.secs / 60))}): hai fatto ${hoursText(ride.movingTime)}${diff > 1.15 ? ", più del previsto" : diff < 0.85 ? ", meno del previsto" : ", come previsto"}.`);
    if (plan.load && ride.tss) {
      const l = ride.tss / plan.load;
      if (l > 1.25) {
        good = false;
        lines.push(`TSS ${n0(ride.tss)} contro ${n0(plan.load)} previsti: più dura del piano. Se capita spesso, le qualità dopo ne risentono.`);
      } else lines.push(`TSS ${n0(ride.tss)} contro ${n0(plan.load)} previsti: ${l < 0.75 ? "più leggera del piano, va bene se eri stanco" : "in linea"}.`);
    }
  } else lines.push(`Non c'era nulla in programma: ${hoursText(ride.movingTime)}, TSS ${n0(ride.tss)}.`);
  const easy = ride.IF != null && ride.IF < 0.75;
  if (plan && /z2|endurance|recover|recupero|fondo/i.test(plan.name) && ride.IF != null && ride.IF > 0.78) {
    good = false;
    lines.push(`IF ${ride.IF.toFixed(2).replace(".", ",")}: per una seduta facile è alto, eri oltre la Z2.`);
  } else if (easy) lines.push(`IF ${ride.IF!.toFixed(2).replace(".", ",")}: facile davvero, come deve essere il fondo.`);
  const after = addDays(day, 1) === ctx.today ? ctx.data.status : null;
  if (after) {
    const hrv = after.hrv;
    lines.push(after.readiness.level === "verde" ? "Stanotte il corpo l'ha assorbita bene: oggi sei verde." : `Stanotte i segnali dicono ${after.readiness.level}: ${lower(after.readiness.headline)}.`);
    if (hrv && hrv.status === "sotto la norma") good = false;
  }
  const when = dayLabel(ctx, day) === "Ieri" ? "ieri" : sayDate(day);
  // «ho esagerato?» wants a «no» when it went well; «ho fatto bene?» a «sì».
  const fearsTooMuch = /\b(esagerat\w*|troppo|spinto|tirato)\b/.test(normalize(text));
  const head = good ? (fearsTooMuch ? `👍 No, ${when} è andata bene.` : `👍 Sì, ${when} hai fatto bene.`) : "🤔 Quasi: qualcosa da tenere d'occhio.";
  return done({ text: head, lines, chips: ["Com'è andata l'uscita di ieri?", "Cosa faccio oggi?"] }, state);
}

// ── Weather ──────────────────────────────────────────────────────────────────────────────────────

/** «che tempo fa domenica?», «c'è vento sabato?»: the forecast the calendar saved, and what it means for the session. */
export function meteo(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const span = parseDates(text, ctx.today);
  const date = span && span.from >= ctx.today ? span.from : ctx.today;
  const days = ctx.weather ?? [];
  const w: DayWeather | undefined = days.find((d) => d.date === date);
  if (!w) {
    const why = days.length ? `Le previsioni che ho arrivano fino a ${sayDate(days.at(-1)!.date)}.` : "Non ho le previsioni: le scarica il calendario quando lo apri (Piano → Settimana, in cima c'è il meteo con il vento).";
    return done({ text: `Il meteo di ${lower(dayLabel(ctx, date))} non ce l'ho.`, lines: [why], chips: ["Cosa ho domenica?"] }, state);
  }
  const lines = [`${w.label}, da ${Math.round(w.tMin)} a ${Math.round(w.tMax)} °C${w.rainPct != null ? `, pioggia ${w.rainPct}%` : ""}.`, `Vento da ${compass(w.windFrom)} ${Math.round(w.windKmh)} km/h, raffiche ${Math.round(w.gustKmh)}.`];
  const session = ctx.planned.find((p) => p.date === date && isBikeSession(p));
  const wet = w.kind === "pioggia" || w.kind === "temporale" || w.kind === "neve" || (w.rainPct ?? 0) >= 60;
  const chips: string[] = [];
  if (session && !onTrainer(session) && wet) {
    lines.push(`Hai «${session.name}» fuori: se piove davvero, la sposto sui rulli.`);
    chips.push(`${weekday(date).charAt(0).toUpperCase() + weekday(date).slice(1)} falla sui rulli`);
  } else if (session) lines.push(`Hai «${session.name}» ${onTrainer(session) ? "sui rulli: il meteo non conta" : "fuori"}.`);
  if (w.windKmh >= 25) lines.push("Vento forte: parti controvento e torna col vento a favore, tieni d'occhio la potenza e non la velocità.");
  if (w.tMax <= 6) lines.push("Freddo: strati, guanti e copriscarpe, e mangia un po' di più perché il freddo consuma.");
  if (w.tMax >= 30) lines.push("Caldo: esci presto, bevi 750 ml all'ora o più con i sali, abbassa i watt del 5% se la FC sale.");
  return done({ text: `🌤️ ${dayLabel(ctx, date)}: ${w.label.toLowerCase()}, ${Math.round(w.tMax)} °C, vento ${Math.round(w.windKmh)} km/h.`, lines, chips: [...chips, "Cosa ho domenica?"].slice(0, 3) }, state);
}

// ── Gym ──────────────────────────────────────────────────────────────────────────────────────────

const QUALITY: WorkoutClass[] = ["tempo", "sweetspot", "soglia", "vo2", "anaerobico", "gara"];

/** «posso fare palestra martedì?», «martedì mattina pesi e sera VO2?»: the rule of the engine (no quality the day after). */
export function palestra(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const span = parseDates(text, ctx.today);
  const date = span && span.from >= ctx.today ? span.from : ctx.today;
  const same = upcoming(ctx).filter((w) => w.date === date);
  const next = upcoming(ctx).filter((w) => w.date === addDays(date, 1));
  const sameQ = same.find((w) => QUALITY.includes(clsOf(w)));
  const nextQ = next.find((w) => QUALITY.includes(clsOf(w)));
  const lines: string[] = [];
  let verdict = "✅ Sì.";
  if (sameQ) {
    verdict = "🟡 Si può, con un ordine preciso.";
    lines.push(`${dayLabel(ctx, date)} c'è «${sameQ.name}»: prima la bici, poi i pesi, oppure almeno 6 ore tra le due. I pesi prima tolgono qualità alle ripetute.`);
  }
  if (nextQ) {
    verdict = "⚠️ Meglio di no, o non di gambe.";
    lines.push(`Il giorno dopo c'è ${sayPlanned(nextQ, undefined)}: dopo i pesi di gambe niente qualità per 24-48 ore. Fai parte alta e core, oppure sposta i pesi o la seduta.`);
  }
  if (!sameQ && !nextQ) lines.push(`Nessuna seduta di qualità quel giorno né il giorno dopo: va bene.`);
  const pw = weekFor(ctx.plan, date);
  if (pw) lines.push(pw.phase.startsWith("base") ? "In Base i pesi vanno bene 2 volte a settimana." : "Da adesso basta una volta a settimana per mantenere la forza.");
  const chips = nextQ ? [`Sposta ${sayPlanned(nextQ, undefined)} di un giorno`, "Cosa faccio oggi?"] : ["Cosa faccio oggi?"];
  return done({ text: `${verdict} Pesi ${lower(dayLabel(ctx, date))}:`, lines, chips }, state);
}

// ── Races ────────────────────────────────────────────────────────────────────────────────────────

const RACE_WORD: [RegExp, string][] = [
  [/\bgran ?fondo\b/, "Granfondo"],
  [/\bmedio ?fondo\b/, "Mediofondo"],
  [/\bcronoscalata\b/, "Cronoscalata"],
  [/\bcrono\w*\b/, "Cronometro"],
  [/\bcriterium\b/, "Criterium"],
];

/** «domenica gara», «il 14 dicembre ho una granfondo»: a race on the calendar (it asks A, B or C when not said). */
export function gara(ctx: ChatContext, state: ChatState, text: string): ChatResult | null {
  const t = normalize(text);
  const span = parseDates(t.replace(/\bgara [abc]\b/, "gara"), ctx.today);
  if (!span || span.from < ctx.today) return null;
  const date = span.from;
  const name = RACE_WORD.find(([re]) => re.test(t))?.[1] ?? "Gara";
  const km = t.match(/\b(\d{2,3}) ?km\b/);
  const fullName = km ? `${name} ${km[1]} km` : name;
  const prio = /\bgara a\b|\bobiettivo\b|\bprincipale\b|\bdella stagione\b/.test(t) ? "RACE_A" : /\bgara b\b|\bimportante\b/.test(t) ? "RACE_B" : /\bgara c\b|\bdi allenamento\b|\bper allenarmi\b|\btranquill\w*\b/.test(t) ? "RACE_C" : null;
  const when = sayDate(date);
  if (!prio) return choose(state, `${fullName} ${when}: quanto conta per te?`, [`Gara A ${when}: è il mio obiettivo`, `Gara B ${when}: importante`, `Gara C ${when}: di allenamento`], { intent: "gara", date });
  const lines: string[] = [];
  const same = ctx.planned.filter((w) => w.date === date && isBikeSession(w) && !w.race);
  if (same.length) lines.push(`Quel giorno hai ${same.map((w) => `«${w.name}»`).join(" e ")}: se la gara la sostituisce, dopo dimmi «cancella quella di ${weekday(date)}».`);
  lines.push("Il giorno prima: facile, 45-60' con 3-4 accelerazioni brevi. Il giorno dopo: riposo o recupero.");
  if (prio === "RACE_A") lines.push("Se è l'obiettivo della stagione, mettila anche come gara A nella pagina Stagione: il piano costruisce il tapering delle 2 settimane prima.");
  if (km) {
    const hours = Number(km[1]) / 28;
    lines.push(`${km[1]} km sono circa ${hoursText(Math.round(hours * 3600))}: carboidrati ${carbsFor({ mins: Math.round(hours * 60), cls: "gara" }, toleratedCarbs(ctx.profile?.carboTollerati))}.`);
  }
  const label = `${fullName} ${when} (${prio.replace("RACE_", "gara ")})`;
  return ask(state, { type: "race_add", date, priority: prio, name: fullName, label }, `Segno ${label} sul calendario di Intervals. Confermi?`, lines);
}

// ── The week ─────────────────────────────────────────────────────────────────────────────────────

/** «rendi leggera questa settimana», «la prossima settimana di scarico»: a light week asked for, in the season. */
export function leggera(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  if (!ctx.setup) return done({ text: "Per rendere leggera una settimana mi serve il piano di stagione: apri «Stagione» e impostalo.", chips: ["Cosa faccio oggi?"] }, state);
  const next = /\b(prossima|settimana prossima|dopo)\b/.test(t);
  const start = next ? addDays(weekStart(ctx.today), 7) : weekStart(ctx.today);
  const pw = ctx.plan?.weeks.find((w) => w.start === start);
  const what = next ? "La prossima settimana" : "Questa settimana";
  const tired = /\b(stanc\w*|cotto|cotta|a pezzi|sfinit\w*|non recupero)\b/.test(t);
  if (pw && pw.kind === "scarico") {
    const r = done({ text: `${what} è già leggera: ${pw.tssTarget} TSS di riferimento, una sola qualità corta.`, lines: tired ? ["Se sei stanco anche così, oggi abbasso la giornata di un livello.", "Se la stanchezza dura più di qualche giorno, con HRV bassa e sonno peggiore, scrivimelo: è un segnale da ascoltare."] : [], chips: ["Cosa faccio oggi?", "Oggi riposo"] }, state);
    return tired ? { ...r, overrides: { feeling: { drop: true, note: "sei stanco" } } } : r;
  }
  if (ctx.setup.lightWeeks?.includes(start)) return done({ text: `${what} l'avevi già chiesta leggera.`, chips: ["Cosa faccio oggi?"] }, state);
  const lightWeeks = [...(ctx.setup.lightWeeks ?? []), start];
  // The days the Stagione page froze from an old proposal go, so the week is proposed again light; the athlete's own stay.
  const plans = ctx.setup.weekPlans ?? {};
  const kept = (plans[start] ?? []).filter((c) => c.mine);
  const weekPlans = { ...plans };
  if (kept.length) weekPlans[start] = kept;
  else delete weekPlans[start];
  const patch = { lightWeeks, weekPlans };
  const lines = [...planImpact(ctx, { setup: { lightWeeks } }), "Una settimana leggera: circa il 60% del carico, una sola qualità corta, la lunga più corta."];
  if (kept.length) lines.push(`I giorni che hai scelto tu nella Stagione restano: ${kept.map((c) => weekday(c.date)).join(", ")}.`);
  const planned = ctx.planned.filter((w) => w.date >= ctx.today && w.date >= start && w.date <= addDays(start, 6) && isBikeSession(w));
  if (planned.length) lines.push(`Su Intervals restano ${planned.map((w) => `«${w.name}» ${weekday(w.date)}`).join(", ")}: se vuoi le alleggerisco una per una («rendi più facile quella di ${weekday(planned[0].date)}»).`);
  const r = ask(state, { type: "set_season", patch, label: `${what} leggera` }, `Rendo leggera ${lower(what)} (dal ${sayDate(start)}). Confermi?`, lines);
  return tired ? { ...r, overrides: { feeling: { drop: true, note: "sei stanco" } } } : r;
}

// ── A group ride ─────────────────────────────────────────────────────────────────────────────────

/** «domani esco con gli amici, giro di 3 ore»: a session of those hours outdoors, with what a group ride really is. */
export function giroLibero(ctx: ChatContext, state: ChatState, text: string): ChatResult | null {
  const t = normalize(text);
  const mins = parseMinutes(t);
  const span = parseDates(t, ctx.today);
  if (!mins || !span || span.from < ctx.today) return null;
  const date = span.from;
  const dayWord = date === ctx.today ? "oggi" : date === addDays(ctx.today, 1) ? "domani" : weekday(date);
  const built = buildChat("new", ctx, { ...state, draft: null }, `${dayWord} ${mins} minuti z2 fuori`);
  const gruppo = NOTIONS.find((n) => n.id === "gruppo")!.say(ctx).lines;
  built.reply.text = `Un giro di ${minsText(mins)} con gli amici ${dayWord}: lo metto come uscita facile, così il piano ne tiene conto. ${built.reply.text}`;
  built.reply.lines = [...(built.reply.lines ?? []), "In gruppo raramente si resta in Z2: se si va forte conta come una qualità e il giorno dopo va facile.", gruppo[0]];
  return built;
}
