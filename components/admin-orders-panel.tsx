"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { getFirebaseDb } from "@/lib/firebase";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_NEXT,
  computeFinalTotal,
  formatOrderAddress,
  normalizeOrderStatus,
  servicesSummary,
  type FoamOrder,
  type OrderStatus,
} from "@/lib/orders";
import { cn } from "@/lib/utils";

type Filter = "active" | "new" | "all" | "done";

function formatDate(value: Timestamp | null | undefined) {
  if (!value?.toDate) return "Just now";
  return value.toDate().toLocaleString();
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
    weightLbs:
      typeof data.weightLbs === "number" ? data.weightLbs : null,
    finalTotal:
      typeof data.finalTotal === "number" ? data.finalTotal : null,
    opsNotes: String(data.opsNotes ?? ""),
    createdAt: (data.createdAt as FoamOrder["createdAt"]) ?? null,
    statusUpdatedAt:
      (data.statusUpdatedAt as FoamOrder["statusUpdatedAt"]) ?? null,
  };
}

export function AdminOrdersPanel({ adminEmail }: { adminEmail: string }) {
  const [rows, setRows] = useState<FoamOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [error, setError] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [opsNotes, setOpsNotes] = useState("");
  const [saving, setSaving] = useState(false);

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

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filter === "all") return true;
      if (filter === "new") return row.status === "new";
      if (filter === "done")
        return row.status === "delivered" || row.status === "cancelled";
      return row.status !== "delivered" && row.status !== "cancelled";
    });
  }, [rows, filter]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setWeightInput(
      selected.weightLbs != null && selected.weightLbs > 0
        ? String(selected.weightLbs)
        : ""
    );
    setOpsNotes(selected.opsNotes ?? "");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatus(status: OrderStatus) {
    if (!selected) return;
    setSaving(true);
    try {
      await updateDoc(doc(getFirebaseDb(), "orders", selected.id), {
        status,
        statusUpdatedAt: serverTimestamp(),
        lastUpdatedBy: adminEmail,
      });
    } catch {
      setError("Could not update status.");
    } finally {
      setSaving(false);
    }
  }

  async function saveWeighIn() {
    if (!selected) return;
    const lbs = Number(weightInput);
    if (!Number.isFinite(lbs) || lbs <= 0) {
      setError("Enter a valid weight in pounds.");
      return;
    }
    setSaving(true);
    setError("");
    try {
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

      await updateDoc(doc(getFirebaseDb(), "orders", selected.id), {
        weightLbs: lbs,
        finalTotal,
        opsNotes: opsNotes.trim(),
        status: "weighed",
        statusUpdatedAt: serverTimestamp(),
        lastUpdatedBy: adminEmail,
        "pricing.finalTotalPending": false,
      });
    } catch {
      setError("Could not save weigh-in.");
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    if (!selected) return;
    setSaving(true);
    try {
      await updateDoc(doc(getFirebaseDb(), "orders", selected.id), {
        opsNotes: opsNotes.trim(),
        statusUpdatedAt: serverTimestamp(),
        lastUpdatedBy: adminEmail,
      });
    } catch {
      setError("Could not save notes.");
    } finally {
      setSaving(false);
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

  return (
    <div className="admin-layout">
      <aside className="admin-list">
        <div className="admin-filters">
          {(
            [
              ["active", "Active"],
              ["new", "New"],
              ["done", "Done"],
              ["all", "All"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cn("admin-filter", filter === key && "is-active")}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? <p className="admin-error">{error}</p> : null}

        {filtered.length === 0 ? (
          <p className="admin-muted">No orders in this view.</p>
        ) : (
          filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className={cn(
                "admin-list-item",
                selectedId === row.id && "is-active",
                row.status === "new" && "is-unread"
              )}
              onClick={() => setSelectedId(row.id)}
            >
              <span className="admin-list-name">{row.contact.name}</span>
              <span className="admin-list-meta">
                {row.pickup.date} · {row.pickup.slot}
              </span>
              <span className="admin-list-meta">{servicesSummary(row)}</span>
              <span
                className={cn(
                  "admin-pill",
                  row.status === "delivered" && "is-done",
                  row.status === "cancelled" && "is-cancelled",
                  row.status === "new" && "is-new"
                )}
              >
                {ORDER_STATUS_LABELS[row.status]}
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
            <div className="admin-detail-top">
              <div>
                <h2>{selected.contact.name}</h2>
                <p className="admin-muted">
                  {formatDate(selected.createdAt as Timestamp | null)} ·{" "}
                  {selected.guest ? "Guest" : "Account"}
                </p>
              </div>
              <span
                className={cn(
                  "admin-pill",
                  selected.status === "delivered" && "is-done",
                  selected.status === "new" && "is-new"
                )}
              >
                {ORDER_STATUS_LABELS[selected.status]}
              </span>
            </div>

            {nextStatuses.length > 0 ? (
              <div className="admin-actions">
                {nextStatuses.map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant={status === "cancelled" ? "outline" : "default"}
                    disabled={saving}
                    onClick={() => void setStatus(status)}
                  >
                    Mark {ORDER_STATUS_LABELS[status]}
                  </Button>
                ))}
              </div>
            ) : null}

            <dl className="admin-fields">
              <div>
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${selected.contact.phone}`}>
                    {selected.contact.phone}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${selected.contact.email}`}>
                    {selected.contact.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Pickup</dt>
                <dd>
                  {selected.pickup.date} · {selected.pickup.slot}
                </dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{formatOrderAddress(selected)}</dd>
              </div>
              {selected.pickup.notes ? (
                <div>
                  <dt>Access notes</dt>
                  <dd>{selected.pickup.notes}</dd>
                </div>
              ) : null}
              <div>
                <dt>Services</dt>
                <dd>{servicesSummary(selected)}</dd>
              </div>
              <div>
                <dt>Rate</dt>
                <dd>
                  {selected.pricing?.tier === "weekly" ? "Weekly" : "Standard"}{" "}
                  · ${selected.pricing?.laundryRatePerLb?.toFixed(2) ?? "—"}/lb
                  {selected.pickup.repeat ? " · Repeat" : ""}
                </dd>
              </div>
              {selected.orderNotes ? (
                <div>
                  <dt>Customer notes</dt>
                  <dd>{selected.orderNotes}</dd>
                </div>
              ) : null}
            </dl>

            {selected.preferences &&
            Object.keys(selected.preferences).length > 0 ? (
              <div className="admin-message">
                <p className="admin-message-label">Laundry prefs</p>
                <ul className="admin-pref-list">
                  {Object.entries(selected.preferences).map(([key, val]) =>
                    val ? (
                      <li key={key}>
                        <strong>{key}</strong>: {val}
                      </li>
                    ) : null
                  )}
                </ul>
              </div>
            ) : null}

            {selected.services.laundry ? (
              <div className="admin-ops-card">
                <p className="admin-message-label">Weigh-in</p>
                <div className="admin-ops-row">
                  <label>
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
                    <span>Final total</span>
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
                  {saving ? "Saving…" : "Save weight & mark Weighed"}
                </Button>
              </div>
            ) : null}

            <div className="admin-ops-card">
              <label>
                Ops notes
                <textarea
                  rows={3}
                  value={opsNotes}
                  onChange={(e) => setOpsNotes(e.target.value)}
                  placeholder="Driver notes, bag condition, customer requests…"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void saveNotes()}
              >
                Save notes
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
