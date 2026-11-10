// Bluetooth links to the trainer (FTMS), the heart-rate strap and a power meter (e.g. pedals).
// The radio itself is in radio.ts: Web Bluetooth in Chrome / Edge, Android's own Bluetooth in the app.
// Manual management, chosen by the athlete on 10 November 2026 (reconnecting by itself caused trouble): no device is
// remembered between sessions, each one is chosen with a tap, and a link that drops stays down until «Ricollega».
import {
  type ControlResponse,
  type CyclingPowerMeasurement,
  crankCadence,
  type FtmsFeatures,
  ftmsCommand,
  type IndoorBikeData,
  parseControlResponse,
  parseCyclingPower,
  parseFtmsFeatures,
  parseHeartRate,
  parseIndoorBikeData,
  parseResistanceRange,
  type Range,
  resistanceSteps,
  UUID,
} from "./protocol";
import { ChooserCancelled, type Gatt, type GattDevice, ServiceMissing, transport } from "./radio";

export type { GattDevice } from "./radio";

export type DeviceKind = "trainer" | "hr" | "power";
/** `lost`: it was connected and dropped (nothing reconnects by itself). */
export type DeviceStatus = "off" | "connecting" | "connected" | "lost";

/** Why Bluetooth cannot work here, or null when it can. */
export function bluetoothProblem(): string | null {
  return transport().problem();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STEP_MS = 15000;
const CONNECT_TRIES = 3;

/** Rejects when a Bluetooth step never answers: some devices (Garmin watches on Android) accept the link and then go quiet. */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** The device answers but lacks the service: trying it again would not help. */
class NoService extends Error {}

/** A missing service gets a clear message; time-outs and other errors pass through. */
function missing(message: string) {
  return (e: unknown): never => {
    throw e instanceof ServiceMissing ? new NoService(message) : e;
  };
}

/** Devices are not remembered any more: clears what the versions before 10 November 2026 saved. */
export function forgetSavedDevices() {
  try {
    for (const kind of ["trainer", "hr", "power"] as DeviceKind[]) {
      localStorage.removeItem(`mascoach-ble-${kind}`);
      localStorage.removeItem(`mascoach-ble-${kind}-last`);
    }
  } catch {
    // Storage blocked: nothing was saved either.
  }
}

function chooserError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/adapter|bluetooth.*(off|not available|unavailable|not enabled|disabled)/i.test(msg)) return "Il Bluetooth è spento o non disponibile: accendilo e riprova.";
  if (/location/i.test(msg)) return "Android 11 e precedenti cercano i dispositivi Bluetooth solo con la posizione accesa: attivala (e concedi il permesso) e riprova.";
  if (/permission/i.test(msg)) return "Serve il permesso «Dispositivi nelle vicinanze»: concedilo nelle impostazioni dell'app.";
  return msg;
}

abstract class Link {
  /** The device chosen in this session (kept after a drop or a failed attempt for «Ricollega»; never saved). */
  device: GattDevice | null = null;
  /** The open link, while connected. */
  protected gatt: Gatt | null = null;
  status: DeviceStatus = "off";
  error: string | null = null;
  /** The connection step in progress, shown while connecting: tells where a device gets stuck. */
  step: string | null = null;
  /** It was connected at least once since it was chosen: a later drop or failed «Ricollega» is shown in big. */
  wasConnected = false;
  /** Grows at every connection and disconnection: an attempt or a drop that belongs to an older link is ignored. */
  private epoch = 0;

  constructor(
    readonly kind: DeviceKind,
    private readonly changed: () => void,
  ) {}

  get name(): string | null {
    return this.device?.name ?? null;
  }

  /** The service the device is found by, and others it should be allowed to use. */
  protected abstract services(): { main: number; extra: number[] };
  /** Subscribes to the characteristics after (re)connection. */
  protected abstract setup(g: Gatt): Promise<void>;

  protected set(status: DeviceStatus, error: string | null = this.error) {
    this.status = status;
    this.error = error;
    this.changed();
  }

  /**
   * Opens the chooser (must run inside a tap) and connects to the chosen device.
   * `any` lists every nearby device: Android only matches what a device advertises, and some (Garmin watches
   * broadcasting heart rate) offer the service without advertising it, so they never show in the filtered list.
   */
  async choose(any = false): Promise<void> {
    let device: GattDevice;
    try {
      const { main, extra } = this.services();
      device = await transport().choose(main, extra, any);
    } catch (e) {
      if (e instanceof ChooserCancelled) return;
      this.set(this.status, chooserError(e));
      return;
    }
    if (this.device && this.device !== device) this.disconnect();
    this.wasConnected = false;
    await this.use(device);
  }

  /** «Ricollega» / «Riprova»: the device of this session again, without the chooser. Only on a tap. */
  async retry(): Promise<void> {
    if (this.device && this.status !== "connected" && this.status !== "connecting") await this.use(this.device);
  }

