// What changes things: today's wishes (applied at once, nothing leaves the app), writes to Intervals.icu and to the sheet
// and the season (always shown first and confirmed with a "sì"), and the life events that reshape the plan.
import { addDays, weekStart } from "@/lib/dates";
import { LIFE_LABEL, openLife } from "@/lib/training/life";
import { RAMP_TARGET, type RampLevel } from "@/lib/training/season";
import type { WorkoutClass } from "@/lib/training/suggest";
import { type Action, type ChatContext, type ChatResult, type ChatState, type Reply, suggestInput, type TodayOverrides } from "./context";
import { dayLabel, dayShort, minsText, planImpact, suggestFor, suggestionReply, weekFrom, withOptions } from "./helpers";
import { BODY_RE, classFrom } from "./intents";
import { MONTHS, normalize, parseDates, parseHours, parseMinutes, parseRpe, sayDate, sayRange, weekdayFrom, WEEKDAY_NAMES } from "./text";
import { CLASS_SAY } from "@/lib/training/suggest";

type Patch = Partial<Omit<TodayOverrides, "date">>;
const ladder: WorkoutClass[] = ["recupero", "z2", "tempo", "sweetspot", "soglia", "vo2", "anaerobico"];

/** A write that waits for "sì". */
function ask(state: ChatState, action: Action, text: string, lines: string[] = []): ChatResult {
  return { reply: { text, lines, chips: ["Sì", "No"], confirm: action }, state: { ...state, pending: action, awaiting: null } };
}
const plain = (state: ChatState, reply: Reply): ChatResult => ({ reply, state: { ...state, pending: null, awaiting: null } });

/** The context with today's wishes updated: what the answer is computed on. */
function withPatch(ctx: ChatContext, patch: Patch): ChatContext {
  const cur = ctx.overrides.date === ctx.today ? ctx.overrides : { date: ctx.today };
  return { ...ctx, overrides: { ...cur, ...patch, date: ctx.today } };
}

/** A new proposal after today's wishes changed. */
function repropose(ctx: ChatContext, state: ChatState, patch: Patch, lead: string, exclude: number[] = []): ChatResult {
  const c2 = withPatch(ctx, patch);
  const s = suggestFor(c2, ctx.today, exclude.length ? { exclude } : {});
  const reply = suggestionReply(c2, s, ctx.today, lead);
  return { reply, state: s.kind === "workout" ? withOptions(state, [s.main, ...s.alternatives], ctx.today) : { ...state, pending: null, awaiting: null }, overrides: patch };
}

// ── Change the workout ───────────────────────────────────────────────────────────────────────────

export function cambia(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const span = parseDates(text, ctx.today);
  const date = span && span.from >= ctx.today ? span.from : (state.optionsDate ?? ctx.today);
  const current = state.options[state.index];
  const patch: Patch = {};
  const wanted = classFrom(t);
  if (/(piu facile|meno duro|piu leggero|leggero|piu easy|rilassat)/.test(t)) {
    patch.easier = true;
    patch.wantClass = undefined;
  } else if (/(piu duro|piu intenso|piu impegnativo|piu forte)/.test(t)) {
    const i = current ? ladder.indexOf(current.cls) : 3;
    patch.wantClass = ladder[Math.min(ladder.length - 1, Math.max(0, i) + 1)];
    patch.easier = false;
  } else if (wanted) {
    patch.wantClass = wanted;
    patch.easier = false;
  }
  if (/(piu corto|piu breve|accorcia)/.test(t)) patch.maxMins = parseMinutes(t) ?? Math.max(20, Math.round(((current?.mins ?? 60) * 0.75) / 5) * 5);
  else if (/(piu lungo|allunga)/.test(t)) patch.maxMins = undefined;
  else if (parseMinutes(t)) patch.maxMins = parseMinutes(t)!;
  if (/(rulli|indoor|in casa)/.test(t)) patch.place = "indoor";
  else if (/(fuori|all aperto|in strada|outdoor)/.test(t)) patch.place = "outdoor";

  const changed = Object.keys(patch).length > 0;
  if (date !== ctx.today) {
    const extra = { override: { easier: patch.easier, wantClass: patch.wantClass, maxMins: patch.maxMins }, place: patch.place ?? "any", exclude: changed ? [] : state.shown };
    const s = suggestFor(ctx, date, extra);
    return { reply: suggestionReply(ctx, s, date, "Va bene."), state: s.kind === "workout" ? withOptions(state, [s.main, ...s.alternatives], date) : state };
  }
  const lead = patch.easier ? "Più facile, allora." : patch.wantClass ? `Come chiedi: ${CLASS_SAY[patch.wantClass]}.` : patch.maxMins ? `Entro ${minsText(patch.maxMins)}.` : changed ? "Va bene." : "Ecco un'altra idea.";
  return repropose(ctx, state, patch, lead, changed ? [] : state.shown);
}

