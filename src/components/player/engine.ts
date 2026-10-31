// Everything that runs during a trainer session: sensors, the session clock, recording, DFA α1,
// the trainer target (with power match when pedals are connected), sounds and the screen wake lock.
// A plain class (browser only) that the player screen subscribes to; see usePlayer.ts.
import { type DeviceKind, type DeviceStatus, HeartRateStrap, PowerMeter, rememberedDevice, Trainer } from "@/lib/ble/devices";
import type { IndoorBikeData } from "@/lib/ble/protocol";
import { type DfaLive, dfaLive } from "@/lib/physio/dfa";
import { newRecording, type Recording } from "@/lib/player/recording";
import {
  adjust as adjustSession,
  ergTarget,
  initialSession,
  type Mode,
  pause as pauseSession,
  type SessionState,
  setMode as setSessionMode,
  skip as skipSession,
  start as startSession,
  stepRemaining,
  tick,
} from "@/lib/player/session";
import { deleteRecording, saveRecording } from "@/lib/player/store";
import type { PlayerWorkout } from "@/lib/player/timeline";
import { uploadRecording } from "./upload";

export type DeviceView = { status: DeviceStatus; name: string | null; error: string | null; detail: string | null; remembered: string | null };

export type PlayerView = {
  session: SessionState;
  power: number | null;
  hr: number | null;
  cadence: number | null;
  /** ERG target of this second (with the − / + adjustment). */
  target: number;
  levels: number[];
  dfa: DfaLive | null;
  /** α1 every 5 s over the last 10 minutes: seconds ridden, value. */
  dfaHistory: { t: number; a: number }[];
  /** Power actually ridden along the workout (position, watts). */
  trace: { pos: number; w: number }[];
  devices: Record<DeviceKind, DeviceView>;
  /** Trainer/pedal ratio applied to ERG when pedals are connected. */
  match: number | null;
  recording: boolean;
  finished: Recording | null;
  uploading: boolean;
  sound: boolean;
};

const FRESH_MS = 3000;
const MATCH_WINDOW = 30;
const SOUND_KEY = "mascoach-rulli-suoni";
const KINDS: DeviceKind[] = ["trainer", "hr", "power"];

export class PlayerEngine {
  readonly trainer: Trainer;
  readonly hrStrap: HeartRateStrap;
  readonly pedals: PowerMeter;

  private session: SessionState = initialSession(3);
  private trainerData: IndoorBikeData | null = null;
  private trainerAt = 0;
  private pmPower: number | null = null;
  private pmCadence: number | null = null;
  private pmAt = 0;
  private pmCadenceAt = 0;
  private hr: number | null = null;
  private hrAt = 0;
  private rr: number[] = [];
  private rec: Recording | null = null;
  private moving = false;
  private lastStep = 0;
  private distance = 0;
  private trace: { pos: number; w: number }[] = [];
  private dfa: DfaLive | null = null;
  private dfaHistory: { t: number; a: number }[] = [];
  private match = { t: [] as number[], p: [] as number[] };
  private ticks = 0;
  private sound = true;
  private finished: Recording | null = null;
  private uploading = false;
  private remembered: Record<DeviceKind, BluetoothDevice | null> = { trainer: null, hr: null, power: null };

  private timer: ReturnType<typeof setInterval> | null = null;
  private audio: AudioContext | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private listeners = new Set<() => void>();
  private view: PlayerView;

  constructor(private readonly workout: PlayerWorkout) {
    const changed = () => this.emit();
    this.trainer = new Trainer(changed, (d) => {
      this.trainerData = d;
      this.trainerAt = Date.now();
    });
    this.hrStrap = new HeartRateStrap(changed, (hr, rr) => {
      this.hr = hr;
      this.hrAt = Date.now();
      for (const ms of rr) {
        this.rr.push(ms);
        if (this.rec?.status === "recording") this.rec.rr.push({ t: Date.now(), ms });
      }
      if (this.rr.length > 1200) this.rr.splice(0, this.rr.length - 1200);
    });
    this.pedals = new PowerMeter(changed, (power, cadence) => {
      this.pmPower = power;
      this.pmAt = Date.now();
      if (cadence !== null) {
        this.pmCadence = cadence;
        this.pmCadenceAt = Date.now();
      }
    });
    try {
      this.sound = localStorage.getItem(SOUND_KEY) !== "0";
    } catch {
      this.sound = true;
    }
    this.view = this.compute();
  }

  private link(kind: DeviceKind) {
    return kind === "trainer" ? this.trainer : kind === "hr" ? this.hrStrap : this.pedals;
  }

  // ── Store interface (useSyncExternalStore) ──

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getView = () => this.view;

  private emit() {
    this.view = this.compute();
    for (const fn of this.listeners) fn();
  }

  // ── Readings ──

