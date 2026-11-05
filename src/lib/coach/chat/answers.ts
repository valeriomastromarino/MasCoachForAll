// The chat's answers that only read: how you are, what to do, why, the week, the plan, the last ride, records, FTP, zones,
// the library, carbs, comparisons, explanations. Every number comes from the app's own data and engines.
import { classifyWorkout, CLASS_LABEL, CLASS_SAY, carbsFor, type WorkoutClass } from "@/lib/training/suggest";
import { addDays, weekStart } from "@/lib/dates";
import { planFromToday, PHASE_INFO, RAMP_TARGET, weekFor } from "@/lib/training/season";
import { restrictionOn } from "@/lib/training/life";
import type { ChatContext, ChatResult, ChatState, Reply } from "./context";
import { findTerm } from "./glossary";
import { dayLabel, dayShort, hoursText, minsText, n0, n1, planImpact, signed1, suggestFor, suggestionReply, weekFrom, withOptions, workoutLine } from "./helpers";
import { classFrom, HELP } from "./intents";
import { normalize, parseDates, parseMinutes, sayDate, sayRange } from "./text";

const done = (reply: Reply, state: ChatState): ChatResult => ({ reply, state });

// ── Coaching ─────────────────────────────────────────────────────────────────────────────────────

export function stato(ctx: ChatContext, state: ChatState): ChatResult {
  const { status } = ctx.data;
  const r = status.readiness;
  const lines = [r.advice, ...r.reasons.filter((x) => x !== r.advice).slice(0, 4)];
  const o = ctx.overrides.date === ctx.today ? ctx.overrides : null;
  if (o?.feeling?.drop) lines.push(`Mi hai detto che ${o.feeling.note}: per l'allenamento di oggi la prontezza è abbassata di un livello.`);
  const hrv = status.hrv;
  const ms = (ln: number | null) => (ln == null ? null : Math.exp(ln));
  lines.push(`HRV (7 notti): ${n0(ms(hrv.baseline7))} ms, range normale ${n0(ms(hrv.low))}-${n0(ms(hrv.high))}. FC a riposo ${n0(status.rhr.today)} bpm. Sonno ${status.sleepHours == null ? "–" : hoursText(status.sleepHours * 3600)}.`);
  lines.push(`Carico: CTL ${n0(status.ctl)}, ATL ${n0(status.atl)}, forma ${n0(status.tsb)} (${status.formZone ?? "–"}).`);
  return done({ text: `Prontezza ${r.level}: ${r.headline}.`, lines, chips: ["Cosa faccio oggi?", "Perché?", "Come va la settimana?", "Dati del recupero"] }, state);
}

export function recupero(ctx: ChatContext, state: ChatState): ChatResult {
  const { status, sleep } = ctx.data;
  const hrv = status.hrv;
  const ms = (ln: number | null) => (ln == null ? null : Math.exp(ln));
  const lines = [
    `HRV: media 7 notti ${n0(ms(hrv.baseline7))} ms, ${hrv.status}. Range normale (60 giorni) ${n0(ms(hrv.low))}-${n0(ms(hrv.high))} ms.`,
    `FC a riposo: ${n0(status.rhr.today)} bpm stanotte, media 7 giorni ${n1(status.rhr.baseline7)}${status.rhr.low != null ? `, range ${n0(status.rhr.low)}-${n0(status.rhr.high)}` : ""}.`,
    `Lettura combinata: ${status.autonomic.title}. ${status.autonomic.explanation}`,
  ];
  if (hrv.sd7 != null && hrv.sd60 != null) {
    lines.push(hrv.sd7 > hrv.sd60 * 1.5 ? "La variabilità degli ultimi 7 giorni è molto più instabile del solito: tienilo d'occhio." : "La variabilità degli ultimi 7 giorni è nella norma: il sistema nervoso è stabile.");
  }
  const last = sleep.slice(-3).map((s) => s.hours);
  lines.push(`Sonno ultime 3 notti: ${last.map((h) => (h == null ? "–" : hoursText(h * 3600))).join(", ")}${last.filter((h) => h != null && h < 6).length >= 2 ? ". Due notti sotto le 6 ore: pesa sulla prontezza." : "."}`);
  return done({ text: "Ecco il recupero, nei numeri.", lines, chips: ["Come sto?", "Cos'è l'HRV?", "Cosa faccio oggi?"] }, state);
}

