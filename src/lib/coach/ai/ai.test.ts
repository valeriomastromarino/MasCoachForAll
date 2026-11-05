import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, weekStart } from "@/lib/dates";
import { planFromToday, type SeasonSetup } from "@/lib/training/season";

vi.mock("@/lib/api/handlers", () => ({
  handleApi: async (_method: string, path: string) => {
    if (path.startsWith("/api/dashboard")) return { status: 200, json: { status: { ctl: 50 } } };
    if (path.startsWith("/api/life")) return { status: 200, json: [] };
    if (path.startsWith("/api/library")) {
      const w = (id: number, name: string, mins: number, zone: number, tss: number) => ({ id, name, type: "Ride", secs: mins * 60, tss, description: null, blocks: [{ secs: mins * 60, zone, watts: 200 }] });
      return { status: 200, json: { folders: [{ id: 1, name: "Workout Coach AI", workouts: [w(11, "Zone 2 Endurance 90", 90, 2, 62), w(12, "Threshold 4x8 Indoor", 60, 4, 75), w(13, "MTB XC Zone 2 120", 120, 2, 90)] }] } };
    }
    return { status: 404, json: {} };
  },
}));

import { ask, hideKeys } from "./agent";
import { AI_TOOLS, type Snapshot, type ToolContext } from "./tools";

const TODAY = "2026-11-09"; // a Monday
const setup: SeasonSetup = { start: TODAY, horizonWeeks: 20, raceA: null, peak: { start: addDays(TODAY, 140), weeks: 8 }, ramp: "prudente", stops: [], maxHours: 8 };
const snapshot: Snapshot = { today: TODAY, setup, profile: null };
const ctxOf = (): ToolContext => ({ snapshot, actions: [], overrides: {} });
const tool = (name: string) => AI_TOOLS.find((t) => t.name === name)!;

describe("settimana di scarico nel piano", () => {
  it("rende leggera la settimana chiesta e poi il carico riprende", () => {
    const base = planFromToday(setup, TODAY, 50);
    const w2 = addDays(weekStart(TODAY), 7);
    const light = planFromToday({ ...setup, lightWeeks: [w2] }, TODAY, 50);
    const i = light.weeks.findIndex((w) => w.start === w2);
    expect(light.weeks[i].kind).toBe("scarico");
    expect(light.weeks[i].tssTarget).toBeLessThan(base.weeks[i].tssTarget);
    expect(light.weeks[i].hardMax).toBe(0);
    expect(light.weeks[i + 1].kind).toBe("carico");
  });
});

