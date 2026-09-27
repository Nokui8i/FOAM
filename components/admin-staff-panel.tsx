"use client";

import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";

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

function statusLabel(row: StaffProfile) {
  if (isAdminEmail(row.email) && row.uid.startsWith("bootstrap:")) {
    return "Allowlist";
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

export function AdminStaffPanel({
  adminEmail,
}: {
  adminEmail: string;
}) {
  const [rows, setRows] = useState<StaffProfile[]>([]);
  const [ready, setReady] = useState(false);
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
    () => rows.filter((row) => row.status === "pending"),
    [rows]
  );
  const active = useMemo(
    () => rows.filter((row) => row.status === "approved"),
    [rows]
  );
  const other = useMemo(
    () =>
      rows.filter(
        (row) => row.status === "denied" || row.status === "revoked"
      ),
    [rows]
  );

  function draftRole(row: StaffProfile): StaffRole {
    return roleDraft[row.uid] ?? row.role;
  }

  /** Code allowlist admins cannot be demoted/fired from this UI. */
  function isProtectedAdmin(row: StaffProfile) {
    return isAdminEmail(row.email) || row.uid.startsWith("bootstrap:");
  }

  async function review(
    row: StaffProfile,
    status: "approved" | "denied" | "revoked"
  ) {
    if (isProtectedAdmin(row)) return;
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
    } catch {
      setError("Could not update staff member.");
    } finally {
      setBusyId("");
    }
  }

  async function saveRole(row: StaffProfile) {
    if (isProtectedAdmin(row)) return;
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
    if (isProtectedAdmin(row)) return;
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
          <div className="ops-catalog-plane-chip is-meta" aria-current="page">
            <span className="ops-catalog-plane-chip-icon" aria-hidden>
              <Users size={16} />
            </span>
            <span className="ops-catalog-plane-chip-copy">
              <strong>
                {pending.length} pending · {active.length} active
              </strong>
            </span>
          </div>
        </div>
      </header>

      {(okMsg || error) && (
        <p className={cn("ops-flash", error ? "is-error" : "is-ok")}>
          {error || okMsg}
        </p>
      )}

      <div className="ops-staff-sections">
        <section className="ops-staff-section">
          <h2>Waiting for approval</h2>
          {pending.length === 0 ? (
            <p className="ops-staff-empty">No pending requests.</p>
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

        <section className="ops-staff-section">
          <h2>Active</h2>
          {active.length === 0 ? (
            <p className="ops-staff-empty">No active staff yet.</p>
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
                const locked = isProtectedAdmin(row);
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
                        <span className="ops-staff-locked">OPS allowlist</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="ops-catalog-editor-btn is-secondary"
                            disabled={
                              busyId === row.uid || draftRole(row) === row.role
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
        </section>

        {other.length > 0 ? (
          <section className="ops-staff-section">
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
                  <span className="ops-status-pill">{statusLabel(row)}</span>
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
          </section>
        ) : null}
      </div>
    </section>
  );
}

export function countPendingStaff(rows: StaffProfile[]) {
  return rows.filter((row) => row.status === "pending").length;
}
