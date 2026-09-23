"use client";

import { AdminAlertsPanel } from "@/components/admin-alerts-panel";
import { AdminContactsPanel } from "@/components/admin-contacts-panel";
import { useQueryReplace } from "@/lib/use-query-replace";

type MobileView = "list" | "detail";

export function AdminSupportPanel({
  adminEmail,
  mobileView,
  onMobileViewChange,
  alertsTodoCount = 0,
  onAlertsTodoCountChange,
}: {
  adminEmail: string;
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
  alertsTodoCount?: number;
  onAlertsTodoCountChange?: (count: number) => void;
}) {
  const { searchParams } = useQueryReplace();
  const section = searchParams.get("section") === "alerts" ? "alerts" : "messages";

  if (section === "alerts") {
    return (
      <AdminAlertsPanel
        adminEmail={adminEmail}
        mobileView={mobileView}
        onMobileViewChange={onMobileViewChange}
        alertCount={alertsTodoCount}
        onTodoCountChange={onAlertsTodoCountChange}
      />
    );
  }

  return (
    <AdminContactsPanel
      mobileView={mobileView}
      onMobileViewChange={onMobileViewChange}
      alertCount={alertsTodoCount}
    />
  );
}