export function programma(ctx: ChatContext, state: ChatState): ChatResult {
  let option = state.options[state.index];
  let date = state.optionsDate ?? ctx.today;
  if (!option) {
    const s = suggestFor(ctx, ctx.today);
    if (s.kind === "rest") return plain(state, { text: `Oggi la proposta è riposo: non c'è nulla da programmare. ${s.reason}`, chips: ["Cosa faccio domani?"] });
    option = s.main;
    date = ctx.today;
  }
  const existing = ctx.planned.filter((w) => w.date === date);
  const label = `${option.workout.name} (${minsText(option.mins)}, TSS ${option.tss}) ${dayLabel(ctx, date).toLowerCase()}`;
  const action: Action = { type: "schedule", items: [{ workoutId: option.workout.id, name: option.workout.name, date }], replace: existing.map((e) => e.id), label };
  const lines = existing.length ? [`Su Intervals hai già in programma ${existing.map((e) => e.name).join(", ")} per quel giorno: lo tolgo e metto questo.`] : [];
  return ask(state, action, `Scrivo su Intervals: ${label}. Confermi?`, lines);
}

export function programmaSettimana(ctx: ChatContext, state: ChatState): ChatResult {
  const items = weekFrom(ctx).flatMap(({ date, suggestion: s, planned }) => (!planned && s?.kind === "workout" ? [{ workoutId: s.main.workout.id, name: s.main.workout.name, date, label: `${dayShort(date)}: ${s.main.workout.name} (${minsText(s.main.mins)}, TSS ${s.main.tss})` }] : []));
  if (!items.length) return plain(state, { text: "Non c'è nulla da programmare nei prossimi 7 giorni: o è già tutto in calendario o sono giorni di riposo.", chips: ["I prossimi giorni"] });
  const action: Action = { type: "schedule", items: items.map(({ workoutId, name, date }) => ({ workoutId, name, date })), label: `${items.length} allenamenti nei prossimi 7 giorni` };
  return ask(state, action, `Scrivo su Intervals ${items.length} allenamenti. Confermi?`, items.map((i) => i.label));
}

export function sposta(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const parts = t.split(/\b(?:a|al|su|per)\b(?!.*\b(?:a|al|su|per)\b)/);
  const to = parseDates(parts[parts.length - 1] ?? "", ctx.today);
  const from = parts.length > 1 ? parseDates(parts[0], ctx.today) : null;
  const sourceDate = from?.from ?? ctx.today;
  const ev = ctx.planned.find((w) => w.date === sourceDate) ?? ctx.planned.find((w) => w.date >= ctx.today);
  if (!ev) return plain(state, { text: "Non vedo allenamenti in programma da spostare nei prossimi giorni.", chips: ["I prossimi giorni"] });
  if (!to || to.from < ctx.today) return plain(state, { text: `Dove sposto ${ev.name}? Dimmi il giorno, per esempio «sposta a domani» o «sposta a venerdì».`, chips: ["Sposta a domani", "Sposta a dopodomani"] });
  if (ctx.planned.some((w) => w.date === to.from && w.id !== ev.id)) return plain(state, { text: `${dayLabel(ctx, to.from)} hai già un allenamento in programma: scegli un altro giorno o cancella prima quello.`, chips: ["Sposta a dopodomani"] });
  const label = `${ev.name} da ${sayDate(ev.date)} a ${sayDate(to.from)}`;
  return ask(state, { type: "move", eventId: ev.id, name: ev.name, to: to.from, label }, `Sposto su Intervals: ${label}. Confermi?`);
}

