"use client";

// Season: the first planning screen asks for the goals (peak period, optional A race), the ramp rate the athlete accepts,
// the hours and the days off; then it shows the plan week by week (lib/training/season.ts).
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useCompact } from "@/lib/compact";
import { addDays, weekStart } from "@/lib/dates";
import type { CalendarData } from "@/lib/api/handlers";
import type { DashboardData } from "@/lib/dashboard";
import { loadProfile } from "@/lib/profile/profile";
import { PHASE_INFO, type PhaseId, planFromToday, type PlanWeek, RAMP_TARGET, type RampLevel, type SeasonSetup } from "@/lib/training/season";
import { clearSeason, loadSeason, SEASON_EVENT, saveSeason, seasonSnapshot } from "@/lib/training/seasonStore";
import { scheduleCloudPush } from "../data/cloud";
import { useLife } from "../data/trainingData";
import { apiFetch } from "../data/transport";
import { Chip, Divider, Err, Grid2, Label, Note, One, Text } from "../firstrun/FirstRun";
import { fmtDay } from "../format";
import { SectionPage } from "./SectionPage";

const subscribe = (cb: () => void) => {
  window.addEventListener(SEASON_EVENT, cb);
  return () => window.removeEventListener(SEASON_EVENT, cb);
};

const RAMP_LABEL: Record<RampLevel, string> = {
  prudente: "Prudente (circa +2-3 CTL a settimana)",
  bilanciato: "Bilanciato (circa +3-4)",
  aggressivo: "Aggressivo (circa +5-6)",
};
const RAMP_KEYS = Object.keys(RAMP_LABEL) as RampLevel[];
const HORIZONS: [string, number][] = [
  ["8 mesi", 36],
  ["9 mesi", 40],
  ["12 mesi", 52],
];

const PHASE_COLOR: Record<PhaseId, string> = {
  base_1: "var(--hrv)",
  base_2: "var(--hrv)",
  base_3: "var(--hrv)",
  build_1: "var(--fitness)",
  build_2: "var(--fitness)",
  peak: "var(--form)",
  taper: "var(--fatigue)",
  recupero: "var(--faint)",
  mantenimento: "var(--muted)",
};

const hoursFrom = (oreMax: string | undefined): string => (oreMax && /^\d+$/.test(oreMax) ? oreMax : "");

type Found = { race: { date: string; name: string } | null; stops: { from: string; to: string; label: string }[] };

/** Races and holidays already on the Intervals.icu calendar, read in 70-day chunks (the API's limit). */
async function readCalendar(today: string, weeks: number, ftp: number | null): Promise<Found> {
  const found: Found = { race: null, stops: [] };
  const chunks = Math.ceil((weeks * 7) / 70);
  const results = await Promise.all(
    Array.from({ length: chunks }, (_, i) =>
      apiFetch(`/api/calendar?from=${addDays(today, i * 70)}&to=${addDays(today, i * 70 + 69)}&ftp=${ftp ?? ""}`)
        .then((r) => (r.ok ? (r.json() as Promise<CalendarData>) : null))
        .catch(() => null),
    ),
  );
  const seen = new Set<string>();
  for (const c of results) {
    for (const e of c?.events ?? []) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (e.category === "RACE_A" && !found.race) found.race = { date: e.date, name: e.name };
      if (e.category === "HOLIDAY") found.stops.push({ from: e.date, to: e.endDate ?? e.date, label: e.name });
    }
  }
  return found;
}

// ── Setup form ───────────────────────────────────────────────────────────────────────────────────

type Draft = {
  hasPeak: "Sì" | "No";
  peakStart: string;
  peakWeeks: string;
  hasRace: "Sì" | "No";
  raceName: string;
  raceDate: string;
  raceTipo: string;
  ramp: RampLevel;
  horizon: number;
  maxHours: string;
  stops: { from: string; to: string; label: string; on: boolean }[];
  newFrom: string;
  newTo: string;
};

function draftFrom(setup: SeasonSetup | null): Draft {
  return {
    hasPeak: setup ? (setup.peak ? "Sì" : "No") : "Sì",
    peakStart: setup?.peak?.start ?? "",
    peakWeeks: String(setup?.peak?.weeks ?? 8),
    hasRace: setup?.raceA ? "Sì" : "No",
    raceName: setup?.raceA?.name ?? "",
    raceDate: setup?.raceA?.date ?? "",
    raceTipo: setup?.raceA?.tipo ?? "",
    ramp: setup?.ramp ?? "prudente",
    horizon: setup?.horizonWeeks ?? 40,
    maxHours: setup?.maxHours ? String(setup.maxHours) : hoursFrom(loadProfile()?.profile.oreMax),
    stops: (setup?.stops ?? []).map((s) => ({ from: s.from, to: s.to, label: s.label ?? "", on: true })),
    newFrom: "",
    newTo: "",
  };
}

