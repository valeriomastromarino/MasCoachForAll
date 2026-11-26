"use client";

// The coach's chat: it talks only to the app's own engine (lib/coach/chat), reads the athlete's Italian with rules and answers
// from the data. What it writes to Intervals.icu, to the sheet or to the plan is shown first and done only after a "sì".
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { IconAlertTriangle, IconApple, IconBike, IconBolt, IconCalendarEvent, IconChevronRight, IconMoodSmile, IconMoon } from "@tabler/icons-react";
import { type Action, chat, type ChatContext, type ChatState, emptyState, rulesFirst } from "@/lib/coach/chat";
import type { WorkoutCard } from "@/lib/coach/chat/context";
import { COACH_PREFILL_EVENT, takeCoachPrefill } from "@/lib/coach/chat/prefill";
import { type StartTone, startPage } from "@/lib/coach/chat/starters";
import { normalize } from "@/lib/coach/chat/text";
import { useCompact } from "@/lib/compact";
import { coachAiOn } from "@/lib/coach/server";
import { isApp } from "@/lib/native";
import { type ChatMessage, clearChat, loadChat, saveChat, saveOverrides } from "@/lib/coach/chat/store";
import type { DashboardData } from "@/lib/dashboard";
import { assessPhenotype } from "@/lib/profile/phenotype";
import { loadProfile, PROFILE_EVENT, profileSnapshot } from "@/lib/profile/profile";
import { planFromToday } from "@/lib/training/season";
import { loadSeason, SEASON_EVENT, seasonSnapshot } from "@/lib/training/seasonStore";
import { WorkoutProfile } from "../calendar/shared";
import { bestOfLastSeasons } from "../firstrun/FirstRun";
import { useHistory, useLibrary, useLife, useOverrides, usePlanned } from "../data/trainingData";
import { askFetch } from "../data/transport";
import { savedForecast } from "../data/weatherData";
import { PageTitle } from "../sections/SectionPage";
import { runAction, runUndo, type SheetContext } from "./chatActions";

const subProfile = (cb: () => void) => {
  window.addEventListener(PROFILE_EVENT, cb);
  return () => window.removeEventListener(PROFILE_EVENT, cb);
};
const subSeason = (cb: () => void) => {
  window.addEventListener(SEASON_EVENT, cb);
  return () => window.removeEventListener(SEASON_EVENT, cb);
};

const QUICK = ["Cosa faccio oggi?", "Come sto?", "Fammi il punto", "Cosa posso chiederti?"];
/**
 * Phone app, empty chat («2 · Del momento», chosen on 26 November 2026 among three previews):
 * the questions of the day come from `startPage`; a change starts the sentence in the box, to be finished by the athlete
 * (nothing is written without the «sì» anyway).
 */
const CHANGES: { label: string; begin: string }[] = [
  { label: "Sposta una seduta", begin: "Sposta l'allenamento di domani a " },
  { label: "Crea una seduta", begin: "Domani sui rulli " },
  { label: "Oggi più facile", begin: "Oggi più facile" },
  { label: "Ferie o malattia", begin: "Ferie dal " },
];
const TONE: Record<StartTone, { Icon: typeof IconBolt; bg: string; ink: string }> = {
  warn: { Icon: IconAlertTriangle, bg: "var(--warning-bg)", ink: "var(--warning-ink)" },
  good: { Icon: IconMoodSmile, bg: "var(--good-bg)", ink: "var(--good-ink)" },
  night: { Icon: IconMoon, bg: "var(--good-bg)", ink: "var(--good-ink)" },
  session: { Icon: IconBolt, bg: "var(--accent-bg)", ink: "var(--accent-ink)" },
  food: { Icon: IconApple, bg: "var(--accent-bg)", ink: "var(--accent-ink)" },
  ride: { Icon: IconBike, bg: "var(--accent-bg)", ink: "var(--accent-ink)" },
  plan: { Icon: IconCalendarEvent, bg: "var(--neutral-bg)", ink: "var(--muted)" },
};
/** A quick reply that changes something (it still asks for the «sì» before writing): a small dot tells it from a question. */
const CHANGE_CHIP = /^(programma|più facile|piu facile|cambia|sposta|accorcia|allunga|annulla|rendi|togli|cancella|salva|mettila|riprova|ancora|torna|fallo|falla)/i;
const YES = /^(si|sii|sisi|ok|okay|va bene|certo|confermo|conferma|fallo|procedi|esatto|d accordo|daccordo|perfetto|yes|dai|vai|fai pure|applica)\b/;
const NO = /^(no|nono|lascia stare|stop|niente|non farlo|ferma|aspetta|indietro|meglio di no|annulla)\b/;
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const noSubscribe = () => () => {};

