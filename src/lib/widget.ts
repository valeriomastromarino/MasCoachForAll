// What the Android home-screen widget shows. Design «B + C», chosen on 22 November 2026 among five previews
// (docs/anteprime-widget-mix-2026-11-22.html): on top the verdict of the day on the brand colour with the bar
// Recupero · Riduci · Pronto (B), under it the night's numbers against the athlete's norm with their trend (C: HRV over
// 7 days as in the app, resting HR, sleep, form), at the bottom today's session with one action.
// The session follows the rules of the Oggi card: a planned ride goes through plannedFits, an empty day shows the engine's
// proposal, «Pedala» appears only for a session on the trainer that suits the day. Until 22 November the widget opened the
// player for any planned workout (an outdoor long ride included), showed the HRV of the single night and «Nessun
// allenamento previsto» on the days the app proposed one.
// Built by the same function in two places: by the app while it is open (it also knows the «solo per oggi» requests of
// the chat) and by GET /api/widget at 8:00, with the copy of sheet and season kept on Intervals.icu. The strings are ready
// to show, in Italian: the native side (MasCoachWidget.java) only lays them out and draws the small charts.
import { type CalendarWorkout, isBikeSession, type LibraryWorkout, onTrainer } from "./calendar";
import { type ChatContext, suggestInput, type TodayOverrides } from "./coach/chat/context";
import type { DashboardData } from "./dashboard";
import type { AutonomicPattern } from "./physio/autonomic";
import type { AthleteProfile } from "./profile/profile";
import type { LifeEvent } from "./training/life";
import { planFromToday, type SeasonSetup } from "./training/season";
import { plannedFits, planWeek, type Suggestion, suggestWorkout, type WeekDay } from "./training/suggest";
import { choicesOf } from "./training/weeks";
import type { WorkoutBlock } from "./workout";

export type WidgetLevel = "verde" | "giallo" | "rosso" | "grigio";

/** The one thing to do with today's session. `icon`: play (the trainer), right (a page of the app), calendar (the plan). */
export type WidgetAction = { label: string; icon: "play" | "right" | "calendar"; route: string };

export type WidgetSession = {
  kind: "planned" | "proposal" | "rest" | "done";
  /** The line above the name: «Oggi · fuori», «Proposta di MasCoach», «Fatto oggi». */
  label: string;
  title: string;
  /** Short line for the small sizes. */
  meta: string;
  /** Long line: place, duration and TSS. */
  metaLong: string;
  /** A planned session the day does not suit: «Non adatta a oggi», what to do instead and the rule in its own words. */
  warn: string | null;
  better: string | null;
  why: string | null;
  /** Where a tap on the session goes. */
  route: string;
  action: WidgetAction;
  /** The profile: seconds, % of FTP and zone of each block (empty = nothing to draw). */
  blocks: { secs: number; pct: number; zone: number }[];
};

/** A number of the night against the athlete's norm (lo–hi), with the last seven nights for the small trend. */
export type WidgetNumber = {
  value: number;
  lo: number | null;
  hi: number | null;
  /** «nella norma», «sotto la norma», «sopra la norma», «dati insufficienti». */
  status: string;
  arrow: "↑" | "↓" | "";
  nights: (number | null)[];
};

export type WidgetData = {
  v: 2;
  /** When it was built (ISO): the widget shows the time. */
  at: string;
  date: string;
  /** «dom 22 nov». */
  day: string;
  /** Who built it: the app (with the chat's requests for today) or the site (at 8:00 and with «Aggiorna»). */
  from: "app" | "sito";
  level: WidgetLevel;
  /** «Riduci» for the small sizes; the app's headline («Riduci l'intensità») for the others. */
  word: string;
  headline: string;
  /** «Meglio Z2 oggi». */
  short: string;
  /** Why the day is what it is, in one line. */
  why: string;
  /** Lit segment of the bar: 0 Recupero, 1 Riduci, 2 Pronto, −1 none (not enough data yet). */
  seg: number;
  /** «HRV 58 · FC 52 ↑» for the smallest sizes. */
  nums: string;
  /** HRV: the 7-day average the app shows («HRV 7 gg»), the nights of the last week and of the last two. */
  hrv: (WidgetNumber & { n14: (number | null)[] }) | null;
  /** Resting HR of the night; the arrow and the status come from its 7-day average against the norm (Altini). */
  rhr: WidgetNumber | null;
  sleep: { text: string; nights: (number | null)[] } | null;
  form: { value: number; text: string; zone: string | null; days: number[]; ctl: number | null; atl: number | null } | null;
  session: WidgetSession;
  /** «Domani riposo · mar 24 VO2 5x3 Indoor». */
  next: string;
};

