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
} from "firebase/firestore";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
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
import { uploadOrderPhoto } from "@/lib/order-photos";
import {
  ORDER_PIPELINE_STEPS,
  ORDER_STATUS_LABELS,
  computeFinalTotal,
  dryCleanItemsTotal,
  formatOrderAddress,
  isCollectedStage,
  isInProgressOrder,
  isWaitingForPickup,
  normalizeOrderStatus,
  orderPipelineIndex,
  servicesSummary,
  type DryCleanItem,
  type FoamOrder,
  type OrderPhoto,
  type OrderPhotoKind,
  type OrderStatus,
} from "@/lib/orders";
import { BUSINESS_WHATSAPP } from "@/lib/site-config";
import { cn } from "@/lib/utils";

type Filter =
  | "waiting"
  | "progress"
  | "today"
  | "upcoming"
  | "cancelled"
  | "done"
  | "all";
type MobileView = "list" | "detail";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "waiting", label: "Waiting" },
  { id: "progress", label: "In progress" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "cancelled", label: "Cancelled" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];

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
  return ORDER_STATUS_LABELS[status];
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
    photos: Array.isArray(data.photos)
      ? (data.photos as OrderPhoto[]).filter(
          (photo) => photo && typeof photo.url === "string"
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
  const [filter, setFilter] = useState<Filter>("waiting");
  const [queryText, setQueryText] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [dryItems, setDryItems] = useState<DryCleanItem[]>([]);
  const [dryQuery, setDryQuery] = useState("");
  const [openCatalog, setOpenCatalog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>(
    {}
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
      waiting: rows.filter((r) => isWaitingForPickup(r.status)).length,
      progress: rows.filter((r) => isInProgressOrder(r.status)).length,
      today: rows.filter(
        (r) => r.pickup.date === today && r.status !== "cancelled"
      ).length,
      upcoming: rows.filter(
        (r) =>
          r.pickup.date > today &&
          r.status !== "cancelled" &&
          r.status !== "delivered"
      ).length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      done: rows.filter((r) => r.status === "delivered").length,
      all: rows.length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const today = todayIso();
    return rows.filter((row) => {
      if (filter === "waiting" && !isWaitingForPickup(row.status)) return false;
      if (filter === "progress" && !isInProgressOrder(row.status)) return false;
      if (
        filter === "today" &&
        (row.pickup.date !== today || row.status === "cancelled")
      ) {
        return false;
      }
      if (
        filter === "upcoming" &&
        !(
          row.pickup.date > today &&
          row.status !== "cancelled" &&
          row.status !== "delivered"
        )
      ) {
        return false;
      }
      if (filter === "cancelled" && row.status !== "cancelled") return false;
      if (filter === "done" && row.status !== "delivered") return false;
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

  useEffect(() => {
    if (!selected) return;
    const current = orderPipelineIndex(selected.status);
    const activeId = ORDER_PIPELINE_STEPS[Math.max(0, current)]?.id;
    setExpandedSteps(activeId ? { [activeId]: true } : {});
  }, [selected?.id, selected?.status]);

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
    if (status === "delivered") setFilter("done");
    else if (status === "cancelled") setFilter("cancelled");
    else if (isInProgressOrder(status)) setFilter("progress");
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
    if (isWaitingForPickup(selected.status)) {
      await chargeAndCollect();
      return;
    }

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
        "pricing.finalTotalPending": false,
      },
      `Total updated · $${finalTotal.toFixed(2)}`
    );
  }

  const weightPhotos = useMemo(
    () => (selected?.photos ?? []).filter((photo) => photo.kind === "weight"),
    [selected?.photos]
  );

  const deliveryPhotos = useMemo(
    () => (selected?.photos ?? []).filter((photo) => photo.kind === "return"),
    [selected?.photos]
  );

  async function handleOrderPhoto(file: File | null, kind: OrderPhotoKind) {
    if (!selected || !file) return;
    setUploadingPhoto(true);
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
          kind,
          createdAt: new Date().toISOString(),
        }),
        statusUpdatedAt: serverTimestamp(),
        lastUpdatedBy: adminEmail,
      });
      setOkMsg(kind === "return" ? "Delivery photo saved." : "Photo saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function markDelivered() {
    if (!selected) return;
    if (deliveryPhotos.length === 0) {
      setError("Upload a delivery photo before marking delivered.");
      return;
    }
    await setStatus("delivered");
  }

  async function chargeAndCollect() {
    if (!selected) return;
    const hasLaundry = selected.services.laundry;
    let lbs = 0;
    if (hasLaundry) {
      lbs = Number(weightInput);
      if (!Number.isFinite(lbs) || lbs <= 0) {
        setError("Enter the weight in pounds before charging.");
        return;
      }
      if (weightPhotos.length === 0) {
        setError("Upload a photo of the scale before charging.");
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
        status: "picked_up",
        "pricing.finalTotalPending": false,
      },
      `Charged · $${finalTotal.toFixed(2)} · Collected`
    );
    setFilter("progress");
  }

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

  const stageAction = (() => {
    if (!selected || selected.status === "cancelled") return null;
    if (isCollectedStage(selected.status)) {
      return { label: "Start washing", next: "washing" as const };
    }
    if (selected.status === "washing") {
      return {
        label: "Left for drop-off",
        next: "out_for_delivery" as const,
      };
    }
    if (selected.status === "out_for_delivery") {
      return { label: "Mark delivered", next: "delivered" as const };
    }
    return null;
  })();

  const customerMsg = selected
    ? `Hi ${selected.contact.name.split(" ")[0] || "there"}, this is FOAM about your pickup on ${selected.pickup.date} (${selected.pickup.slot}).`
    : "";

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

          <div className="ops-filter-row" role="tablist" aria-label="Order tabs">
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
                <span className="ops-filter-count">{counts[item.id]}</span>
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
                <span className="ops-row-main">
                  <span className="ops-row-name">{row.contact.name}</span>
                </span>
                <span
                  className={cn(
                    "ops-status-pill",
                    row.status === "delivered" && "is-done",
                    row.status === "cancelled" && "is-cancelled",
                    isWaitingForPickup(row.status) && "is-new"
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
                        isWaitingForPickup(selected.status) && "is-new"
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

            <div className="ops-detail-body">
              <aside className="ops-detail-aside" aria-label="Stop details">
                <section className="ops-pickup-card">
                  <p className="ops-pickup-label">Scheduled pickup</p>
                  <div className="ops-pickup-grid">
                    <div>
                      <p className="ops-field-label">Date</p>
                      <p className="ops-pickup-value">
                        {selected.pickup.date || "—"}
                      </p>
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
                      {selected.pickup.repeat ||
                      selected.pickup.repeatRequested ? (
                        <span className="ops-repeat-pill">
                          <Repeat2 size={12} />
                          Weekly repeat
                        </span>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className="ops-card ops-aside-card">
                  <PanelTitleFixed icon={MapPin} title="Customer & stop" />
                  <div className="ops-fields ops-fields-stack">
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
              </aside>

              <div className="ops-detail-main">
              <section className="ops-flow" aria-label="Order stages">
                <div className="ops-flow-head">
                  <PanelTitleFixed icon={Truck} title="Order progress" />
                </div>

                {ORDER_PIPELINE_STEPS.map((step, index) => {
                  const current = orderPipelineIndex(selected.status);
                  const done =
                    selected.status !== "cancelled" && current > index;
                  const active =
                    selected.status !== "cancelled" && current === index;
                  const upcoming = !done && !active;
                  const open = expandedSteps[step.id] ?? active;

                  return (
                    <div
                      key={step.id}
                      className={cn(
                        "ops-flow-step",
                        done && "is-done",
                        active && "is-active",
                        upcoming && "is-upcoming",
                        open && "is-open"
                      )}
                    >
                      <div className="ops-flow-rail" aria-hidden>
                        <span className="ops-flow-dot">
                          {done ? <Check size={12} /> : index + 1}
                        </span>
                        {index < ORDER_PIPELINE_STEPS.length - 1 ? (
                          <span className="ops-flow-line" />
                        ) : null}
                      </div>

                      <div className="ops-flow-body">
                        <button
                          type="button"
                          className="ops-flow-title-row"
                          aria-expanded={open}
                          onClick={() =>
                            setExpandedSteps(() =>
                              open && !active
                                ? {
                                    [ORDER_PIPELINE_STEPS[
                                      Math.max(0, current)
                                    ]?.id ?? step.id]: true,
                                  }
                                : { [step.id]: true }
                            )
                          }
                        >
                          <h3>{step.label}</h3>
                          <span className="ops-flow-title-end">
                            <span className="ops-flow-state">
                              {done ? "Done" : active ? "Now" : "Next"}
                            </span>
                            <ChevronDown
                              size={16}
                              className={cn(
                                "ops-flow-chevron",
                                open && "is-open"
                              )}
                              aria-hidden
                            />
                          </span>
                        </button>

                        {open ? (
                          <div className="ops-flow-panel">
                            {active && index === 0 ? (
                              <>
                            {selected.services.laundry ? (
                              <>
                                <label className="ops-weight-field">
                                  Weight in pounds
                                  <span className="ops-weight-input">
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      min={0}
                                      step={0.1}
                                      value={weightInput}
                                      onChange={(e) =>
                                        setWeightInput(e.target.value)
                                      }
                                      placeholder="0.0"
                                    />
                                    <span>lb</span>
                                  </span>
                                </label>
                                <div className="ops-photo-block">
                                  <p className="ops-field-label">
                                    Scale photo
                                  </p>
                                  <label className="ops-photo-upload is-primary">
                                    <Camera size={16} aria-hidden />
                                    <span>
                                      {uploadingPhoto
                                        ? "Uploading…"
                                        : weightPhotos.length
                                          ? "Add another scale photo"
                                          : "Upload scale photo"}
                                    </span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      capture="environment"
                                      disabled={uploadingPhoto || saving}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0] ?? null;
                                        void handleOrderPhoto(file, "weight");
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                  {weightPhotos.length ? (
                                    <div className="ops-photo-thumbs">
                                      {weightPhotos.map((photo) => (
                                        <a
                                          key={photo.url}
                                          href={photo.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="ops-photo-thumb"
                                        >
                                          <img
                                            src={photo.url}
                                            alt="Weight scale photo"
                                          />
                                        </a>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </>
                            ) : null}

                            <div className="ops-flow-subsection">
                              <p className="ops-field-label">
                                Dry cleaning items
                              </p>
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
                                        onChange={(e) =>
                                          setDryQuery(e.target.value)
                                        }
                                        placeholder="Search catalog"
                                      />
                                    </label>
                                    <div className="ops-catalog-list">
                                      {dryMatches.length === 0 ? (
                                        <p className="ops-catalog-empty">
                                          No catalog matches
                                        </p>
                                      ) : (
                                        dryMatches.map((item) => (
                                          <button
                                            key={item.name}
                                            type="button"
                                            className="ops-catalog-item"
                                            onClick={() => addDryItem(item)}
                                          >
                                            <span>{item.name}</span>
                                            <strong>
                                              ${item.price.toFixed(2)}
                                            </strong>
                                          </button>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              <div className="ops-chips">
                                {dryItems.length ? (
                                  dryItems.map((item, itemIndex) => (
                                    <span
                                      key={`${item.name}-${itemIndex}`}
                                      className="ops-chip"
                                    >
                                      {item.name}{" "}
                                      <b>${item.price.toFixed(2)}</b>
                                      <button
                                        type="button"
                                        aria-label={`Remove ${item.name}`}
                                        onClick={() =>
                                          removeDryItem(itemIndex)
                                        }
                                      >
                                        <X size={12} />
                                      </button>
                                    </span>
                                  ))
                                ) : (
                                  <span className="ops-chips-empty">
                                    No items selected
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="ops-billing-card">
                              <div className="ops-billing-total">
                                <span>Total</span>
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
                                className="ops-billing-save"
                                disabled={saving || uploadingPhoto}
                                onClick={() => void saveBilling()}
                              >
                                Charge & mark collected
                              </Button>
                            </div>
                              </>
                            ) : null}

                            {active &&
                            selected.status === "out_for_delivery" ? (
                              <div className="ops-photo-block">
                                <p className="ops-field-label">
                                  Delivery photo
                                </p>
                                <label className="ops-photo-upload is-primary">
                                  <Camera size={16} aria-hidden />
                                  <span>
                                    {uploadingPhoto
                                      ? "Uploading…"
                                      : deliveryPhotos.length
                                        ? "Add another delivery photo"
                                        : "Upload delivery photo"}
                                  </span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    disabled={uploadingPhoto || saving}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] ?? null;
                                      void handleOrderPhoto(file, "return");
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                                {deliveryPhotos.length ? (
                                  <div className="ops-photo-thumbs">
                                    {deliveryPhotos.map((photo) => (
                                      <a
                                        key={photo.url}
                                        href={photo.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="ops-photo-thumb"
                                      >
                                        <img
                                          src={photo.url}
                                          alt="Delivery proof photo"
                                        />
                                      </a>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {active && stageAction ? (
                              <div className="ops-action-row">
                                <Button
                                  type="button"
                                  className="ops-btn-lg"
                                  disabled={saving || uploadingPhoto}
                                  onClick={() => {
                                    if (stageAction.next === "delivered") {
                                      void markDelivered();
                                      return;
                                    }
                                    void setStatus(stageAction.next);
                                  }}
                                >
                                  <PackageCheck size={16} />
                                  {stageAction.label}
                                </Button>
                              </div>
                            ) : null}

                            {done ? (
                              <p className="ops-flow-done-note">
                                {index === 0 && selected.finalTotal != null
                                  ? `Charged $${selected.finalTotal.toFixed(2)}${
                                      selected.weightLbs
                                        ? ` · ${selected.weightLbs} lb`
                                        : ""
                                    }`
                                  : index === 3 && deliveryPhotos.length
                                    ? "Delivered with photo"
                                    : "Completed"}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </section>
              </div>
            </div>
          </article>
        )}
      </section>
    </>
  );
}