export function CoachChat({ data }: { data: DashboardData }) {
  const today = data.today;
  const library = useLibrary();
  const planned = usePlanned(today, data.athlete.ftp);
  const life = useLife(today);
  const history = useHistory();
  const overrides = useOverrides(today);
  const rawProfile = useSyncExternalStore(subProfile, profileSnapshot, () => "");
  const rawSeason = useSyncExternalStore(subSeason, seasonSnapshot, () => "");
  const stored = useMemo(() => (rawProfile ? loadProfile() : null), [rawProfile]);
  const setup = useMemo(() => (rawSeason ? loadSeason() : null), [rawSeason]);
  const plan = useMemo(() => (setup ? planFromToday(setup, today, data.status.ctl, life) : null), [setup, today, data.status.ctl, life]);

  const compact = useCompact();
  const [thread, setThread] = useState(() => loadChat());
  const messages = thread.messages;
  const state = thread.state;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("Scrivo su Intervals…");
  /** Changes proposed by the written coach (Claude Haiku), waiting for the "sì". Not kept: a new topic drops them. */
  const [aiActions, setAiActions] = useState<Action[]>([]);
  /** The written coach is not reachable here (single-file app, no key): the chat uses its rules. */
  const [aiOff, setAiOff] = useState(false);
  /** The written coach turned on in Impostazioni (read after the first paint: the server page doesn't know it). */
  const aiOn = useSyncExternalStore(noSubscribe, coachAiOn, () => false);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);
  // A request written by another page (calendar: "Chiedi al coach una tabella") waits in the message box.
  useEffect(() => {
    const take = () => {
      const t = takeCoachPrefill();
      if (t) setDraft(t);
    };
    take();
    window.addEventListener(COACH_PREFILL_EVENT, take);
    return () => window.removeEventListener(COACH_PREFILL_EVENT, take);
  }, []);
  const started = useRef(false);

  const ctx: ChatContext | null = useMemo(() => {
    if (!library || planned === null) return null;
    return { today, data, library, planned, profile: stored?.profile ?? null, phenotype: stored?.phenotype ?? null, setup, plan, life, overrides, history, weather: savedForecast() };
  }, [today, data, library, planned, stored, setup, plan, life, overrides, history]);

  const pheno = useMemo(() => {
    const recent = data.mmp.find((p) => p.secs === 1200)?.watts ?? null;
    return assessPhenotype({
      weightKg: data.athlete.weight,
      ftp: data.athlete.ftp,
      wPrimeSetJ: data.athlete.wPrime,
      modelWPrimeJ: data.cp?.wPrime ?? null,
      modelReliable: data.cp?.reliable ?? null,
      best: bestOfLastSeasons(history),
      recent20: recent !== null ? Math.round(recent) : null,
    });
  }, [data, history]);
  const sheet: SheetContext = useMemo(
    () => ({
      today,
      pheno,
      athlete: { name: data.athlete.name, weight: data.athlete.weight, ftp: data.athlete.ftp, indoorFtp: data.athlete.indoorFtp, lthr: data.athlete.lthr, maxHr: data.athlete.maxHr, wPrime: data.athlete.wPrime, cp: data.cp?.cp ?? null, cpValid: data.cp ? false : null },
    }),
    [today, pheno, data],
  );

  const commit = (add: ChatMessage[], next: ChatState) => setThread((t) => ({ messages: [...t.messages, ...add], state: next }));

  // The first time the chat opens (or after "Nuova conversazione"), it starts with the day's briefing.
  useEffect(() => {
    if (!ctx || started.current || messages.length > 0 || compact) return;
    started.current = true;
    const r = chat("fammi il punto", ctx, emptyState());
    commit([{ id: uid(), role: "coach", text: r.reply.text, lines: r.reply.lines, proposal: r.reply.proposal, workout: r.reply.workout, chips: r.reply.chips, at: new Date().toISOString() }], r.state);
  }, [ctx, messages.length, compact]);

  useEffect(() => {
    saveChat(messages, state);
  }, [messages, state]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  const say = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: uid(), role: "coach", text, at: new Date().toISOString(), ...extra });
  const push = (add: ChatMessage[], patch?: Partial<ChatState>) => setThread((cur) => ({ messages: [...cur.messages, ...add], state: patch ? { ...cur.state, ...patch } : cur.state }));

  /** The written coach: Claude Haiku reads the thread and the data, answers, and proposes changes that wait for the "sì". */
  const askCoach = async (t: string, user: ChatMessage): Promise<{ ok: true } | { ok: false; why: string }> => {
    const history = [...messages, user].slice(-16).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.role === "user" ? m.text : [m.text, ...(m.lines ?? [])].join("\n") }));
    setBusyText("Il coach sta pensando…");
    try {
      const res = await askFetch({ messages: history, snapshot: { today, setup, profile: stored?.profile ?? null } });
      const json = (await res.json().catch(() => ({}))) as { text?: string; actions?: Action[]; overrides?: Partial<Omit<import("@/lib/coach/chat").TodayOverrides, "date">>; error?: string };
      if (res.status === 501) {
        setAiOff(true);
        return { ok: false, why: "" };
      }
      if (!res.ok || !json.text) return { ok: false, why: `${res.status} ${json.error ?? "nessuna risposta"}`.slice(0, 300) };
      if (json.overrides) saveOverrides({ ...(overrides.date === today ? overrides : { date: today }), ...json.overrides, date: today });
      const actions = json.actions ?? [];
      setAiActions(actions);
      push([say(json.text, actions.length ? { lines: actions.map((a) => a.label), chips: ["Sì", "No"] } : { chips: ["Cosa faccio oggi?", "Fammi il punto"] })]);
      return { ok: true };
    } catch (e) {
      return { ok: false, why: `rete: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) };
    }
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || !ctx || busy) return;
    setDraft("");
    const now = new Date().toISOString();
    const user: ChatMessage = { id: uid(), role: "user", text: t, at: now };
    const n = normalize(t);

    // A proposal from the written coach is waiting: "sì" writes it, "no" drops it, anything else is a new request.
    if (aiActions.length > 0 && !state.pending) {
      if (NO.test(n)) {
        setAiActions([]);
        return push([user, say("Va bene, non scrivo nulla.", { chips: ["Cosa faccio oggi?", "Fammi il punto"] })]);
      }
      if (YES.test(n)) {
        const todo = aiActions;
        setAiActions([]);
        setBusyText("Scrivo su Intervals…");
        setBusy(true);
        push([user, say("Lo scrivo…")]);
        const lines: string[] = [];
        let okAll = true;
        let undo: ChatState["undo"] = null;
        for (const a of todo) {
          const r = await runAction(a, sheet);
          lines.push(r.message);
          if (!r.ok) {
            okAll = false;
            break;
          }
          if (r.undo) undo = r.undo;
        }
        push([say(lines.join(" "), { chips: okAll ? ["Cosa faccio oggi?", "Annulla", "Come va la settimana?"] : ["Riprova", "Cosa faccio oggi?"] })], { undo: okAll ? undo : null });
        setBusy(false);
        return;
      }
    }

    // The engine answers (free, offline). The written coach only when the athlete turned it on in Impostazioni, and never for
    // building and changing sessions: those are the engine's job, with rules and at no cost.
    const tryAi = coachAiOn() && !aiOff &&!state.pending && !(state.awaiting && !aiActions.length) && !NO.test(n) && !/^annulla/.test(n) && !rulesFirst(t, state, today);
    if (tryAi) {
      push([user]);
      setBusy(true);
    }
    const done = tryAi ? await askCoach(t, user) : null;
    if (tryAi) setBusy(false);
    if (done?.ok) return;
    if (done) setThread((cur) => ({ ...cur, messages: cur.messages.filter((m) => m.id !== user.id) }));
    const aiNote = done && !done.ok && done.why ? say(`Il coach scritto non ha risposto (${done.why}). Ti rispondo con le regole dell'app.`) : null;

    const r = chat(t, ctx, state);
    const coach: ChatMessage = { id: uid(), role: "coach", text: r.reply.text, lines: r.reply.lines, proposal: r.reply.proposal, workout: r.reply.workout, chips: r.reply.chips, choices: r.reply.choices, at: now };
    if (r.resetOverrides) saveOverrides({ date: today });
    else if (r.overrides) saveOverrides({ ...(overrides.date === today ? overrides : { date: today }), ...r.overrides, date: today });
    const shown = aiNote ? [user, aiNote, coach] : [user, coach];
    if (!r.run && !r.undo) return commit(shown, r.state);
    setBusyText("Scrivo su Intervals…");
    setBusy(true);
    commit(shown, r.state);
    const result = r.run ? await runAction(r.run, sheet) : await runUndo(r.undo!);
    const follow: ChatMessage = {
      id: uid(),
      role: "coach",
      text: result.message,
      chips: result.ok ? (r.run ? (r.run.type === "create_workout" || r.run.type === "update_workout" ? ["Salva in libreria", "Annulla", "Cosa faccio oggi?"] : ["Cosa faccio oggi?", "Annulla", "Come va la settimana?"]) : ["Cosa faccio oggi?"]) : ["Riprova", "Cosa faccio oggi?"],
      at: new Date().toISOString(),
    };
    setThread((cur) => ({ messages: [...cur.messages, follow], state: { ...cur.state, undo: r.run ? (result.ok ? (result.undo ?? null) : null) : null } }));
    setBusy(false);
  };

  const lastCoach = [...messages].reverse().find((m) => m.role === "coach");
  const waiting = state.pending !== null || aiActions.length > 0;
  // Phone («A · Sopra la casella», 26 November 2026): every quick reply of the last answer, in one row above the box; a
  // question of the chat («Quale seduta?», «A che giorno?») shows its choices; with a proposal open «Sì» and «No» come first.
  const yesNoFirst = (list: string[]) => [...list.filter((c) => c === "Sì" || c === "No"), ...list.filter((c) => c !== "Sì" && c !== "No")];
  const chips = compact ? (lastCoach?.choices?.length ? lastCoach.choices : yesNoFirst(lastCoach?.chips ?? [])) : (lastCoach?.chips ?? []);
  const begin = (text: string) => {
    setDraft(text);
    box.current?.focus();
  };
  // The questions of the day for the empty chat; the hour only picks the greeting.
  const page = useMemo(() => (ctx && compact ? startPage(ctx, new Date().getHours()) : null), [ctx, compact]);

  return (
    <section className={compact ? "flex h-full min-h-0 flex-col" : "card flex flex-col p-4"} aria-label="Chat con il coach">
      <div className={"flex gap-3 " + (compact ? "items-center justify-between" : "items-start justify-between")}>
        {compact ? (
          <PageTitle>Coach</PageTitle>
        ) : (
        <div>
          <h2 className="text-sm font-medium">Parla con il coach</h2>
          <p className="mt-0.5 text-xs text-muted">{aiOn && !aiOff ?"Scrivi come vuoi: il coach scritto (Claude Haiku, acceso in Impostazioni) legge i tuoi dati." : `Scrivi come vuoi: risponde il motore dell'app con i tuoi dati, gratis${isApp() ? " e anche senza rete" : ""}. Capisce i refusi, le domande di seguito e le nozioni da coach.`} Scrive su Intervals solo dopo il tuo «sì».</p>
        </div>
        )}
        {(!compact || messages.length > 0) && (
        <button
          type="button"
          onClick={() => {
            clearChat();
            started.current = false;
            setThread({ messages: [], state: emptyState() });
          }}
          className={compact ? "card inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium leading-none" : "shrink-0 rounded-full px-3 py-1 text-xs"}
          style={compact ? undefined : { border: "1px solid var(--border)" }}
        >
          {compact ? "Nuova" : "Nuova conversazione"}
        </button>
        )}
      </div>

      <div ref={scroller} className={compact ? "mt-3 min-h-0 flex-1 space-y-2.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "mt-3 max-h-[62vh] min-h-[220px] space-y-3 overflow-y-auto pr-1"} role="log" aria-live="polite">
        {!ctx && <p className="text-sm text-muted">Preparo i dati…</p>}
        {compact && page && messages.length === 0 && (
          <>
            <Bubble m={{ id: "hello", role: "coach", text: page.hello, at: "" }} compact />
            <h2 className="px-1 pt-1 text-xs font-semibold text-faint">Per te, adesso</h2>
            <ul className="card overflow-hidden p-0">
              {page.questions.map((q, i) => {
                const t = TONE[q.tone];
                return (
                  <li key={q.ask} style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
                    <button type="button" onClick={() => void send(q.ask)} className="flex min-h-14 w-full items-center gap-2.5 px-3 py-2 text-left text-sm">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full" style={{ background: t.bg, color: t.ink }} aria-hidden>
                        <t.Icon size={16} stroke={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium leading-snug">{q.ask}</span>
                        <span className="block text-xs leading-snug text-faint">{q.why}</span>
                      </span>
                      <IconChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
            <h2 className="px-1 pt-1 text-xs font-semibold text-faint">Cambia qualcosa</h2>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CHANGES.map((c) => (
                <button key={c.label} type="button" onClick={() => begin(c.begin)} className="card inline-flex h-11 shrink-0 items-center gap-1.5 !rounded-full px-4 text-sm font-medium leading-none">
                  <span className="size-1.5 rounded-full" style={{ background: "var(--accent-ink)" }} aria-hidden />
                  {c.label}
                </button>
              ))}
            </div>
            {page.more.length > 0 && (
              <>
                <h2 className="px-1 pt-1 text-xs font-semibold text-faint">Altre domande</h2>
                <div className="flex flex-wrap gap-1.5">
                  {page.more.map((m) => (
                    <button key={m} type="button" onClick={() => void send(m)} className="card inline-flex h-11 items-center !rounded-full px-4 text-sm font-medium leading-none">
                      {m}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} compact={compact} />
        ))}
        {busy && <p className="text-xs text-muted">{busyText}</p>}
      </div>

      {chips.length > 0 && !busy && (
        <div className={compact ? "-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "mt-3 flex flex-wrap gap-1.5"} role="group" aria-label="Risposte pronte">
          {chips.map((c) => {
            const yesNo = waiting && (c === "Sì" || c === "No");
            const change = compact && !yesNo && CHANGE_CHIP.test(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => void send(c)}
                className={"inline-flex items-center rounded-full leading-none " + (compact ? "h-11 shrink-0 gap-1.5 whitespace-nowrap px-4 text-sm font-medium" : "px-3 py-1 text-xs")}
                style={{
                  background: yesNo ? "var(--accent-bg)" : compact ? "var(--surface)" : "transparent",
                  color: yesNo ? "var(--accent-ink)" : "var(--foreground)",
                  fontWeight: yesNo && compact ? 600 : undefined,
                  border: compact ? "none" : "1px solid var(--border)",
                  boxShadow: compact && !yesNo ? "var(--card-shadow)" : undefined,
                }}
              >
                {change && <span className="size-1.5 rounded-full" style={{ background: "var(--accent-ink)" }} aria-hidden />}
                {c}
              </button>
            );
          })}
        </div>
      )}

      <form
        className={"flex gap-2 " + (compact ? "mt-3 pb-1" : "mt-3")}
        onSubmit={(e) => {
          e.preventDefault();
          // On the phone «Invia» never looks switched off: with nothing written it takes you to the box.
          if (!draft.trim()) return box.current?.focus();
          void send(draft);
        }}
      >
        <input
          ref={box}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={compact ? "Scrivimi…" : "Scrivimi: «ho male al ginocchio», «ferie dal 10 al 20 dicembre»…"}
          aria-label="Scrivi al coach"
          className={compact ? "card h-11 min-w-0 flex-1 rounded-full px-4 text-sm outline-none" : "min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none"}
          style={compact ? undefined : { background: "var(--background)", border: "1px solid var(--border)" }}
        />
        <button
          type="submit"
          disabled={!ctx || busy || (!compact && !draft.trim())}
          className={(compact ? "h-11 rounded-full px-5 leading-none " : "rounded-xl px-4 py-2 ") + "text-sm font-medium transition-opacity disabled:opacity-45"}
          style={compact ? { background: "var(--brand)", color: "var(--on-brand)" } : { background: "var(--accent-bg)", color: "var(--accent-ink)" }}
        >
          Invia
        </button>
      </form>
      {!compact && <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => void send(q)} disabled={!ctx || busy} className="rounded-full px-2.5 py-1 text-[11px] text-muted disabled:opacity-50" style={{ border: "1px solid var(--border)" }}>
            {q}
          </button>
        ))}
      </div>}
    </section>
  );
}

function Bubble({ m, compact = false }: { m: ChatMessage; compact?: boolean }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[18px] rounded-br-md px-3.5 py-2.5 text-sm leading-snug" style={compact ? { background: "var(--brand)", color: "var(--on-brand)" } : { background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
          {m.text}
        </div>
      </div>
    );
  }
  const p = m.proposal;
  return (
    <div className="flex justify-start">
      <div className={"max-w-[92%] rounded-[18px] rounded-bl-md px-3.5 py-2.5 text-sm leading-snug" + (compact ? " card !rounded-[18px] !rounded-bl-md" : "")} style={compact ? undefined : { background: "var(--background)" }}>
        <p className="whitespace-pre-line">{m.text}</p>
        {p && (
          <div className="mt-2 rounded-xl p-2.5" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2">
              <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
                {p.label}
              </span>
              <span className="text-[11px] text-faint">{p.indoor ? "rulli" : "fuori"}</span>
            </div>
            <div className="mt-1 font-medium">{p.workout.name}</div>
            <div className="num text-xs text-muted">
              {p.mins} min · TSS {p.tss} · carbo {p.carbs}
            </div>
            {p.workout.blocks.length > 0 && (
              <div className="mt-2">
                <WorkoutProfile blocks={p.workout.blocks} height={40} axis={false} />
              </div>
            )}
          </div>
        )}
        {m.workout && <BuiltCard w={m.workout} />}
        {m.lines && m.lines.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {m.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** A session built by the chat: name and day, minutes and load, drawing, steps in watts, what was assumed, the day's check. */
function BuiltCard({ w }: { w: WorkoutCard }) {
  return (
    <div className="mt-2 rounded-xl p-2.5" style={{ border: "1px solid var(--border)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{w.name}</span>
        <span className="shrink-0 text-[11px] text-faint">{w.when}</span>
      </div>
      <div className="num mt-0.5 text-xs text-muted">
        {w.meta}
        {w.tag && (
          <span className="ml-1.5 rounded-full px-2 py-0.5 text-[10.5px]" style={{ background: "var(--good-bg)", color: "var(--good-ink)" }}>
            {w.tag}
          </span>
        )}
      </div>
      {w.blocks.length > 0 && (
        <div className="mt-2">
          <WorkoutProfile blocks={w.blocks} height={44} axis={false} />
        </div>
      )}
      <ul className="num mt-2 space-y-0.5 text-xs text-muted">
        {w.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      {w.notes.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-faint">
          {w.notes.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
      {w.ok && <p className="mt-2 text-xs" style={{ color: "var(--good-ink)" }}>✓ {w.ok}</p>}
      {w.warning && (
        <p className="mt-2 rounded-lg px-2.5 py-1.5 text-xs" style={{ background: "var(--warning-bg)", color: "var(--warning-ink)" }}>
          {w.warning}
        </p>
      )}
    </div>
  );
}