  private readings(now = Date.now()) {
    const trainerFresh = now - this.trainerAt < FRESH_MS;
    const pmFresh = this.pedals.status === "connected" && now - this.pmAt < FRESH_MS;
    const cadence =
      this.pedals.status === "connected" && now - this.pmCadenceAt < FRESH_MS
        ? this.pmCadence
        : trainerFresh
          ? (this.trainerData?.cadence ?? null)
          : null;
    return {
      power: pmFresh ? this.pmPower : trainerFresh ? (this.trainerData?.power ?? null) : null,
      trainerPower: trainerFresh ? (this.trainerData?.power ?? null) : null,
      speed: trainerFresh ? (this.trainerData?.speedKmh ?? null) : null,
      hr: now - this.hrAt < FRESH_MS ? this.hr : null,
      cadence: cadence === null ? null : Math.round(cadence),
    };
  }

  private matchFactor(): number | null {
    const sumT = this.match.t.reduce((s, v) => s + v, 0);
    const sumP = this.match.p.reduce((s, v) => s + v, 0);
    return this.match.p.length >= 10 && sumP > 0 ? Math.min(1.15, Math.max(0.85, sumT / sumP)) : null;
  }

  private deviceView(kind: DeviceKind): DeviceView {
    const l = this.link(kind);
    let detail: string | null = null;
    if (kind === "trainer" && l.status === "connected") detail = this.trainer.features?.power === false ? "senza ERG" : "ERG";
    if (kind === "hr" && l.status === "connected") detail = this.hrStrap.sendsRr ? "RR" : "solo FC";
    return { status: l.status, name: l.name, error: l.error, detail, remembered: this.remembered[kind]?.name ?? null };
  }

  private compute(): PlayerView {
    const r = this.readings();
    return {
      session: this.session,
      power: r.power,
      hr: r.hr,
      cadence: r.cadence,
      target: ergTarget(this.session, this.workout.steps),
      levels: this.trainer.levels,
      dfa: this.dfa,
      dfaHistory: this.dfaHistory,
      trace: this.trace,
      devices: { trainer: this.deviceView("trainer"), hr: this.deviceView("hr"), power: this.deviceView("power") },
      match: this.matchFactor(),
      recording: this.rec?.status === "recording",
      finished: this.finished,
      uploading: this.uploading,
      sound: this.sound,
    };
  }

  // ── Lifecycle ──

  open() {
    this.timer = setInterval(() => this.step(), 1000);
    document.addEventListener("visibilitychange", this.keepAwake);
    window.addEventListener("beforeunload", this.warnUnload);
    void this.keepAwake();
    void this.reuseRemembered();
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    document.removeEventListener("visibilitychange", this.keepAwake);
    window.removeEventListener("beforeunload", this.warnUnload);
    void this.wakeLock?.release().catch(() => {});
    for (const k of KINDS) this.link(k).disconnect();
    if (this.rec?.status === "recording") void saveRecording(this.rec);
  }

  /** Devices chosen last time: try them straight away (works when the browser kept the permission). */
  private async reuseRemembered() {
    for (const kind of KINDS) this.remembered[kind] = await rememberedDevice(kind);
    this.emit();
    for (const kind of ["trainer", "hr"] as DeviceKind[]) {
      const d = this.remembered[kind];
      if (d && this.link(kind).status === "off") void this.link(kind).use(d);
    }
  }

  private keepAwake = async () => {
    try {
      if (document.visibilityState === "visible") this.wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      // Not allowed (battery saver…): nothing to do.
    }
  };

  private warnUnload = (e: BeforeUnloadEvent) => {
    if (this.rec?.status === "recording") e.preventDefault();
  };

  // ── The session clock (once a second) ──

  private step() {
    const now = Date.now();
    const steps = this.workout.steps;
    const r = this.readings(now);
    const pedalling = r.cadence !== null ? r.cadence > 0 : (r.power ?? 0) > 15;
    const prev = this.session;
    const next = tick(prev, 1, pedalling, steps);

    const moving = next.status === "running" && !next.autoPaused;
    // Recording starts with the first second actually ridden (pressing play alone does not start it).
    if (moving && !this.rec) this.rec = newRecording(this.workout.id, this.workout.name, now);
    const rec = this.rec;
    if (rec?.status === "recording") {
      const last = rec.pauses[rec.pauses.length - 1];
      if (this.moving && !moving && next.status !== "done") rec.pauses.push({ from: now, to: null });
      if (!this.moving && moving && last && last.to === null) last.to = now;
      if (moving || (this.moving && next.status === "done")) {
        if (next.stepIndex !== this.lastStep && rec.samples.length) rec.laps.push(rec.samples.length);
        this.lastStep = next.stepIndex;
        this.distance += (r.speed ?? 0) / 3.6;
        rec.samples.push({ t: now, power: r.power, hr: r.hr, cadence: r.cadence, speed: r.speed, distance: this.distance, target: next.mode === "erg" ? ergTarget(next, steps) : null });
        this.trace = [...this.trace, { pos: next.pos, w: r.power ?? 0 }];
      }
    }
    this.moving = moving;

    // Countdown to the next step.
    if (moving) {
      const left = Math.round(stepRemaining(next, steps));
      if (next.stepIndex < steps.length - 1 && left >= 1 && left <= 3) this.beep(660, 90);
      if (next.stepIndex !== prev.stepIndex) this.beep(990, 250);
    }

    // Power match: trainer power / pedal power over the last 30 s of riding.
    if (this.pedals.status === "connected" && r.trainerPower && this.pmPower && r.trainerPower > 50 && this.pmPower > 50 && now - this.pmAt < FRESH_MS) {
      this.match.t.push(r.trainerPower);
      this.match.p.push(this.pmPower);
      if (this.match.t.length > MATCH_WINDOW) {
        this.match.t.shift();
        this.match.p.shift();
      }
    }

    this.session = next;
    this.ticks++;
    if (this.ticks % 5 === 0) {
      this.dfa = this.rr.length ? dfaLive(this.rr) : null;
      if (this.dfa?.alpha1 != null && moving) this.dfaHistory = [...this.dfaHistory, { t: next.elapsed, a: this.dfa.alpha1 }].slice(-120);
    }
    if (rec?.status === "recording" && this.ticks % 10 === 0) void saveRecording(rec);
    this.drive();
    this.emit();
    if (next.status === "done" && prev.status !== "done" && rec?.status === "recording") void this.finish();
  }