export function forma(ctx: ChatContext, state: ChatState): ChatResult {
  const { status } = ctx.data;
  const target = ctx.plan?.rampTarget;
  const lines = [
    `CTL ${n0(status.ctl)} (ieri ${n0(status.ctlYesterday)}), ATL ${n0(status.atl)}, forma ${n0(status.tsb)}: zona ${status.formZone ?? "–"}.`,
    `Ramp rate ${status.rampRate == null ? "–" : signed1(status.rampRate)} CTL negli ultimi 7 giorni${target ? `, tetto scelto +${String(target).replace(".", ",")}` : ""}.`,
  ];
  const f = status.tsb;
  if (f != null) {
    lines.push(
      f > 20 ? "Sei molto fresco: se non è uno scarico voluto, stai perdendo fitness."
        : f > 5 ? "Sei fresco: bel momento per un lavoro di qualità o una gara."
        : f > -10 ? "Zona neutra: né fresco né affaticato."
        : f >= -30 ? "Zona ottimale per allenarsi: stai accumulando carico utile."
        : "Alto rischio: la fatica supera di molto la fitness. Conta con HRV e sonno, ma oggi si va piano.",
    );
  }
  if (status.rampRate != null && target && status.rampRate >= target + 2) lines.push("Il CTL sta salendo oltre il tetto che hai scelto: il motore ti darà giornate facili finché rientra.");
  return done({ text: "La tua forma, in breve.", lines, chips: ["Cos'è il TSB?", "A che punto sono col piano?", "Come va la settimana?"] }, state);
}

export function oggi(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const span = parseDates(text, ctx.today);
  const date = span && span.from >= ctx.today ? span.from : ctx.today;
  const s = suggestFor(ctx, date);
  const reply = suggestionReply(ctx, s, date);
  const next = s.kind === "workout" ? withOptions(state, [s.main, ...s.alternatives], date) : { ...state, pending: null, awaiting: null };
  return done(reply, next);
}

export function perche(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  let option = state.options[state.index];
  let date = state.optionsDate ?? ctx.today;
  let next = state;
  if (!option) {
    const s = suggestFor(ctx, ctx.today);
    if (s.kind === "rest") return done({ text: `Oggi la proposta è riposo. ${s.reason}`, chips: ["Come sto?"] }, state);
    option = s.main;
    date = ctx.today;
    next = withOptions(state, [s.main, ...s.alternatives], date);
  }
  const wanted = classFrom(normalize(text));
  const lines = [...option.reasons.filter((r) => !r.startsWith(option.workout.name))];
  if (wanted && wanted !== option.cls) lines.push(`Non ti propongo ${CLASS_SAY[wanted]} perché, con queste regole, oggi viene prima ${CLASS_SAY[option.cls]}. Se lo vuoi lo stesso dimmelo: «voglio fare ${CLASS_SAY[wanted]}».`);
  const { status } = ctx.data;
  lines.push(`I numeri che contano: prontezza ${status.readiness.level}, forma di ieri ${n0(status.tsbYesterday)}, ramp rate ${status.rampRate == null ? "–" : signed1(status.rampRate)}.`);
  const dur = `${minsText(option.mins)}, TSS ${option.tss}`;
  lines.push(`Durata e carico (${dur}) vengono da quanto resta del carico della settimana e dalle ore che mi hai dato.`);
  return done({ text: `${dayLabel(ctx, date)} ti propongo ${option.workout.name} per questo:`, lines, chips: ["Programma", "Cambia", "Più facile"] }, next);
}

export function settimanaPiano(ctx: ChatContext, state: ChatState): ChatResult {
  const week = weekFrom(ctx);
  const lines = week.map(({ date, suggestion: s, planned }) => {
    if (planned) return `${dayShort(date)}: già in programma, ${planned.name}`;
    if (!s || s.kind === "rest") return `${dayShort(date)}: riposo`;
    return `${dayShort(date)}: ${workoutLine(s.main)}`;
  });
  const pw = weekFor(ctx.plan, ctx.today);
  return done(
    {
      text: pw ? `I prossimi 7 giorni (${PHASE_INFO[pw.phase].label}, TSS di riferimento ${pw.tssTarget} questa settimana):` : "I prossimi 7 giorni:",
      lines,
      chips: ["Programma la settimana", "Com'è andata la settimana?", "A che punto sono col piano?"],
    },
    state,
  );
}

export function settimanaBilancio(ctx: ChatContext, state: ChatState): ChatResult {
  const start = weekStart(ctx.today);
  const rides = ctx.data.activities.filter((a) => a.date.slice(0, 10) >= start && a.date.slice(0, 10) <= ctx.today);
  const tss = rides.reduce((s, a) => s + (a.tss ?? 0), 0);
  const secs = rides.reduce((s, a) => s + a.movingTime, 0);
  const hard = rides.filter((a) => a.IF != null && a.IF >= 0.85 && a.movingTime >= 1200).length;
  const pw = weekFor(ctx.plan, ctx.today);
  const lines = [`Fatto finora: ${rides.length} uscite, ${hoursText(secs)}, TSS ${n0(tss)}, ${hard} lavori duri.`];
  let text = `Settimana dal ${sayRange(start, addDays(start, 6)).replace(/^dal /, "")}.`;
  if (pw && pw.tssTarget > 0) {
    const daysLeft = 7 - ((new Date(`${ctx.today}T12:00:00`).getDay() + 6) % 7) - 1;
    const share = tss / pw.tssTarget;
    lines.push(`TSS di riferimento: ${pw.tssTarget} (${n0(share * 100)}% fatto), restano ${daysLeft} giorni.`);
    text = share >= 1.05 ? "Hai già raggiunto il carico della settimana: da qui si va facile." : share >= 0.75 || daysLeft === 0 ? "Sei in linea con la settimana." : share >= 0.4 ? "Sei un po' sotto, ma hai ancora giorni per recuperare." : "Sei indietro con il carico: dipende da quanto riesci a fare nei prossimi giorni.";
    if (share < 0.4 && daysLeft > 0) lines.push("Non recuperare tutto in un giorno: meglio distribuire, senza due lavori duri di fila.");
  }
  const d = ctx.data.distribution;
  if (d.totalSecs > 0) lines.push(`Distribuzione dell'intensità (ultime settimane): ${n0(d.low * 100)}% bassa, ${n0(d.mid * 100)}% media, ${n0(d.high * 100)}% alta (${d.pattern}).`);
  return done({ text, lines, chips: ["I prossimi giorni", "Cosa faccio oggi?", "Com'è andata l'uscita di ieri?"] }, state);
}

