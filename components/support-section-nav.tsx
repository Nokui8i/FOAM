"use client";

import { useQueryReplace } from "@/lib/use-query-replace";
import { cn } from "@/lib/utils";

type SupportSection = "messages" | "alerts";

function parseSection(raw: string | null): SupportSection {
  return raw === "alerts" ? "alerts" : "messages";
}

export function SupportSectionNav({ alertCount = 0 }: { alertCount?: number }) {
  const { searchParams, replaceQuery } = useQueryReplace();
  const section = parseSection(searchParams.get("section"));

  function setSection(next: SupportSection) {
    replaceQuery({
      section: next === "messages" ? null : next,
      filter: null,
      id: null,
      view: null,
    });
  }

  return (
    <div className="ops-support-tabs" role="tablist" aria-label="Support sections">
      <button
        type="button"
        role="tab"
        aria-selected={section === "messages"}
        className={cn("ops-support-tab", section === "messages" && "is-active")}
        onClick={() => setSection("messages")}
      >
        Messages
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={section === "alerts"}
        className={cn("ops-support-tab", section === "alerts" && "is-active")}
        onClick={() => setSection("alerts")}
      >
        Alerts
        {alertCount > 0 ? (
          <b className="ops-support-tab-count">{alertCount}</b>
        ) : null}
      </button>
    </div>
  );
}
