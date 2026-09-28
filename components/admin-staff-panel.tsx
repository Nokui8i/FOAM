"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { useOpsPageReadyWhen } from "@/components/ops-boot";
import { isAdminEmail } from "@/lib/site-config";
import {
  assignableStaffRoles,
  banStaffMember,
  canChangeStaffRoles,
  canRemoveStaffMember,
  mergeStaffWithBootstrap,
  removeStaffMember,
  reviewStaffMember,
  staffRoleLabel,
  subscribeAllStaff,
  subscribeStaffBans,
  unbanStaffEmail,
  type StaffBan,
  type StaffProfile,
  type StaffRole,
} from "@/lib/staff-access";
import {
  buildDemoStaffVolume,
  isOpsDemoId,
  mergeDemoStaff,
} from "@/lib/ops-demo-volume";
import { useQueryReplace } from "@/lib/use-query-replace";
import { cn } from "@/lib/utils";

type StaffTab = "employees" | "pending" | "banned";

function statusLabel(row: StaffProfile) {
  if (isAdminEmail(row.email)) {
    return "Owner";
  }
  switch (row.status) {
    case "approved":
      return staffRoleLabel(row.role);
    case "denied":
      return "Denied";
    case "revoked":
      return "Revoked";
    default:
      return "Waiting for approval";
  }
}

function matchesStaffQuery(row: StaffProfile, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.displayName.toLowerCase().includes(q) ||
    row.email.toLowerCase().includes(q) ||
    row.role.toLowerCase().includes(q) ||
    staffRoleLabel(row.role).toLowerCase().includes(q) ||
    row.requestedPortal.toLowerCase().includes(q) ||
    (row.requestedPortal === "ops" ? "ops" : "driver").includes(q)
  );
}

function RoleOptions({ roles }: { roles: StaffRole[] }) {
  return (
    <>
      {roles.includes("admin") ? <option value="admin">Admin</option> : null}
      {roles.includes("manager") ? (
        <option value="manager">Manager</option>
      ) : null}
      {roles.includes("driver") ? <option value="driver">Driver</option> : null}
    </>
  );
}