export function piano(ctx: ChatContext, state: ChatState): ChatResult {
  if (!ctx.setup || !ctx.plan) {
    return done({ text: "Non c'è ancora un piano di stagione. Apri «Stagione»: ti chiedo il periodo di picco, la gara A se c'è, il ramp rate e le ore.", chips: ["Cosa faccio oggi?"] }, state);
  }
  const plan = ctx.plan;
  const pw = weekFor(plan, ctx.today)!;
  const lines = [`Fase: ${PHASE_INFO[pw.phase].label}, ${PHASE_INFO[pw.phase].focus.toLowerCase()}. Questa settimana è ${pw.kind === "carico" ? "di carico" : pw.kind === "scarico" ? "leggera" : pw.kind}, TSS di riferimento ${pw.tssTarget}.`];
  lines.push(`CTL ${n0(plan.ctlStart)} oggi${plan.ctlPeak != null ? `, previsto ${n0(plan.ctlPeak)} a fine picco` : ""}, con ramp ${String(RAMP_TARGET[ctx.setup.ramp]).replace(".", ",")} a settimana nelle settimane di carico.`);
  if (plan.peakWindow) {
    const weeks = Math.max(0, Math.round((new Date(`${plan.peakWindow.start}T12:00:00`).getTime() - new Date(`${ctx.today}T12:00:00`).getTime()) / (7 * 86400000)));
    lines.push(`Il picco va ${sayRange(plan.peakWindow.start, plan.peakWindow.end)}: ${weeks > 0 ? `mancano circa ${weeks} settimane` : "ci sei dentro"}.`);
  }
  if (ctx.setup.raceA) lines.push(`Gara A: ${ctx.setup.raceA.name ?? ""} ${sayRange(ctx.setup.raceA.date, ctx.setup.raceA.date)}.`.replace("  ", " "));
  const nextLight = plan.weeks.find((w) => w.start > ctx.today && w.kind === "scarico");
  if (nextLight) lines.push(`Prossima settimana leggera: dal ${Number(nextLight.start.slice(8))}/${nextLight.start.slice(5, 7)}.`);
  const nextUp = plan.weeks.find((w) => w.start > ctx.today);
  if (nextUp) lines.push(`Settimana prossima: ${PHASE_INFO[nextUp.phase].label}, TSS ${nextUp.tssTarget}${nextUp.note ? ` (${nextUp.note.toLowerCase().replace(/.$/, "")})` : ""}.`);
  for (const w of plan.warnings) lines.push(`Attenzione: ${w}`);
  const limits = ctx.life.filter((e) => e.to >= ctx.today).length;
  if (limits) lines.push(`Nel calendario ${limits === 1 ? "c'è 1 evento (ferie, malattia o infortunio) già considerato" : `ci sono ${limits} eventi (ferie, malattia o infortunio) già considerati`}.`);
  return done({ text: "A che punto sei col piano:", lines, chips: ["E se salto una settimana?", "Più prudente col carico", "Test CP: quando?"] }, state);
}

export function whatIf(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  if (!ctx.setup) return done({ text: "Per dirti cosa cambia mi serve un piano di stagione: apri «Stagione» e impostalo.", chips: ["Cosa faccio oggi?"] }, state);
  const t = normalize(text);
  let span = parseDates(text, ctx.today);
  if (!span) span = { from: addDays(weekStart(ctx.today), 7), to: addDays(weekStart(ctx.today), 13) };
  const n = parseMinutes(t) ? null : t.match(/(\d{1,2}) giorni/);
  if (n) span = { from: span.from, to: addDays(span.from, Number(n[1]) - 1) };
  if (/(mi fermo|non mi alleno|salto)/.test(t) && !/(settimana)/.test(t) && !n && span.from === span.to) span = { from: ctx.today, to: ctx.today };
  const hypothetical = [{ id: "ipotesi", category: "HOLIDAY" as const, from: span.from, to: span.to }];
  const lines = planImpact(ctx, { life: hypothetical });
  const days = Math.round((new Date(`${span.to}T12:00:00`).getTime() - new Date(`${span.from}T12:00:00`).getTime()) / 86400000) + 1;
  lines.push(days >= 7 ? "Dopo uno stop così il piano mette una settimana leggera di rientro, poi riparte." : "Con uno stop breve il piano riassorbe quasi tutto senza toccare le fasi.");
  lines.push("Il picco resta alla data scelta: se perdi settimane, si comprimono base e build prima.");
  return done({ text: `Se ti fermi ${sayRange(span.from, span.to)}:`, lines, chips: ["A che punto sono col piano?", "Cosa faccio oggi?"] }, state);
}

