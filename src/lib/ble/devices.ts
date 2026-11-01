// Bluetooth links to the trainer (FTMS), the heart-rate strap and a power meter (e.g. pedals).
// The radio itself is in radio.ts: Web Bluetooth in Chrome / Edge, Android's own Bluetooth in the app.
// A dropped link reconnects by itself with the device already chosen; choosing a device always needs a tap.
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
export type DeviceStatus = "off" | "connecting" | "connected" | "reconnecting" | "lost";

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

/** A missing service gets a clear message; time-outs and other errors pass through. */
function missing(message: string) {
  return (e: unknown): never => {
    throw e instanceof ServiceMissing ? new Error(message) : e;
  };
}
const REMEMBER_KEY = (kind: DeviceKind) => `mascoach-ble-${kind}`;
const LAST_KEY = (kind: DeviceKind) => `mascoach-ble-${kind}-last`;

/** The device picked last time and whether it was found in the full list ("Mostra tutti i dispositivi"). */
export type LastChoice = { name: string | null; any: boolean };

export function lastChoice(kind: DeviceKind): LastChoice | null {
  try {
    const v = localStorage.getItem(LAST_KEY(kind));
    return v ? (JSON.parse(v) as LastChoice) : null;
  } catch {
    return null;
  }
}

/**
 * The device chosen last time for this kind, if it can be reached without the chooser.
 * The app always can; Chrome on Android often keeps no permission between visits (empty getDevices).
 */
export async function rememberedDevice(kind: DeviceKind): Promise<GattDevice | null> {
  try {
    return await transport().known(localStorage.getItem(REMEMBER_KEY(kind)), lastChoice(kind)?.name ?? null);
  } catch {
    return null;
  }
}

function chooserError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/adapter|bluetooth.*(off|not available|unavailable|not enabled|disabled)/i.test(msg)) return "Il Bluetooth è spento o non disponibile: accendilo e riprova.";
  if (/permission/i.test(msg)) return "Serve il permesso «Dispositivi nelle vicinanze»: concedilo nelle impostazioni dell'app.";
  return msg;
}

abstract class Link {
  device: GattDevice | null = null;
  /** The open link, while connected. */
  protected gatt: Gatt | null = null;
  status: DeviceStatus = "off";
  error: string | null = null;
  /** The connection step in progress, shown while connecting: tells where a device gets stuck. */
  step: string | null = null;
  private closing = false;

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
    try {
      localStorage.setItem(LAST_KEY(this.kind), JSON.stringify({ name: device.name ?? null, any } satisfies LastChoice));
    } catch {
      // Not remembered.
    }
    await this.use(device);
  }

  /** Connects to a device already allowed (e.g. from rememberedDevice). */
  async use(device: GattDevice): Promise<void> {
    if (this.device && this.device !== device) this.disconnect();
    this.closing = false;
    this.device = device;
    try {
      localStorage.setItem(REMEMBER_KEY(this.kind), device.id);
    } catch {
      // Not remembered: next time the chooser is needed anyway.
    }
    this.set("connecting", null);
    let error: unknown = null;
    // Android often fails the first attempts (Garmin watches especially): retry on a clean link, giving Android
    // a few seconds to release the previous one.
    for (let attempt = 0; attempt < CONNECT_TRIES && !this.closing; attempt++) {
      if (attempt) await sleep(2000 * attempt);
      try {
        await this.connect();
        return;
      } catch (e) {
        error = e;
        this.dropLink();
      }
    }
    if (!this.closing) this.set("off", error instanceof Error ? error.message : String(error));
  }

  private async connect() {
    try {
      const g = await this.stage("mi collego", transport().connect(this.device!, this.onDropped), 25000);
      this.gatt = g;
      await this.setup(g);
    } finally {
      this.step = null;
    }
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

  private onDropped = () => {
    // Drops while connecting or retrying are handled by those loops.
    if (this.closing || this.status !== "connected") return;
    this.set("reconnecting");
    void this.reconnect();
  };

  private async reconnect() {
    for (let attempt = 0; attempt < 12 && !this.closing; attempt++) {
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
      if (this.closing) return;
      try {
        await this.connect();
        return;
      } catch {
        // Try again: the trainer may still be out of range or busy.
        this.dropLink();
      }
    }
    if (!this.closing) this.set("lost", "Connessione persa: ricollega il dispositivo.");
  }

  disconnect() {
    this.closing = true;
    this.dropLink();
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