  /** Sends the right target to the trainer for the current mode. */
  private drive() {
    if (this.trainer.status !== "connected") return;
    const s = this.session;
    if (s.mode === "erg") this.trainer.setTarget({ mode: "erg", watts: Math.round(ergTarget(s, this.workout.steps) * (this.matchFactor() ?? 1)) });
    else {
      const lv = this.trainer.levels;
      this.trainer.setTarget({ mode: "resistance", level: lv[Math.min(lv.length - 1, s.level)] ?? 0 });
    }
  }

  private beep(freq: number, ms: number) {
    if (!this.sound) return;
    try {
      const ctx = this.audio ?? (this.audio = new AudioContext());
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + ms / 1000);
      navigator.vibrate?.(ms);
    } catch {
      // No audio: the countdown is still on screen.
    }
  }

  /** Audio can only start from a tap: prepare it on the first button pressed. */
  private unlockAudio() {
    try {
      this.audio ??= new AudioContext();
      void this.audio.resume();
    } catch {
      this.audio = null;
    }
  }

  private act(fn: (s: SessionState) => SessionState) {
    this.session = fn(this.session);
    this.drive();
    this.emit();
  }

  // ── Actions from the screen ──

  connect(kind: DeviceKind) {
    this.unlockAudio();
    const known = this.remembered[kind];
    const l = this.link(kind);
    if (known && l.device === null) void l.use(known);
    else void l.choose();
  }

  choose(kind: DeviceKind) {
    void this.link(kind).choose();
  }

  disconnect(kind: DeviceKind) {
    this.link(kind).disconnect();
  }

  play() {
    this.unlockAudio();
    this.act((s) => (s.status === "running" ? pauseSession(s) : startSession(s)));
  }

  skip(dir: 1 | -1) {
    this.act((s) => skipSession(s, dir, this.workout.steps));
  }

  adjust(dir: 1 | -1) {
    this.act((s) => adjustSession(s, dir, this.trainer.levels.length, this.workout.steps));
  }

  setMode(mode: Mode) {
    this.act((s) => setSessionMode(s, mode));
  }

  toggleSound() {
    this.sound = !this.sound;
    try {
      localStorage.setItem(SOUND_KEY, this.sound ? "1" : "0");
    } catch {
      // Not remembered.
    }
    this.emit();
  }

  /** Ends the session: saved on the device, then uploaded to Intervals.icu. Too short sessions are dropped. */
  async finish(): Promise<void> {
    const rec = this.rec;
    this.session = { ...this.session, status: "done" };
    if (!rec || rec.status !== "recording" || rec.samples.length < 5) {
      if (rec && rec.status === "recording") await deleteRecording(rec.id);
      if (rec?.status === "recording") this.rec = null;
      this.emit();
      return;
    }
    const last = rec.pauses[rec.pauses.length - 1];
    if (last && last.to === null) last.to = Date.now();
    rec.status = "finished";
    await saveRecording(rec);
    this.finished = { ...rec };
    this.uploading = true;
    this.emit();
    await this.upload(rec);
  }

  private async upload(rec: Recording) {
    this.uploading = true;
    this.emit();
    const done = await uploadRecording(rec);
    this.rec = done;
    this.finished = done;
    this.uploading = false;
    this.emit();
  }

  retryUpload() {
    if (this.rec && this.rec.status === "finished") void this.upload(this.rec);
  }

  /** The finished (or current) session, for the FIT download. */
  recording(): Recording | null {
    return this.rec;
  }

  async discard() {
    if (this.rec) await deleteRecording(this.rec.id);
    this.rec = null;
    this.finished = null;
    this.emit();
  }
}
