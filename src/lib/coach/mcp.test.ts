import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleMcp } from "./mcp";
import { parseWarning } from "./tools";

// No Intervals.icu key in tests: reads answer with the demo data, writes refuse.
beforeEach(() => {
  vi.stubEnv("INTERVALS_API_KEY", "");
});

const call = (name: string, args: Record<string, unknown> = {}) =>
  handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) as Promise<{
    result: { content: { text: string }[]; isError?: boolean };
  }>;

describe("MasCoach MCP server", () => {
  it("negotiates the protocol and lists read and write tools", async () => {
    const init = (await handleMcp({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18" } })) as {
      result: { protocolVersion: string; capabilities: object };
    };
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.capabilities).toHaveProperty("tools");

    const list = (await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" })) as {
      result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
    };
    const byName = new Map(list.result.tools.map((t) => [t.name, t]));
    expect(byName.get("stato_di_oggi")?.annotations.readOnlyHint).toBe(true);
    expect(byName.get("crea_allenamento")?.annotations.readOnlyHint).toBe(false);
    // Tools the coach prompt v7.2-p expects.
    for (const name of ["eventi", "w_balance", "fueling_log"]) expect(byName.get(name)?.annotations.readOnlyHint).toBe(true);
    for (const name of ["registra_carboidrati", "salva_in_libreria"]) expect(byName.get(name)?.annotations.readOnlyHint).toBe(false);
  });

  it("answers notifications with nothing and unknown methods with an error", async () => {
    expect(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(await handleMcp({ jsonrpc: "2.0", id: 2, method: "resources/list" })).toMatchObject({ error: { code: -32601 } });
  });

  it("reads today's status (demo data) in compact form", async () => {
    const r = await call("stato_di_oggi");
    expect(r.result.isError).toBeUndefined();
    const s = JSON.parse(r.result.content[0].text);
    expect(s.dati).toMatch(/DEMO/);
    expect(s.hrv_altini.media_7gg_ms).toBeGreaterThan(0);
    expect(s.ultimi_14_giorni).toHaveLength(14);
  });

  it("returns tool errors as readable results", async () => {
    const r = await call("crea_allenamento", { data: "2099-01-01", nome: "SS", testo: "- 10m 55%" });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/Intervals/);
    for (const [name, args] of [
      ["eventi", {}],
      ["w_balance", {}],
      ["fueling_log", {}],
      ["registra_carboidrati", { id: "i1", grammi: 60 }],
      ["salva_in_libreria", { nome: "SS", testo: "- 10m 55%" }],
    ] as const) {
      const r2 = await call(name, args);
      expect(r2.result.isError).toBe(true);
      expect(r2.result.content[0].text).toMatch(/Intervals/);
    }
    const bad = await call("uscite", { da: "ieri" });
    expect(bad.result.isError).toBe(true);
  });
});

describe("storico", () => {
  it("summarises years and months (demo data)", async () => {
    const r = await call("storico", { anni: 1 });
    expect(r.result.isError).toBeUndefined();
    const h = JSON.parse(r.result.content[0].text);
    expect(h.mesi.length).toBeGreaterThanOrEqual(12);
    expect(h.anni.length).toBeGreaterThanOrEqual(1);
    expect(h.mesi[0]).toHaveProperty("hrv_media_ms");
    expect(h.anni.at(-1)).toHaveProperty("parziale_fino_a");
  });
});

describe("parseWarning", () => {
  it("flags a repeat block Intervals.icu did not read", () => {
    const text = "Riscaldamento\n- 10m 55%\nSweet spot 2x\n- 10m 90%\n- 5m 55%";
    // Read once: 3 flat steps, no reps.
    expect(parseWarning(text, [{}, {}, {}])).toMatch(/riga vuota/);
    expect(parseWarning(text, [{}, { reps: 2 }])).toBeNull();
    expect(parseWarning(text, [])).toMatch(/nessun passo/);
  });
});