export function cancella(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const span = parseDates(text, ctx.today);
  const date = span?.from ?? ctx.today;
  const ev = ctx.planned.find((w) => w.date === date);
  if (!ev) return plain(state, { text: `Non vedo allenamenti in programma ${sayRange(date, date)}.`, chips: ["I prossimi giorni"] });
  const label = `${ev.name} (${sayDate(date)})`;
  return ask(state, { type: "remove", eventId: ev.id, name: ev.name, label }, `Cancello da Intervals: ${label}. Confermi?`);
}

// ── Life: holidays, fever, injury ────────────────────────────────────────────────────────────────

const explicitRange = (t: string, from: string, to: string) => from !== to && /(\bal\b|\ba\b|fino|per \d|tra il|fra il)/.test(t);

export function vitaMalattia(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const open = openLife(ctx.life, ctx.today, "SICK");
  if (open) return plain(state, { text: `Su Intervals hai già una malattia ${sayRange(open.from, open.to)}. Quando passa scrivimi «sto meglio»: la chiudo e parte il rientro.`, chips: ["Sto meglio", "Come sto?"] });
  const span = parseDates(text, ctx.today, { past: true });
  const from = span?.from ?? ctx.today;
  const to = span && explicitRange(t, span.from, span.to) ? span.to : addDays(from > ctx.today ? from : ctx.today, 6);
  const ev = { id: "nuova", category: "SICK" as const, from, to };
  const action: Action = { type: "life_add", category: "SICK", from, to, name: "Malattia (febbre)", label: `Malattia ${sayRange(from, to)}` };
  const lines = [
    "Finché hai la febbre: riposo.",
    "Quando passa: 7 giorni di sola Z1-Z2 breve (45 minuti al massimo), poi si risale con calma.",
    "Se la febbre è alta, dura più di 3 giorni o hai dolore al petto, senti il medico: non faccio diagnosi.",
    ...planImpact(ctx, { life: [ev] }),
    "Quando passa scrivimi «sto meglio»: chiudo la malattia con la data giusta.",
  ];
  return ask(state, action, `Mi dispiace. Segno la malattia ${sayRange(from, to)} sul calendario di Intervals. Confermi?`, lines);
}

export function vitaInfortunio(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const part = t.match(BODY_RE)?.[1] ?? "";
  const open = openLife(ctx.life, ctx.today, "INJURED");
  if (open) return plain(state, { text: `Su Intervals hai già un infortunio ${sayRange(open.from, open.to)}. Quando passa scrivimi «sto meglio».`, chips: ["Sto meglio", "Come sto?"] });
  const span = parseDates(text, ctx.today, { past: true });
  const from = span?.from ?? ctx.today;
  const to = span && explicitRange(t, span.from, span.to) ? span.to : addDays(from > ctx.today ? from : ctx.today, 13);
  const ev = { id: "nuova", category: "INJURED" as const, from, to };
  const name = part ? `Infortunio: ${part}` : "Infortunio";
  const action: Action = { type: "life_add", category: "INJURED", from, to, name, label: `${name} ${sayRange(from, to)}` };
  const lines = [
    "Finché dura: solo Z1-Z2, facile, 60 minuti al massimo, niente lavori duri.",
    "Se pedalando il dolore aumenta, ti fermi. Se è grave o non passa, senti il medico.",
    "Per qualche giorno dopo, ancora Z1-Z2 prima di risalire.",
    ...planImpact(ctx, { life: [ev] }),
    "Quando passa scrivimi «sto meglio».",
  ];
  return ask(state, action, `Segno ${name.toLowerCase()} ${sayRange(from, to)} su Intervals. Confermi?`, lines);
}

