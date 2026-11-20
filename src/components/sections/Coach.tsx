"use client";

// The coach: a chat with Claude Haiku (online) or, without it, with the app's own rules. Writes to Intervals.icu only after a "sì".
import { useCompact } from "@/lib/compact";
import { CoachChat } from "../coach/Chat";
import { useDashboard } from "../data/remote";
import { PageTitle, SectionPage } from "./SectionPage";

export default function Coach() {
  const compact = useCompact();
  const { data, error } = useDashboard();
  // Phone app: the chat fills the page, with the box to write in always at the bottom.
  if (compact)
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 pb-2 pt-4">
        {data ? (
          <CoachChat data={data} />
        ) : (
          <>
            <PageTitle>Coach</PageTitle>
            <p className="mt-3 text-sm text-muted">{error ?? "Carico i dati…"}</p>
          </>
        )}
      </div>
    );
  return (
    <SectionPage id="coach">
      {(d) => (
        <div className="max-w-3xl space-y-4">
          <CoachChat data={d} />
        </div>
      )}
    </SectionPage>
  );
}
