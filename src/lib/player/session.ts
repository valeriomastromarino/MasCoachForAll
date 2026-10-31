// The running session as a pure state machine, advanced once a second by the player.
// ERG: − / + move the target of the current step by 5 W (reset at the next step).
// Resistance: − / + move one "gradino". Riding starts and pauses by itself when you start or stop pedalling.
import { type PlayerStep, stepIndexAt, targetAt, totalSecs } from "./timeline";

export const ERG_STEP_W = 5;
/** Seconds without pedalling before the session pauses by itself. */
export const AUTO_PAUSE_SECS = 3;

export type Mode = "erg" | "resistance";

export type SessionState = {
  status: "ready" | "running" | "paused" | "done";
  /** Paused because you stopped pedalling (resumes by itself). */
  autoPaused: boolean;
  /** Position in the workout, seconds. */
  pos: number;
  /** Time actually ridden, seconds. */
  elapsed: number;
  stepIndex: number;
  /** ERG adjustment of the current step, watts. */
  offset: number;
  mode: Mode;
  /** Index into the trainer's resistance steps. */
  level: number;
  stillSecs: number;
};

export function initialSession(level = 3): SessionState {
  return { status: "ready", autoPaused: false, pos: 0, elapsed: 0, stepIndex: 0, offset: 0, mode: "erg", level, stillSecs: 0 };
}

export function ergTarget(s: SessionState, steps: PlayerStep[]): number {
  return Math.max(0, targetAt(steps, s.pos) + s.offset);
}

/** Advances the session by `dt` seconds. `pedalling` comes from cadence (or power when there is no cadence). */
export function tick(s: SessionState, dt: number, pedalling: boolean, steps: PlayerStep[]): SessionState {
  if (s.status === "done" || s.status === "paused") return s;
  if (s.status === "ready") return pedalling ? { ...s, status: "running", stillSecs: 0 } : s;
  const stillSecs = pedalling ? 0 : s.stillSecs + dt;
  const autoPaused = stillSecs >= AUTO_PAUSE_SECS;
  if (autoPaused) return { ...s, autoPaused, stillSecs };
  const pos = s.pos + dt;
  const end = totalSecs(steps);
  if (pos >= end) return { ...s, status: "done", autoPaused: false, stillSecs, pos: end, elapsed: s.elapsed + dt, stepIndex: steps.length - 1 };
  const stepIndex = stepIndexAt(steps, pos);
  return { ...s, autoPaused: false, stillSecs, pos, elapsed: s.elapsed + dt, stepIndex, offset: stepIndex === s.stepIndex ? s.offset : 0 };
}

export function start(s: SessionState): SessionState {
  return s.status === "ready" || s.status === "paused" ? { ...s, status: "running", autoPaused: false, stillSecs: 0 } : s;
}

export function pause(s: SessionState): SessionState {
  return s.status === "running" ? { ...s, status: "paused", autoPaused: false } : s;
}

/** Next step (+1), or back (-1): to the start of this step, or of the previous one within its first 5 s. */
export function skip(s: SessionState, dir: 1 | -1, steps: PlayerStep[]): SessionState {
  if (!steps.length || s.status === "done") return s;
  const cur = steps[s.stepIndex];
  let index: number;
  if (dir === 1) index = s.stepIndex + 1;
  else index = s.pos - cur.start > 5 ? s.stepIndex : Math.max(0, s.stepIndex - 1);
  if (index >= steps.length) return { ...s, status: "done", pos: totalSecs(steps), stepIndex: steps.length - 1, offset: 0 };
  return { ...s, pos: steps[index].start, stepIndex: index, offset: 0 };
}

/** − / + : 5 W in ERG, one step of resistance otherwise. */
export function adjust(s: SessionState, dir: 1 | -1, levels: number, steps: PlayerStep[]): SessionState {
  if (s.mode === "resistance") return { ...s, level: Math.min(levels - 1, Math.max(0, s.level + dir)) };
  const base = targetAt(steps, s.pos);
  return { ...s, offset: Math.max(-base, s.offset + dir * ERG_STEP_W) };
}

export function setMode(s: SessionState, mode: Mode): SessionState {
  return { ...s, mode };
}

/** Seconds left in the current step. */
export function stepRemaining(s: SessionState, steps: PlayerStep[]): number {
  const cur = steps[s.stepIndex];
  return cur ? Math.max(0, cur.start + cur.secs - s.pos) : 0;
}