export function vitaFerie(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const span = parseDates(text, ctx.today);
  if (!span) {
    return { reply: { text: "Dimmi le date: per esempio «dal 10 al 20 dicembre» oppure «il 14 e 15 novembre».", chips: ["Dal 10 al 20 dicembre", "Da lunedì a venerdì", "Nel weekend"] }, state: { ...state, pending: null, awaiting: { intent: "vita_ferie" } } };
  }
  const trip = /(viaggio|trasferta|lavoro|conferenza)/.test(t);
  const name = trip ? "Trasferta" : "Ferie";
  const ev = { id: "nuova", category: "HOLIDAY" as const, from: span.from, to: span.to };
  const days = Math.round((new Date(`${span.to}T12:00:00`).getTime() - new Date(`${span.from}T12:00:00`).getTime()) / 86400000) + 1;
  const lines = [
    `${days} ${days === 1 ? "giorno" : "giorni"} senza allenamento.`,
    days >= 5 ? "Dopo uno stop così il piano mette una settimana leggera di rientro." : "Il piano riassorbe lo stop senza cambiare le fasi.",
    ...planImpact(ctx, { life: [ev] }),
  ];
  return ask(state, { type: "life_add", category: "HOLIDAY", from: span.from, to: span.to, name, label: `${name} ${sayRange(span.from, span.to)}` }, `Segno ${name.toLowerCase()} ${sayRange(span.from, span.to)} su Intervals. Confermi?`, lines);
}

export function vitaGuarito(ctx: ChatContext, state: ChatState): ChatResult {
  const open = openLife(ctx.life, ctx.today);
  if (!open) return plain(state, { text: "Non vedo malattie o infortuni aperti sul calendario di Intervals. Se stai meglio, bene: per oggi vale la prontezza dei dati.", chips: ["Come sto?", "Cosa faccio oggi?"] });
  const yesterday = addDays(ctx.today, -1);
  const to = yesterday >= open.from ? yesterday : open.from;
  const sick = open.category === "SICK";
  const label = `${LIFE_LABEL[open.category]} chiusa il ${sayDate(to)}`;
  const lines = sick
    ? ["Da oggi 7 giorni di sola Z1-Z2 breve (45 minuti al massimo), poi si risale: dopo la febbre non si forza.", "Se la febbre torna, scrivimelo."]
    : ["Per qualche giorno ancora Z1-Z2 (60 minuti al massimo), poi si risale.", "Se il dolore torna pedalando, ti fermi."];
  return ask(state, { type: "life_close", id: open.id, category: open.category, to, label }, `Bene! Chiudo ${LIFE_LABEL[open.category].toLowerCase()} su Intervals (ultimo giorno ${sayRange(to, to).replace("il ", "")}). Confermi?`, lines);
}

// ── Feelings and today's wishes (applied at once) ────────────────────────────────────────────────

const FEELINGS: [RegExp, string][] = [
  [/gambe (pesanti|dure|vuote|di legno)/, "hai le gambe pesanti"],
  [/dormito (male|poco)|sonno scarso|non ho dormito/, "hai dormito male"],
  [/mal di testa/, "hai mal di testa"],
  [/nausea/, "hai nausea"],
  [/stress|nervos/, "sei stressato"],
  [/stanc|sfinit|distrutt|spossat|affaticat|fiacco|scarico|a pezzi|poca energia|non ne ho/, "sei stanco"],
];

export function sensazione(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const note = FEELINGS.find(([re]) => re.test(t))?.[1] ?? "non stai bene";
  const rpe = parseRpe(text) ?? undefined;
  const from = ctx.data.status.readiness.level;
  const extra = /dorm/.test(note) && ctx.data.status.sleepHours != null ? ` Nei dati stanotte risultano ${ctx.data.status.sleepHours.toFixed(1).replace(".", ",")} ore di sonno.` : "";
  const lead = `Capito: ${note}. Abbasso la prontezza di un livello per oggi (era ${from}).${extra}`;
  return repropose(ctx, state, { feeling: { drop: true, note, rpe }, wantClass: undefined }, lead);
}

export function dolore(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const part = normalize(text).match(BODY_RE)?.[1];
  const note = part ? `ti fa male ${part.endsWith("a") ? "la" : "il"} ${part}` : "hai un fastidio";
  const r = repropose(ctx, state, { feeling: { drop: true, note }, wantClass: undefined }, `Se è un fastidio, oggi vado leggero (prontezza abbassata di un livello).`);
  r.reply.lines = [...(r.reply.lines ?? []), `Se è un infortunio vero, scrivimi «infortunio${part ? ` al ${part}` : ""}»: lo segno su Intervals e il piano resta Z1-Z2 finché non passa.`, "Se il dolore aumenta pedalando, ti fermi."];
  r.reply.chips = [...(r.reply.chips ?? []).slice(0, 2), `Infortunio${part ? ` al ${part}` : ""}`];
  return r;
}

