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

import { forgetSavedDevices, HeartRateStrap } from "./devices";
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
