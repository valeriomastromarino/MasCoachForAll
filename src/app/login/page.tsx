import { Suspense } from "react";
import { Logo } from "@/components/brand/Logo";
import { authMode } from "@/lib/auth/session";
import { LoginFields, LoginForm } from "./LoginForm";

// Covers the whole window, navigation included: nothing of the app shows before the password.
export default function Page() {
  const locked = authMode() === "locked";
  return (
    <main className="fixed inset-0 z-50 flex items-center justify-center overflow-auto px-4" style={{ background: "var(--background)" }}>
      <section className="card w-full max-w-sm p-6">
        <Logo size={24} />
        {locked ? (
          <p className="mt-5 text-sm text-muted">
            App bloccata: manca la password. Su Vercel aggiungi la variabile <b className="font-medium">APP_PASSWORD</b> e
            ripubblica.
          </p>
        ) : (
          <Suspense fallback={<LoginFields next="/" error={false} />}>
            <LoginForm />
          </Suspense>
        )}
      </section>
    </main>
  );
}
