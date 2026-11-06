"use client";

import { useCompact } from "@/lib/compact";
import { Dashboard } from "./Dashboard";
import { OggiCompact } from "./OggiCompact";
import { SectionPage } from "./SectionPage";

export default function Oggi() {
  const compact = useCompact();
  return (
    <SectionPage id="oggi" heading={false}>
      {(data) => {
        if (compact) return <OggiCompact data={data} />;
        return <Dashboard data={data} />;
      }}
    </SectionPage>
  );
}
