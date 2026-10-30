"use client";
import { useSearchParams } from "next/navigation";

/** Reads ?next= and ?error= from the address (needs a Suspense boundary around it). */
export function LoginForm() {
  const params = useSearchParams();
  return <LoginFields next={params.get("next") ?? "/"} error={params.has("error")} />;
}

// Plain HTML form: it works even before the page's JavaScript has loaded.
export function LoginFields({ next, error }: { next: string; error: boolean }) {
  return (
    <form method="post" action="/api/login" className="mt-5">
      <input type="hidden" name="next" value={next} />
      <label className="block text-xs text-muted">
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          required
          className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: "var(--background)", border: "1px solid var(--border)" }}
        />
      </label>
      {error && (
        <p className="mt-2 text-xs" style={{ color: "var(--critical)" }}>
          Password sbagliata, riprova.
        </p>
      )}
      <button
        type="submit"
        className="mt-4 w-full rounded-xl px-4 py-2 text-sm font-medium"
        style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
      >
        Entra
      </button>
      <p className="mt-3 text-xs text-muted">Questo dispositivo resterà collegato per 60 giorni.</p>
    </form>
  );
}
