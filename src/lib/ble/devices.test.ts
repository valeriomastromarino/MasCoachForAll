import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake radio: the test decides when a link opens or drops, and sees every connection and disconnection.
const radio = vi.hoisted(() => ({
  chosen: [] as { id: string; name: string | null; raw: null }[],
  connects: [] as { id: string; resolve: (g: unknown) => void; reject: (e: unknown) => void; onDrop: () => void }[],
  disconnects: [] as string[],
  heartRate: true,
}));

vi.mock("./radio", () => {
  class ServiceMissing extends Error {}
  class ChooserCancelled extends Error {}
  return {
    ServiceMissing,
    ChooserCancelled,
    transport: () => ({
      native: false,
      problem: () => null,
      choose: async () => {
        const d = radio.chosen.shift();
        if (!d) throw new ChooserCancelled();
        return d;
      },
      connect: (device: { id: string }, onDrop: () => void) => new Promise((resolve, reject) => radio.connects.push({ id: device.id, resolve, reject, onDrop })),
      disconnect: (device: { id: string }) => radio.disconnects.push(device.id),
    }),
  };
});

import { forgetSavedDevices, HeartRateStrap, REFUSED_RETRY_MS, Trainer } from "./devices";
import { ServiceMissing } from "./radio";

const gatt = () => ({
  need: async (service: number) => {
    if (service !== 0x180d || !radio.heartRate) throw new ServiceMissing(String(service));
  },
  read: async () => new DataView(new ArrayBuffer(4)),
  notify: async () => {},
  write: async () => {},
});
const settle = () => vi.advanceTimersByTimeAsync(0);
/** Lets a chain of commands and answers run to the end (each answer arrives in a microtask). */
async function drain() {
  for (let i = 0; i < 5; i++) {
    await settle();
    for (let k = 0; k < 20; k++) await Promise.resolve();
  }
}
const dv = (...b: number[]) => new DataView(new Uint8Array(b).buffer);

/** A trainer with FTMS: its resistance range [min, max, step], and the answer to each control point command (1 = ok). */
function trainerGatt(range: [number, number, number], answer: (op: number) => number) {
  const writes: number[][] = [];
  let control: ((v: DataView) => void) | null = null;
  return {
    writes,
    need: async (service: number) => {
      if (service !== 0x1826) throw new ServiceMissing(String(service));
    },
    read: async (_service: number, c: number) => {
      if (c === 0x2acc) return dv(0, 0, 0, 0, 0x0c, 0, 0, 0); // takes resistance and power targets
      if (c !== 0x2ad6) throw new Error("not read here");
      const v = new DataView(new ArrayBuffer(6));
      v.setInt16(0, range[0] * 10, true);
      v.setInt16(2, range[1] * 10, true);
      v.setUint16(4, range[2] * 10, true);
      return v;
    },
    notify: async (_service: number, c: number, cb: (v: DataView) => void) => {
      if (c === 0x2ad9) control = cb;
    },
    write: async (_service: number, _c: number, bytes: Uint8Array) => {
      writes.push([...bytes]);
      const op = bytes[0];
      void Promise.resolve().then(() => control?.(dv(0x80, op, answer(op))));
    },
  };
}

async function connectTrainer(t: Trainer, g: ReturnType<typeof trainerGatt>) {
  radio.chosen.push({ id: "justo", name: "Elite Justo", raw: null });
  const p = t.choose();
  await settle();
  radio.connects[radio.connects.length - 1].resolve(g);
  await p;
}
const strap = () => new HeartRateStrap(() => {}, () => {});

/** Chooses a device in the fake chooser and lets its link open. */
async function connected(s: HeartRateStrap, id = "h10") {
  radio.chosen.push({ id, name: "Polar H10", raw: null });
  const p = s.choose();
  await settle();
  radio.connects[radio.connects.length - 1].resolve(gatt());
  await p;
}