export function sensazioneBuona(ctx: ChatContext, state: ChatState): ChatResult {
  const s = suggestFor(ctx, ctx.today);
  const reply = suggestionReply(ctx, s, ctx.today, "Bene! Le sensazioni positive contano, ma la prontezza la decidono i dati e non la alzo.");
  return { reply, state: s.kind === "workout" ? withOptions(state, [s.main, ...s.alternatives], ctx.today) : state };
}

export function resetOggi(ctx: ChatContext, state: ChatState): ChatResult {
  const clean: ChatContext = { ...ctx, overrides: { date: ctx.today } };
  const s = suggestFor(clean, ctx.today);
  const reply = suggestionReply(clean, s, ctx.today, "Fatto: ho tolto le richieste di oggi.");
  return { reply, state: s.kind === "workout" ? withOptions(state, [s.main, ...s.alternatives], ctx.today) : state, resetOverrides: true };
}

export function riposoOggi(ctx: ChatContext, state: ChatState): ChatResult {
  const pw = ctx.plan?.weeks.find((w) => ctx.today >= w.start && ctx.today <= w.end);
  const lines = pw ? [`Il carico di riferimento della settimana (${pw.tssTarget} TSS) lo redistribuisco sui giorni che restano: non recuperare tutto in uno.`] : [];
  return { reply: { text: "Va bene, oggi riposo. Una giornata libera fa parte del piano.", lines, chips: ["Cosa faccio domani?", "Come va la settimana?"] }, state: { ...state, pending: null, awaiting: null }, overrides: { restToday: true } };
}

export function prefLuogo(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const place = /(rulli|indoor|in casa|piove|freddo|vento)/.test(t) ? "indoor" : "outdoor";
  return repropose(ctx, state, { place }, place === "indoor" ? "Rulli, allora." : "Fuori, allora.");
}

export function prefMinuti(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const mins = parseMinutes(text);
  if (!mins) return plain(state, { text: "Quanto tempo hai? Per esempio «ho 45 minuti» o «ho un'ora e mezza».", chips: ["Ho 45 minuti", "Ho un'ora", "Ho due ore"] });
  return repropose(ctx, state, { maxMins: mins }, `Hai ${minsText(mins)}.`);
}

// ── Preferences that change the sheet or the season (confirmed) ──────────────────────────────────

export function prefGiorno(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const wd = weekdayFrom(text);
  if (wd === null) return plain(state, { text: "Quale giorno? Per esempio «il martedì non posso».", chips: ["Il martedì non posso", "Posso anche il sabato"] });
  const t = normalize(text);
  const add = /(posso (anche )?allenarmi|libero|disponibile)/.test(t) && !/non posso/.test(t);
  const current = ctx.profile?.giorni?.length ? ctx.profile.giorni : [0, 1, 2, 3, 4, 5, 6];
  const next = add ? [...new Set([...current, wd])].sort() : current.filter((d) => d !== wd);
  if (JSON.stringify(next) === JSON.stringify([...current].sort())) return plain(state, { text: `${add ? "Il" : "Il"} ${WEEKDAY_NAMES[wd]} è già ${add ? "tra i giorni in cui ti alleni" : "un giorno senza allenamento"}.`, chips: ["Cosa faccio oggi?"] });
  if (!next.length) return plain(state, { text: "Così non resterebbe nessun giorno per allenarti: dimmi almeno un giorno disponibile.", chips: ["Posso anche il sabato"] });
  const names = next.map((d) => WEEKDAY_NAMES[d].slice(0, 3)).join(", ");
  return ask(state, { type: "set_profile", patch: { giorni: next }, label: `Giorni disponibili: ${names}` }, `${add ? `Aggiungo il ${WEEKDAY_NAMES[wd]}` : `Tolgo il ${WEEKDAY_NAMES[wd]}`}: i giorni diventano ${names}. Lo salvo nella scheda. Confermi?`, ["Nel piano, i giorni liberi restano riposo."]);
}