export function posso(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const span = parseDates(text, ctx.today);
  const date = span && span.from >= ctx.today ? span.from : ctx.today;
  const wanted: WorkoutClass | null = classFrom(t) ?? (/(lunga|uscita lunga|fondo)/.test(t) ? "z2" : /(gara|spingere|forte|duro|intens)/.test(t) ? "soglia" : null);
  const s = suggestFor(ctx, date, wanted ? { override: { wantClass: wanted } } : {});
  if (s.kind === "rest") return done({ text: `${dayLabel(ctx, date)}: meglio di no. ${s.reason.replace(new RegExp("(^|[^a-z])oggi(?![a-z])", "g"), "$1quel giorno")}`, chips: ["Cosa faccio oggi?", "Come sto?"] }, state);
  const warn = s.main.warnings;
  const verdict = warn.length === 0 ? "Sì, puoi." : "Lo sconsiglio.";
  const day = (l: string) => (date !== ctx.today ? l.replace(new RegExp("(^|[^a-z])oggi(?![a-z])", "g"), "$1quel giorno") : l);
  const lines = [...warn, ...s.main.reasons.filter((r) => !r.startsWith(s.main.workout.name)).slice(0, 3)].map(day);
  if (warn.length) lines.push(`Quello che mi sentirei di proporti: ${workoutLine(suggestFor(ctx, date).kind === "workout" ? (suggestFor(ctx, date) as { main: typeof s.main }).main : s.main)}.`);
  return done({ text: `${dayLabel(ctx, date)}${wanted ? `, ${CLASS_SAY[wanted]}` : ""}: ${verdict}`, lines, chips: ["Cosa faccio oggi?", "Perché?"] }, state);
}

// ── Analysis ─────────────────────────────────────────────────────────────────────────────────────

const intensityWord = (i: number | null) =>
  i == null ? "intensità non nota" : i < 0.55 ? "recupero" : i < 0.75 ? "fondo" : i < 0.85 ? "tempo/medio" : i < 0.95 ? "duro (soglia)" : "molto duro";

export function ultimaUscita(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const span = parseDates(text, ctx.today, { past: true });
  const rides = [...ctx.data.activities].filter((a) => a.movingTime >= 600 && a.category !== "altro" && a.category !== "nascosta" && a.type).sort((a, b) => b.date.localeCompare(a.date));
  const onDay = span ? rides.find((a) => a.date.slice(0, 10) === span.from) : undefined;
  const ride = onDay ?? rides[0];
  if (!ride) return done({ text: "Non trovo uscite recenti.", chips: ["I miei record", "Come va la settimana?"] }, state);
  const missing = span && !onDay ? `Non trovo uscite ${sayRange(span.from, span.from)} (o non hanno dettagli): ti dico l'ultima. ` : "";
  const lines = [
    `${ride.name}: ${hoursText(ride.movingTime)}${ride.distanceKm ? `, ${n0(ride.distanceKm)} km` : ""}, ${ride.indoor ? "rulli" : "fuori"}.`,
    `Potenza media ${n0(ride.avgWatts)} W, NP ${n0(ride.np)} W, IF ${ride.IF == null ? "–" : ride.IF.toFixed(2).replace(".", ",")} (${intensityWord(ride.IF)}), TSS ${n0(ride.tss)}.`,
  ];
  if (ride.avgHr) lines.push(`FC media ${n0(ride.avgHr)} bpm.`);
  if (ride.decoupling != null) {
    const d = ride.decoupling;
    lines.push(`Disaccoppiamento ${n1(d)}%: ${d < 5 ? "il fondo è ben assorbito" : d <= 7 ? "al limite: la base regge ma non è ancora comoda" : "alto: la base non è ancora solida (se faceva caldo conta)"}.`);
  }
  if (ride.ef != null) {
    const prev = rides.filter((a) => a.id !== ride.id && a.ef != null && !a.isTest).slice(0, 10).map((a) => a.ef as number);
    if (prev.length >= 3) {
      const med = [...prev].sort((a, b) => a - b)[Math.floor(prev.length / 2)];
      const e2 = (x: number) => x.toFixed(2).replace(".", ",");
      lines.push(`EF ${e2(ride.ef)} contro ${e2(med)} delle ultime uscite: ${ride.ef > med * 1.03 ? "meglio del solito" : ride.ef < med * 0.97 ? "un po' sotto" : "in linea"}.`);
    } else lines.push(`EF ${ride.ef.toFixed(2).replace(".", ",")}.`);
  }
  const plan = weekFor(ctx.plan, ride.date.slice(0, 10));
  if (plan) lines.push(`Era una settimana ${plan.kind === "carico" ? "di carico" : plan.kind === "scarico" ? "leggera" : plan.kind} (${PHASE_INFO[plan.phase].label}).`);
  return done({ text: `${missing}L'uscita ${sayDate(ride.date.slice(0, 10))}:`, lines, chips: ["RPE 7 per questa uscita", "Come va la settimana?", "Cosa faccio oggi?"] }, state);
}