export type WidgetInput = {
  dash: DashboardData;
  library: LibraryWorkout[];
  /** The calendar from today for a week: only the rides and the races count (weights and Pilates are not sessions). */
  planned: CalendarWorkout[];
  setup: SeasonSetup | null;
  profile: AthleteProfile | null;
  phenotype: ChatContext["phenotype"];
  life: LifeEvent[];
  /** What the athlete asked in the chat for today only: the app knows it, the site does not. */
  overrides?: TodayOverrides | null;
  from: "app" | "sito";
  now?: Date;
};

const LEVEL: Record<WidgetLevel, { word: string; short: string; seg: number }> = {
  verde: { word: "Pronto", short: "Via libera oggi", seg: 2 },
  giallo: { word: "Riduci", short: "Meglio Z2 oggi", seg: 1 },
  rosso: { word: "Recupero", short: "Riposo o Z1 breve", seg: 0 },
  grigio: { word: "Pochi dati", short: "Segui il piano", seg: -1 },
};

const WEEKDAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const noon = (iso: string) => new Date(`${iso}T12:00:00`);
/** «dom 22 nov». */
export const dayText = (iso: string) => `${WEEKDAYS[noon(iso).getDay()]} ${noon(iso).getDate()} ${MONTHS[noon(iso).getMonth()]}`;
const shortDay = (iso: string) => `${WEEKDAYS[noon(iso).getDay()]} ${noon(iso).getDate()}`;

/** 120 → «2 h 00», 55 → «55′». */
export const minsText = (mins: number) => (mins >= 60 ? `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")}` : `${mins}′`);
/** −14 with the minus sign the app uses. */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
const round = (x: number | null | undefined, d = 0) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(d)) : null);
const hoursText = (h: number) => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};

/** Rides that count as «done today» on the Oggi card. */
const RIDE_CATEGORIES = ["strada", "offroad", "rulli"];
/** % of FTP drawn for a block without its own (middle of the Coggan zone). */
const ZONE_PCT = [0, 45, 65, 83, 98, 113, 135, 160];

const blocksOf = (b: WorkoutBlock[]) =>
  b
    .filter((x) => x.secs > 0)
    .slice(0, 200)
    .map((x) => ({ secs: Math.round(x.secs), pct: Math.round(x.pct ?? ZONE_PCT[Math.max(1, Math.min(7, x.zone))]), zone: Math.max(1, Math.min(7, x.zone)) }));

function hrvOf(dash: DashboardData): WidgetData["hrv"] {
  const h = dash.status.hrv;
  if (h.baseline7 === null) return null;
  const rec = dash.recovery;
  return {
    value: Math.round(Math.exp(h.baseline7)),
    lo: h.low !== null ? Math.round(Math.exp(h.low)) : null,
    hi: h.high !== null ? Math.round(Math.exp(h.high)) : null,
    status: h.status,
    arrow: h.status === "sotto la norma" ? "↓" : h.status === "sopra la norma" ? "↑" : "",
    nights: rec.slice(-7).map((r) => round(r.rmssd)),
    n14: rec.slice(-14).map((r) => round(r.rmssd)),
  };
}

function rhrOf(dash: DashboardData): WidgetNumber | null {
  const r = dash.status.rhr;
  const value = round(r.today ?? r.baseline7);
  if (value === null) return null;
  const b = r.baseline7;
  const known = b !== null && r.low !== null && r.high !== null;
  const up = known && b! > r.high!;
  const down = known && b! < r.low!;
  return {
    value,
    lo: round(r.low),
    hi: round(r.high),
    status: !known ? "dati insufficienti" : up ? "sopra la norma" : down ? "sotto la norma" : "nella norma",
    arrow: up ? "↑" : down ? "↓" : "",
    nights: dash.recovery.slice(-7).map((x) => round(x.rhr)),
  };
}

const PATTERN_WHY: Partial<Record<AutonomicPattern, string>> = {
  stress: "HRV sotto e FC a riposo sopra la norma",
  hrv_basso: "HRV sotto la norma",
  fc_alta: "FC a riposo sopra la norma",
  saturazione: "HRV e FC a riposo entrambe basse",
  discordante: "HRV e FC a riposo entrambe alte: misura forse disturbata",
};

