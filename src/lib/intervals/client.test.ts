import { describe, expect, it } from "vitest";
import { icuErrorText } from "./client";

describe("icuErrorText", () => {
  it("says in words what a refused request means, with the code at the end", () => {
    expect(icuErrorText(401, '{"status":401,"error":"Unauthorized"}')).toBe("Intervals.icu non accetta la chiave API: controlla che sia giusta (errore 401).");
    expect(icuErrorText(404)).toContain("non trova quello che ho chiesto");
    expect(icuErrorText(429)).toContain("riprova tra un minuto");
    expect(icuErrorText(503)).toBe("Intervals.icu ha un problema in questo momento: riprova tra poco (errore 503).");
  });

  it("keeps the reply only where it explains what was wrong with the request", () => {
    expect(icuErrorText(422, "Invalid   workout\n text")).toBe("Intervals.icu ha rifiutato la richiesta: Invalid workout text (errore 422).");
    expect(icuErrorText(400)).toBe("Intervals.icu ha rifiutato la richiesta (errore 400).");
    // A key or a path never ends up on screen through the reply of a 401 or a 5xx.
    expect(icuErrorText(401, "API_KEY abc")).not.toContain("abc");
    expect(icuErrorText(500, "stack trace /athlete/i123")).not.toContain("i123");
    expect(icuErrorText(418)).toBe("Intervals.icu non ha accettato la richiesta (errore 418).");
  });
});
