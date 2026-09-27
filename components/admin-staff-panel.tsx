"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { useOpsPageReadyWhen } from "@/components/ops-boot";
import { isAdminEmail } from "@/lib/site-config";
import {
  mergeStaffWithBootstrap,
  removeStaffMember,
  reviewStaffMember,
  staffRoleLabel,
  subscribeAllStaff,
  type StaffProfile,
  type StaffRole,
} from "@/lib/staff-access";
import { cn } from "@/lib/utils";

type StaffTab = "employees" | "pending";

function statusLabel(row: StaffProfile) {
  if (isAdminEmail(row.email)) {
    return "Owner";
  }
  switch (row.status) {
    case "approved":
      return "Active";
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

export function AdminStaffPanel({
  adminEmail,
}: {
  adminEmail: string;
}) {
  const [rows, setRows] = useState<StaffProfile[]>([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<StaffTab>("employees");
  const [queryText, setQueryText] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busyId, setBusyId] = useState("");
  const [roleDraft, setRoleDraft] = useState<Record<string, StaffRole>>({});
  useOpsPageReadyWhen(ready);

  useEffect(() => {
    return subscribeAllStaff((next) => {
      setRows(mergeStaffWithBootstrap(next));
      setReady(true);
    });
  }, []);

  const pending = useMemo(
    () =>
      rows
        .filter((row) => row.status === "pending")
        .filter((row) => matchesStaffQuery(row, queryText)),
    [rows, queryText]
  );
  const active = useMemo(
    () =>
      rows
        .filter((row) => row.status === "approved")
        .filter((row) => matchesStaffQuery(row, queryText)),
    [rows, queryText]
  );
  const other = useMemo(
    () =>
      rows
        .filter(
          (row) => row.status === "denied" || row.status === "revoked"
        )
        .filter((row) => matchesStaffQuery(row, queryText)),
    [rows, queryText]
  );

  const pendingTotal = useMemo(
    () => rows.filter((row) => row.status === "pending").length,
    [rows]
  );
  const activeTotal = useMemo(
    () => rows.filter((row) => row.status === "approved").length,
    [rows]
  );

  function draftRole(row: StaffProfile): StaffRole {
    return roleDraft[row.uid] ?? row.role;
  }

  function isProtectedOwner(row: StaffProfile) {
    return isAdminEmail(row.email) || row.uid.startsWith("bootstrap:");
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
      await reviewStaffMember(
        row.uid,
        {
          status,
          role: status === "approved" ? draftRole(row) : undefined,
        },
        adminEmail || "admin"
      );
      setOkMsg(
        status === "approved"
          ? `${row.displayName || row.email} approved as ${staffRoleLabel(draftRole(row))}.`
          : status === "denied"
            ? `${row.displayName || row.email} denied.`
            : `${row.displayName || row.email} access revoked.`
      );
      if (status === "approved" || status === "denied") {
        setTab(status === "approved" ? "employees" : "pending");
      }
    } catch {
      setError("Could not update staff member.");
    } finally {
      setBusyId("");
    }
  }

  async function saveRole(row: StaffProfile) {
    if (isProtectedOwner(row)) return;
    const nextRole = draftRole(row);
    if (nextRole === row.role) return;
    setBusyId(row.uid);
    setError("");
    setOkMsg("");
    try {
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
    if (isProtectedOwner(row)) return;
    const ok = window.confirm(
      `Remove ${row.displayName || row.email}?\n\nThey will lose access to OPS and Driver immediately. They can request access again later.`
    );
    if (!ok) return;
    setBusyId(row.uid);
    setError("");
    setOkMsg("");
    try {
      await removeStaffMember(row.uid);
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
        <div
          className="ops-filter-row is-alerts ops-staff-tabs"
          role="tablist"
          aria-label="Staff views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "employees"}
            className={cn("ops-filter-chip", tab === "employees" && "is-active")}
            onClick={() => setTab("employees")}
          >
            Employees
            <span className="ops-radio-count">{activeTotal}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pending"}
            className={cn("ops-filter-chip", tab === "pending" && "is-active")}
            onClick={() => setTab("pending")}
          >
            Pending
            <span className="ops-radio-count">{pendingTotal}</span>
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
                        onChange={(e) =>
                          setRoleDraft((prev) => ({
                            ...prev,
                            [row.uid]: e.target.value as StaffRole,
                          }))
                        }
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="driver">Driver</option>
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
                  return (
                    <div key={row.uid} className="ops-staff-table-row">
                      <strong>{row.displayName || "—"}</strong>
                      <span>{row.email}</span>
                      {locked ? (
                        <span>{staffRoleLabel(row.role)}</span>
                      ) : (
                        <label className="ops-staff-role">
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
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="driver">Driver</option>
                          </select>
                        </label>
                      )}
                      <span className="ops-status-pill is-ok">
                        {statusLabel(row)}
                      </span>
                      <div className="ops-staff-actions">
                        {locked ? (
                          <span className="ops-staff-locked">Owner · locked</span>
                        ) : (
                          <>
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
                            <button
                              type="button"
                              className="ops-catalog-editor-btn is-secondary"
                              disabled={busyId === row.uid}
                              onClick={() => void remove(row)}
                            >
                              {busyId === row.uid ? "Removing…" : "Remove"}
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
                  {other.map((row) => (
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
                          className="ops-catalog-editor-btn"
                          disabled={busyId === row.uid}
                          onClick={() => void review(row, "approved")}
                        >
                          Re-approve
                        </button>
                        <button
                          type="button"
                          className="ops-catalog-editor-btn is-secondary"
                          disabled={busyId === row.uid}
                          onClick={() => void remove(row)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
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