/** The reasons of the verdict in a line, in the order the readiness score counts them (lib/physio/readiness.ts). */
export function whyOf(dash: DashboardData): string {
  const s = dash.status;
  const a = s.autonomic;
  const parts: string[] = [];
  if (a.anomalyStreak >= 2) parts.push(`${a.anomalyStreak} notti di fila con HRV bassa e FC a riposo alta`);
  else if (a.anomalyToday) parts.push("stanotte HRV bassa e FC a riposo alta");
  else if (s.hrv.acuteDrop) parts.push("HRV di stanotte molto più bassa del solito");
  // The anomalous night already says what HRV and resting HR did.
  const pattern = PATTERN_WHY[a.pattern];
  if (pattern && !(a.anomalyStreak >= 2 || a.anomalyToday)) parts.push(pattern);
  const short = dash.sleep.slice(-3).filter((n) => n.hours !== null && n.hours < 6).length;
  if (short >= 2) parts.push(`sonno sotto le 6 h in ${short} notti su 3`);
  if (s.tsbYesterday !== null && s.tsbYesterday < -30) parts.push(`forma di ieri a ${signed(Math.round(s.tsbYesterday))}`);
  if (!parts.length) {
    if (a.pattern === "dati_insufficienti") return "Servono 3 settimane di misure notturne per la tua norma";
    if (a.pattern === "adattamento_positivo") return "FC a riposo più bassa del solito: stai assorbendo bene il carico";
    return "HRV e FC a riposo nella tua norma";
  }
  const text = parts.slice(0, 2).join(", ");
  return text[0].toUpperCase() + text.slice(1);
}

type DayPlan = { name: string; mins: number | null; indoor: boolean };
function dayPlan(d: WeekDay | undefined): DayPlan | null {
  if (!d) return null;
  if (d.planned) return { name: d.planned.name, mins: d.planned.secs ? Math.round(d.planned.secs / 60) : null, indoor: onTrainer(d.planned) };
  if (d.suggestion?.kind === "workout") return { name: d.suggestion.main.workout.name, mins: d.suggestion.main.mins, indoor: d.suggestion.main.indoor };
  return null;
}

/** «Domani VO2 5x3 Indoor», or «Domani riposo · mer 25 Zone 2 Endurance 60 Indoor». */
function nextOf(week: WeekDay[]): string {
  const tomorrow = week[1];
  if (!tomorrow) return "";
  const t = dayPlan(tomorrow);
  if (t) return `Domani ${t.name}`;
  const later = week.slice(2).find((d) => dayPlan(d));
  return later ? `Domani riposo · ${shortDay(later.date)} ${dayPlan(later)!.name}` : "Domani riposo";
}

function session(input: WidgetInput, today: string, s: Suggestion, week: WeekDay[], fitsOf: (w: CalendarWorkout) => ReturnType<typeof plannedFits>): WidgetSession {
  const { dash, planned } = input;
  // A bike ride already done today replaces the plan, as on the Oggi card.
  const ride =
    dash.activities
      .filter((a) => a.date.slice(0, 10) === today && a.movingTime > 0 && RIDE_CATEGORIES.includes(a.category))
      .sort((a, b) => b.movingTime - a.movingTime)[0] ?? null;
  if (ride) {
    const mins = Math.round(ride.movingTime / 60);
    const route = `/attivita/${encodeURIComponent(ride.id)}`;
    return {
      kind: "done",
      label: "Fatto oggi",
      title: ride.name,
      meta: minsText(mins),
      metaLong: [minsText(mins), ride.tss !== null ? `TSS ${Math.round(ride.tss)}` : null, ride.distanceKm ? `${ride.distanceKm.toFixed(1).replace(".", ",")} km` : null].filter(Boolean).join(" · "),
      warn: null,
      better: null,
      why: null,
      route,
      action: { label: "Vedi uscita", icon: "right", route },
      blocks: [],
    };
  }

  const w = planned.find((p) => p.date === today && isBikeSession(p)) ?? null;
  if (w) {
    const mins = w.secs ? Math.round(w.secs / 60) : null;
    const trainer = onTrainer(w);
    const fit = fitsOf(w);
    const base = {
      kind: "planned" as const,
      label: w.race ? "Oggi · gara" : `Oggi · ${trainer ? "sui rulli" : "fuori"}`,
      title: w.name,
      meta: mins !== null ? minsText(mins) : "",
      metaLong: [w.race ? "Gara" : trainer ? "Rulli" : "Fuori", mins !== null ? minsText(mins) : null, w.tss ? `TSS ${Math.round(w.tss)}` : null].filter(Boolean).join(" · "),
      route: "/",
      blocks: blocksOf(w.blocks),
    };
    if (!fit.ok)
      return {
        ...base,
        warn: "Non adatta a oggi",
        better: s.kind === "workout" ? `Meglio ${s.main.workout.name} · ${minsText(s.main.mins)}` : "Meglio riposare oggi",
        why: fit.why,
        action: { label: "Vedi cosa fare", icon: "right", route: "/" },
      };
    // «Pedala» only for a session on the trainer with its steps (the player needs them).
    const action: WidgetAction = trainer && w.blocks.length > 0 ? { label: "Pedala", icon: "play", route: `/rulli/${encodeURIComponent(w.id)}` } : { label: "Dettagli", icon: "right", route: "/" };
    return { ...base, warn: null, better: null, why: null, action };
  }

  const tomorrow = dayPlan(week[1]);
  if (!input.library.length) {
    // Without the library the engine has nothing to propose (it would say «riposo»): the card of the app knows more.
    return {
      kind: "rest",
      label: "Oggi",
      title: "Niente in programma",
      meta: "Apri Oggi",
      metaLong: "Apri Oggi per la proposta di MasCoach",
      warn: null,
      better: null,
      why: null,
      route: "/",
      action: { label: "Oggi", icon: "right", route: "/" },
      blocks: [],
    };
  }
  if (s.kind === "rest") {
    return {
      kind: "rest",
      label: "Oggi",
      title: "Riposo",
      meta: tomorrow ? `Domani: ${tomorrow.name}` : "Domani riposo",
      metaLong: tomorrow ? `Domani: ${tomorrow.name}${tomorrow.mins ? ` · ${minsText(tomorrow.mins)}` : ""}` : s.reason,
      warn: null,
      better: null,
      why: s.reason,
      route: "/calendario",
      action: { label: "Piano", icon: "calendar", route: "/calendario" },
      blocks: [],
    };
  }
  const p = s.main;
  // A day the athlete fixed in the Stagione page is theirs, not a proposal.
  const mine = choicesOf(input.setup).some((c) => c.date === today && c.mine);
  return {
    kind: "proposal",
    label: mine ? "Scelta da te" : "Proposta di MasCoach",
    title: p.workout.name,
    meta: minsText(p.mins),
    metaLong: `${p.indoor ? "Rulli" : "Fuori"} · ${minsText(p.mins)} · non è su Intervals`,
    warn: null,
    better: null,
    why: null,
    route: "/",
    action: { label: "Vedi proposta", icon: "right", route: "/" },
    blocks: blocksOf(p.workout.blocks),
  };
}