  private async use(device: GattDevice): Promise<void> {
    const epoch = ++this.epoch;
    this.device = device;
    this.set("connecting", null);
    let error: unknown = null;
    // Android often fails the first attempts (Garmin watches especially): a few tries within this one tap, on a clean
    // link, giving Android a few seconds to release the previous one. A device without the service is not retried.
    for (let attempt = 0; attempt < CONNECT_TRIES; attempt++) {
      if (attempt) await sleep(2000 * attempt);
      if (epoch !== this.epoch) return;
      try {
        await this.connect(device, epoch);
        return;
      } catch (e) {
        // «Annulla» or «Scollega» meanwhile: that one already closed the link and set the status.
        if (epoch !== this.epoch) return;
        error = e;
        this.dropLink();
        if (e instanceof NoService) break;
      }
    }
    this.set("off", error instanceof Error ? error.message : String(error));
  }

  private async connect(device: GattDevice, epoch: number) {
    // An attempt left behind by «Annulla» must not leave the device connected (the trainer takes one controller only).
    const stale = () => {
      if (epoch === this.epoch) return false;
      if (this.device !== device) transport().disconnect(device);
      return true;
    };
    try {
      const g = await this.stage("mi collego", transport().connect(device, () => this.lost(epoch)), 25000);
      if (stale()) throw new Error("annullato");
      this.gatt = g;
      await this.setup(g);
      if (stale()) throw new Error("annullato");
    } finally {
      this.step = null;
    }
    this.wasConnected = true;
    this.set("connected", null);
  }

  /** Runs one connection step with a label and a time limit. */
  protected stage<T>(label: string, p: Promise<T>, ms = STEP_MS): Promise<T> {
    this.step = label;
    this.changed();
    return withTimeout(p, ms, `Fermo su «${label}»: nessuna risposta in ${Math.round(ms / 1000)} s.`);
  }

  /** Closes a half-open link, which would block the next attempt. */
  private dropLink() {
    this.gatt = null;
    if (this.device) transport().disconnect(this.device);
  }

  /** The device went away. Nothing reconnects by itself: the player shows it and offers «Ricollega». */
  private lost(epoch: number) {
    // Drops while connecting are handled by the attempt in progress; an older link's drop is ignored.
    if (epoch !== this.epoch || this.status !== "connected") return;
    this.dropLink();
    this.set("lost", null);
  }

  /** «Scollega», or «Annulla» while connecting: closes the link and forgets the device. */
  disconnect() {
    this.epoch++;
    this.dropLink();
    this.device = null;
    this.wasConnected = false;
    this.step = null;
    this.set("off", null);
  }
}

// ── Trainer ─────────────────────────────────────────────────────────────────────────────────────────

export type TrainerTarget = { mode: "erg"; watts: number } | { mode: "resistance"; level: number };

export class Trainer extends Link {
  features: FtmsFeatures | null = null;
  range: Range | null = null;
  /** Resistance levels the − / + buttons step through. */
  levels: number[] = resistanceSteps(null);
  /** Resistance is set as a fixed grade when the trainer does not take a resistance level. */
  resistanceAsGrade = false;
  private waiting: { op: number; resolve: (r: ControlResponse | null) => void } | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private desired: TrainerTarget | null = null;
  private applied: TrainerTarget | null = null;
  private flushing = false;

  constructor(
    changed: () => void,
    private readonly onData: (d: IndoorBikeData) => void,
  ) {
    super("trainer", changed);
  }

  protected services() {
    return { main: UUID.ftms, extra: [UUID.deviceInfo, UUID.cyclingPower] };
  }

  protected async setup(g: Gatt) {
    await this.stage("cerco il servizio FTMS", g.need(UUID.ftms)).catch(
      missing("Il rullo non espone FTMS: aggiorna il firmware con l'app del produttore."),
    );
    try {
      this.features = parseFtmsFeatures(await g.read(UUID.ftms, UUID.ftmsFeature));
    } catch {
      this.features = null;
    }
    try {
      this.range = parseResistanceRange(await g.read(UUID.ftms, UUID.resistanceRange));
    } catch {
      this.range = null;
    }
    this.levels = resistanceSteps(this.range);

    await this.stage(
      "attivo i dati del rullo",
      g.notify(UUID.ftms, UUID.indoorBikeData, (v) => this.onData(parseIndoorBikeData(v))),
    );

    await this.stage(
      "prendo il comando del rullo",
      g.notify(UUID.ftms, UUID.controlPoint, (v) => {
        const r = parseControlResponse(v);
        if (r && this.waiting && r.op === this.waiting.op) {
          this.waiting.resolve(r);
          this.waiting = null;
        }
      }),
    );
    await this.command(ftmsCommand.requestControl());
    await this.command(ftmsCommand.start());
    // After a reconnection, put the last target back.
    this.applied = null;
    if (this.desired) void this.flush();
  }