export function prefOre(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const hours = parseHours(text);
  if (!hours || hours < 2 || hours > 30) return plain(state, { text: "Quante ore? Per esempio «massimo 8 ore a settimana» o «questa settimana solo 5 ore».", chips: ["Massimo 8 ore a settimana", "Questa settimana solo 5 ore"] });
  if (!ctx.setup) return plain(state, { text: "Per limitare le ore mi serve il piano di stagione: apri «Stagione» e impostalo.", chips: ["Cosa faccio oggi?"] });
  const t = normalize(text);
  const oneOff = /(questa settimana|settimana prossima|prossima settimana|la settimana)/.test(t);
  if (oneOff) {
    const start = /(prossima)/.test(t) ? addDays(weekStart(ctx.today), 7) : weekStart(ctx.today);
    const caps = [...(ctx.setup.weekCaps ?? []).filter((c) => c.start !== start), { start, hours }];
    return ask(state, { type: "set_season", patch: { weekCaps: caps }, label: `Settimana dal ${Number(start.slice(8))}/${start.slice(5, 7)}: massimo ${hours} ore` }, `Limito a ${hours} ore la settimana dal ${Number(start.slice(8))}/${start.slice(5, 7)}. Confermi?`, planImpact(ctx, { setup: { weekCaps: caps } }));
  }
  return ask(state, { type: "set_season", patch: { maxHours: hours }, label: `Ore massime a settimana: ${hours}` }, `Imposto ${hours} ore come massimo a settimana. Confermi?`, planImpact(ctx, { setup: { maxHours: hours } }));
}

export function prefRamp(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  if (!ctx.setup) return plain(state, { text: "Per cambiare il ramp rate mi serve il piano di stagione: apri «Stagione» e impostalo.", chips: ["Cosa faccio oggi?"] });
  const t = normalize(text);
  const levels: RampLevel[] = ["prudente", "bilanciato", "aggressivo"];
  const cur = levels.indexOf(ctx.setup.ramp);
  let next: RampLevel | null = null;
  const named = levels.find((l) => t.includes(l.slice(0, 7)) || (l === "aggressivo" && /aggressiv/.test(t)));
  if (named) next = named;
  else if (/(piu (prudente|piano|cauto)|meno (forte|carico)|abbass|dimin|riduci)/.test(t)) next = levels[Math.max(0, cur - 1)];
  else if (/(piu (forte|aggressiv|veloce)|alz|aument|accelera|piu carico)/.test(t)) next = levels[Math.min(2, cur + 1)];
  if (!next || next === ctx.setup.ramp) return plain(state, { text: next ? `Il ramp rate è già ${next}.` : `Oggi è ${ctx.setup.ramp} (circa +${String(RAMP_TARGET[ctx.setup.ramp]).replace(".", ",")} CTL a settimana). Vuoi più prudente o più aggressivo?`, chips: ["Più prudente", "Più aggressivo"] });
  return ask(state, { type: "set_season", patch: { ramp: next }, label: `Ramp rate ${next}` }, `Passo il ramp rate da ${ctx.setup.ramp} a ${next} (circa +${String(RAMP_TARGET[next]).replace(".", ",")} CTL a settimana). Confermi?`, planImpact(ctx, { setup: { ramp: next } }));
}

