"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

import { useOpsPageReadyWhen } from "@/components/ops-boot";
import { isAdminEmail } from "@/lib/site-config";
import {
  assignableStaffRoles,
  banStaffMember,
  canChangeStaffRoles,
  canRemoveStaffMember,
  fetchStaffProfileFromServer,
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
  type StaffStatus,
} from "@/lib/staff-access";
import { useQueryReplace } from "@/lib/use-query-replace";
import { cn } from "@/lib/utils";

type StaffTab = "employees" | "pending" | "banned";

type StaffConfirm =
  | { kind: "approve" | "deny" | "ban" | "remove"; row: StaffProfile }
  | { kind: "unban"; email: string };

type StaffPatch = Partial<Pick<StaffProfile, "status" | "role" | "reviewedBy">> | "removed";

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
  onPendingCountChange,
}: {
  adminEmail: string;
  onPendingCountChange?: (count: number) => void;
}) {
  const { searchParams, replaceQuery } = useQueryReplace();
  const [rows, setRows] = useState<StaffProfile[]>([]);
  const [bans, setBans] = useState<StaffBan[]>([]);
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
  const [confirmAction, setConfirmAction] = useState<StaffConfirm | null>(null);
  /** Employees table: click Role to group Admin → Manager → Driver (toggle reverse). */
  const [roleSort, setRoleSort] = useState<"asc" | "desc">("asc");
  const serverRowsRef = useRef<StaffProfile[]>([]);
  const patchesRef = useRef<Map<string, StaffPatch>>(new Map());
  useOpsPageReadyWhen(ready);

  function publishRows(serverRows: StaffProfile[]) {
    serverRowsRef.current = serverRows;
    let next = mergeStaffWithBootstrap(serverRows);
    for (const [uid, patch] of patchesRef.current) {
      if (patch === "removed") {
        // If the uid reappears on the server (e.g. deleted employee re-requests
        // access), clear the stale optimistic remove so Pending can show again.
        if (serverRows.some((r) => r.uid === uid)) {
          patchesRef.current.delete(uid);
        } else {
          next = next.filter((r) => r.uid !== uid);
        }
        continue;
      }
      const idx = next.findIndex((r) => r.uid === uid);
      if (idx < 0) continue;
      next[idx] = { ...next[idx], ...patch };
      const server = serverRows.find((r) => r.uid === uid);
      if (
        server &&
        (!patch.status || server.status === patch.status) &&
        (!patch.role || server.role === patch.role)
      ) {
        patchesRef.current.delete(uid);
      }
    }
    setRows(next);
    onPendingCountChange?.(
      next.filter((row) => row.status === "pending").length
    );
  }

  useEffect(() => {
    if (!confirmAction) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyId) setConfirmAction(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmAction, busyId]);

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
      publishRows(next);
      setReady(true);
    });
    const unsubBans = subscribeStaffBans(setBans);
    return () => {
      unsubStaff();
      unsubBans();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once; publishRows reads refs
  }, []);

  const allRows = rows;
  const allBans = useMemo(
    () => [...bans].sort((a, b) => a.email.localeCompare(b.email)),
    [bans]
  );

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
  const active = useMemo(() => {
    const rows = allRows
      .filter((row) => row.status === "approved")
      .filter((row) => matchesStaffQuery(row, queryText));
    const rank = (role: StaffRole) =>
      role === "admin" ? 0 : role === "manager" ? 1 : 2;
    const dir = roleSort === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const byRole = (rank(a.role) - rank(b.role)) * dir;
      if (byRole !== 0) return byRole;
      return (a.displayName || a.email).localeCompare(
        b.displayName || b.email
      );
    });
  }, [allRows, queryText, roleSort]);
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

  async function review(
    row: StaffProfile,
    status: "approved" | "denied" | "revoked"
  ) {
    if (isProtectedOwner(row)) return;
    setError("");
    setOkMsg("");
    const role = status === "approved" ? draftRole(row) : undefined;
    if (status === "approved" && role && !allowedRoles.includes(role)) {
      setError("Role not allowed");
      setConfirmAction(null);
      return;
    }

    // Close the modal immediately — don't wait on Firebase round-trips.
    setConfirmAction(null);
    setBusyId("");

    // Optimistic list update so Pending/Employees move instantly.
    if (status === "denied") {
      patchesRef.current.set(row.uid, "removed");
    } else {
      patchesRef.current.set(row.uid, {
        status: status as StaffStatus,
        role: role ?? row.role,
        reviewedBy: adminEmail || "admin",
      });
    }
    publishRows(serverRowsRef.current);
    setOkMsg(
      status === "approved"
        ? `${row.displayName || row.email} approved as ${staffRoleLabel(draftRole(row))}.`
        : status === "denied"
          ? `${row.displayName || row.email} denied. They can sign in and request again.`
          : `${row.displayName || row.email} access revoked.`
    );
    if (status === "approved") selectStaffTab("employees");

    try {
      await reviewStaffMember(
        row.uid,
        { status, role },
        adminEmail || "admin",
        row.email
      );
      if (status === "denied") {
        patchesRef.current.set(row.uid, "removed");
        publishRows(
          serverRowsRef.current.filter((r) => r.uid !== row.uid)
        );
      } else {
        const confirmed = await fetchStaffProfileFromServer(row.uid);
        if (confirmed) {
          patchesRef.current.delete(row.uid);
          publishRows(
            serverRowsRef.current.map((r) =>
              r.uid === row.uid ? confirmed : r
            )
          );
        }
      }
    } catch {
      patchesRef.current.delete(row.uid);
      publishRows(serverRowsRef.current);
      setError("Could not update staff member. Refresh if the list looks wrong.");
    }
  }

  async function ban(row: StaffProfile) {
    if (isProtectedOwner(row)) return;
    setError("");
    setOkMsg("");
    setConfirmAction(null);
    setBusyId("");

    patchesRef.current.set(row.uid, "removed");
    publishRows(serverRowsRef.current);
    setBans((prev) => {
      if (prev.some((b) => b.email === row.email)) return prev;
      return [
        ...prev,
        {
          email: row.email,
          bannedBy: adminEmail || "admin",
          reason: "Spam / blocked by ops",
        },
      ].sort((a, b) => a.email.localeCompare(b.email));
    });
    setOkMsg(`${row.email} banned. They cannot request access until Unban.`);
    selectStaffTab("banned");

    try {
      await banStaffMember(row, adminEmail || "admin");
      patchesRef.current.set(row.uid, "removed");
      publishRows(serverRowsRef.current.filter((r) => r.uid !== row.uid));
    } catch {
      patchesRef.current.delete(row.uid);
      publishRows(serverRowsRef.current);
      setError("Could not ban this email. Refresh if the list looks wrong.");
    }
  }

  async function unban(email: string) {
    setError("");
    setOkMsg("");
    setConfirmAction(null);
    setBusyId("");

    setBans((prev) => prev.filter((b) => b.email !== email));
    setOkMsg(`${email} unbanned. They can request access again.`);

    try {
      await unbanStaffEmail(email);
    } catch {
      setError("Could not unban this email. Refresh if the list looks wrong.");
    }
  }

  async function saveRole(row: StaffProfile) {
    if (isProtectedOwner(row) || !mayChangeRoles) return;
    const nextRole = draftRole(row);
    if (nextRole === row.role) return;
    setError("");
    setOkMsg("");

    patchesRef.current.set(row.uid, {
      role: nextRole,
      status: "approved",
    });
    publishRows(serverRowsRef.current);
    setOkMsg(
      `${row.displayName || row.email} is now ${staffRoleLabel(nextRole)}.`
    );

    try {
      await reviewStaffMember(
        row.uid,
        { status: "approved", role: nextRole },
        adminEmail || "admin",
        row.email
      );
      const confirmed = await fetchStaffProfileFromServer(row.uid);
      if (confirmed) {
        patchesRef.current.delete(row.uid);
        publishRows(
          serverRowsRef.current.map((r) =>
            r.uid === row.uid ? confirmed : r
          )
        );
      }
    } catch {
      patchesRef.current.delete(row.uid);
      publishRows(serverRowsRef.current);
      setError("Could not change role. Refresh if the list looks wrong.");
    }
  }

  async function remove(row: StaffProfile) {
    if (!canRemoveStaffMember(adminEmail, row)) return;
    setError("");
    setOkMsg("");
    setConfirmAction(null);
    setBusyId("");

    patchesRef.current.set(row.uid, "removed");
    publishRows(serverRowsRef.current);
    setOkMsg(`${row.displayName || row.email} removed.`);

    try {
      await removeStaffMember(row.uid, adminEmail, row);
      patchesRef.current.set(row.uid, "removed");
      publishRows(serverRowsRef.current.filter((r) => r.uid !== row.uid));
    } catch {
      patchesRef.current.delete(row.uid);
      publishRows(serverRowsRef.current);
      setError("Could not remove staff member. Refresh if the list looks wrong.");
    }
  }

  async function confirmStaffAction() {
    if (!confirmAction) return;
    if (confirmAction.kind === "unban") {
      await unban(confirmAction.email);
      return;
    }
    if (confirmAction.kind === "approve") {
      await review(confirmAction.row, "approved");
      return;
    }
    if (confirmAction.kind === "deny") {
      await review(confirmAction.row, "denied");
      return;
    }
    if (confirmAction.kind === "ban") {
      await ban(confirmAction.row);
      return;
    }
    if (confirmAction.kind === "remove") {
      await remove(confirmAction.row);
    }
  }

  function confirmCopy(action: StaffConfirm) {
    if (action.kind === "unban") {
      return {
        title: "Unban this email?",
        body: (
          <>
            <p>
              Unban <strong>{action.email}</strong>?
            </p>
            <p className="ops-confirm-note">
              They will be able to request OPS or Driver access again.
            </p>
          </>
        ),
        confirmLabel: "Unban",
        danger: false,
      };
    }
    const name = action.row.displayName || action.row.email;
    if (action.kind === "approve") {
      const role = staffRoleLabel(draftRole(action.row));
      return {
        title: "Approve access?",
        body: (
          <>
            <p>
              Approve <strong>{name}</strong> as <strong>{role}</strong>?
            </p>
            <p className="ops-confirm-meta">{action.row.email}</p>
            <p className="ops-confirm-note">
              {draftRole(action.row) === "driver"
                ? "They will get Driver access only."
                : "They will get OPS and Driver access."}
            </p>
          </>
        ),
        confirmLabel: "Approve",
        danger: false,
      };
    }
    if (action.kind === "deny") {
      return {
        title: "Deny this request?",
        body: (
          <>
            <p>
              Deny <strong>{name}</strong>?
            </p>
            <p className="ops-confirm-meta">{action.row.email}</p>
            <p className="ops-confirm-note">
              Their request is cleared. They can sign in and ask again later.
            </p>
          </>
        ),
        confirmLabel: "Deny",
        danger: true,
      };
    }
    if (action.kind === "ban") {
      return {
        title: "Ban this email?",
        body: (
          <>
            <p>
              Ban <strong>{action.row.email}</strong>?
            </p>
            <p className="ops-confirm-note">
              They cannot request OPS or Driver access again until you Unban
              them.
            </p>
          </>
        ),
        confirmLabel: "Ban",
        danger: true,
      };
    }
    return {
      title: "Remove staff access?",
      body: (
        <>
          <p>
            Remove <strong>{name}</strong>?
          </p>
          <p className="ops-confirm-meta">{action.row.email}</p>
          <p className="ops-confirm-note">
            They lose OPS and Driver access immediately. They can request again
            later unless Banned.
          </p>
        </>
      ),
      confirmLabel: "Remove",
      danger: true,
    };
  }

  return (
    <>
    <section
      className="ops-list-pane queue-plane ops-staff-plane"
      {...{ "x-apple-data-detectors": "false" }}
    >
      <div className="ops-list-head">
        <div className="queue-heading">
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
      </div>

      {(okMsg || error) && (
        <p className={cn("ops-flash", error ? "is-error" : "is-ok")}>
          {error || okMsg}
        </p>
      )}

      <div className="ops-list-scroll ops-staff-sections">
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
                {pending.map((row, index) => (
                  <div
                    key={row.uid}
                    className={`ops-staff-table-row${
                      index % 2 === 1 ? " is-stripe" : ""
                    }`}
                  >
                    <strong>{row.displayName || "—"}</strong>
                    <span className="ops-staff-email">{row.email}</span>
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
                        onClick={() =>
                          setConfirmAction({ kind: "deny", row })
                        }
                      >
                        Deny
                      </button>
                      <button
                        type="button"
                        className="ops-catalog-editor-btn is-secondary"
                        disabled={busyId === row.uid}
                        onClick={() => setConfirmAction({ kind: "ban", row })}
                      >
                        Ban
                      </button>
                      <button
                        type="button"
                        className="ops-catalog-editor-btn"
                        disabled={busyId === row.uid}
                        onClick={() =>
                          setConfirmAction({ kind: "approve", row })
                        }
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
                {bannedFiltered.map((row, index) => (
                  <div
                    key={row.email}
                    className={`ops-staff-table-row${
                      index % 2 === 1 ? " is-stripe" : ""
                    }`}
                  >                    <strong className="ops-staff-email">{row.email}</strong>
                    <span>{row.bannedBy || "—"}</span>
                    <span>{row.reason || "—"}</span>
                    <span className="ops-status-pill">Banned</span>
                    <div className="ops-staff-actions">
                      <button
                        type="button"
                        className="ops-catalog-editor-btn"
                        disabled={busyId === row.email}
                        onClick={() =>
                          setConfirmAction({ kind: "unban", email: row.email })
                        }
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
                  <button
                    type="button"
                    className="ops-staff-sort-btn"
                    onClick={() =>
                      setRoleSort((prev) => (prev === "asc" ? "desc" : "asc"))
                    }
                    aria-label={`Sort by role, currently ${
                      roleSort === "asc"
                        ? "Admin, Manager, Driver"
                        : "Driver, Manager, Admin"
                    }`}
                  >
                    Role
                    <span className="ops-staff-sort-mark" aria-hidden>
                      {roleSort === "asc" ? "↑" : "↓"}
                    </span>
                  </button>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {active.map((row, index) => {
                  const locked = isProtectedOwner(row);
                  const canEditRole = mayChangeRoles && !locked;
                  const canRemove = canRemoveStaffMember(adminEmail, row);
                  return (
                    <div
                      key={row.uid}
                      className={`ops-staff-table-row is-employee${
                        index % 2 === 1 ? " is-stripe" : ""
                      }`}
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
                                onClick={() =>
                                  setConfirmAction({ kind: "remove", row })
                                }
                              >
                                {busyId === row.uid ? "Removing…" : "Remove"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="ops-catalog-editor-btn is-secondary"
                              disabled={busyId === row.uid}
                              onClick={() =>
                                setConfirmAction({ kind: "ban", row })
                              }
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
                        <span className="ops-staff-email">{row.email}</span>
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
                            onClick={() =>
                              setConfirmAction({ kind: "deny", row })
                            }
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            className="ops-catalog-editor-btn is-secondary"
                            disabled={busyId === row.uid}
                            onClick={() =>
                              setConfirmAction({ kind: "ban", row })
                            }
                          >
                            Ban
                          </button>
                          {canRemove ? (
                            <button
                              type="button"
                              className="ops-catalog-editor-btn is-secondary"
                              disabled={busyId === row.uid}
                              onClick={() =>
                                setConfirmAction({ kind: "remove", row })
                              }
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
    {confirmAction && typeof document !== "undefined"
      ? createPortal(
          <div className="admin-page ops-confirm-root">
            <div
              className="ops-confirm-overlay"
              role="presentation"
              onClick={() => {
                if (!busyId) setConfirmAction(null);
              }}
            >
              <div
                className="ops-confirm-modal"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="ops-staff-confirm-title"
                aria-describedby="ops-staff-confirm-desc"
                onClick={(event) => event.stopPropagation()}
              >
                {(() => {
                  const copy = confirmCopy(confirmAction);
                  return (
                    <>
                      <h4 id="ops-staff-confirm-title">{copy.title}</h4>
                      <div
                        id="ops-staff-confirm-desc"
                        className="ops-confirm-body"
                      >
                        {copy.body}
                      </div>
                      <div className="ops-confirm-actions">
                        <button
                          type="button"
                          className="ops-confirm-btn is-cancel"
                          disabled={Boolean(busyId)}
                          onClick={() => setConfirmAction(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "ops-confirm-btn",
                            copy.danger ? "is-danger" : "is-confirm"
                          )}
                          disabled={Boolean(busyId)}
                          onClick={() => void confirmStaffAction()}
                        >
                          {busyId ? "Working…" : copy.confirmLabel}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>,
          document.body
        )
      : null}
    </>
  );
}

export function countPendingStaff(rows: StaffProfile[]) {
  return rows.filter((row) => row.status === "pending").length;
}
