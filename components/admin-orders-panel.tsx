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
} from "firebase/firestore";
import { ExternalLink, MapPin, MessageCircle, Phone, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DRY_CLEAN_CATALOG,
  type DryCleanCatalogItem,
} from "@/lib/dry-clean-catalog";
import { getFirebaseDb } from "@/lib/firebase";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_NEXT,
  computeFinalTotal,
  dryCleanItemsTotal,
  formatOrderAddress,
  normalizeOrderStatus,
  servicesSummary,
  type DryCleanItem,
  type FoamOrder,
  type OrderStatus,
} from "@/lib/orders";
import { BUSINESS_WHATSAPP } from "@/lib/site-config";
import { cn } from "@/lib/utils";

type Filter = "active" | "new" | "today" | "cancelled" | "done" | "all";

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
    dryCleanItems: Array.isArray(data.dryCleanItems)
      ? (data.dryCleanItems as DryCleanItem[]).filter(
          (item) =>
            item &&
            typeof item.name === "string" &&
            typeof item.price === "number"
        )
      : [],
    createdAt: (data.createdAt as FoamOrder["createdAt"]) ?? null,
    statusUpdatedAt:
      (data.statusUpdatedAt as FoamOrder["statusUpdatedAt"]) ?? null,
  };
}

export function AdminOrdersPanel({ adminEmail }: { adminEmail: string }) {
  const [rows, setRows] = useState<FoamOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [queryText, setQueryText] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [dryItems, setDryItems] = useState<DryCleanItem[]>([]);
  const [dryQuery, setDryQuery] = useState("");
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

  const counts = useMemo(() => {
    const today = todayIso();
    return {
      active: rows.filter(
        (r) => r.status !== "delivered" && r.status !== "cancelled"
      ).length,
      new: rows.filter((r) => r.status === "new").length,
      today: rows.filter((r) => r.pickup.date === today).length,
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
    setDryItems(selected.dryCleanItems ?? []);
    setDryQuery("");
    setOkMsg("");
    setError("");
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

  const dryMatches = useMemo(() => {
    const q = dryQuery.trim().toLowerCase();
    if (!q) return [];
    return DRY_CLEAN_CATALOG.filter((item) =>
      item.name.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [dryQuery]);

  function addDryItem(item: DryCleanCatalogItem) {
    setDryItems((current) => [...current, { name: item.name, price: item.price }]);
    setDryQuery("");
  }

  function removeDryItem(index: number) {
    setDryItems((current) => current.filter((_, i) => i !== index));
  }

  async function saveBilling() {
    if (!selected) return;
    const hasLaundry = selected.services.laundry;
    let lbs = 0;
    if (hasLaundry) {
      lbs = Number(weightInput);
      if (!Number.isFinite(lbs) || lbs <= 0) {
        setError("Enter a valid weight in pounds.");
        return;
      }
    }
    const laundryPortion = computeFinalTotal({
      weightLbs: lbs,
      tier: selected.pricing?.tier,
      ratePerLb: selected.pricing?.laundryRatePerLb,
      deliveryFee: selected.pricing?.deliveryFee,
      minimumOrder: selected.pricing?.minimumOrder,
      tip: selected.tip ?? selected.pricing?.tip ?? 0,
      repeatDiscountPercent: selected.pricing?.repeatDiscountEligible
        ? selected.pricing?.repeatDiscountPercent ?? 0
        : 0,
      hasLaundry,
    });
    const dryTotal = dryCleanItemsTotal(dryItems);
    const finalTotal = Math.round((laundryPortion + dryTotal) * 100) / 100;

    await patchOrder(
      {
        ...(hasLaundry ? { weightLbs: lbs } : {}),
        dryCleanItems: dryItems,
        finalTotal,
        status:
          hasLaundry && selected.status === "picked_up"
            ? "weighed"
            : selected.status,
        "pricing.finalTotalPending": false,
      },
      `Total saved · $${finalTotal.toFixed(2)}`
    );
  }

  const nextStatuses = selected
    ? ORDER_STATUS_NEXT[selected.status] ?? []
    : [];

  const previewTotal = useMemo(() => {
    if (!selected) return null;
    const hasLaundry = selected.services.laundry;
    const lbs = Number(weightInput);
    if (hasLaundry && !(lbs > 0)) return null;
    const laundryPortion = computeFinalTotal({
      weightLbs: hasLaundry ? lbs : 0,
      tier: selected.pricing?.tier,
      ratePerLb: selected.pricing?.laundryRatePerLb,
      deliveryFee: selected.pricing?.deliveryFee,
      minimumOrder: selected.pricing?.minimumOrder,
      tip: selected.tip ?? selected.pricing?.tip ?? 0,
      repeatDiscountPercent: selected.pricing?.repeatDiscountEligible
        ? selected.pricing?.repeatDiscountPercent ?? 0
        : 0,
      hasLaundry,
    });
    return (
      Math.round((laundryPortion + dryCleanItemsTotal(dryItems)) * 100) / 100
    );
  }, [selected, weightInput, dryItems]);

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
                row.status === "new" && "is-unread"
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
                  href={waUrl(selected.contact.phone, customerMsg)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="WhatsApp"
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
              </div>
            </div>

            {(okMsg || error) && (
              <p className={error ? "admin-error" : "admin-ok"}>
                {error || okMsg}
              </p>
            )}

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
              </dl>

              {selected.services.laundry ? (
                <div className="admin-block">
                  <p className="admin-block-title">Weigh-in</p>
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
                  </div>
                </div>
              ) : null}

              <div className="admin-block">
                <p className="admin-block-title">Dry cleaning — add items</p>
                <label className="admin-field">
                  Search catalog
                  <input
                    type="text"
                    value={dryQuery}
                    onChange={(e) => setDryQuery(e.target.value)}
                    placeholder="Shirt, coat, comforter…"
                  />
                </label>
                {dryMatches.length > 0 ? (
                  <div className="admin-dry-results">
                    {dryMatches.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        className="admin-dry-row"
                        onClick={() => addDryItem(item)}
                      >
                        <span>{item.name}</span>
                        <span>${item.price.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {dryItems.length > 0 ? (
                  <div className="admin-chip-wrap">
                    {dryItems.map((item, index) => (
                      <span
                        key={`${item.name}-${index}`}
                        className="admin-dry-chip"
                      >
                        {item.name} · ${item.price.toFixed(2)}
                        <button
                          type="button"
                          onClick={() => removeDryItem(index)}
                          aria-label={`Remove ${item.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="admin-block">
                <div className="admin-total-row">
                  <span>Total</span>
                  <strong>
                    {previewTotal != null
                      ? `$${previewTotal.toFixed(2)}`
                      : "—"}
                  </strong>
                </div>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveBilling()}
                >
                  Save total
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
