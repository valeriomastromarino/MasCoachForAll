// MasCoach wordmark: three speed lines (fatigue, fitness, HRV colours) and the name in a terminal-style
// monospace face with a terminal block cursor.

export function Logo({ size = 22 }: { size?: number }) {
  const bar = (w: number, offset: number, color: string) => (
    <i className="block rounded-full" style={{ width: w, height: Math.max(2, size * 0.12), marginLeft: offset, background: color }} />
  );
  return (
    <span
      className="inline-flex items-center"
      style={{ fontSize: size, color: "var(--foreground)", lineHeight: 1, fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
      aria-label="MasCoach"
    >
      <span className="inline-flex flex-col" style={{ gap: size * 0.13, marginRight: size * 0.38 }} aria-hidden>
        {bar(size * 0.82, 0, "var(--fatigue)")}
        {bar(size * 0.58, size * 0.24, "var(--fitness)")}
        {bar(size * 0.36, size * 0.46, "var(--hrv)")}
      </span>
      <span aria-hidden className="font-medium" style={{ letterSpacing: "-0.02em" }}>
        MasCoach
      </span>
      {/* Cursor drawn as a box sized to the cap height: the "▍" glyph renders taller than the letters. */}
      <span
        aria-hidden
        className="logo-cursor inline-block rounded-[1px]"
        style={{ width: size * 0.42, height: size * 0.74, marginLeft: size * 0.12, background: "var(--fitness)", opacity: 0.85 }}
      />
    </span>
  );
}