export function record(ctx: ChatContext, state: ChatState): ChatResult {
  const rows = ctx.data.records.rows;
  const kg = ctx.data.athlete.weight;
  const label = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${s / 60} min` : `${s / 3600} h`);
  const lines = rows.map((r) => {
    const best = r.best84;
    const wk = best && kg ? ` (${n1(best / kg)} W/kg)` : "";
    const trend = r.current != null && r.previous != null ? `, ${r.current >= r.previous ? "su" : "giù"} rispetto al mese scorso (${n0(r.previous)} W)` : "";
    return `${label(r.secs)}: miglior valore ultimi 84 giorni ${n0(best)} W${wk}; questo mese ${n0(r.current)} W${trend}.`;
  });
  const last = ctx.data.eftp.at(-1);
  if (last) lines.push(`eFTP di Intervals: ${n0(last.eftp)} W (FTP impostata ${n0(ctx.data.athlete.ftp)} W).`);
  lines.push("Un record non è automaticamente un miglioramento: dipende dal contesto e dalla freschezza.");
  return done({ text: "I tuoi migliori sforzi:", lines, chips: ["Devo cambiare l'FTP?", "Che atleta sono?", "Rispetto a un anno fa?"] }, state);
}

export function ftp(ctx: ChatContext, state: ChatState): ChatResult {
  const a = ctx.data.athlete;
  const e = ctx.data.eftp.at(-1);
  const lines = [`FTP impostata: ${n0(a.ftp)} W fuori, ${n0(a.indoorFtp)} W sui rulli.`];
  let text = "Sulla FTP:";
  if (e && a.ftp) {
    const diff = ((e.eftp - a.ftp) / a.ftp) * 100;
    lines.push(`eFTP di Intervals: ${n0(e.eftp)} W (${diff > 0 ? "+" : "−"}${n1(Math.abs(diff))}% rispetto a quella impostata).`);
    text = Math.abs(diff) < 5 ? "L'FTP impostata è coerente con le stime: non cambiarla." : Math.abs(diff) < 10 ? "C'è una differenza da tenere d'occhio, ma non basta per cambiarla." : "La differenza è grande: conviene un test per decidere.";
  }
  const cp = ctx.data.cp;
  if (cp) lines.push(`Potenza critica dal modello: ${n0(cp.cp)} W${cp.reliable ? "" : ", ma non affidabile (mancano sforzi massimali lunghi)"}.`);
  for (const m of ctx.data.icuModels.slice(0, 3)) lines.push(`Modello ${m.name}: CP ${n0(m.cp)} W${m.ftp ? `, FTP ${n0(m.ftp)} W` : ""}.`);
  lines.push("Su un singolo test, un cambio sotto il 6-8% (circa 15-20 W) non si distingue dal rumore: serve che si ripeta.");
  return done({ text, lines, chips: ["Test CP: quando?", "I miei record", "Cos'è la potenza critica?"] }, state);
}

export function zone(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const cardio = /(cardio|fc|battiti|frequenza)/.test(t);
  const zs = cardio ? ctx.data.hrZones : ctx.data.powerZones;
  const lines = zs.map((z) => `${z.id} ${z.name}: ${z.max == null ? `da ${z.min}` : `${z.min}-${z.max}`} ${cardio ? "bpm" : "W"}`);
  return done({ text: cardio ? `Zone cardio (soglia ${n0(ctx.data.athlete.lthr)} bpm):` : `Zone di potenza (FTP ${n0(ctx.data.athlete.ftp)} W):`, lines, chips: [cardio ? "Zone di potenza" : "Zone cardio", "Cos'è Z2?"] }, state);
}

const PHENO_TEXT = {
  glicolitico: "Hai una punta alta (scatti, 1 minuto) e una soglia più modesta: sei un puncheur. Per te funzionano intervalli più brevi e variati, recuperi un po' più lunghi, soglia in blocchi fino a 12 minuti. Il margine è la base aerobica e la durata.",
  diesel: "Hai soglia e resistenza forti rispetto al picco: sei un passista. Funzionano blocchi più lunghi e più volume, con recuperi brevi. Il margine è la capacità anaerobica e gli scatti.",
  all_rounder: "Il tuo profilo è bilanciato: alterna lunghi a soglia e lavori brevi intensi.",
};
export function profilo(ctx: ChatContext, state: ChatState): ChatResult {
  if (!ctx.phenotype) return done({ text: "Non ho ancora calcolato il tuo profilo: compila la scheda atleta (Impostazioni).", chips: ["Cosa faccio oggi?"] }, state);
  return done({ text: `Il tuo profilo: ${ctx.phenotype === "glicolitico" ? "tendenza glicolitica (puncheur)" : ctx.phenotype === "diesel" ? "tendenza diesel (passista)" : "all-rounder"}.`, lines: [PHENO_TEXT[ctx.phenotype], "È una lettura indicativa, su un continuum: il test CP classico (3′, 7′, 12′) la conferma o la corregge."], chips: ["Test CP: quando?", "I miei record"] }, state);
}

export function libreria(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const cls = classFrom(t);
  const mins = parseMinutes(t);
  const roadOnly = ctx.profile?.disciplina && !/mtb/i.test(ctx.profile.disciplina);
  const all = ctx.library.map(classifyWorkout).filter((c) => !(roadOnly && c.mtb));
  if (cls || mins) {
    const found = all
      .filter((c) => (!cls || c.cls === cls) && (!mins || Math.abs(c.mins - mins) <= 10) && !/(test|benchmark)/i.test(c.w.name))
      .sort((a, b) => (mins ? Math.abs(a.mins - mins) - Math.abs(b.mins - mins) : a.mins - b.mins))
      .slice(0, 6);
    if (!found.length) return done({ text: "Non trovo nulla con questi criteri nella libreria.", chips: ["Quanti allenamenti hai?"] }, state);
    return done({ text: `Dalla libreria${cls ? `, ${CLASS_SAY[cls]}` : ""}${mins ? `, circa ${minsText(mins)}` : ""}:`, lines: found.map((c) => `${c.w.name} — ${minsText(Math.round(c.mins))}, TSS ${Math.round(c.tss)}${c.indoor ? ", rulli" : ""}`), chips: cls ? [`Voglio fare ${CLASS_SAY[cls]}`, "Cosa faccio oggi?"] : ["Cosa faccio oggi?"] }, state);
  }
  const by: Record<string, number> = {};
  for (const c of all) by[c.cls] = (by[c.cls] ?? 0) + 1;
  const lines = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${CLASS_LABEL[k as WorkoutClass]}: ${n}`);
  lines.push(`Rulli: ${all.filter((c) => c.indoor).length}, MTB: ${all.filter((c) => c.mtb).length}.`);
  return done({ text: `Nella libreria di Intervals ci sono ${all.length} allenamenti.`, lines, chips: ["Un sweet spot da 60 minuti", "Un VO2", "Cosa faccio oggi?"] }, state);
}