describe("strumenti del coach scritto", () => {
  it("proponi_stagione registra la proposta e mostra prima/dopo, senza scrivere", async () => {
    const ctx = ctxOf();
    const monday = weekStart(TODAY);
    const out = (await tool("proponi_stagione").run({ descrizione: "Scarico questa settimana", scarico_aggiungi: [addDays(monday, 3)] }, ctx)) as Record<string, unknown>;
    expect(ctx.actions).toHaveLength(1);
    expect(ctx.actions[0]).toMatchObject({ type: "set_season", patch: { lightWeeks: [monday] }, label: "Scarico questa settimana" });
    expect(String(out.proposta_registrata)).toContain("In attesa");
    expect((out.settimane_che_cambiano as unknown[]).length).toBeGreaterThan(0);
  });

  it("non propone nulla se il piano è già così", async () => {
    const ctx = ctxOf();
    const out = (await tool("proponi_stagione").run({ descrizione: "Niente", ramp: "prudente" }, ctx)) as Record<string, unknown>;
    expect(ctx.actions).toHaveLength(0);
    expect(out.nessun_cambiamento).toBe(true);
  });

  it("rifiuta date sbagliate e ore assurde", async () => {
    await expect(tool("proponi_stagione").run({ descrizione: "x", scarico_aggiungi: ["domani"] }, ctxOf())).rejects.toThrow("AAAA-MM-GG");
    await expect(tool("proponi_sposta").run({ id: "1", nome: "x", data: "2020-01-01" }, ctxOf())).rejects.toThrow("passato");
  });

  it("segna_per_oggi applica subito, senza proposta", async () => {
    const ctx = ctxOf();
    await tool("segna_per_oggi").run({ sensazione: "gambe pesanti", sensazione_negativa: true, minuti_massimi: 45 }, ctx);
    expect(ctx.actions).toHaveLength(0);
    expect(ctx.overrides).toMatchObject({ maxMins: 45, feeling: { drop: true } });
  });

  it("cerca_libreria dà gli id e filtra per durata, tipo e rulli, senza dump della libreria", async () => {
    const all = (await tool("cerca_libreria").run({}, ctxOf())) as { trovati: number; allenamenti: { id: number; nome: string }[] };
    expect(all.allenamenti.every((a) => typeof a.id === "number")).toBe(true);
    expect(all.allenamenti.map((a) => a.nome)).not.toContain("MTB XC Zone 2 120"); // MTB out by default
    const rulli = (await tool("cerca_libreria").run({ luogo: "rulli" }, ctxOf())) as { allenamenti: { id: number }[] };
    expect(rulli.allenamenti.map((a) => a.id)).toEqual([12]);
    const lunghi = (await tool("cerca_libreria").run({ minuti_min: 80 }, ctxOf())) as { allenamenti: { id: number }[] };
    expect(lunghi.allenamenti.map((a) => a.id)).toEqual([11]);
    expect(AI_TOOLS.map((t) => t.name)).not.toContain("libreria_allenamenti");
  });

  it("nessuno strumento di scrittura diretta è esposto", () => {
    const names = AI_TOOLS.map((t) => t.name);
    for (const w of ["crea_allenamento", "modifica_allenamento", "cancella_allenamento", "cancella_prove", "salva_in_libreria", "registra_carboidrati"]) expect(names).not.toContain(w);
  });
});

describe("ciclo con il modello", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("esegue gli strumenti richiesti e restituisce testo e proposte", async () => {
    const calls: { body: Record<string, unknown>; headers: Record<string, string> }[] = [];
    const replies = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "proponi_stagione", input: { descrizione: "Scarico", scarico_aggiungi: [weekStart(TODAY)] } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Ti propongo uno scarico. Confermi?" }] },
    ];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      calls.push({ body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify(replies[calls.length - 1]), { status: 200 });
    }) as typeof fetch;

    const r = await ask([{ role: "user", content: "questa settimana faccio scarico" }], snapshot);
    expect(r.text).toContain("Confermi");
    expect(r.actions).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[0].body.model).toBe("claude-haiku-5-5");
    expect(calls[0].headers["x-api-key"]).toBe("test-key");
    // The second call carries the tool result back to the model.
    const last = (calls[1].body.messages as { role: string; content: unknown }[]).at(-1)!;
    expect(last.role).toBe("user");
    expect(JSON.stringify(last.content)).toContain("tool_result");
  });

  it("una chiave incollata con spazi o a capo viene ripulita prima di andare nell'intestazione", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-abc123 \n def456 ";
    let sent = "";
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sent = (init.headers as Record<string, string>)["x-api-key"];
      return new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] }), { status: 200 });
    }) as typeof fetch;
    await ask([{ role: "user", content: "ciao" }], snapshot);
    expect(sent).toBe("sk-ant-abc123def456");
  });

  it("nessun messaggio di errore mostra la chiave", () => {
    const bad = 'Headers.append: "sk-ant-usr-AAA BBB" is an invalid header value.';
    expect(hideKeys(bad)).toBe('Headers.append: "[chiave nascosta]" is an invalid header value.');
    expect(hideKeys("errore sk-ant-xyz123 qui")).not.toContain("xyz123");
  });

  it("senza chiave risponde 501, così l'app usa le regole", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(ask([{ role: "user", content: "ciao" }], snapshot)).rejects.toMatchObject({ status: 501 });
  });
});