  /** Sends one control point command and waits for its answer (null on timeout). Commands run one at a time. */
  private command(bytes: Uint8Array): Promise<ControlResponse | null> {
    const run = async () => {
      const g = this.gatt;
      if (!g) return null;
      const answer = new Promise<ControlResponse | null>((resolve) => {
        this.waiting = { op: bytes[0], resolve };
        setTimeout(() => {
          if (this.waiting?.resolve === resolve) {
            this.waiting = null;
            resolve(null);
          }
        }, 3000);
      });
      try {
        await g.write(UUID.ftms, UUID.controlPoint, bytes);
      } catch {
        this.waiting = null;
        return null;
      }
      return answer;
    };
    const next = this.chain.then(run, run);
    this.chain = next;
    return next;
  }

  /** Sets ERG power or resistance; only the latest request is sent when several come in quick succession. */
  setTarget(t: TrainerTarget) {
    this.desired = t;
    if (this.status === "connected" && !this.flushing) void this.flush();
  }

  private async flush() {
    this.flushing = true;
    try {
      while (this.desired && !same(this.desired, this.applied) && this.status === "connected") {
        const t = this.desired;
        if (await this.apply(t)) this.applied = t;
        else break;
      }
    } finally {
      this.flushing = false;
    }
  }

  private async apply(t: TrainerTarget): Promise<boolean> {
    let r: ControlResponse | null;
    if (t.mode === "erg") r = await this.command(ftmsCommand.power(t.watts));
    else if (!this.resistanceAsGrade) {
      r = await this.command(ftmsCommand.resistance(t.level));
      if (r && r.result === 2) {
        this.resistanceAsGrade = true;
        r = await this.command(ftmsCommand.simulation(this.grade(t.level)));
      }
    } else r = await this.command(ftmsCommand.simulation(this.grade(t.level)));
    if (r && r.result === 5) {
      // Control taken by another app or lost: ask again once.
      await this.command(ftmsCommand.requestControl());
      return false;
    }
    return r !== null;
  }

  /** Resistance level → grade 0–10 % for trainers that only take a simulated slope. */
  private grade(level: number): number {
    const lo = this.levels[0] ?? 0;
    const hi = this.levels[this.levels.length - 1] ?? 100;
    return hi > lo ? ((level - lo) / (hi - lo)) * 10 : 0;
  }
}

function same(a: TrainerTarget, b: TrainerTarget | null): boolean {
  if (!b || a.mode !== b.mode) return false;
  return a.mode === "erg" ? a.watts === (b as { watts: number }).watts : a.level === (b as { level: number }).level;
}

// ── Heart-rate strap ────────────────────────────────────────────────────────────────────────────────

export class HeartRateStrap extends Link {
  /** The strap has sent RR intervals (needed for DFA α1). */
  sendsRr = false;

  constructor(
    changed: () => void,
    private readonly onBeat: (hr: number, rr: number[]) => void,
  ) {
    super("hr", changed);
  }

  protected services() {
    return { main: UUID.heartRate, extra: [] };
  }

  protected async setup(g: Gatt) {
    // Another strap may not send RR: found out again on every connection.
    this.sendsRr = false;
    await this.stage("cerco il servizio cardio", g.need(UUID.heartRate)).catch(
      missing(`${this.name ?? "Il dispositivo"} non manda la frequenza cardiaca via Bluetooth: su un orologio Garmin attiva «Trasmetti frequenza cardiaca».`),
    );
    await this.stage(
      "attivo i dati del cuore",
      g.notify(UUID.heartRate, UUID.heartRateMeasurement, (v) => {
        const m = parseHeartRate(v);
        if (m.rr.length && !this.sendsRr) {
          this.sendsRr = true;
          this.set(this.status);
        }
        this.onBeat(m.heartRate, m.rr);
      }),
    );
  }
}

// ── Power meter ─────────────────────────────────────────────────────────────────────────────────────

export class PowerMeter extends Link {
  private lastCrank: { revs: number; time: number; at: number } | null = null;

  constructor(
    changed: () => void,
    private readonly onPower: (power: number, cadence: number | null) => void,
  ) {
    super("power", changed);
  }

  protected services() {
    return { main: UUID.cyclingPower, extra: [] };
  }

  protected async setup(g: Gatt) {
    // Crank counts from before a drop would give one wrong cadence reading.
    this.lastCrank = null;
    await this.stage("cerco il servizio potenza", g.need(UUID.cyclingPower)).catch(
      missing(`${this.name ?? "Il dispositivo"} non manda la potenza via Bluetooth.`),
    );
    await this.stage(
      "attivo i dati di potenza",
      g.notify(UUID.cyclingPower, UUID.cyclingPowerMeasurement, (v) => this.onPower(...this.read(parseCyclingPower(v)))),
    );
  }

  private read(m: CyclingPowerMeasurement): [number, number | null] {
    if (!m.crank) return [m.power, null];
    const now = Date.now();
    const prev = this.lastCrank;
    let cadence: number | null = null;
    if (prev) {
      const c = crankCadence(prev, m.crank);
      if (c !== null && c < 220) {
        cadence = c;
        this.lastCrank = { ...m.crank, at: now };
      } else cadence = now - prev.at > 2500 ? 0 : null; // no new revolution for a while: not pedalling
    } else this.lastCrank = { ...m.crank, at: now };
    return [m.power, cadence];
  }
}