export function carbo(ctx: ChatContext, state: ChatState): ChatResult {
  const p = state.options[state.index];
  const lines = ["Sotto i 60 minuti: solo acqua (0 g/h).", "60-150 minuti: 30-45 g/h in Z1-Z2, 45-60 g/h con sweet spot, soglia o VO2max.", "Oltre i 150 minuti: 60-90 g/h.", "Sopra i 60 g/h serve glucosio e fruttosio (2:1). Per salire di 10 g/h servono 2-4 settimane di abitudine."];
  const out: string[] = [];
  if (p) out.push(`Per ${p.workout.name} (${minsText(p.mins)}): ${carbsFor({ mins: p.mins, cls: p.cls })}.`);
  return done({ text: out.length ? out[0] : "Carboidrati, la regola:", lines: out.length ? lines : lines, chips: ["Ho preso 60 g/h", "Cosa faccio oggi?"] }, state);
}

export function confronto(ctx: ChatContext, state: ChatState): ChatResult {
  const h = ctx.history;
  if (!h) return done({ text: "Lo storico non è ancora caricato: riprova tra un attimo.", chips: ["Come sto?"] }, state);
  const month = ctx.today.slice(0, 7);
  const lastYear = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
  const now = h.mesi.find((m) => m.mese === month);
  const then = h.mesi.find((m) => m.mese === lastYear);
  if (!now || !then) return done({ text: "Non ho abbastanza storico per questo confronto (serve lo stesso mese dell'anno scorso).", chips: ["I miei record"] }, state);
  const f = (a: number | null | undefined, b: number | null | undefined, unit: string) => (a == null || b == null ? "–" : `${n0(a)}${unit} contro ${n0(b)}${unit}`);
  const lines = [
    `CTL medio del mese: ${f(now.ctl_media, then.ctl_media, "")}.`,
    `Ore in bici (finora nel mese): ${f(now.ore_bici, then.ore_bici, " h")}.`,
    `HRV media: ${f(now.hrv_media_ms, then.hrv_media_ms, " ms")}. FC a riposo: ${f(now.fc_riposo_media, then.fc_riposo_media, " bpm")}.`,
  ];
  const y = h.anni.find((a) => a.anno === String(Number(ctx.today.slice(0, 4)) - 1));
  if (y) lines.push(`Il tuo massimo dell'anno scorso: CTL ${n0(y.ctl_max?.valore)} (${y.ctl_max?.data ?? "–"}), 20 minuti ${n0(y.migliori_watt["20m"])} W.`);
  return done({ text: `${month.slice(5)}/${month.slice(0, 4)} contro lo stesso mese di un anno fa:`, lines, chips: ["A che punto sono col piano?", "I miei record"] }, state);
}

