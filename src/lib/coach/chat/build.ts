// The chat builds sessions: «domani sui rulli 3x12' sweet spot rec 5'»,
// «dammi una soglia da 60'», «inseriscimi 6 sprint nella Z2 di domani». The engine in lib/training/build reads the words
// and builds the session; here it is shown (drawing, steps in watts, what was assumed, the check with readiness and the
// week), changed with words («fai 4 ripetute», «sposta a venerdì», «sui rulli») and written on Intervals.icu after «sì».
// All with rules: no model, no cost.
import { isBikeSession, type LibraryWorkout } from "@/lib/calendar";
import { addDays } from "@/lib/dates";
import { composeInsert, composeNew, type Composed, durLabel, vagueSets } from "@/lib/training/build/compose";
import { parseIntervalsText, sectionsFromBlocks, toIntervalsText } from "@/lib/training/build/intervalsText";
import { blocksOf, type Section, type Step } from "@/lib/training/build/model";
import { intensityIn, parseSpec, prepare, type SetSpec, type Spec } from "@/lib/training/build/parse";
import { CLASS_SAY, type WorkoutClass } from "@/lib/training/classify";
import { PHASE_INFO, weekFor } from "@/lib/training/season";
import { plannedFits } from "@/lib/training/suggest";
import { type Action, type ChatContext, type ChatResult, type ChatState, type Draft, suggestInput, type WorkoutCard } from "./context";
import { sayDate } from "./text";

