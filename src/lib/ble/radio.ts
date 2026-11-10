// The Bluetooth link underneath the devices: Web Bluetooth in a browser, Android's own Bluetooth in the app
// (Capacitor + @capacitor-community/bluetooth-le). The app exists because Chrome on Android drops Garmin watches,
// forgets the chosen device and cannot pair; the native side has none of those limits.
import { Capacitor } from "@capacitor/core";

/** A device the user picked in this session (devices are never remembered: see devices.ts). */
export type GattDevice = { id: string; name: string | null; raw: unknown };

/** The device does not offer this service. */
export class ServiceMissing extends Error {}
/** The user closed the chooser. */
export class ChooserCancelled extends Error {}

/** A connected device: services and characteristics are 16-bit UUIDs (0x180d…). */
export interface Gatt {
  /** Throws ServiceMissing when the device has no such service. */
  need(service: number): Promise<void>;
  read(service: number, characteristic: number): Promise<DataView>;
  notify(service: number, characteristic: number, on: (value: DataView) => void): Promise<void>;
  /** Write with response. */
  write(service: number, characteristic: number, bytes: Uint8Array): Promise<void>;
}

export interface BleTransport {
  readonly native: boolean;
  /** Why Bluetooth cannot work here, or null when it can. */
  problem(): string | null;
  /** Opens the chooser (inside a tap). `any` lists every nearby device instead of those advertising `main`. */
  choose(main: number, extra: number[], any: boolean): Promise<GattDevice>;
  connect(device: GattDevice, onDrop: () => void): Promise<Gatt>;
  disconnect(device: GattDevice): void;
}

// ── Web Bluetooth ───────────────────────────────────────────────────────────────────────────────────

const dropHandlers = new WeakMap<BluetoothDevice, () => void>();
const valueHandlers = new WeakMap<BluetoothRemoteGATTCharacteristic, (e: Event) => void>();

function wrapWeb(d: BluetoothDevice): GattDevice {
  return { id: d.id, name: d.name ?? null, raw: d };
}

function webSession(server: BluetoothRemoteGATTServer): Gatt {
  const characteristic = async (service: number, characteristic: number) => {
    try {
      return await (await server.getPrimaryService(service)).getCharacteristic(characteristic);
    } catch (e) {
      throw e instanceof DOMException && e.name === "NotFoundError" ? new ServiceMissing(String(service)) : e;
    }
  };
  return {
    async need(service) {
      try {
        await server.getPrimaryService(service);
      } catch (e) {
        throw e instanceof DOMException && e.name === "NotFoundError" ? new ServiceMissing(String(service)) : e;
      }
    },
    async read(service, c) {
      return (await characteristic(service, c)).readValue();
    },
    async notify(service, c, on) {
      const ch = await characteristic(service, c);
      // The browser keeps the same characteristic object across reconnections: drop the old listener or every beat arrives twice.
      const old = valueHandlers.get(ch);
      if (old) ch.removeEventListener("characteristicvaluechanged", old);
      const handler = (e: Event) => {
        const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
        if (v) on(v);
      };
      valueHandlers.set(ch, handler);
      ch.addEventListener("characteristicvaluechanged", handler);
      await ch.startNotifications();
    },
    async write(service, c, bytes) {
      await (await characteristic(service, c)).writeValueWithResponse(bytes as BufferSource);
    },
  };
}

const web: BleTransport = {
  native: false,
  problem() {
    if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
      return "Questo browser non ha il Bluetooth per le pagine web: usa Chrome o Edge su Windows o Android.";
    }
    if (typeof window !== "undefined" && !window.isSecureContext) return "Il Bluetooth funziona solo con un indirizzo https.";
    return null;
  },
  async choose(main, extra, any) {
    try {
      const d = await navigator.bluetooth.requestDevice(
        any ? { acceptAllDevices: true, optionalServices: [main, ...extra] } : { filters: [{ services: [main] }], optionalServices: extra },
      );
      return wrapWeb(d);
    } catch (e) {
      // Closing the chooser is not an error (Chrome reports it as NotFoundError too, with "cancelled").
      if (e instanceof DOMException && e.name === "NotFoundError" && /cancel/i.test(e.message)) throw new ChooserCancelled();
      throw e;
    }
  },
  async connect(device, onDrop) {
    const raw = device.raw as BluetoothDevice;
    const old = dropHandlers.get(raw);
    if (old) raw.removeEventListener("gattserverdisconnected", old);
    dropHandlers.set(raw, onDrop);
    raw.addEventListener("gattserverdisconnected", onDrop);
    return webSession(await raw.gatt!.connect());
  },
  disconnect(device) {
    try {
      (device.raw as BluetoothDevice).gatt?.disconnect();
    } catch {
      // Already gone.
    }
  },
};

// ── Android (native) ────────────────────────────────────────────────────────────────────────────────

const full = (n: number) => `0000${n.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

let bleReady: Promise<typeof import("@capacitor-community/bluetooth-le").BleClient> | null = null;
function client() {
  bleReady ??= import("@capacitor-community/bluetooth-le").then(async ({ BleClient }) => {
    await BleClient.initialize({ androidNeverForLocation: true });
    return BleClient;
  });
  // A failed start (Bluetooth off, permission refused) must be retried at the next tap.
  bleReady.catch(() => (bleReady = null));
  return bleReady;
}

const native: BleTransport = {
  native: true,
  problem: () => null,
  async choose(main, extra, any) {
    const ble = await client();
    try {
      const d = await ble.requestDevice(any ? { optionalServices: [main, ...extra].map(full) } : { services: [full(main)], optionalServices: extra.map(full) });
      return { id: d.deviceId, name: d.name ?? null, raw: null };
    } catch (e) {
      if (e instanceof Error && /cancel|dismiss|no device selected/i.test(e.message)) throw new ChooserCancelled();
      throw e;
    }
  },
  async connect(device, onDrop) {
    const ble = await client();
    await ble.connect(device.id, () => onDrop(), { timeout: 20000 });
    return {
      async need(service) {
        const services = await ble.getServices(device.id);
        if (!services.some((s) => s.uuid.toLowerCase() === full(service))) throw new ServiceMissing(String(service));
      },
      read: (service, c) => ble.read(device.id, full(service), full(c)),
      notify: (service, c, on) => ble.startNotifications(device.id, full(service), full(c), on),
      write: (service, c, bytes) => ble.write(device.id, full(service), full(c), view(bytes)),
    };
  },
  disconnect(device) {
    void client()
      .then((ble) => ble.disconnect(device.id))
      .catch(() => {
        // Not connected, or Bluetooth is off: nothing to close.
      });
  },
};

/** Android's Bluetooth inside the app, Web Bluetooth everywhere else. */
export function transport(): BleTransport {
  return Capacitor.isNativePlatform() ? native : web;
}