export function mese(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const h = ctx.history;
  if (!h) return done({ text: "Lo storico non è ancora caricato: riprova tra un attimo.", chips: ["Come sto?"] }, state);
  const prevMonth = /scorso/.test(normalize(text));
  const key = prevMonth ? `${new Date(Number(ctx.today.slice(0, 4)), Number(ctx.today.slice(5, 7)) - 2, 1).getFullYear()}-${String(((Number(ctx.today.slice(5, 7)) + 10) % 12) + 1).padStart(2, "0")}` : ctx.today.slice(0, 7);
  const m = h.mesi.find((x) => x.mese === key);
  if (!m) return done({ text: "Non trovo quel mese nello storico.", chips: ["Come va la settimana?"] }, state);
  return done({ text: `${key.slice(5)}/${key.slice(0, 4)}:`, lines: [`${m.uscite_bici} uscite, ${n0(m.ore_bici)} h, ${n0(m.km)} km, TSS ${n0(m.tss_bici)}.`, `Uscite oltre 3 ore: ${m.uscite_oltre_3h}. CTL medio ${n0(m.ctl_media)}, a fine mese ${n0(m.ctl_fine)}.`, `HRV media ${n0(m.hrv_media_ms)} ms, sonno ${n1(m.sonno_medio_ore)} h.`], chips: ["Rispetto a un anno fa?", "Come va la settimana?"] }, state);
}

export function distribuzione(ctx: ChatContext, state: ChatState): ChatResult {
  const d = ctx.data.distribution;
  if (d.totalSecs === 0) return done({ text: "Non ho abbastanza uscite recenti per dirlo.", chips: ["Come va la settimana?"] }, state);
  const advice: Record<string, string> = {
    polarizzata: "Tanto facile e un po' di molto duro: va bene soprattutto con volumi alti.",
    piramidale: "Più tempo (Z3) che lavoro duro: ottimo per volumi medi, senza esagerare con la zona grigia.",
    soglia: "Poco fondo e molta intensità media-alta: attenzione, è facile accumulare fatica.",
    "solo bassa intensità": "Quasi tutto facile: c'è spazio per un lavoro di qualità, se la prontezza lo consente.",
    "n/d": "",
  };
  return done({ text: `Distribuzione ${d.pattern}.`, lines: [`${n0(d.low * 100)}% in Z1-Z2, ${n0(d.mid * 100)}% in Z3, ${n0(d.high * 100)}% in Z4 e oltre (ultimi ${ctx.data.distribution.days} giorni).`, advice[d.pattern] ?? ""].filter(Boolean), chips: ["Cos'è polarizzato?", "Come va la settimana?"] }, state);
}

export function testCp(ctx: ChatContext, state: ChatState): ChatResult {
  const cp = ctx.data.cp;
  const lines = [
    "Il test CP classico: tre sforzi massimali (all-out) da 3 minuti, 7 minuti e 12 minuti, in tre giorni diversi, riposato e dopo un buon riscaldamento.",
    "Dai tre migliori sforzi si ricava la potenza critica (CP) e il W′: sono la base per FTP e zone.",
    cp ? `Oggi la tua CP stimata è ${n0(cp.cp)} W${cp.reliable ? "" : ", ma non è affidabile: mancano sforzi massimali lunghi"}.` : "Oggi non ho abbastanza sforzi massimali per stimarla.",
  ];
  const light = ctx.plan?.weeks.find((w) => w.start > ctx.today && w.kind === "scarico" && w.easyDays === 0 && w.stopDays === 0);
  lines.push(light ? `Il momento giusto è la prossima settimana leggera: dal ${Number(light.start.slice(8))}/${light.start.slice(5, 7)}, con la prontezza verde.` : "Il momento giusto è una settimana leggera, con la prontezza verde e senza lavori duri nei due giorni prima.");
  return done({ text: "Il test della potenza critica:", lines, chips: ["Devo cambiare l'FTP?", "A che punto sono col piano?"] }, state);
}

export function glossario(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const term = findTerm(normalize(text));
  if (!term) return done({ text: "Dimmi quale parola: per esempio TSB, CTL, ramp rate, HRV, sweet spot, tapering.", chips: ["Cos'è il TSB?", "Cos'è l'HRV?", "Cos'è lo sweet spot?"] }, state);
  return done({ text: `${term.title}: ${term.text(ctx)}`, chips: ["Come sto?", "Cosa faccio oggi?"] }, state);
}

// ── The day's briefing and advice ────────────────────────────────────────────────────────────────

