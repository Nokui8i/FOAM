"use client";

import { useEffect, useMemo, useState } from "react";
import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import {
  Camera,
  Copy,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getFirebaseDb } from "@/lib/firebase";
import { uploadOrderPhoto } from "@/lib/order-photos";
import {
  CANCEL_REASONS,
  ORDER_ISSUE_OPTIONS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_NEXT,
  REFUND_STATUSES,
  REFUND_STATUS_LABELS,
  computeFinalTotal,
  formatOrderAddress,
  normalizeOrderStatus,
  servicesSummary,
  type FoamOrder,
  type OrderPhoto,
  type OrderPhotoKind,
  type OrderStatus,
  type RefundStatus,
} from "@/lib/orders";
import { BUSINESS_WHATSAPP } from "@/lib/site-config";
import { cn } from "@/lib/utils";

type Filter =
  | "active"
  | "new"
  | "today"
  | "issues"
  | "refunds"
  | "cancelled"
  | "done"
  | "all";

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mapsUrl(order: FoamOrder) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    formatOrderAddress(order)
  )}`;
}

function smsUrl(phone: string, body: string) {
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}

function waUrl(phone: string, body: string) {
  const digits = phone.replace(/\D/g, "");
  const to = digits || BUSINESS_WHATSAPP;
  return `https://wa.me/${to}?text=${encodeURIComponent(body)}`;
}

function mapOrder(id: string, data: Record<string, unknown>): FoamOrder {
  const contact = (data.contact ?? {}) as Record<string, string>;
  const pickup = (data.pickup ?? {}) as Record<string, unknown>;
  const services = (data.services ?? {}) as Record<string, unknown>;
  const pricing = (data.pricing ?? {}) as FoamOrder["pricing"];

  return {
    id,
    status: normalizeOrderStatus(data.status),
    guest: Boolean(data.guest),
    uid: typeof data.uid === "string" ? data.uid : null,
    services: {
      laundry: Boolean(services.laundry),
      dryCleaning: Boolean(services.dryCleaning),
      bagCount: Number(services.bagCount ?? 0),
    },
    contact: {
      name: String(contact.name ?? ""),
      email: String(contact.email ?? ""),
      phone: String(contact.phone ?? ""),
    },
    pickup: {
      address: String(pickup.address ?? ""),
      unit: String(pickup.unit ?? ""),
      city: String(pickup.city ?? "Las Vegas"),
      zip: String(pickup.zip ?? ""),
      notes: String(pickup.notes ?? ""),
      date: String(pickup.date ?? ""),
      slot: String(pickup.slot ?? ""),
      repeat: Boolean(pickup.repeat),
      repeatRequested: Boolean(pickup.repeatRequested),
    },
    preferences: (data.preferences as Record<string, string>) ?? undefined,
    orderNotes: String(data.orderNotes ?? ""),
    pricing,
    tip: Number(data.tip ?? pricing?.tip ?? 0),
    promoCode: String(data.promoCode ?? pricing?.promoCode ?? ""),
    weightLbs: typeof data.weightLbs === "number" ? data.weightLbs : null,
    finalTotal: typeof data.finalTotal === "number" ? data.finalTotal : null,
    opsNotes: String(data.opsNotes ?? ""),
    opsIssue: String(data.opsIssue ?? ""),
    refundStatus: String(data.refundStatus ?? "none"),
    refundAmount:
      typeof data.refundAmount === "number" ? data.refundAmount : null,
    cancelReason: String(data.cancelReason ?? ""),
    photos: Array.isArray(data.photos)
      ? (data.photos as OrderPhoto[]).filter((p) => p && typeof p.url === "string")
      : [],
    createdAt: (data.createdAt as FoamOrder["createdAt"]) ?? null,
    statusUpdatedAt:
      (data.statusUpdatedAt as FoamOrder["statusUpdatedAt"]) ?? null,
  };
}

