"use client";

// The coach: a chat with Claude Haiku (online) or, without it, with the app's own rules. Writes to Intervals.icu only after a "sì".
import { useCompact } from "@/lib/compact";
import { CoachChat } from "../coach/Chat";
import { SectionPage } from "./SectionPage";

export default function Coach() {
  const compact = useCompact();
  return (
    <SectionPage id="coach" heading={!compact}>
      {(data) => (
        <div className="max-w-3xl space-y-4">
          <CoachChat data={data} />
        </div>
      )}
    </SectionPage>
  );
}