export function briefing(ctx: ChatContext, state: ChatState): ChatResult {
  const r = ctx.data.status.readiness;
  const s = suggestFor(ctx, ctx.today);
  const lines = [`Prontezza ${r.level}: ${r.advice}`];
  if (s.kind === "workout") lines.push(`Oggi: ${workoutLine(s.main)}.`);
  else lines.push(`Oggi: riposo. ${s.reason}`);
  const pw = weekFor(ctx.plan, ctx.today);
  if (pw) {
    const rides = ctx.data.activities.filter((a) => a.date.slice(0, 10) >= pw.start && a.date.slice(0, 10) <= ctx.today);
    lines.push(`Settimana: ${n0(rides.reduce((x, a) => x + (a.tss ?? 0), 0))} TSS su ${pw.tssTarget} di riferimento (${PHASE_INFO[pw.phase].label}).`);
  }
  const upcoming = ctx.life.filter((e) => e.to >= ctx.today && e.from <= addDays(ctx.today, 14));
  for (const e of upcoming) lines.push(`${e.category === "HOLIDAY" ? "Ferie" : e.category === "SICK" ? "Malattia" : "Infortunio"} ${sayRange(e.from, e.to)}${e.name ? ` (${e.name})` : ""}: ne tengo conto.`);
  const rr = ctx.data.status.rampRate;
  if (rr != null && ctx.plan && rr >= ctx.plan.rampTarget + 2) lines.push(`Attenzione: il CTL sale di ${signed1(rr)} a settimana, oltre il tetto che hai scelto.`);
  const next = s.kind === "workout" ? withOptions(state, [s.main, ...s.alternatives], ctx.today) : state;
  return done({ text: "Il punto di oggi.", lines, proposal: s.kind === "workout" ? s.main : undefined, chips: s.kind === "workout" ? ["Programma", "Cambia", "Perché?"] : ["Come sto?", "Cosa faccio domani?"] }, next);
}

export function consiglio(ctx: ChatContext, state: ChatState): ChatResult {
  const advice: string[] = [];
  const { status } = ctx.data;
  const r = status.readiness;
  if (r.level === "rosso") advice.push("Oggi proteggi il recupero: riposo o Z1 breve. Il resto viene dopo.");
  else if (r.level === "giallo") advice.push("Prontezza gialla: tieni la seduta in Z2, accorcia o sposta il lavoro duro.");
  const sleep = ctx.data.sleep.slice(-3).filter((n) => n.hours != null && n.hours < 6).length;
  if (sleep >= 2) advice.push("Hai dormito meno di 6 ore in due delle ultime tre notti: è il fattore più economico da correggere.");
  if (status.rampRate != null && ctx.plan && status.rampRate >= ctx.plan.rampTarget + 2) advice.push("Il CTL sale più in fretta del tetto scelto: una giornata facile vale più di una seduta in più.");
  const rides = ctx.data.activities.filter((a) => a.date.slice(0, 10) >= weekStart(ctx.today));
  if (r.level === "verde" && !rides.some((a) => a.IF != null && a.IF >= 0.85) && ctx.plan && (weekFor(ctx.plan, ctx.today)?.hardMax ?? 0) > 0) advice.push("Prontezza verde e nessun lavoro di qualità questa settimana: è il momento di farne uno.");
  const e = ctx.data.eftp.at(-1);
  if (e && ctx.data.athlete.ftp && Math.abs(e.eftp - ctx.data.athlete.ftp) / ctx.data.athlete.ftp > 0.08) advice.push("La FTP impostata e l'eFTP si discostano più dell'8%: pensa a un test.");
  if (ctx.data.cp && !ctx.data.cp.reliable) advice.push("La potenza critica non è affidabile: il test CP classico (3′, 7′, 12′) sistema profilo e zone.");
  if (!ctx.setup) advice.push("Manca il piano di stagione: con le date del picco il carico non va più a sensazione.");
  if (!advice.length) advice.push("Tutto in ordine: segui il piano, dormi, mangia in base alla seduta.");
  return done({ text: "Quello che farei io:", lines: advice.slice(0, 4), chips: ["Cosa faccio oggi?", "Come va la settimana?", "A che punto sono col piano?"] }, state);
}

export function aiuto(state: ChatState): ChatResult {
  const lines = HELP.map((g) => `${g.title}: ${g.examples.map((e) => `«${e}»`).join(", ")}`);
  return done({ text: "Sono il motore di MasCoach: parlo solo con i tuoi dati e con le regole del piano. Puoi chiedermi:", lines: [...lines, "Prima di scrivere qualcosa su Intervals ti chiedo sempre conferma, e puoi dire «annulla»."], chips: ["Cosa faccio oggi?", "Come sto?", "Ho male al ginocchio", "Ferie dal 10 al 20 dicembre"] }, state);
}

export function saluto(ctx: ChatContext, state: ChatState): ChatResult {
  const h = new Date().getHours();
  const hello = h < 12 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
  const r = ctx.data.status.readiness;
  return done({ text: `${hello} ${ctx.data.athlete.name.split(" ")[0] ?? ""}. Prontezza ${r.level}: ${r.headline.toLowerCase()}.`.replace("  ", " "), chips: ["Cosa faccio oggi?", "Fammi il punto", "Come sto?", "Cosa posso chiederti?"] }, state);
}

export function restrictionNote(ctx: ChatContext): string | null {
  return restrictionOn(ctx.today, ctx.life)?.reason ?? null;
}

export { planFromToday, planImpact };