function prefLabel(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export function AdminOrdersPanel({ adminEmail }: { adminEmail: string }) {
  const [rows, setRows] = useState<FoamOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [queryText, setQueryText] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [opsNotes, setOpsNotes] = useState("");
  const [opsIssue, setOpsIssue] = useState("");
  const [refundStatus, setRefundStatus] = useState<RefundStatus>("none");
  const [refundAmount, setRefundAmount] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [pane, setPane] = useState<"run" | "info" | "cs">("run");
  const [uploadingKind, setUploadingKind] = useState<OrderPhotoKind | null>(
    null
  );

  useEffect(() => {
    const db = getFirebaseDb();
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((item) =>
          mapOrder(item.id, item.data() as Record<string, unknown>)
        );
        setRows(next);
        setSelectedId((current) => current ?? next[0]?.id ?? null);
        setError("");
      },
      () => {
        setError("Could not load orders. Check admin permissions.");
      }
    );
  }, []);

  const counts = useMemo(() => {
    const today = todayIso();
    return {
      active: rows.filter(
        (r) => r.status !== "delivered" && r.status !== "cancelled"
      ).length,
      new: rows.filter((r) => r.status === "new").length,
      today: rows.filter((r) => r.pickup.date === today).length,
      issues: rows.filter((r) => Boolean(r.opsIssue)).length,
      refunds: rows.filter(
        (r) => r.refundStatus && r.refundStatus !== "none"
      ).length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      done: rows.filter(
        (r) => r.status === "delivered" || r.status === "cancelled"
      ).length,
      all: rows.length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const today = todayIso();
    return rows.filter((row) => {
      if (filter === "new" && row.status !== "new") return false;
      if (filter === "today" && row.pickup.date !== today) return false;
      if (filter === "issues" && !row.opsIssue) return false;
      if (
        filter === "refunds" &&
        (!row.refundStatus || row.refundStatus === "none")
      ) {
        return false;
      }
      if (filter === "cancelled" && row.status !== "cancelled") return false;
      if (
        filter === "done" &&
        row.status !== "delivered" &&
        row.status !== "cancelled"
      ) {
        return false;
      }
      if (
        filter === "active" &&
        (row.status === "delivered" || row.status === "cancelled")
      ) {
        return false;
      }
      if (!q) return true;
      const hay = [
        row.contact.name,
        row.contact.email,
        row.contact.phone,
        row.pickup.address,
        row.pickup.zip,
        row.id,
        ORDER_STATUS_LABELS[row.status],
        row.opsIssue,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filter, queryText]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setWeightInput(
      selected.weightLbs != null && selected.weightLbs > 0
        ? String(selected.weightLbs)
        : ""
    );
    setOpsNotes(selected.opsNotes ?? "");
    setOpsIssue(selected.opsIssue ?? "");
    setRefundStatus(
      (selected.refundStatus as RefundStatus) || "none"
    );
    setRefundAmount(
      selected.refundAmount != null ? String(selected.refundAmount) : ""
    );
    setCancelReason(selected.cancelReason ?? "");
    setPane("run");
    setOkMsg("");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patchOrder(data: Record<string, unknown>, ok = "Saved.") {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await updateDoc(doc(getFirebaseDb(), "orders", selected.id), {
        ...data,
        statusUpdatedAt: serverTimestamp(),
        lastUpdatedBy: adminEmail,
      });
      setOkMsg(ok);
    } catch {
      setError("Update failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: OrderStatus) {
    await patchOrder({ status }, `Status → ${ORDER_STATUS_LABELS[status]}`);
  }

  async function saveWeighIn() {
    if (!selected) return;
    const lbs = Number(weightInput);
    if (!Number.isFinite(lbs) || lbs <= 0) {
      setError("Enter a valid weight in pounds.");
      return;
    }
    const finalTotal = computeFinalTotal({
      weightLbs: lbs,
      tier: selected.pricing?.tier,
      ratePerLb: selected.pricing?.laundryRatePerLb,
      deliveryFee: selected.pricing?.deliveryFee,
      minimumOrder: selected.pricing?.minimumOrder,
      tip: selected.tip ?? selected.pricing?.tip ?? 0,
      repeatDiscountPercent: selected.pricing?.repeatDiscountEligible
        ? selected.pricing?.repeatDiscountPercent ?? 0
        : 0,
      hasLaundry: selected.services.laundry,
    });
    await patchOrder(
      {
        weightLbs: lbs,
        finalTotal,
        opsNotes: opsNotes.trim(),
        status: "weighed",
        "pricing.finalTotalPending": false,
      },
      `Weighed ${lbs} lb · $${finalTotal.toFixed(2)}`
    );
  }

  async function saveNotesAndIssue() {
    await patchOrder(
      {
        opsNotes: opsNotes.trim(),
        opsIssue: opsIssue || "",
      },
      "Issue & notes saved."
    );
  }

  async function saveRefund() {
    const amount = refundAmount.trim() ? Number(refundAmount) : null;
    if (
      refundAmount.trim() &&
      (!Number.isFinite(amount) || (amount as number) < 0)
    ) {
      setError("Enter a valid refund amount.");
      return;
    }
    await patchOrder(
      {
        refundStatus,
        refundAmount: amount,
        opsIssue:
          opsIssue ||
          (refundStatus !== "none" ? "refund_request" : opsIssue),
      },
      `Refund: ${REFUND_STATUS_LABELS[refundStatus]}`
    );
  }

  async function cancelOrder() {
    if (!cancelReason) {
      setError("Pick a cancel reason first.");
      return;
    }
    await patchOrder(
      {
        status: "cancelled",
        cancelReason,
        opsIssue: opsIssue || "cancel_request",
        opsNotes: opsNotes.trim(),
      },
      "Order cancelled."
    );
  }

  async function onPhotoPicked(kind: OrderPhotoKind, file: File | undefined) {
    if (!selected || !file) return;
    setUploadingKind(kind);
    setError("");
    try {
      const uploaded = await uploadOrderPhoto({
        orderId: selected.id,
        kind,
        file,
      });
      await updateDoc(doc(getFirebaseDb(), "orders", selected.id), {
        photos: arrayUnion({
          url: uploaded.url,
          kind: uploaded.kind,
          createdAt: Date.now(),
          by: adminEmail,
        }),
        statusUpdatedAt: serverTimestamp(),
        lastUpdatedBy: adminEmail,
      });
      setOkMsg("Photo saved.");
    } catch {
      setError(
        "Photo upload failed. Enable Firebase Storage, then try again."
      );
    } finally {
      setUploadingKind(null);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setOkMsg("Copied.");
    } catch {
      setError("Could not copy.");
    }
  }

  const nextStatuses = selected
    ? ORDER_STATUS_NEXT[selected.status] ?? []
    : [];

  const previewTotal =
    selected && Number(weightInput) > 0
      ? computeFinalTotal({
          weightLbs: Number(weightInput),
          tier: selected.pricing?.tier,
          ratePerLb: selected.pricing?.laundryRatePerLb,
          deliveryFee: selected.pricing?.deliveryFee,
          minimumOrder: selected.pricing?.minimumOrder,
          tip: selected.tip ?? selected.pricing?.tip ?? 0,
          repeatDiscountPercent: selected.pricing?.repeatDiscountEligible
            ? selected.pricing?.repeatDiscountPercent ?? 0
            : 0,
          hasLaundry: selected.services.laundry,
        })
      : selected?.finalTotal ?? null;

  const customerMsg = selected
    ? `Hi ${selected.contact.name.split(" ")[0] || "there"}, this is FOAM about your pickup on ${selected.pickup.date} (${selected.pickup.slot}).`
    : "";

  return (
    <div className="admin-layout">
      <aside className="admin-list">
        <div className="admin-list-tools">
          <label className="admin-search">
            <Search size={15} aria-hidden />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search…"
            />
          </label>
          <select
            className="admin-filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Filter orders"
          >
            <option value="active">Active ({counts.active})</option>
            <option value="new">New ({counts.new})</option>
            <option value="today">Today ({counts.today})</option>
            <option value="issues">Issues ({counts.issues})</option>
            <option value="refunds">Refunds ({counts.refunds})</option>
            <option value="cancelled">Cancelled ({counts.cancelled})</option>
            <option value="done">Done ({counts.done})</option>
            <option value="all">All ({counts.all})</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="admin-muted">No orders.</p>
        ) : (
          filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className={cn(
                "admin-list-item",
                selectedId === row.id && "is-active",
                row.status === "new" && "is-unread",
                (row.opsIssue ||
                  (row.refundStatus && row.refundStatus !== "none")) &&
                  "has-issue"
              )}
              onClick={() => setSelectedId(row.id)}
            >
              <span className="admin-list-name">{row.contact.name}</span>
              <span className="admin-list-meta">
                {row.pickup.date} · {row.pickup.slot}
              </span>
              <span
                className={cn(
                  "admin-pill",
                  row.status === "delivered" && "is-done",
                  row.status === "cancelled" && "is-cancelled",
                  row.status === "new" && "is-new"
                )}
              >
                {ORDER_STATUS_LABELS[row.status].replace(/^\d+ · /, "")}
              </span>
            </button>
          ))
        )}
      </aside>

      <section className="admin-detail">
        {!selected ? (
          <p className="admin-muted">Select an order.</p>
        ) : (
          <>
            <div className="admin-detail-head">
              <div>
                <h2>{selected.contact.name}</h2>
                <p className="admin-detail-sub">
                  {selected.pickup.date} · {selected.pickup.slot}
                  {selected.opsIssue ? " · Issue open" : ""}
                  {selected.refundStatus && selected.refundStatus !== "none"
                    ? ` · ${REFUND_STATUS_LABELS[(selected.refundStatus as RefundStatus) || "none"]}`
                    : ""}
                </p>
              </div>
              <div className="admin-icon-row">
                <a
                  className="admin-icon-btn"
                  href={`tel:${selected.contact.phone}`}
                  aria-label="Call"
                >
                  <Phone size={16} />
                </a>
                <a
                  className="admin-icon-btn"
                  href={smsUrl(selected.contact.phone, customerMsg)}
                  aria-label="SMS"
                >
                  <MessageCircle size={16} />
                </a>
                <a
                  className="admin-icon-btn"
                  href={mapsUrl(selected)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Maps"
                >
                  <MapPin size={16} />
                </a>
                <button
                  type="button"
                  className="admin-icon-btn"
                  aria-label="Copy details"
                  onClick={() =>
                    void copyText(
                      `${selected.contact.name}\n${selected.contact.phone}\n${formatOrderAddress(selected)}`
                    )
                  }
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>

            {(okMsg || error) && (
              <p className={error ? "admin-error" : "admin-ok"}>
                {error || okMsg}
              </p>
            )}

            <div className="admin-pane-tabs">
              {(
                [
                  ["run", "Run"],
                  ["info", "Details"],
                  ["cs", "CS"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={cn("admin-pane-tab", pane === id && "is-active")}
                  onClick={() => setPane(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {pane === "run" ? (
              <div className="admin-pane">
                <div className="admin-block">
                  <label className="admin-field">
                    Status
                    <select
                      value={selected.status}
                      disabled={saving}
                      onChange={(e) =>
                        void setStatus(e.target.value as OrderStatus)
                      }
                    >
                      {ORDER_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {ORDER_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {nextStatuses.length > 0 ? (
                    <div className="admin-chip-row">
                      {nextStatuses.map((status) => (
                        <button
                          key={status}
                          type="button"
                          className="admin-chip"
                          disabled={saving}
                          onClick={() => void setStatus(status)}
                        >
                          → {ORDER_STATUS_LABELS[status].replace(/^\d+ · /, "")}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {selected.services.laundry ? (
                  <div className="admin-block">
                    <div className="admin-ops-row">
                      <label className="admin-field">
                        Weight (lb)
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={0.1}
                          value={weightInput}
                          onChange={(e) => setWeightInput(e.target.value)}
                        />
                      </label>
                      <div className="admin-ops-total">
                        <span>Total</span>
                        <strong>
                          {previewTotal != null
                            ? `$${previewTotal.toFixed(2)}`
                            : "—"}
                        </strong>
                      </div>
                    </div>
                    <Button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveWeighIn()}
                    >
                      Save weight
                    </Button>
                  </div>
                ) : null}

                <div className="admin-block">
                  <p className="admin-block-title">Photos</p>
                  <div className="admin-photo-actions">
                    {(
                      [
                        ["pickup", "Pickup"],
                        ["weight", "Scale"],
                        ["return", "Return"],
                        ["other", "Other"],
                      ] as const
                    ).map(([kind, label]) => (
                      <label
                        key={kind}
                        className={cn(
                          "admin-photo-btn",
                          uploadingKind === kind && "is-busy"
                        )}
                      >
                        <Camera size={15} aria-hidden />
                        {uploadingKind === kind ? "…" : label}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={Boolean(uploadingKind) || saving}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            void onPhotoPicked(kind, file);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  {selected.photos && selected.photos.length > 0 ? (
                    <div className="admin-photo-grid">
                      {selected.photos.map((photo, index) => (
                        <a
                          key={`${photo.url}-${index}`}
                          href={photo.url}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-photo-thumb"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.url} alt={photo.kind} />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {pane === "info" ? (
              <div className="admin-pane">
                <dl className="admin-kv">
                  <div>
                    <dt>Phone</dt>
                    <dd>
                      <a href={`tel:${selected.contact.phone}`}>
                        {selected.contact.phone || "—"}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>
                      <a href={`mailto:${selected.contact.email}`}>
                        {selected.contact.email || "—"}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd>
                      {formatOrderAddress(selected)}{" "}
                      <a
                        href={mapsUrl(selected)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={13} className="inline" />
                      </a>
                    </dd>
                  </div>
                  {selected.pickup.notes ? (
                    <div>
                      <dt>Access</dt>
                      <dd>{selected.pickup.notes}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Services</dt>
                    <dd>{servicesSummary(selected)}</dd>
                  </div>
                  <div>
                    <dt>Pricing</dt>
                    <dd>
                      {selected.pricing?.tier === "weekly"
                        ? "Weekly"
                        : "Standard"}{" "}
                      · $
                      {selected.pricing?.laundryRatePerLb?.toFixed(2) ?? "—"}
                      /lb
                      {selected.tip ? ` · Tip $${selected.tip}` : ""}
                      {selected.promoCode
                        ? ` · Promo ${selected.promoCode}`
                        : ""}
                    </dd>
                  </div>
                  {selected.orderNotes ? (
                    <div>
                      <dt>Notes</dt>
                      <dd>{selected.orderNotes}</dd>
                    </div>
                  ) : null}
                </dl>

                {selected.preferences &&
                Object.values(selected.preferences).some(Boolean) ? (
                  <div className="admin-block">
                    <p className="admin-block-title">Preferences</p>
                    <ul className="admin-pref-list">
                      {Object.entries(selected.preferences).map(([key, val]) =>
                        val ? (
                          <li key={key}>
                            <strong>{prefLabel(key)}</strong>: {val}
                          </li>
                        ) : null
                      )}
                    </ul>
                  </div>
                ) : null}

                <div className="admin-chip-row">
                  <a
                    className="admin-chip"
                    href={waUrl(selected.contact.phone, customerMsg)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>
                  <a
                    className="admin-chip"
                    href={`mailto:${selected.contact.email}`}
                  >
                    Email
                  </a>
                </div>
              </div>
            ) : null}

            {pane === "cs" ? (
              <div className="admin-pane">
                <label className="admin-field">
                  Issue
                  <select
                    value={opsIssue}
                    onChange={(e) => setOpsIssue(e.target.value)}
                  >
                    {ORDER_ISSUE_OPTIONS.map((opt) => (
                      <option key={opt.id || "none"} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="admin-inline-pair">
                  <label className="admin-field">
                    Cancel reason
                    <select
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    >
                      {CANCEL_REASONS.map((reason) => (
                        <option key={reason || "empty"} value={reason}>
                          {reason || "Select…"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving || selected.status === "cancelled"}
                    onClick={() => void cancelOrder()}
                  >
                    Cancel order
                  </Button>
                </div>

                <div className="admin-inline-pair">
                  <label className="admin-field">
                    Refund
                    <select
                      value={refundStatus}
                      onChange={(e) =>
                        setRefundStatus(e.target.value as RefundStatus)
                      }
                    >
                      {REFUND_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {REFUND_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field">
                    Amount ($)
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.01}
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </label>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void saveRefund()}
                >
                  Save refund
                </Button>

                <label className="admin-field">
                  Notes
                  <textarea
                    rows={3}
                    value={opsNotes}
                    onChange={(e) => setOpsNotes(e.target.value)}
                    placeholder="What you promised, refund ID…"
                  />
                </label>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveNotesAndIssue()}
                >
                  Save issue & notes
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