describe("Bluetooth, manual management", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    radio.chosen = [];
    radio.connects = [];
    radio.disconnects = [];
    radio.heartRate = true;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not reconnect by itself after a drop; «Ricollega» uses the same device without the chooser", async () => {
    const s = strap();
    await connected(s);
    expect(s.status).toBe("connected");
    radio.connects[0].onDrop();
    expect(s.status).toBe("lost");
    expect(s.wasConnected).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(radio.connects).toHaveLength(1);
    expect(s.status).toBe("lost");

    const again = s.retry();
    await settle();
    expect(radio.connects).toHaveLength(2);
    expect(radio.connects[1].id).toBe("h10");
    radio.connects[1].resolve(gatt());
    await again;
    expect(s.status).toBe("connected");
  });

  it("«Annulla» while connecting closes the link that opens later, and stays off", async () => {
    const s = strap();
    radio.chosen.push({ id: "h10", name: "Polar H10", raw: null });
    const p = s.choose();
    await settle();
    expect(s.status).toBe("connecting");
    s.disconnect();
    expect(s.status).toBe("off");
    radio.connects[0].resolve(gatt());
    await p;
    expect(s.status).toBe("off");
    // Once on «Annulla», once when the late link opened.
    expect(radio.disconnects.filter((id) => id === "h10")).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(radio.connects).toHaveLength(1);
  });

  it("«Scollega» forgets the device: «Collega» opens the chooser again", async () => {
    const s = strap();
    await connected(s);
    s.disconnect();
    expect(s.status).toBe("off");
    expect(s.device).toBeNull();
    expect(s.wasConnected).toBe(false);
  });

  it("a device without the service is tried once and kept for «Riprova»", async () => {
    radio.heartRate = false;
    const s = strap();
    await connected(s, "watch");
    expect(radio.connects).toHaveLength(1);
    expect(s.status).toBe("off");
    expect(s.error).toMatch(/non manda la frequenza cardiaca/);
    expect(s.device?.id).toBe("watch");
  });

  it("remembers nothing on the device and clears what older versions saved", async () => {
    const store = new Map<string, string>([
      ["mascoach-ble-hr", "old-id"],
      ["mascoach-ble-trainer-last", JSON.stringify({ name: "Elite Justo", any: false })],
      ["mascoach-theme", "night"],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    forgetSavedDevices();
    expect([...store.keys()]).toEqual(["mascoach-theme"]);
    await connected(strap());
    expect([...store.keys()]).toEqual(["mascoach-theme"]);
  });
});

describe("Trainer commands", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    radio.chosen = [];
    radio.connects = [];
    radio.disconnects = [];
  });
  afterEach(() => vi.useRealTimers());

  it("uses a trainer's own steps, and sends a level it calls not valid as a grade from then on", async () => {
    const t = new Trainer(() => {}, () => {});
    const g = trainerGatt([0, 10, 1], (op) => (op === 0x04 ? 3 : 1));
    await connectTrainer(t, g);
    expect(t.status).toBe("connected");
    expect(t.levels).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    t.setTarget({ mode: "resistance", level: 5 });
    await drain();
    expect(t.resistanceAsGrade).toBe(true);
    expect(t.refused).toBeNull();
    expect(g.writes.slice(-2).map((w) => w[0])).toEqual([0x04, 0x11]);
    // 5 of 10 steps = 5 % (500 in hundredths), in equal steps by position.
    expect(g.writes.at(-1)).toEqual([0x11, 0, 0, 0xf4, 0x01, 40, 51]);
  });

  it("does not count a refused target as applied, shows it, and sends the same one again only after a while", async () => {
    const t = new Trainer(() => {}, () => {});
    let erg = 3;
    const g = trainerGatt([0, 100, 1], (op) => (op === 0x05 ? erg : 1));
    await connectTrainer(t, g);
    const sent = () => g.writes.filter((w) => w[0] === 0x05).length;
    t.setTarget({ mode: "erg", watts: 200 });
    await drain();
    expect(t.refused).toMatchObject({ target: { mode: "erg", watts: 200 }, reason: "valore non valido" });
    expect(sent()).toBe(1);
    // The player asks for the same target every second: the trainer is not asked again every second.
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      t.setTarget({ mode: "erg", watts: 200 });
      await drain();
    }
    expect(sent()).toBe(1);
    erg = 1;
    await vi.advanceTimersByTimeAsync(REFUSED_RETRY_MS);
    t.setTarget({ mode: "erg", watts: 200 });
    await drain();
    expect(sent()).toBe(2);
    expect(t.refused).toBeNull();
  });

  it("says so when another app keeps the trainer, and does not send anything every second meanwhile", async () => {
    const t = new Trainer(() => {}, () => {});
    let taken = true;
    const g = trainerGatt([0, 100, 1], (op) => (taken && (op === 0x00 || op === 0x05) ? 5 : 1));
    await connectTrainer(t, g);
    expect(t.status).toBe("connected");
    expect(t.refused).toMatchObject({ target: null, reason: "un'altra app comanda il rullo" });
    const before = g.writes.length;
    for (let i = 0; i < 5; i++) {
      t.setTarget({ mode: "erg", watts: 150 + i * 5 }); // the soft start changes the target every second
      await drain();
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(g.writes.length).toBe(before);
    taken = false;
    await vi.advanceTimersByTimeAsync(REFUSED_RETRY_MS);
    t.setTarget({ mode: "erg", watts: 180 });
    await drain();
    expect(g.writes.at(-1)).toEqual([0x05, 180, 0]);
    expect(t.refused).toBeNull();
  });

  it("asks for control again when another app took it, and sends the target on the next second", async () => {
    const t = new Trainer(() => {}, () => {});
    let first = true;
    const g = trainerGatt([0, 100, 1], (op) => {
      if (op !== 0x05 || !first) return 1;
      first = false;
      return 5;
    });
    await connectTrainer(t, g);
    t.setTarget({ mode: "erg", watts: 180 });
    await drain();
    expect(g.writes.slice(-2).map((w) => w[0])).toEqual([0x05, 0x00]);
    expect(t.refused).toBeNull();
    t.setTarget({ mode: "erg", watts: 180 });
    await drain();
    expect(g.writes.at(-1)).toEqual([0x05, 180, 0]);
  });
});
