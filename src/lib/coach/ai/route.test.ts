import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OPTIONS, POST } from "@/app/api/coach/ask/route";

const realFetch = globalThis.fetch;
const call = (headers: Record<string, string>) =>
  POST(new Request("http://x/api/coach/ask", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ messages: [{ role: "user", content: "ciao" }], snapshot: { today: "2026-11-09" } }) }));

describe("POST /api/coach/ask dall'app Android (password nell'intestazione)", () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = "password-di-prova";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.APP_PASSWORD;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("risponde al preflight con le intestazioni CORS", async () => {
    const r = await OPTIONS();
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("access-control-allow-headers")).toContain("x-mascoach-password");
  });

  it("con la password sbagliata dice 401 e non chiama Anthropic", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch;
    const r = await call({ "x-mascoach-password": "sbagliata" });
    expect(r.status).toBe(401);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(called).toBe(false);
  });

  it("con la password giusta risponde con il testo del coach", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "🟢 Pronto" }] }), { status: 200 })) as typeof fetch;
    const r = await call({ "x-mascoach-password": "password-di-prova" });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { text: string }).text).toBe("🟢 Pronto");
  });
});
