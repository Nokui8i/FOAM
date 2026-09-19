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
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  MapPin,
  MessageCircle,
  PackageCheck,
  Phone,
  Repeat2,
  Search,
  Shirt,
  Truck,
  UserRound,
  Weight,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DRY_CLEAN_CATALOG,
  type DryCleanCatalogItem,
} from "@/lib/dry-clean-catalog";
import { getFirebaseDb } from "@/lib/firebase";
import {
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
type MobileView = "list" | "detail";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "new", label: "New" },
  { id: "today", label: "Today" },
  { id: "cancelled", label: "Cancelled" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];

const ADVANCE_LABEL: Partial<Record<OrderStatus, string>> = {
  new: "Confirm order",
  confirmed: "Mark collected",
  picked_up: "Save weight & continue",
  weighed: "Start work at plant",
  washing: "Out for delivery",
  out_for_delivery: "Mark delivered",
};

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

function shortStatus(status: OrderStatus) {
  return ORDER_STATUS_LABELS[status].replace(/^\d+ · /, "");
}

function isToday(date: string) {
  return date === todayIso();
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

function PanelTitleFixed({
  icon: Icon,
  title,
  note,
}: {
  icon: LucideIcon;
  title: string;
  note?: string;
}) {
  return (
    <div className="ops-panel-title">
      <span className="ops-panel-title-icon">
        <Icon className="size-4" />
      </span>
      <div>
        <h3>{title}</h3>
        {note ? <p>{note}</p> : null}
      </div>
    </div>
  );
}

export function AdminOrdersPanel({
  adminEmail,
  mobileView,
  onMobileViewChange,
}: {
  adminEmail: string;
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
}) {
  const [rows, setRows] = useState<FoamOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [queryText, setQueryText] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [dryItems, setDryItems] = useState<DryCleanItem[]>([]);
  const [dryQuery, setDryQuery] = useState("");
  const [openCatalog, setOpenCatalog] = useState(false);
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

  // Keep detail pane on a row that is actually visible in the current list.
  useEffect(() => {
    const stillVisible = filtered.some((row) => row.id === selectedId);
    if (stillVisible) return;
    setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);

  const selected = filtered.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setWeightInput(
      selected.weightLbs != null && selected.weightLbs > 0
        ? String(selected.weightLbs)
        : ""
    );
    setDryItems(selected.dryCleanItems ?? []);
    setDryQuery("");
    setOpenCatalog(false);
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
    await patchOrder({ status }, `Status → ${shortStatus(status)}`);
  }

  const dryMatches = useMemo(() => {
    const q = dryQuery.trim().toLowerCase();
    if (!q) return DRY_CLEAN_CATALOG;
    return DRY_CLEAN_CATALOG.filter((item) =>
      item.name.toLowerCase().includes(q)
    );
  }, [dryQuery]);

  function addDryItem(item: DryCleanCatalogItem) {
    setDryItems((current) => [...current, { name: item.name, price: item.price }]);
    setDryQuery("");
    setOpenCatalog(false);
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
  const advanceStatus = nextStatuses.find((s) => s !== "cancelled");
  const canCancel = nextStatuses.includes("cancelled");

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

  const pipeline: OrderStatus[] = [
    "new",
    "picked_up",
    "washing",
    "out_for_delivery",
    "delivered",
  ];

  function pipelineIndex(status: OrderStatus) {
    if (status === "cancelled") return -1;
    if (status === "confirmed") return 0;
    if (status === "weighed") return 2;
    return Math.max(0, pipeline.indexOf(status));
  }

  function selectOrder(id: string) {
    setSelectedId(id);
    onMobileViewChange("detail");
  }

  return (
    <>
      <section
        className={cn(
          "ops-list-pane",
          mobileView === "detail" && "is-hidden-mobile"
        )}
      >
        <div className="ops-list-head">
          <div className="ops-list-head-row">
            <div>
              <p className="ops-eyebrow">Current queue</p>
              <h1 className="ops-list-title">Orders</h1>
            </div>
            <span className="ops-count-chip">{counts[filter]}</span>
          </div>

          <label className="ops-search">
            <Search size={16} aria-hidden />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search orders"
            />
          </label>

          <div className="ops-filter-row" role="tablist" aria-label="Filter orders">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                className={cn(
                  "ops-filter-chip",
                  filter === item.id && "is-active"
                )}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {error && !selected ? <p className="ops-error ops-pad">{error}</p> : null}

        <div className="ops-list-body">
          {filtered.length === 0 ? (
            <p className="ops-empty">Live orders will appear here.</p>
          ) : (
            filtered.map((row) => (
              <button
                key={row.id}
                type="button"
                className={cn(
                  "ops-row",
                  selectedId === row.id && "is-active"
                )}
                onClick={() => selectOrder(row.id)}
              >
                <span className="ops-row-icon">
                  <UserRound size={16} />
                </span>
                <span className="ops-row-main">
                  <span className="ops-row-name">{row.contact.name}</span>
                  <span className="ops-row-meta">
                    {row.pickup.date} · {row.pickup.slot}
                  </span>
                </span>
                <span
                  className={cn(
                    "ops-status-pill",
                    row.status === "delivered" && "is-done",
                    row.status === "cancelled" && "is-cancelled",
                    row.status === "new" && "is-new"
                  )}
                >
                  {shortStatus(row.status)}
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section
        className={cn(
          "ops-detail-pane",
          mobileView === "list" && "is-hidden-mobile"
        )}
      >
        {!selected ? (
          <p className="ops-empty ops-pad">Select an order to view details.</p>
        ) : (
          <article className="ops-detail">
            <div className="ops-detail-head">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ops-back"
                onClick={() => onMobileViewChange("list")}
              >
                <ArrowLeft size={16} />
                Back to orders
              </Button>

              <div className="ops-detail-head-row">
                <div>
                  <div className="ops-detail-name-row">
                    <h2>{selected.contact.name}</h2>
                    <span
                      className={cn(
                        "ops-status-pill is-lg",
                        selected.status === "cancelled" && "is-cancelled",
                        selected.status === "delivered" && "is-done",
                        selected.status === "new" && "is-new"
                      )}
                    >
                      {shortStatus(selected.status)}
                    </span>
                  </div>
                  <p className="ops-muted">
                    {selected.pickup.date} · {selected.pickup.slot}
                  </p>
                </div>
                <div className="ops-icon-row">
                  <a
                    className="ops-icon-btn"
                    href={`tel:${selected.contact.phone}`}
                    aria-label="Call"
                  >
                    <Phone size={18} />
                  </a>
                  <a
                    className="ops-icon-btn"
                    href={waUrl(selected.contact.phone, customerMsg)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="WhatsApp"
                  >
                    <MessageCircle size={18} />
                  </a>
                  <a
                    className="ops-icon-btn"
                    href={mapsUrl(selected)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Maps"
                  >
                    <MapPin size={18} />
                  </a>
                </div>
              </div>
            </div>

            {(okMsg || error) && (
              <p className={cn("ops-flash", error ? "is-error" : "is-ok")}>
                {error || okMsg}
              </p>
            )}

            <div className="ops-detail-grid">
              <section className="ops-pickup-card">
                <p className="ops-pickup-label">Scheduled pickup</p>
                <div className="ops-pickup-grid">
                  <div>
                    <p className="ops-field-label">Date from customer booking</p>
                    <p className="ops-pickup-value">{selected.pickup.date || "—"}</p>
                  </div>
                  <div>
                    <p className="ops-field-label">Time window</p>
                    <p className="ops-pickup-time">
                      <Clock3 size={18} />
                      {selected.pickup.slot || "—"}
                    </p>
                  </div>
                  <div className="ops-pickup-pills">
                    {isToday(selected.pickup.date) ? (
                      <span className="ops-today-pill">Today</span>
                    ) : null}
                    {selected.pickup.repeat || selected.pickup.repeatRequested ? (
                      <span className="ops-repeat-pill">
                        <Repeat2 size={12} />
                        Weekly repeat
                      </span>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="ops-card">
                <PanelTitleFixed icon={MapPin} title="Customer & stop" />
                <div className="ops-fields">
                  <div>
                    <p className="ops-field-label">Phone</p>
                    <p>
                      <a href={`tel:${selected.contact.phone}`}>
                        {selected.contact.phone || "—"}
                      </a>
                    </p>
                  </div>
                  <div>
                    <p className="ops-field-label">Email</p>
                    <p>
                      <a href={`mailto:${selected.contact.email}`}>
                        {selected.contact.email || "—"}
                      </a>
                    </p>
                  </div>
                  <div className="ops-field-wide">
                    <p className="ops-field-label">Full address · Las Vegas</p>
                    <p>{formatOrderAddress(selected)}</p>
                  </div>
                  <div className="ops-field-wide">
                    <p className="ops-field-label">Access notes</p>
                    <p>{selected.pickup.notes || "—"}</p>
                  </div>
                  <div className="ops-field-wide">
                    <p className="ops-field-label">Services summary</p>
                    <p>{servicesSummary(selected)}</p>
                  </div>
                </div>
                <a
                  className="ops-link"
                  href={mapsUrl(selected)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open address in Maps <ExternalLink size={14} />
                </a>
              </section>

              <section className="ops-card">
                <PanelTitleFixed
                  icon={Truck}
                  title="Workflow"
                  note="Status advances only when the current handoff is complete."
                />
                <div className="ops-stepper" aria-hidden>
                  {pipeline.map((status, index) => {
                    const current = pipelineIndex(selected.status);
                    const done = current > index;
                    const active = current === index;
                    return (
                      <div key={status} className="ops-step">
                        <span
                          className={cn(
                            "ops-step-dot",
                            (done || active) &&
                              selected.status !== "cancelled" &&
                              "is-on"
                          )}
                        >
                          {done ? <Check size={12} /> : index + 1}
                        </span>
                        {index < pipeline.length - 1 ? (
                          <span
                            className={cn(
                              "ops-step-bar",
                              done && selected.status !== "cancelled" && "is-on"
                            )}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className="ops-muted ops-step-help">
                  {selected.status === "cancelled"
                    ? "This order is closed and cannot advance."
                    : selected.status === "delivered"
                      ? "Delivery is complete."
                      : "Complete the current step, then move this order forward."}
                </p>
                <div className="ops-action-row">
                  {advanceStatus ? (
                    <Button
                      type="button"
                      className="ops-btn-lg"
                      disabled={saving}
                      onClick={() => void setStatus(advanceStatus)}
                    >
                      <PackageCheck size={16} />
                      {ADVANCE_LABEL[selected.status] ??
                        `→ ${shortStatus(advanceStatus)}`}
                    </Button>
                  ) : null}
                  {canCancel ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="ops-btn-lg ops-btn-danger"
                      disabled={saving}
                      onClick={() => void setStatus("cancelled")}
                    >
                      <X size={16} />
                      Cancel order
                    </Button>
                  ) : null}
                </div>
              </section>

              {selected.services.laundry ? (
                <section className="ops-card">
                  <PanelTitleFixed
                    icon={Weight}
                    title="Weigh-in"
                    note="Required when laundry service is included."
                  />
                  <label className="ops-weight-field">
                    Weight in pounds
                    <span className="ops-weight-input">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.1}
                        value={weightInput}
                        onChange={(e) => setWeightInput(e.target.value)}
                        placeholder="0.0"
                      />
                      <span>lb</span>
                    </span>
                  </label>
                </section>
              ) : null}

              <section className="ops-card">
                <PanelTitleFixed
                  icon={Shirt}
                  title="Dry cleaning items"
                  note="Add one or more catalog items to this order."
                />
                <div className="ops-catalog">
                  <Button
                    type="button"
                    variant="outline"
                    className="ops-catalog-toggle"
                    onClick={() => setOpenCatalog((v) => !v)}
                  >
                    Choose catalog items
                    <ChevronDown size={16} />
                  </Button>
                  {openCatalog ? (
                    <div className="ops-catalog-menu">
                      <label className="ops-search is-compact">
                        <Search size={14} aria-hidden />
                        <input
                          autoFocus
                          value={dryQuery}
                          onChange={(e) => setDryQuery(e.target.value)}
                          placeholder="Search catalog"
                        />
                      </label>
                      <div className="ops-catalog-list">
                        {dryMatches.length === 0 ? (
                          <p className="ops-catalog-empty">No catalog matches</p>
                        ) : (
                          dryMatches.map((item) => (
                            <button
                              key={item.name}
                              type="button"
                              className="ops-catalog-item"
                              onClick={() => addDryItem(item)}
                            >
                              <span>{item.name}</span>
                              <strong>${item.price.toFixed(2)}</strong>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="ops-chips">
                  {dryItems.length ? (
                    dryItems.map((item, index) => (
                      <span
                        key={`${item.name}-${index}`}
                        className="ops-chip"
                      >
                        {item.name}{" "}
                        <b>${item.price.toFixed(2)}</b>
                        <button
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => removeDryItem(index)}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="ops-chips-empty">No items selected</span>
                  )}
                </div>
              </section>

              <section className="ops-billing-card">
                <PanelTitleFixed
                  icon={CircleDollarSign}
                  title="Billing summary"
                  note="Laundry weight, dry-cleaning items, fees, and tip."
                />
                <div className="ops-billing-total">
                  <span>Calculated total</span>
                  <strong>
                    {previewTotal != null
                      ? `$${previewTotal.toFixed(2)}`
                      : selected.finalTotal != null
                        ? `$${selected.finalTotal.toFixed(2)}`
                        : "—"}
                  </strong>
                </div>
                <Button
                  type="button"
                  className="ops-btn-lg ops-billing-save"
                  disabled={saving}
                  onClick={() => void saveBilling()}
                >
                  Save total
                </Button>
                <p className="ops-billing-note">
                  This stores the total only. Card charging will be added later.
                </p>
              </section>
            </div>
          </article>
        )}
      </section>
    </>
  );
}
