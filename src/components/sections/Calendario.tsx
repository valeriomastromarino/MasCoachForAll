"use client";

// The calendar as a page of its own (the phone app's second tab).
import { Calendar } from "../calendar/Calendar";
import { SectionPage } from "./SectionPage";

export default function Calendario() {
  return (
    <SectionPage id="oggi" heading={false}>
      {(data) => <Calendar dashboard={data} />}
    </SectionPage>
  );
}