export function buildWidget(input: WidgetInput): WidgetData {
  const { dash, setup, life } = input;
  const today = dash.today;
  const bike = input.planned.filter(isBikeSession);
  const ctx: ChatContext = {
    today,
    data: dash,
    library: input.library,
    planned: bike,
    profile: input.profile,
    phenotype: input.phenotype,
    setup,
    plan: setup ? planFromToday(setup, today, dash.status.ctl, life) : null,
    life,
    overrides: input.overrides ?? { date: "" },
    history: null,
  };
  const engine = suggestInput(ctx);
  const suggestion = suggestWorkout(engine);
  // The next seven days as the Oggi card plans them: today with the real readiness, the next days assuming green.
  const week = planWeek(engine);
  // The engine's rules on a planned session look at the rides done, not at the days it simulated (as on the Oggi card).
  const fitsOf = (w: CalendarWorkout) => plannedFits({ ...engine, recent: engine.recent.filter((a) => !a.planned) }, { ...w, id: 0 });

  const level = dash.status.readiness.level;
  const hrv = hrvOf(dash);
  const rhr = rhrOf(dash);
  const hours = dash.status.sleepHours;
  const tsb = dash.status.tsb;
  const nums = [hrv ? `HRV ${hrv.value}` : null, rhr ? `FC ${rhr.value}${rhr.arrow ? ` ${rhr.arrow}` : ""}` : null].filter(Boolean).join(" · ");
  return {
    v: 2,
    at: (input.now ?? new Date()).toISOString(),
    date: today,
    day: dayText(today),
    from: input.from,
    level,
    word: LEVEL[level].word,
    headline: dash.status.readiness.headline,
    short: LEVEL[level].short,
    why: whyOf(dash),
    seg: LEVEL[level].seg,
    nums: nums || LEVEL[level].short,
    hrv,
    rhr,
    sleep: hours !== null ? { text: hoursText(hours), nights: dash.sleep.slice(-7).map((n) => round(n.hours, 1)) } : null,
    form:
      tsb !== null
        ? { value: Math.round(tsb), text: signed(Math.round(tsb)), zone: dash.status.formZone, days: dash.pmc.slice(-14).map((p) => round(p.tsb, 1) ?? 0), ctl: round(dash.status.ctl), atl: round(dash.status.atl) }
        : null,
    session: session(input, today, suggestion, week, fitsOf),
    next: nextOf(week),
  };
}
