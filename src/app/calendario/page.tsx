"use client";

// The calendar on its own page: the phone app's home is short, the full calendar lives here (under "Altro").
import { Calendar } from "@/components/calendar/Calendar";
import { SectionPage } from "@/components/sections/SectionPage";

export default function Page() {
  return (
    <SectionPage id="oggi" heading={false}>
      {(data) => <Calendar dashboard={data} />}
    </SectionPage>
  );
}
