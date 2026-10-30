import { capitalize } from "@/lib/text";

export { capitalize };

export function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}'`;
}

export function fmtSecsLabel(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}'`;
  return `${Math.round(secs / 360) / 10}h`;
}

export function fmtDay(iso: string): string {
  return new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}


/** "Ott 26": month axis labels on year-long charts. */
export function fmtMonth(iso: string): string {
  return capitalize(new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("it-IT", { month: "short", year: "2-digit" }));
}

/** "Ottobre": full month name from YYYY-MM. */
export function fmtMonthName(ym: string): string {
  return capitalize(new Date(ym + "-15T12:00:00").toLocaleDateString("it-IT", { month: "long" }));
}

export function fmtWeekday(iso: string): string {
  return capitalize(
    new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
  );
}

export function fmt(x: number | null | undefined, digits = 0, unit = ""): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "–";
  return x.toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + unit;
}

/** Elapsed time as h:mm:ss (or m:ss under an hour). */
export function fmtClock(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return (h > 0 ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
}

export function fmtTime(iso: string): string {
  return iso.slice(11, 16);
}