function SetupForm({ data, initial, onSaved }: { data: DashboardData; initial: SeasonSetup | null; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(() => draftFrom(initial));
  const [error, setError] = useState("");
  const [reading, setReading] = useState(!initial);
  const today = data.today;
  const ftp = data.athlete.ftp;

  useEffect(() => {
    if (initial) return;
    let live = true;
    void readCalendar(today, d.horizon, ftp).then((f) => {
      if (!live) return;
      setD((cur) => ({
        ...cur,
        hasRace: f.race && !cur.raceDate ? "Sì" : cur.hasRace,
        raceName: cur.raceName || f.race?.name || "",
        raceDate: cur.raceDate || f.race?.date || "",
        stops: cur.stops.length ? cur.stops : f.stops.map((s) => ({ ...s, on: true })),
      }));
      setReading(false);
    });
    return () => {
      live = false;
    };
    // The calendar is read once, with the first horizon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<Draft>) => {
    setD((cur) => ({ ...cur, ...patch }));
    setError("");
  };

  const save = () => {
    const peakWeeks = Number(d.peakWeeks);
    if (d.hasPeak === "Sì") {
      if (!d.peakStart) return setError("Scrivi quando inizia il periodo di picco.");
      if (d.peakStart < today) return setError("Il periodo di picco deve iniziare da oggi in poi.");
      if (!(peakWeeks >= 1 && peakWeeks <= 8)) return setError("Il picco dura da 1 a 8 settimane.");
    }
    if (d.hasRace === "Sì") {
      if (!d.raceDate) return setError("Scrivi la data della gara A.");
      if (d.raceDate < today) return setError("La gara A deve essere in una data futura.");
    }
    const maxHours = d.maxHours ? Number(d.maxHours) : null;
    if (d.maxHours && !(maxHours! >= 3 && maxHours! <= 30)) return setError("Le ore massime a settimana vanno da 3 a 30.");
    saveSeason({
      // Editing keeps the day the season began: phases and light weeks stay on their dates.
      start: initial?.start ?? today,
      horizonWeeks: d.horizon,
      raceA: d.hasRace === "Sì" ? { date: d.raceDate, name: d.raceName || undefined, tipo: d.raceTipo || undefined } : null,
      peak: d.hasPeak === "Sì" ? { start: d.peakStart, weeks: peakWeeks } : null,
      ramp: d.ramp,
      stops: d.stops.filter((s) => s.on).map((s) => ({ from: s.from, to: s.to, label: s.label || undefined })),
      maxHours,
    });
    scheduleCloudPush();
    onSaved();
  };

  const addStop = () => {
    if (!d.newFrom) return setError("Scrivi il primo giorno dello stop.");
    const to = d.newTo || d.newFrom;
    if (to < d.newFrom) return setError("La fine dello stop è prima dell'inizio.");
    set({ stops: [...d.stops, { from: d.newFrom, to, label: "", on: true }], newFrom: "", newTo: "" });
  };

  return (
    <section className="card max-w-xl p-5">
      <h2 className="text-lg font-medium">Programmazione della stagione</h2>
      <p className="mt-1 text-sm text-muted">Poche domande: da qui il piano settimana per settimana, con il carico che sale di quanto accetti tu.</p>
      {reading && <Note>Leggo da Intervals gare e vacanze già in calendario…</Note>}

      <Divider>Periodo di picco</Divider>
      <Label>Vuoi un periodo di forma al massimo (fino a 2 mesi)?</Label>
      <One options={["Sì", "No"]} value={d.hasPeak} onChange={(v) => set({ hasPeak: v as "Sì" | "No" })} />
      {d.hasPeak === "Sì" && (
        <>
          <Grid2>
            <Text label="Quando inizia" type="date" value={d.peakStart} onChange={(v) => set({ peakStart: v })} />
            <div>
              <Label>Quante settimane (massimo 8)</Label>
              <One options={["4", "6", "8"]} value={d.peakWeeks} onChange={(v) => set({ peakWeeks: v })} />
            </div>
          </Grid2>
        </>
      )}

      <Divider>Gara A</Divider>
      <Label>Hai una gara A in questa stagione?</Label>
      <One options={["Sì", "No"]} value={d.hasRace} onChange={(v) => set({ hasRace: v as "Sì" | "No" })} />
      {d.hasRace === "Sì" && (
        <Grid2>
          <Text label="Nome" placeholder="facoltativo" value={d.raceName} onChange={(v) => set({ raceName: v })} />
          <Text label="Data" type="date" value={d.raceDate} onChange={(v) => set({ raceDate: v })} />
          <Text label="Tipo" placeholder="es. Granfondo, XC" value={d.raceTipo} onChange={(v) => set({ raceTipo: v })} />
        </Grid2>
      )}
      {d.hasRace === "Sì" && <Note>Prima della gara c&apos;è un tapering di 2 settimane: meno volume, stessa intensità.</Note>}

      <Divider>Carico</Divider>
      <Label>Quanto può salire il CTL ogni settimana di carico (ramp rate)</Label>
      <div>
        {RAMP_KEYS.map((k) => (
          <Chip key={k} on={d.ramp === k} onClick={() => set({ ramp: k })}>
            {RAMP_LABEL[k]}
          </Chip>
        ))}
      </div>
      <Grid2>
        <Text label="Ore massime in una settimana" type="number" placeholder="es. 8" value={d.maxHours} onChange={(v) => set({ maxHours: v })} />
        <div>
          <Label>Orizzonte del piano</Label>
          <div>
            {HORIZONS.map(([l, w]) => (
              <Chip key={w} on={d.horizon === w} onClick={() => set({ horizon: w })}>
                {l}
              </Chip>
            ))}
          </div>
        </div>
      </Grid2>

      <Divider>Giorni di stop</Divider>
      {d.stops.length === 0 && <p className="mt-2 text-xs text-muted">Nessuna vacanza o trasferta in calendario.</p>}
      <div className="mt-2">
        {d.stops.map((s, i) => (
          <Chip key={`${s.from}-${i}`} on={s.on} onClick={() => set({ stops: d.stops.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) })}>
            {s.label ? `${s.label}: ` : ""}
            {fmtDay(s.from)}
            {s.to !== s.from ? `–${fmtDay(s.to)}` : ""}
          </Chip>
        ))}
      </div>
      <Grid2>
        <Text label="Aggiungi uno stop: dal" type="date" value={d.newFrom} onChange={(v) => set({ newFrom: v })} />
        <Text label="al" type="date" value={d.newTo} onChange={(v) => set({ newTo: v })} />
      </Grid2>
      <button type="button" onClick={addStop} className="mt-2 rounded-xl px-3 py-1.5 text-xs" style={{ border: "1px solid var(--border)" }}>
        Aggiungi
      </button>

      <Err text={error} />
      <div className="mt-6 flex gap-2">
        {initial && (
          <button type="button" onClick={onSaved} className="rounded-xl px-4 py-2 text-sm" style={{ border: "1px solid var(--border)" }}>
            Annulla
          </button>
        )}
        <button type="button" onClick={save} className="flex-1 rounded-xl px-4 py-2 text-sm font-medium" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
          Costruisci il piano
        </button>
      </div>
    </section>
  );
}

// ── Plan ─────────────────────────────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<PlanWeek["kind"], string> = { carico: "Carico", scarico: "Leggera", stop: "Stop", taper: "Tapering", gara: "Gara" };
const weekLabel = (w: PlanWeek) => `${fmtDay(w.start)} – ${fmtDay(w.end)}`;

function PlanView({ data, setup, onEdit }: { data: DashboardData; setup: SeasonSetup; onEdit: () => void }) {
  // Holidays, illness and injuries written on the Intervals.icu calendar (or by the chat) shape the plan at once.
  const life = useLife(data.today);
  const plan = useMemo(() => planFromToday(setup, data.today, data.status.ctl, life), [setup, data.today, data.status.ctl, life]);
  const current = weekStart(data.today);
  // Phone app: the next 8 weeks, the rest on request.
  const compact = useCompact();
  const [allWeeks, setAllWeeks] = useState(false);
  const listed = compact && !allWeeks ? plan.weeks.filter((w) => w.start >= current).slice(0, 8) : plan.weeks;
  const maxTss = Math.max(...plan.weeks.map((w) => w.tssTarget), 1);
  const next = plan.weeks.find((w) => w.start >= current && w.kind !== "stop");
  const stat = (label: string, value: string, hint?: string) => (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--background)" }}>
      <div className="text-xs text-muted">{label}</div>
      <div className="num text-lg font-medium">{value}</div>
      {hint && <div className="text-[11px] text-faint">{hint}</div>}
    </div>
  );
  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Il piano</h2>
          <button type="button" onClick={onEdit} className="rounded-full px-3 py-1 text-xs" style={{ border: "1px solid var(--border)" }}>
            Modifica
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stat("CTL oggi", String(Math.round(plan.ctlStart)))}
          {stat("CTL a fine picco", plan.ctlPeak !== null ? String(Math.round(plan.ctlPeak)) : "–", plan.peakWindow ? `${fmtDay(plan.peakWindow.start)} – ${fmtDay(plan.peakWindow.end)}` : "nessun picco")}
          {stat("Ramp rate", `+${String(RAMP_TARGET[setup.ramp]).replace(".", ",")}`, "CTL a settimana, di carico")}
          {stat("Settimane", String(plan.weeks.length), setup.raceA ? `gara A il ${fmtDay(setup.raceA.date)}` : "senza gara A")}
        </div>
        {plan.warnings.map((w) => (
          <Note key={w} tone="warning">
            {w}
          </Note>
        ))}
        <Note>
          È una mappa: ogni giorno si ricalcola con i tuoi dati veri, e il TSS di riferimento di una settimana non è un obbligo. Una settimana andata male sposta tutto quello che viene dopo.
        </Note>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-medium">Carico settimanale (TSS di riferimento)</h2>
        <div className="mt-3 flex h-28 items-end gap-px overflow-x-auto" role="img" aria-label="TSS di riferimento per settimana, colorato per fase">
          {plan.weeks.map((w) => (
            <div
              key={w.start}
              title={`${weekLabel(w)} · ${PHASE_INFO[w.phase].label} · TSS ${w.tssTarget}`}
              className="min-w-[5px] flex-1 rounded-t-sm"
              style={{
                height: `${Math.max(3, (w.tssTarget / maxTss) * 100)}%`,
                background: PHASE_COLOR[w.phase],
                opacity: w.kind === "scarico" || w.kind === "stop" ? 0.45 : 1,
                outline: w.start === current ? "2px solid var(--foreground)" : undefined,
              }}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          {(["base_1", "build_1", "peak", "taper", "recupero", "mantenimento"] as PhaseId[]).map((p) => (
            <span key={p} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: PHASE_COLOR[p] }} />
              {p === "base_1" ? "Base" : p === "build_1" ? "Build" : PHASE_INFO[p].label}
            </span>
          ))}
          <span>Barre chiare: settimane leggere o di stop</span>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-medium">Settimana per settimana</h2>
        {next && (
          <p className="mt-1 text-xs text-muted">
            Questa settimana: {PHASE_INFO[next.phase].label}, {KIND_LABEL[next.kind].toLowerCase()}, TSS di riferimento {next.tssTarget}.
          </p>
        )}
        <ul className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
          {listed.map((w) => (
            <li key={w.start} className="flex items-start gap-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: w.start === current ? "var(--background)" : undefined }}>
              <span className="w-24 shrink-0 text-xs text-muted">{weekLabel(w)}</span>
              <span className="min-w-0 flex-1">
                <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--background)", color: "var(--foreground)", border: `1px solid ${PHASE_COLOR[w.phase]}` }}>
                  {PHASE_INFO[w.phase].label}
                </span>
                <span className="ml-2 text-xs text-muted">{KIND_LABEL[w.kind]}</span>
                {w.note && <span className="mt-0.5 block text-xs text-faint">{w.note}</span>}
              </span>
              <span className="num shrink-0 text-right text-xs">
                <span className="block font-medium">TSS {w.tssTarget}</span>
                <span className="text-muted">
                  CTL {Math.round(w.ctlEnd)} · ~{w.hoursApprox} h
                </span>
              </span>
            </li>
          ))}
        </ul>
        {compact && plan.weeks.length > listed.length && !allWeeks && (
          <button type="button" onClick={() => setAllWeeks(true)} className="mt-3 w-full rounded-xl px-4 py-2 text-sm text-muted" style={{ border: "1px solid var(--border)" }}>
            Mostra tutte le {plan.weeks.length} settimane
          </button>
        )}
      </section>
    </div>
  );
}

export default function Stagione() {
  return (
    <SectionPage id="stagione">
      {(data) => <Body data={data} />}
    </SectionPage>
  );
}

function Body({ data }: { data: DashboardData }) {
  const raw = useSyncExternalStore(subscribe, seasonSnapshot, () => "");
  const setup = useMemo(() => (raw ? loadSeason() : null), [raw]);
  const [editing, setEditing] = useState(false);
  if (data.source === "demo") return <Note tone="warning">Collega Intervals.icu per programmare la stagione sui tuoi dati.</Note>;
  if (!setup || editing) return <SetupForm key={editing ? "edit" : "new"} data={data} initial={setup} onSaved={() => setEditing(false)} />;
  return (
    <>
      <PlanView data={data} setup={setup} onEdit={() => setEditing(true)} />
      <button
        type="button"
        onClick={() => {
          clearSeason();
          scheduleCloudPush(2000, { seasonCleared: true });
        }}
        className="text-xs text-faint underline"
      >
        Cancella il piano e ricomincia
      </button>
    </>
  );
}
