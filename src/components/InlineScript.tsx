"use client";

// A script that runs while the HTML is parsed, before the first paint (Next guide "Preventing flash before hydration").
// Server HTML: an ordinary script. When React renders it in the browser (hot reload, a later client render) it becomes
// text/plain, so React doesn't warn about a script tag it would never run; suppressHydrationWarning accepts the different type.
export function InlineScript({ html }: { html: string }) {
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
