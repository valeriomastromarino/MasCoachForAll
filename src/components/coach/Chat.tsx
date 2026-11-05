"use client";

// The coach's chat: it talks only to the app's own engine (lib/coach/chat), reads the athlete's Italian with rules and answers
// from the data. What it writes to Intervals.icu, to the sheet or to the plan is shown first and done only after a "sì".
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type Action, chat, type ChatContext, type ChatState, emptyState } from "@/lib/coach/chat";
import { normalize } from "@/lib/coach/chat/text";
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
const YES = /^(si|sii|sisi|ok|okay|va bene|certo|confermo|conferma|fallo|procedi|esatto|d accordo|daccordo|perfetto|yes|dai|vai|fai pure|applica)\b/;
const NO = /^(no|nono|lascia stare|stop|niente|non farlo|ferma|aspetta|indietro|meglio di no|annulla)\b/;
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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

  const [thread, setThread] = useState(() => loadChat());
  const messages = thread.messages;
  const state = thread.state;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("Scrivo su Intervals…");
  /** Changes proposed by the written coach (Claude Sonnet), waiting for the "sì". Not kept: a new topic drops them. */
  const [aiActions, setAiActions] = useState<Action[]>([]);
  /** The written coach is not reachable here (single-file app, no key): the chat uses its rules. */
  const [aiOff, setAiOff] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const ctx: ChatContext | null = useMemo(() => {
    if (!library || planned === null) return null;
    return { today, data, library, planned, profile: stored?.profile ?? null, phenotype: stored?.phenotype ?? null, setup, plan, life, overrides, history };
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
    if (!ctx || started.current || messages.length > 0) return;
    started.current = true;
    const r = chat("fammi il punto", ctx, emptyState());
    commit([{ id: uid(), role: "coach", text: r.reply.text, lines: r.reply.lines, proposal: r.reply.proposal, chips: r.reply.chips, at: new Date().toISOString() }], r.state);
  }, [ctx, messages.length]);

  useEffect(() => {
    saveChat(messages, state);
  }, [messages, state]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  const say = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: uid(), role: "coach", text, at: new Date().toISOString(), ...extra });
  const push = (add: ChatMessage[], patch?: Partial<ChatState>) => setThread((cur) => ({ messages: [...cur.messages, ...add], state: patch ? { ...cur.state, ...patch } : cur.state }));

  /** The written coach: Claude Sonnet reads the thread and the data, answers, and proposes changes that wait for the "sì". */
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

    // The written coach answers everything it can; if it isn't there (single-file app, no key, no network), the rules do.
    const tryAi = !aiOff && !state.pending && !(state.awaiting && !aiActions.length) && !NO.test(n) && !/^annulla/.test(n);
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
    const coach: ChatMessage = { id: uid(), role: "coach", text: r.reply.text, lines: r.reply.lines, proposal: r.reply.proposal, chips: r.reply.chips, at: now };
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
      chips: result.ok ? (r.run ? ["Cosa faccio oggi?", "Annulla", "Come va la settimana?"] : ["Cosa faccio oggi?"]) : ["Riprova", "Cosa faccio oggi?"],
      at: new Date().toISOString(),
    };
    setThread((cur) => ({ messages: [...cur.messages, follow], state: { ...cur.state, undo: r.run ? (result.ok ? (result.undo ?? null) : null) : null } }));
    setBusy(false);
  };

  const lastCoach = [...messages].reverse().find((m) => m.role === "coach");
  const waiting = state.pending !== null || aiActions.length > 0;

  return (
    <section className="card flex flex-col p-4" aria-label="Chat con il coach">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Parla con il coach</h2>
          <p className="mt-0.5 text-xs text-muted">{aiOff ? "Risponde con i tuoi dati e le regole dell&apos;app." : "Scrivi come vuoi: il coach (Claude Sonnet) legge i tuoi dati."} Scrive su Intervals solo dopo il tuo «sì».</p>
        </div>
        <button
          type="button"
          onClick={() => {
            clearChat();
            started.current = false;
            setThread({ messages: [], state: emptyState() });
          }}
          className="shrink-0 rounded-full px-3 py-1 text-xs"
          style={{ border: "1px solid var(--border)" }}
        >
          Nuova conversazione
        </button>
      </div>

      <div ref={scroller} className="mt-3 max-h-[62vh] min-h-[220px] space-y-3 overflow-y-auto pr-1" role="log" aria-live="polite">
        {!ctx && <p className="text-sm text-muted">Preparo i dati…</p>}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {busy && <p className="text-xs text-muted">{busyText}</p>}
      </div>

      {lastCoach?.chips && lastCoach.chips.length > 0 && !busy && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {lastCoach.chips.map((c) => (
            <button key={c} type="button" onClick={() => void send(c)} className="rounded-full px-3 py-1 text-xs" style={{ background: waiting && (c === "Sì" || c === "No") ? "var(--accent-bg)" : "transparent", color: waiting && (c === "Sì" || c === "No") ? "var(--accent-ink)" : "var(--foreground)", border: "1px solid var(--border)" }}>
              {c}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Scrivimi: «ho male al ginocchio», «ferie dal 10 al 20 dicembre»…"
          aria-label="Scrivi al coach"
          className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: "var(--background)", border: "1px solid var(--border)" }}
        />
        <button type="submit" disabled={!ctx || busy || !draft.trim()} className="rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
          Invia
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => void send(q)} disabled={!ctx || busy} className="rounded-full px-2.5 py-1 text-[11px] text-muted disabled:opacity-50" style={{ border: "1px solid var(--border)" }}>
            {q}
          </button>
        ))}
      </div>
    </section>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-sm" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
          {m.text}
        </div>
      </div>
    );
  }
  const p = m.proposal;
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md px-3 py-2 text-sm" style={{ background: "var(--background)" }}>
        <p>{m.text}</p>
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