export function AdminStaffPanel({
  adminEmail,
}: {
  adminEmail: string;
}) {
  const { searchParams, replaceQuery } = useQueryReplace();
  const [rows, setRows] = useState<StaffProfile[]>([]);
  const [bans, setBans] = useState<StaffBan[]>([]);
  const [demoRows, setDemoRows] = useState<StaffProfile[]>(() =>
    buildDemoStaffVolume() as StaffProfile[]
  );
  const [demoBans, setDemoBans] = useState<StaffBan[]>([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<StaffTab>(() => {
    const section = searchParams.get("section");
    if (section === "pending") return "pending";
    if (section === "banned") return "banned";
    return "employees";
  });
  const [queryText, setQueryText] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busyId, setBusyId] = useState("");
  const [roleDraft, setRoleDraft] = useState<Record<string, StaffRole>>({});
  useOpsPageReadyWhen(ready);

  const mayChangeRoles = canChangeStaffRoles(adminEmail);
  const allowedRoles = useMemo(
    () => assignableStaffRoles(adminEmail),
    [adminEmail]
  );

  useEffect(() => {
    const section = searchParams.get("section");
    if (section === "pending") setTab("pending");
    else if (section === "banned") setTab("banned");
    else if (section === "employees") setTab("employees");
  }, [searchParams]);

  useEffect(() => {
    const unsubStaff = subscribeAllStaff((next) => {
      setRows(mergeStaffWithBootstrap(next));
      setReady(true);
    });
    const unsubBans = subscribeStaffBans(setBans);
    return () => {
      unsubStaff();
      unsubBans();
    };
  }, []);

  const allRows = useMemo(
    () => mergeDemoStaff(rows, demoRows),
    [rows, demoRows]
  );

  const allBans = useMemo(() => {
    const map = new Map<string, StaffBan>();
    for (const row of bans) map.set(row.email, row);
    for (const row of demoBans) {
      if (!map.has(row.email)) map.set(row.email, row);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.email.localeCompare(b.email)
    );
  }, [bans, demoBans]);

  function selectStaffTab(next: StaffTab) {
    setTab(next);
    replaceQuery({
      section:
        next === "pending" ? "pending" : next === "banned" ? "banned" : null,
    });
  }

  const pending = useMemo(
    () =>
      allRows
        .filter((row) => row.status === "pending")
        .filter((row) => matchesStaffQuery(row, queryText)),
    [allRows, queryText]
  );
  const active = useMemo(
    () =>
      allRows
        .filter((row) => row.status === "approved")
        .filter((row) => matchesStaffQuery(row, queryText)),
    [allRows, queryText]
  );
  const other = useMemo(
    () =>
      allRows
        .filter(
          (row) => row.status === "denied" || row.status === "revoked"
        )
        .filter((row) => matchesStaffQuery(row, queryText)),
    [allRows, queryText]
  );
  const bannedFiltered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return allBans;
    return allBans.filter(
      (row) =>
        row.email.includes(q) ||
        row.bannedBy.toLowerCase().includes(q) ||
        row.reason.toLowerCase().includes(q)
    );
  }, [allBans, queryText]);

  const pendingTotal = useMemo(
    () => allRows.filter((row) => row.status === "pending").length,
    [allRows]
  );
  const activeTotal = useMemo(
    () => allRows.filter((row) => row.status === "approved").length,
    [allRows]
  );
  const bannedTotal = allBans.length;

  function draftRole(row: StaffProfile): StaffRole {
    const preferred = roleDraft[row.uid] ?? row.role;
    if (allowedRoles.includes(preferred)) return preferred;
    return allowedRoles[0] ?? "driver";
  }

  function isProtectedOwner(row: StaffProfile) {
    return isAdminEmail(row.email) || row.uid.startsWith("bootstrap:");
  }

  function patchDemoRow(
    uid: string,
    patch: Partial<StaffProfile> | null
  ) {
    setDemoRows((prev) => {
      if (patch === null) return prev.filter((row) => row.uid !== uid);
      return prev.map((row) =>
        row.uid === uid ? { ...row, ...patch } : row
      );
    });
  }

  async function review(
    row: StaffProfile,
    status: "approved" | "denied" | "revoked"
  ) {
    if (isProtectedOwner(row)) return;
    setError("");
    setOkMsg("");
    setBusyId(row.uid);
    try {
      const role = status === "approved" ? draftRole(row) : undefined;
      if (status === "approved" && role && !allowedRoles.includes(role)) {
        throw new Error("Role not allowed");
      }
      if (isOpsDemoId(row.uid)) {
        if (status === "denied") {
          patchDemoRow(row.uid, null);
          setOkMsg(
            `DEMO — ${row.displayName || row.email} denied. They can request again (local only).`
          );
        } else {
          patchDemoRow(row.uid, {
            status,
            role: role ?? row.role,
            reviewedBy: adminEmail || "demo",
          });
          setOkMsg(
            status === "approved"
              ? `DEMO — ${row.displayName || row.email} approved as ${staffRoleLabel(draftRole(row))} (local only).`
              : `DEMO — ${row.displayName || row.email} revoked (local only).`
          );
        }
        if (status === "approved") setTab("employees");
        return;
      }
      await reviewStaffMember(
        row.uid,
        { status, role },
        adminEmail || "admin"
      );
      setOkMsg(
        status === "approved"
          ? `${row.displayName || row.email} approved as ${staffRoleLabel(draftRole(row))}.`
          : status === "denied"
            ? `${row.displayName || row.email} denied. They can sign in and request again.`
            : `${row.displayName || row.email} access revoked.`
      );
      if (status === "approved") setTab("employees");
    } catch {
      setError("Could not update staff member.");
    } finally {
      setBusyId("");
    }
  }

  async function ban(row: StaffProfile) {
    if (isProtectedOwner(row)) return;
    const ok = window.confirm(
      `Ban ${row.email}?\n\nThey cannot request OPS or Driver access again until you Unban them.`
    );
    if (!ok) return;
    setBusyId(row.uid);
    setError("");
    setOkMsg("");
    try {
      if (isOpsDemoId(row.uid)) {
        patchDemoRow(row.uid, null);
        setDemoBans((prev) => [
          ...prev.filter((b) => b.email !== row.email),
          {
            email: row.email,
            bannedBy: adminEmail || "demo",
            reason: "DEMO ban",
          },
        ]);
        setOkMsg(`DEMO — ${row.email} banned (local only).`);
        setTab("banned");
        return;
      }
      await banStaffMember(row, adminEmail || "admin");
      setOkMsg(`${row.email} banned. They cannot request access until Unban.`);
      setTab("banned");
    } catch {
      setError("Could not ban this email.");
    } finally {
      setBusyId("");
    }
  }

  async function unban(email: string) {
    setBusyId(email);
    setError("");
    setOkMsg("");
    try {
      if (email.startsWith("demo.") || demoBans.some((b) => b.email === email)) {
        setDemoBans((prev) => prev.filter((b) => b.email !== email));
        if (!bans.some((b) => b.email === email)) {
          setOkMsg(`DEMO — ${email} unbanned (local only).`);
          return;
        }
      }
      await unbanStaffEmail(email);
      setOkMsg(`${email} unbanned. They can request access again.`);
    } catch {
      setError("Could not unban this email.");
    } finally {
      setBusyId("");
    }
  }

  async function saveRole(row: StaffProfile) {
    if (isProtectedOwner(row) || !mayChangeRoles) return;
    const nextRole = draftRole(row);
    if (nextRole === row.role) return;
    setBusyId(row.uid);
    setError("");
    setOkMsg("");
    try {
      if (isOpsDemoId(row.uid)) {
        patchDemoRow(row.uid, { role: nextRole, status: "approved" });
        setOkMsg(
          `DEMO — ${row.displayName || row.email} is now ${staffRoleLabel(nextRole)} (local only).`
        );
        return;
      }
      await reviewStaffMember(
        row.uid,
        { status: "approved", role: nextRole },
        adminEmail || "admin"
      );
      setOkMsg(
        `${row.displayName || row.email} is now ${staffRoleLabel(nextRole)}.`
      );
    } catch {
      setError("Could not change role.");
    } finally {
      setBusyId("");
    }
  }

  async function remove(row: StaffProfile) {
    if (!canRemoveStaffMember(adminEmail, row)) return;
    const ok = window.confirm(
      `Remove ${row.displayName || row.email}?\n\nThey will lose access to OPS and Driver immediately. They can request access again later (unless Banned).`
    );
    if (!ok) return;
    setBusyId(row.uid);
    setError("");
    setOkMsg("");
    try {
      if (isOpsDemoId(row.uid)) {
        patchDemoRow(row.uid, null);
        setOkMsg(`DEMO — ${row.displayName || row.email} removed (local only).`);
        return;
      }
      await removeStaffMember(row.uid, adminEmail);
      setOkMsg(`${row.displayName || row.email} removed.`);
    } catch {
      setError("Could not remove staff member.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="ops-catalog-plane ops-staff-plane">
      <header className="ops-catalog-plane-head">
        <div className="ops-catalog-plane-title-row">
          <h1 className="ops-list-title">Staff</h1>
        </div>
        <div className="ops-staff-toolbar">
          <div
            className="ops-filter-row is-alerts ops-staff-tabs"
            role="tablist"
            aria-label="Staff views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "employees"}
              className={cn(
                "ops-filter-chip",
                tab === "employees" && "is-active"
              )}
              onClick={() => selectStaffTab("employees")}
            >
              Employees
              <span className="ops-radio-count">{activeTotal}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "pending"}
              className={cn("ops-filter-chip", tab === "pending" && "is-active")}
              onClick={() => selectStaffTab("pending")}
            >
              Pending
              <span className="ops-radio-count">{pendingTotal}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "banned"}
              className={cn("ops-filter-chip", tab === "banned" && "is-active")}
              onClick={() => selectStaffTab("banned")}
            >
              Banned
              <span className="ops-radio-count">{bannedTotal}</span>
            </button>
          </div>
          <label className="ops-search ops-staff-search">
            <Search size={16} aria-hidden />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search name, email, or role"
              aria-label="Search staff"
            />
          </label>
        </div>
      </header>

      {(okMsg || error) && (
        <p className={cn("ops-flash", error ? "is-error" : "is-ok")}>
          {error || okMsg}
        </p>
      )}

      <div className="ops-staff-sections">
        {tab === "pending" ? (
          <section className="ops-staff-section" role="tabpanel">
            {pending.length === 0 ? (
              <p className="ops-staff-empty">
                {queryText.trim()
                  ? "No pending matches."
                  : "No pending requests."}
              </p>
            ) : (
              <div className="ops-staff-table">
                <div className="ops-staff-table-head">
                  <span>Name</span>
                  <span>Email</span>
                  <span>Requested</span>
                  <span>Role</span>
                  <span>Actions</span>
                </div>
                {pending.map((row) => (
                  <div key={row.uid} className="ops-staff-table-row">
                    <strong>{row.displayName || "—"}</strong>
                    <span>{row.email}</span>
                    <span className="ops-staff-portal">
                      {row.requestedPortal === "ops" ? "OPS" : "Driver"}
                    </span>
                    <label className="ops-staff-role">
                      <span className="sr-only">Role</span>
                      <select
                        value={draftRole(row)}
                        disabled={allowedRoles.length <= 1}
                        onChange={(e) =>
                          setRoleDraft((prev) => ({
                            ...prev,
                            [row.uid]: e.target.value as StaffRole,
                          }))
                        }
                      >
                        <RoleOptions roles={allowedRoles} />
                      </select>
                    </label>
                    <div className="ops-staff-actions">
                      <button
                        type="button"
                        className="ops-catalog-editor-btn is-secondary"
                        disabled={busyId === row.uid}
                        onClick={() => void review(row, "denied")}
                      >
                        Deny
                      </button>
                      <button
                        type="button"
                        className="ops-catalog-editor-btn is-secondary"
                        disabled={busyId === row.uid}
                        onClick={() => void ban(row)}
                      >
                        Ban
                      </button>
                      <button
                        type="button"
                        className="ops-catalog-editor-btn"
                        disabled={busyId === row.uid}
                        onClick={() => void review(row, "approved")}
                      >
                        {busyId === row.uid ? "Saving…" : "Approve"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : tab === "banned" ? (
          <section className="ops-staff-section" role="tabpanel">
            {bannedFiltered.length === 0 ? (
              <p className="ops-staff-empty">
                {queryText.trim() ? "No banned matches." : "No banned emails."}
              </p>
            ) : (
              <div className="ops-staff-table">
                <div className="ops-staff-table-head">
                  <span>Email</span>
                  <span>Banned by</span>
                  <span>Reason</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {bannedFiltered.map((row) => (
                  <div key={row.email} className="ops-staff-table-row">
                    <strong>{row.email}</strong>
                    <span>{row.bannedBy || "—"}</span>
                    <span>{row.reason || "—"}</span>
                    <span className="ops-status-pill">Banned</span>
                    <div className="ops-staff-actions">
                      <button
                        type="button"
                        className="ops-catalog-editor-btn"
                        disabled={busyId === row.email}
                        onClick={() => void unban(row.email)}
                      >
                        {busyId === row.email ? "Working…" : "Unban"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="ops-staff-section" role="tabpanel">
            {active.length === 0 ? (
              <p className="ops-staff-empty">
                {queryText.trim()
                  ? "No employee matches."
                  : "No employees yet."}
              </p>
            ) : (
              <div className="ops-staff-table">
                <div className="ops-staff-table-head">
                  <span>Name</span>
                  <span>Email</span>
                  <span>Role</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {active.map((row) => {
                  const locked = isProtectedOwner(row);
                  const canEditRole = mayChangeRoles && !locked;
                  const canRemove = canRemoveStaffMember(adminEmail, row);
                  return (
                    <div
                      key={row.uid}
                      className="ops-staff-table-row is-employee"
                    >
                      <strong className="ops-staff-name">
                        {row.displayName || "—"}
                      </strong>
                      <span className="ops-staff-email">{row.email}</span>
                      {canEditRole ? (
                        <label className="ops-staff-role ops-staff-role-cell">
                          <span className="sr-only">Role</span>
                          <select
                            value={draftRole(row)}
                            onChange={(e) =>
                              setRoleDraft((prev) => ({
                                ...prev,
                                [row.uid]: e.target.value as StaffRole,
                              }))
                            }
                          >
                            <RoleOptions roles={allowedRoles} />
                          </select>
                        </label>
                      ) : (
                        <span className="ops-staff-role-cell">
                          {staffRoleLabel(row.role)}
                        </span>
                      )}
                      <span className="ops-status-pill is-ok ops-staff-status">
                        {statusLabel(row)}
                      </span>
                      <div className="ops-staff-actions">
                        {locked ? (
                          <span className="ops-staff-locked">Owner · locked</span>
                        ) : (
                          <>
                            {canEditRole ? (
                              <button
                                type="button"
                                className="ops-catalog-editor-btn is-secondary"
                                disabled={
                                  busyId === row.uid ||
                                  draftRole(row) === row.role
                                }
                                onClick={() => void saveRole(row)}
                              >
                                Save role
                              </button>
                            ) : null}
                            {canRemove ? (
                              <button
                                type="button"
                                className="ops-catalog-editor-btn is-secondary"
                                disabled={busyId === row.uid}
                                onClick={() => void remove(row)}
                              >
                                {busyId === row.uid ? "Removing…" : "Remove"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="ops-catalog-editor-btn is-secondary"
                              disabled={busyId === row.uid}
                              onClick={() => void ban(row)}
                            >
                              Ban
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {other.length > 0 ? (
              <div className="ops-staff-denied-block">
                <h2>Denied / revoked</h2>
                <div className="ops-staff-table">
                  <div className="ops-staff-table-head">
                    <span>Name</span>
                    <span>Email</span>
                    <span>Requested</span>
                    <span>Status</span>
                    <span>Actions</span>
                  </div>
                  {other.map((row) => {
                    const canRemove = canRemoveStaffMember(adminEmail, row);
                    return (
                      <div key={row.uid} className="ops-staff-table-row">
                        <strong>{row.displayName || "—"}</strong>
                        <span>{row.email}</span>
                        <span className="ops-staff-portal">
                          {row.requestedPortal === "ops" ? "OPS" : "Driver"}
                        </span>
                        <span className="ops-status-pill">
                          {statusLabel(row)}
                        </span>
                        <div className="ops-staff-actions">
                          <button
                            type="button"
                            className="ops-catalog-editor-btn is-secondary"
                            disabled={busyId === row.uid}
                            onClick={() => void review(row, "denied")}
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            className="ops-catalog-editor-btn is-secondary"
                            disabled={busyId === row.uid}
                            onClick={() => void ban(row)}
                          >
                            Ban
                          </button>
                          {canRemove ? (
                            <button
                              type="button"
                              className="ops-catalog-editor-btn is-secondary"
                              disabled={busyId === row.uid}
                              onClick={() => void remove(row)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </section>
  );
}

export function countPendingStaff(rows: StaffProfile[]) {
  return rows.filter((row) => row.status === "pending").length;
}