export function prefPicco(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  if (!ctx.setup) return plain(state, { text: "Per impostare il picco mi serve il piano di stagione: apri «Stagione» e rispondi alle domande.", chips: ["Cosa faccio oggi?"] });
  const t = normalize(text);
  const wk = t.match(/(\d{1,2}) settimane/);
  let weeks = wk ? Number(wk[1]) : (ctx.setup.peak?.weeks ?? 8);
  const lines: string[] = [];
  if (weeks > 8) {
    lines.push("Il picco dura al massimo 8 settimane: l'ho accorciato.");
    weeks = 8;
  }
  let start = parseDates(text.replace(/\d{1,2} settimane/, ""), ctx.today)?.from ?? null;
  if (!start) {
    const month = Object.keys(MONTHS).find((m) => new RegExp(`\\b${m}\\b`).test(t) && m.length > 3);
    if (month) {
      const y = Number(ctx.today.slice(0, 4));
      const m = MONTHS[month];
      const first = `${m >= Number(ctx.today.slice(5, 7)) ? y : y + 1}-${String(m).padStart(2, "0")}-01`;
      start = weekStart(first) < first ? addDays(weekStart(first), 7) : first;
    }
  }
  if (!start) return plain(state, { text: "Dimmi da quando e per quante settimane, per esempio «picco dal 14 giugno per 8 settimane».", chips: ["Picco dal 14 giugno per 8 settimane"] });
  if (start < ctx.today) return plain(state, { text: "Il picco deve iniziare da oggi in poi: dimmi una data futura.", chips: [] });
  const peak = { start, weeks };
  return ask(state, { type: "set_season", patch: { peak }, label: `Picco ${sayRange(start, addDays(start, weeks * 7 - 1))}` }, `Imposto il picco ${sayRange(start, addDays(start, weeks * 7 - 1))} (${weeks} settimane). Confermi?`, [...lines, ...planImpact(ctx, { setup: { peak } })]);
}

// ── Data entered by voice: RPE and carbohydrates ─────────────────────────────────────────────────

function rideFor(ctx: ChatContext, text: string, minMins = 20) {
  const span = parseDates(text, ctx.today, { past: true });
  const rides = [...ctx.data.activities].filter((a) => a.movingTime >= minMins * 60 && a.type && a.category !== "altro" && a.category !== "nascosta").sort((a, b) => b.date.localeCompare(a.date));
  return span ? rides.find((a) => a.date.slice(0, 10) === span.from) : rides[0];
}

export function rpe(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const value = parseRpe(text);
  if (!value) return plain(state, { text: "Che RPE? Un numero da 1 a 10, per esempio «RPE 7 per ieri».", chips: ["RPE 7 per ieri"] });
  const ride = rideFor(ctx, text);
  if (!ride) return plain(state, { text: "Non trovo l'uscita: dimmi il giorno, per esempio «RPE 7 per ieri».", chips: [] });
  const [lo, hi] = ride.IF == null ? [0, 10] : ride.IF < 0.6 ? [2, 4] : ride.IF < 0.75 ? [3, 5] : ride.IF < 0.85 ? [5, 6] : ride.IF < 0.95 ? [6, 8] : [8, 10];
  const lines = [ride.IF == null ? "" : value > hi + 1 ? "È più dura di quanto dicano i numeri: tienilo presente (sonno, caldo, fatica accumulata)." : value < lo - 1 ? "È più facile di quanto dicano i numeri: buon segno." : "È coerente con i numeri."].filter(Boolean);
  const label = `RPE ${value} su ${ride.name} (${sayDate(ride.date.slice(0, 10))})`;
  return ask(state, { type: "rpe", activityId: ride.id, rpe: value, label }, `Scrivo su Intervals: ${label}. Confermi?`, lines);
}

export function registraCarbo(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const ph = t.match(/(\d{2,3}) ?g(?:r|rammi)? ?(?:\/ ?h|all ora|l ora|ora)/);
  const tot = ph ? null : t.match(/(\d{2,4}) ?g(?:r|rammi)?\b/);
  const ride = rideFor(ctx, text, 30);
  if ((!ph && !tot) || !ride) return plain(state, { text: "Dimmi i grammi e, se non è l'ultima uscita, il giorno: «ho preso 60 g/h» oppure «ho preso 150 g ieri».", chips: ["Ho preso 60 g/h"] });
  const hours = ride.movingTime / 3600;
  const grams = ph ? Math.round(Number(ph[1]) * hours) : Number(tot![1]);
  const label = `${ph ? `${ph[1]} g/h × ${hours.toFixed(1).replace(".", ",")} h = ` : ""}${grams} g su ${ride.name} (${sayDate(ride.date.slice(0, 10))})`;
  return ask(state, { type: "carbs", activityId: ride.id, grams, perHour: ph ? Number(ph[1]) : undefined, label }, `Registro su Intervals i carboidrati assunti: ${label}. Confermi?`, ["Registro solo quelli che mi dici tu: la stima di Intervals non la uso mai."]);
}

export { suggestInput };
