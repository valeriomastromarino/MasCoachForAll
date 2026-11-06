// Automatic sprints: a step planned at a very high power (more than ERG can follow) is ridden in resistance mode.
// A few seconds before it starts the trainer switches to resistance and the screen warns; when the step ends ERG comes back.
// Off by default; the settings are kept on the device.
import { type SessionState, stepRemaining } from "./session";
import type { PlayerStep } from "./timeline";

export type SprintConfig = {
  on: boolean;
  /** Planned watts from which a step counts as a sprint. */
  watts: number;
  /** Seconds of warning before the step. */
  leadSecs: number;
  /** Longest step that counts (seconds); 0 = any length. */
  maxStepSecs: number;
  /** Resistance level (index into the trainer's levels), the one used last. */
  level: number;
};

export const DEFAULT_SPRINT: SprintConfig = { on: false, watts: 450, leadSecs: 3, maxStepSecs: 30, level: 7 };
export const SPRINT_WATTS = [400, 450, 500, 600] as const;
export const SPRINT_LEADS = [2, 3, 5] as const;
export const SPRINT_MAX_STEPS = [30, 60, 0] as const;

/** Parses what was saved, falling back to the defaults for anything out of range. */
export function readSprintConfig(raw: string | null): SprintConfig {
  try {
    const j = raw ? (JSON.parse(raw) as Partial<SprintConfig>) : {};
    const pick = <T extends number>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
    return {
      on: j.on === true,
      watts: pick(j.watts, SPRINT_WATTS, DEFAULT_SPRINT.watts),
      leadSecs: pick(j.leadSecs, SPRINT_LEADS, DEFAULT_SPRINT.leadSecs),
      maxStepSecs: pick(j.maxStepSecs, SPRINT_MAX_STEPS, DEFAULT_SPRINT.maxStepSecs),
      level: typeof j.level === "number" && Number.isFinite(j.level) ? Math.min(20, Math.max(0, Math.round(j.level))) : DEFAULT_SPRINT.level,
    };
  } catch {
    return DEFAULT_SPRINT;
  }
}

/** The planned power of a step (not the recalibrated one) decides if it is a sprint. */
export function isSprintStep(step: PlayerStep | undefined, cfg: SprintConfig): boolean {
  if (!step || !cfg.on) return false;
  return Math.max(step.from, step.to) >= cfg.watts && (cfg.maxStepSecs === 0 || step.secs <= cfg.maxStepSecs);
}

export type SprintPhase = {
  phase: "off" | "warn" | "go";
  /** Seconds to the start (warn) or to the end (go) of the sprint. */
  secs: number;
  /** Which sprint of the workout this is, and how many there are (0 when none). */
  n: number;
  total: number;
};

const OFF: SprintPhase = { phase: "off", secs: 0, n: 0, total: 0 };

export function sprintPhase(s: SessionState, steps: PlayerStep[], cfg: SprintConfig): SprintPhase {
  if (!cfg.on || s.status !== "running" || s.autoPaused) return OFF;
  const sprints = steps.filter((x) => isSprintStep(x, cfg));
  if (!sprints.length) return OFF;
  const left = stepRemaining(s, steps);
  const cur = steps[s.stepIndex];
  if (isSprintStep(cur, cfg)) return { phase: "go", secs: Math.ceil(left), n: sprints.indexOf(cur) + 1, total: sprints.length };
  const next = steps[s.stepIndex + 1];
  if (isSprintStep(next, cfg) && left <= cfg.leadSecs) return { phase: "warn", secs: Math.ceil(left), n: sprints.indexOf(next) + 1, total: sprints.length };
  return OFF;
}
