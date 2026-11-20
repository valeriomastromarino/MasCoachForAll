"use client";

// «Piano», the second page of the phone app (design D «Azione», 19 November 2026): the week and the season are the same plan,
// so the calendar (Settimana) and the season (Stagione) are two views of one page. /calendario and /stagione are its addresses.
import { useEffect } from "react";
import { Calendar } from "../calendar/Calendar";
import { replacePath } from "../nav/replacePath";
import { Segmented } from "../nav/Segmented";
import { rememberPiano } from "../nav/tabs";
import { useCurrentPath } from "../nav/useCurrentPath";
import { PageTitle, SectionPage } from "./SectionPage";
import { SeasonBody } from "./Stagione";

const VIEWS = [
  { id: "settimana", label: "Settimana", href: "/calendario" },
  { id: "stagione", label: "Stagione", href: "/stagione" },
];

export default function Piano() {
  const path = useCurrentPath();
  const season = path === "/stagione";
  useEffect(() => rememberPiano(path), [path]);
  return (
    <SectionPage
      id="oggi"
      heading={false}
      title={
        <>
          <PageTitle>Piano</PageTitle>
          {/* The two views replace each other: Back leaves the page, it does not go from the season to the week. */}
          <Segmented label="Vista del piano" items={VIEWS} current={season ? "stagione" : "settimana"} onPick={(v) => replacePath(v.href)} />
        </>
      }
    >
      {(data) => (season ? <SeasonBody data={data} /> : <Calendar dashboard={data} />)}
    </SectionPage>
  );
}