const CREATE = /\b(crea|creami|creane|costruisci|costruiscimi|prepara|preparami|inventa|inventami|scrivi|scrivimi|disegna|disegnami|progetta|progettami)\b/;
const ASK_TYPED = /\b(dammi|fammi|voglio|vorrei|mi serve|programmami|mettimi)\b.*\b(un|una|uno)\b.*\b(da|di) \d+(min|sec)?\b|\b(dammi|fammi) (un|una|uno) (seduta|allenamento|workout)\b/;
const INSERT = /\b(inserisci|inseriscimi|inseriscici|aggiungi|aggiungimi|aggiungici|metti|mettimi|mettici|infila|infilami)\b/;
const INTO = /\b(nella|nel|nello|dentro|alla|al|all|sulla|sul)\b.*\b(z2|uscita|seduta|allenamento|lunga|lungo|giro|fondo|rulli|programma|calendario|oggi|domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/;
const EDIT = /^(fai|falla|fanne|metti|mettila|mettine|porta|portala|portale|cambia|allunga|allungala|accorcia|accorciala|togli|aggiungi|piu|meno|recupero|recuperi|rec|riscaldamento|defaticamento|sposta|spostala|chiamala|sui rulli|sul rullo|fuori|al \d|a \d|decidi tu|tienile|aggiungila|invece|solo|senza|ripetute|lavori|intensita|watt)\b/;
const PAST = /\b(ho fatto|ho finito|ho completato|ho pedalato|e andata|e andato|com e andat)\b/;

export type BuildKind = "edit" | "insert" | "new";

/** Whether a message is about building a session, and how; null leaves it to the other rules. */
export function buildKind(text: string, state: ChatState, today: string): BuildKind | null {
  const t = prepare(text);
  if (PAST.test(t)) return null;
  const spec = parseSpec(text, today);
  if (spec.date && spec.date < today) return null;
  // «inseriscimi 6 sprint nella z2 di domani» names a day on the calendar: it is not a change to the session being built.
  if (spec.sets.length && spec.date !== null && INSERT.test(t) && INTO.test(t)) return "insert";
  // A whole new request («sabato 3x12' sweet spot») starts over instead of changing the session being built.
  if (state.draft && spec.sets.length && spec.date !== null && !EDIT.test(t)) return "new";
  if (state.draft && (EDIT.test(t) || spec.sets.length > 0 || (spec.date !== null && t.split(" ").length <= 3))) return "edit";
  if (state.draft && /^(cambia qualcosa|modifica|cambiala)$/.test(t)) return "edit";
  if (spec.sets.length && INSERT.test(t) && INTO.test(t)) return "insert";
  if (spec.sets.length) return "new";
  if (spec.vague && (CREATE.test(t) || ASK_TYPED.test(t))) return "new";
  // «giovedì 60' z2 sui rulli»: a type, its minutes and a day are a request, unless it is a question («posso fare…?»).
  if (spec.vague?.mins && spec.date !== null && !text.includes("?") && !/\b(posso|potrei|devo|dovrei|meglio|conviene)\b/.test(t)) return "new";
  if (spec.incomplete && (CREATE.test(t) || spec.date !== null || /\b(voglio|vorrei|fammi|dammi)\b/.test(t))) return "new";
  return null;
}

const ftpFor = (ctx: ChatContext, indoor: boolean) => (indoor ? (ctx.data.athlete.indoorFtp ?? ctx.data.athlete.ftp) : ctx.data.athlete.ftp);

function when(ctx: ChatContext, date: string): string {
  if (date === ctx.today) return "oggi";
  if (date === addDays(ctx.today, 1)) return "domani";
  return sayDate(date);
}

/** A step in words, with watts on the FTP of the place: «da 125 a 190 W», «225 W (90%)», «a tutta». */
function stepWords(st: Step, ftp: number | null): string {
  const w = (f: number) => (ftp ? `${Math.round((f * ftp) / 5) * 5}` : null);
  const p = (f: number) => `${Math.round(f * 100)}%`;
  if (st.target.lo >= 1.5) return "a tutta";
  if (st.ramp) return ftp ? `da ${w(st.target.lo)} a ${w(st.target.hi)} W` : `da ${p(st.target.lo)} a ${p(st.target.hi)}`;
  const rpm = st.rpm ? `, ${st.rpm} rpm` : "";
  if (st.target.lo === st.target.hi) return ftp ? `${w(st.target.lo)} W (${p(st.target.lo)}${rpm})` : `${p(st.target.lo)}${rpm}`;
  return ftp ? `${w(st.target.lo)}-${w(st.target.hi)} W (${Math.round(st.target.lo * 100)}-${p(st.target.hi)}${rpm})` : `${Math.round(st.target.lo * 100)}-${p(st.target.hi)}${rpm}`;
}

/** The steps as the card lists them: one line per section, repeats as «3 × 12' 225 W · 5' 140 W». */
export function sectionLines(sections: Section[], ftp: number | null): string[] {
  return sections.map((s) => {
    const steps = s.steps.filter((x) => x.secs > 0);
    const total = steps.reduce((a, x) => a + x.secs, 0);
    if (s.reps > 1) return `${s.title ? `${s.title}: ` : ""}${s.reps} × ${steps.map((x) => `${durLabel(x.secs)} ${stepWords(x, ftp)}`).join(" · ")}`;
    const efforts = steps.filter((x) => x.target.lo >= 1.5);
    if (steps.length > 4 && efforts.length) {
      const easy = steps.find((x) => x.target.lo < 0.76);
      return `${s.title || "Uscita"} ${durLabel(total)}: ${easy ? `${stepWords(easy, ftp)} con ` : ""}${efforts.length} sprint da ${durLabel(efforts[0].secs)} a tutta`;
    }
    const parts = steps.map((x) => `${durLabel(x.secs)} ${stepWords(x, ftp)}`).join(" · ");
    if (!s.title) return parts;
    return steps.length === 1 ? `${s.title} ${durLabel(total)}: ${stepWords(steps[0], ftp)}` : `${s.title} ${durLabel(total)}: ${parts}`;
  });
}

/** The engine's view of the built session, for the same checks as any planned workout. */
function asLibrary(name: string, sections: Section[], indoor: boolean, c: Composed): LibraryWorkout {
  return { id: 0, name, type: indoor ? "VirtualRide" : "Ride", secs: c.secs, tss: c.tss, description: toIntervalsText(sections), blocks: blocksOf(sections) };
}

/** The checks of the day (readiness, illness, form, the week's hard days), as for the planned workouts. */
function fitFor(ctx: ChatContext, date: string, w: LibraryWorkout, drop: string[]) {
  const other = date !== ctx.today;
  const planned = ctx.planned.filter((p) => !drop.includes(p.id)).map((p) => ({ date: p.date, workout: { ...p, id: 0 } }));
  const input = suggestInput(ctx, other ? { date, readiness: "verde", tsbYesterday: null, feeling: null, planned } : { date, planned });
  return plannedFits({ ...input, recent: input.recent.filter((a) => !a.planned) }, w);
}

/** The first of the next days where the session fits. */
function nextGoodDay(ctx: ChatContext, from: string, w: LibraryWorkout, drop: string[]): string | null {
  for (let i = 1; i <= 4; i++) {
    const d = addDays(from, i);
    if (fitFor(ctx, d, w, drop).ok) return d;
  }
  return null;
}

const dayWord = (ctx: ChatContext, date: string) => {
  const s = when(ctx, date);
  return s === "oggi" || s === "domani" ? s : s.split(" ")[0];
};

/** The other bike workouts already on the calendar that day (a race is never replaced). */
const othersOn = (ctx: ChatContext, date: string) => ctx.planned.filter((p) => p.date === date && isBikeSession(p) && !p.race);

/** Builds the draft and the reply: card, check, and the write waiting for «sì». */
function show(ctx: ChatContext, state: ChatState, draft: Draft, lead: string): ChatResult {
  const indoor = draft.target ? draft.target.indoor : draft.place === "indoor";
  const ftp = ftpFor(ctx, indoor);
  const week = weekFor(ctx.plan, draft.date);
  const recent = suggestInput(ctx).recent;
  const opts = { ftp, phase: week?.phase ?? null, step: week?.step ?? null };
  let c: Composed | null;
  if (draft.target) {
    const base = parseIntervalsText(draft.target.text, ftp) ?? sectionsFromBlocks(draft.target.blocks);
    c = composeInsert(base, draft.target.name, draft.spec, opts);
    if (!c) return { reply: { text: `In «${draft.target.name}» non c'è abbastanza parte facile per inserirlo. Vuoi una seduta nuova con quello che hai chiesto?`, chips: ["Sì, una nuova", "No"] }, state: { ...state, draft: { ...draft, target: null }, pending: null } };
  } else c = composeNew(draft.spec, opts);

  const name = !draft.target && indoor && !/\bindoor$/i.test(c.name) ? `${c.name} Indoor` : c.name;
  const text = toIntervalsText(c.sections);
  const lib = asLibrary(name, c.sections, indoor, c);
  const others = draft.target ? [] : othersOn(ctx, draft.date);
  const drop = draft.target ? [draft.target.eventId] : draft.keepOthers ? [] : others.map((o) => o.id);
  const fit = fitFor(ctx, draft.date, lib, drop);
  const notes = [...c.assumptions];
  if (c.dose) notes.unshift(c.dose);
  const last = recent.filter((a) => a.cls === c!.cls && !a.planned).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (c.dose && last) notes.push(`Ultima ${CLASS_SAY[c.cls]}: ${last.name} (${sayDate(last.date)}).`);
  const phase = week?.phase ? PHASE_INFO[week.phase] : null;
  if (!draft.target && phase && !phase.classes.includes(c.cls as WorkoutClass)) notes.push(`In ${phase.label} il piano non prevede ${CLASS_SAY[c.cls]}: la preparo perché la chiedi.`);
  if (others.length && !draft.keepOthers) notes.push(`Prende il posto di «${others.map((o) => o.name).join("», «")}», già in calendario quel giorno.`);

  const placeWords = draft.target ? (indoor ? "sui rulli" : "fuori") : indoor ? "sui rulli" : draft.place === "outdoor" ? "fuori" : "fuori o sui rulli";
  const card: WorkoutCard = {
    name,
    when: when(ctx, draft.date),
    meta: `${Math.round(c.secs / 60)} min · TSS ${c.tss} · ${placeWords}${ftp ? `, FTP ${ftp} W` : ""}`,
    blocks: lib.blocks,
    steps: sectionLines(c.sections, ftp),
    notes,
    tag: draft.target ? "modificata" : "nuova, su misura",
  };
  const next = fit.ok ? null : nextGoodDay(ctx, draft.date, lib, drop);
  const moveChip = next ? `Mettila ${dayWord(ctx, next)}` : null;

  if (!fit.ok && fit.rule === "safety") {
    card.warning = `${fit.why} Non la programmo${next ? `: ${dayWord(ctx, next)} andrebbe bene` : ""}.`;
    return { reply: { text: lead, workout: card, chips: [moveChip, "Cosa faccio oggi?"].filter((x): x is string => !!x) }, state: { ...state, draft, pending: null, awaiting: null } };
  }
  if (!fit.ok) card.warning = `${fit.why}${next ? ` ${dayWord(ctx, next).replace(/^./, (x) => x.toUpperCase())} andrebbe bene.` : ""}`;
  else card.ok = draft.date === ctx.today ? "Va bene con la prontezza di oggi e con la settimana." : "Va bene con la settimana (la prontezza di quel giorno la vedrai la mattina).";

  const action: Action = draft.target
    ? { type: "update_workout", eventId: draft.target.eventId, name, text, secs: c.secs, tss: c.tss, prev: { name: draft.target.name, text: draft.target.text ?? "", secs: draft.target.secs, tss: draft.target.tss }, label: `la modifica di «${draft.target.name}»` }
    : { type: "create_workout", date: draft.date, name, text, indoor, secs: c.secs, tss: c.tss, replace: drop, label: `«${name}» di ${when(ctx, draft.date)}` };
  const chips = ["Sì", ...(moveChip ? [moveChip] : []), ...(others.length && !draft.keepOthers ? ["Tienile tutte e due"] : []), "Cambia qualcosa", "No"];
  return { reply: { text: lead, workout: card, chips, confirm: action }, state: { ...state, draft, pending: action, awaiting: null } };
}

/** The main set of a draft: the first block of work (or the spread efforts). */
function mainSet(spec: Spec): SetSpec | null {
  return spec.sets.find((s) => !s.spread) ?? spec.sets[0] ?? null;
}

/** A session asked by type only gets its sets now, so «fai 4 ripetute» has something to change. */
function materialize(ctx: ChatContext, draft: Draft): Spec {
  const s = draft.spec;
  if (s.sets.length || !s.vague) return s;
  const week = weekFor(ctx.plan, draft.date);
  const v = vagueSets(s.vague.cls, s.vague.mins, { ftp: ctx.data.athlete.ftp, phase: week?.phase ?? null, step: week?.step ?? null });
  return { ...s, sets: v.sets, totalMins: v.steadyMins ?? s.vague.mins ?? s.totalMins, base: v.steadyMins ? { kind: "band", band: s.vague.cls === "recupero" ? "z1" : "z2" } : s.base, vague: null };
}

const NUMW: Record<string, number> = { una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, dodici: 12 };
const n = (s: string) => NUMW[s] ?? Number(s);

/** A change said with words, applied to the draft. Null when nothing was understood. */
function applyEdit(ctx: ChatContext, draft: Draft, text: string): { draft: Draft; what: string } | null {
  const t = prepare(text);
  const said = parseSpec(text, ctx.today);
  let spec: Spec = { ...draft.spec, sets: draft.spec.sets.map((s) => ({ ...s })) };
  const next: Draft = { ...draft };
  const what: string[] = [];

  if (/\b(tienile|tutte e due|entrambe|aggiungila e basta|non togliere)\b/.test(t)) {
    next.keepOthers = true;
    what.push("tengo anche quella già in calendario");
  }
  if (/^decidi tu\b/.test(t) && spec.incomplete) {
    const week = weekFor(ctx.plan, draft.date);
    const cls: WorkoutClass = (week ? PHASE_INFO[week.phase].slotB[0] : null) ?? "sweetspot";
    spec = { ...spec, incomplete: false, vague: { cls, mins: spec.totalMins } };
    what.push(`decido io: ${CLASS_SAY[cls]}`);
  }
  if (said.sets.length) {
    // A new structure («fai invece 4x8 soglia»): it replaces the work, the rest of the draft stays.
    spec = { ...spec, sets: said.sets, vague: null, incomplete: false };
    what.push("nuovo lavoro");
  } else {
    if (spec.vague && !spec.sets.length && !/^decidi tu\b/.test(t)) spec = materialize(ctx, { ...draft, spec });
    const main = mainSet(spec);
    if (main) {
      const reps = t.match(/\b(\d{1,2}|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|dodici) (ripetute|ripetizioni|volte|sprint|serie)\b/);
      if (reps) {
        main.reps = n(reps[1]);
        what.push(`${main.reps} ${reps[2] === "sprint" ? "sprint" : "ripetute"}`);
      }
      const dur = t.match(/\b(?:ripetute|ripetizioni|lavori|sprint) (?:da|di) (\d+)(min|sec)\b/);
      if (dur) {
        main.workSecs = Number(dur[1]) * (dur[2] === "min" ? 60 : 1);
        what.push(`ripetute da ${durLabel(main.workSecs)}`);
      }
      const rec = t.match(/\b(?:rec|recupero|recuperi)(?: di| da| a)? (\d+)(min|sec)\b/) ?? t.match(/\b(\d+)(min|sec) di recupero\b/);
      if (rec) {
        main.recSecs = Number(rec[1]) * (rec[2] === "min" ? 60 : 1);
        what.push(`recupero ${durLabel(main.recSecs)}`);
      } else if (/\b(recupero|recuperi) piu lung/.test(t)) {
        main.recSecs = (main.recSecs ?? 240) + 60;
        what.push("recupero più lungo");
      } else if (/\b(recupero|recuperi) piu (cort|brev)/.test(t)) {
        main.recSecs = Math.max(30, (main.recSecs ?? 240) - 60);
        what.push("recupero più corto");
      }
      const intensity = intensityIn(t.replace(/\b(rec|recupero|recuperi)\b.*$/, ""));
      if (intensity && intensity.kind !== "band") {
        main.work = intensity;
        what.push("intensità come chiedi");
      } else if (/\b(piu forte|piu intens|piu dur|alza)/.test(t) || /\b(piu facile|piu piano|meno intens|meno dur|abbassa)/.test(t)) {
        const up = /\b(piu forte|piu intens|piu dur|alza)/.test(t);
        const cur = main.work ?? null;
        const base = cur && cur.kind === "pct" ? cur : cur && cur.kind === "band" ? { lo: { z1: 0.5, z2: 0.65, tempo: 0.8, sweetspot: 0.88, soglia: 0.95, vo2: 1.1, anaerobico: 1.3, sprint: 2 }[cur.band], hi: { z1: 0.55, z2: 0.72, tempo: 0.86, sweetspot: 0.93, soglia: 1.0, vo2: 1.2, anaerobico: 1.5, sprint: 2 }[cur.band] } : null;
        if (base) {
          const d = up ? 0.03 : -0.03;
          main.work = { kind: "pct", lo: Math.round((base.lo + d) * 100) / 100, hi: Math.round((base.hi + d) * 100) / 100 };
          what.push(up ? "un po' più forte" : "un po' più facile");
        }
      }
      if (/\b(piu cort|accorcia|piu brev)/.test(t)) {
        if (spec.totalMins) spec.totalMins = Math.max(30, spec.totalMins - 15);
        else main.reps = Math.max(1, main.reps - 1);
        what.push("più corta");
      } else if (/\b(piu lung|allunga)/.test(t) && !/recuper/.test(t)) {
        if (spec.totalMins) spec.totalMins += 15;
        else main.reps += 1;
        what.push("più lunga");
      }
    }
    const total = t.match(/\b(\d+)min (?:in tutto|totali)\b|\b(?:in tutto|totale|dura) (\d+)min\b/);
    if (total) {
      spec.totalMins = Number(total[1] ?? total[2]);
      what.push(`${spec.totalMins}' in tutto`);
    }
  }
  if (said.warmupMins !== null) {
    spec.warmupMins = said.warmupMins;
    what.push(said.warmupMins ? `riscaldamento ${said.warmupMins}'` : "senza riscaldamento");
  }
  if (said.cooldownMins !== null) {
    spec.cooldownMins = said.cooldownMins;
    what.push(said.cooldownMins ? `defaticamento ${said.cooldownMins}'` : "senza defaticamento");
  }
  if (said.where) {
    spec.where = said.where;
    what.push("lavoro spostato");
  }
  if (said.name) {
    spec.name = said.name;
    what.push(`nome «${said.name}»`);
  }
  if (said.place && !draft.target) {
    next.place = said.place;
    what.push(said.place === "indoor" ? "sui rulli" : "fuori");
  }
  if (said.date && said.date !== draft.date && !draft.target) {
    next.date = said.date;
    what.push(when(ctx, said.date));
  }
  if (!what.length) return null;
  next.spec = spec;
  return { draft: next, what: what.join(", ") };
}

const EDIT_HELP = ["Fai 4 ripetute", "Recupero 3'", "Più corta", "Sui rulli"];

export function buildChat(kind: BuildKind, ctx: ChatContext, state: ChatState, text: string): ChatResult {
  if (kind === "edit" && state.draft) {
    if (/^(cambia qualcosa|modifica|cambiala)$/.test(prepare(text))) {
      return { reply: { text: "Dimmi cosa cambiare, per esempio «fai 4 ripetute», «recupero 3'», «al 95%», «più corta», «sposta a venerdì», «sui rulli», «riscaldamento 20'».", chips: EDIT_HELP }, state };
    }
    const done = applyEdit(ctx, state.draft, text);
    if (!done) return { reply: { text: "Non ho capito cosa cambiare nella seduta. Prova con «fai 4 ripetute», «recupero 3'», «al 95%», «più corta» o «sposta a venerdì».", chips: EDIT_HELP }, state };
    return show(ctx, state, done.draft, `Fatto: ${done.what}.`);
  }

  const spec = parseSpec(text, ctx.today);
  const date = spec.date ?? ctx.today;

  if (kind === "insert") {
    const day = othersOn(ctx, date);
    // The session with the most easy riding: that is where efforts and blocks go.
    const easy = (w: (typeof day)[number]) => w.blocks.filter((b) => (b.pct ?? 0.6) < 0.76).reduce((a, b) => a + b.secs, 0);
    const target = [...day].sort((a, b) => easy(b) - easy(a))[0];
    if (!target) {
      const draft: Draft = { spec, date, place: spec.place, target: null, keepOthers: false };
      return { reply: { text: `${when(ctx, date).replace(/^./, (x) => x.toUpperCase())} non c'è nulla in calendario in cui inserirlo. Ti preparo una seduta nuova con quello che hai chiesto?`, chips: ["Sì, una nuova", "No"] }, state: { ...state, draft, pending: null } };
    }
    const indoor = /\bindoor\b/i.test(target.name) || target.type === "VirtualRide";
    const draft: Draft = { spec, date, place: indoor ? "indoor" : "outdoor", target: { eventId: target.id, name: target.name, text: target.description, blocks: target.blocks, secs: target.secs, tss: target.tss, indoor }, keepOthers: true };
    return show(ctx, state, draft, `Ecco «${target.name}» di ${when(ctx, date)} con quello che hai chiesto.`);
  }

  if (spec.incomplete) {
    const draft: Draft = { spec, date, place: spec.place, target: null, keepOthers: false };
    return {
      reply: { text: "Mi manca qualcosa: quante ripetute e quanto lunghe? Per esempio «6×3' al 110%» o «4×8' a soglia». Oppure lascio decidere al motore.", chips: ["Decidi tu", "6×3' al 110%", "4×8' soglia"] },
      state: { ...state, draft, pending: null },
    };
  }
  const draft: Draft = { spec, date, place: spec.place, target: null, keepOthers: false };
  const lead = spec.vague ? `Ecco una seduta di ${CLASS_SAY[spec.vague.cls]}: la dose la sceglie il motore.` : "Ecco la seduta.";
  return show(ctx, state, draft, lead);
}

/** «Sì, una nuova» after an insert that had nowhere to go. */
export function buildNewFromDraft(ctx: ChatContext, state: ChatState): ChatResult | null {
  if (!state.draft) return null;
  return show(ctx, state, { ...state.draft, target: null }, "Ecco la seduta nuova.");
}

/** Saving the last written session in the library (folder «MasCoach Coach»): it waits for «sì» like every write. */
export function saveInLibrary(state: ChatState): ChatResult {
  const b = state.lastBuilt;
  if (!b) return { reply: { text: "Non c'è una seduta appena creata da salvare. Prima chiedimene una, per esempio «domani 3x12' sweet spot».", chips: ["Cosa faccio oggi?"] }, state };
  const action: Action = { type: "save_library", name: b.name, text: b.text, indoor: b.indoor, label: `«${b.name}» in libreria` };
  return { reply: { text: `Salvo «${b.name}» nella libreria di Intervals, cartella «MasCoach Coach»? Poi la ritrovi anche nelle proposte dell'app.`, chips: ["Sì", "No"], confirm: action }, state: { ...state, pending: action } };
}

