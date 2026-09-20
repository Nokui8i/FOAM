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
  isEnRouteToPickup,
  isInProgressOrder,
  isWaitingForPickup,
  normalizeOrderStatus,
  orderPipelineIndex,
  orderStageBackLabel,
  orderStatusPrevious,
  servicesSummary,
  type DryCleanItem,
  type FoamOrder,
  type OrderPhoto,
  type OrderPhotoKind,
  type OrderStatus,
} from "@/lib/orders";
import { firstNameFromContact } from "@/lib/order-tracking";
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
const PRIMARY_FILTERS = FILTERS.slice(0, 3);
const MORE_FILTERS = FILTERS.slice(3);

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatCreatedAt(
  value: FoamOrder["createdAt"] | { toDate?: () => Date } | null | undefined
) {
  if (!value || typeof value !== "object" || typeof value.toDate !== "function") {
    return "—";
  }
  try {
    const date = value.toDate();
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
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
    trackKey: typeof data.trackKey === "string" ? data.trackKey : undefined,
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
  const [showMoreFilters, setShowMoreFilters] = useState(false);

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

  async function patchOrderDoc(
    order: FoamOrder,
    data: Record<string, unknown>,
    ok = "Saved."
  ) {
    setSaving(true);
    setError("");
    try {
      await updateDoc(doc(getFirebaseDb(), "orders", order.id), {
        ...data,
        statusUpdatedAt: serverTimestamp(),
        lastUpdatedBy: adminEmail,
      });

      const nextStatus =
        typeof data.status === "string"
          ? normalizeOrderStatus(data.status)
          : null;
      if (nextStatus && order.trackKey) {
        try {
          await updateDoc(doc(getFirebaseDb(), "orderTracks", order.trackKey), {
            status: nextStatus,
            updatedAt: serverTimestamp(),
          });
        } catch {
          /* older orders may lack a track doc */
        }
      }

      setOkMsg(ok);
    } catch {
      setError("Update failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function patchOrder(data: Record<string, unknown>, ok = "Saved.") {
    if (!selected) return;
    await patchOrderDoc(selected, data, ok);
  }

  async function setStatus(status: OrderStatus) {
    await patchOrder({ status }, `Status → ${shortStatus(status)}`);
    if (status === "delivered") setFilter("done");
    else if (status === "cancelled") setFilter("cancelled");
    else if (isWaitingForPickup(status)) setFilter("waiting");
    else if (isInProgressOrder(status)) setFilter("progress");
  }

  async function goBackStage() {
    if (!selected) return;
    const prev = orderStatusPrevious(selected.status);
    const label = orderStageBackLabel(selected.status);
    if (!prev || !label) return;
    const ok = window.confirm(
      `${label}? Customer tracking will move back to this step.`
    );
    if (!ok) return;
    await setStatus(prev);
  }

  async function markLeftForPickup(order: FoamOrder) {
    setSelectedId(order.id);
    await patchOrderDoc(
      order,
      { status: "confirmed" },
      "En route to pickup — customer tracking updated"
    );
    const first = firstNameFromContact(order.contact.name) || "there";
    const body = `Hi ${first}, this is FOAM — your courier is on the way to pick up your bags (${order.pickup.date} · ${order.pickup.slot}).`;
    window.open(waUrl(order.contact.phone, body), "_blank", "noopener,noreferrer");
    setFilter("waiting");
    onMobileViewChange("detail");
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

    if (selected.services.dryCleaning && dryItems.length === 0) {
      const ok = window.confirm(
        "This order includes dry cleaning, but no dry-cleaning items were added.\n\nContinue without dry-cleaning items?"
      );
      if (!ok) return;
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
        status: "washing",
        "pricing.finalTotalPending": false,
      },
      `Charged · $${finalTotal.toFixed(2)} · Washing`
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
    if (selected.status === "new") {
      return {
        label: "Left for pickup",
        next: "confirmed" as const,
      };
    }
    // Legacy "at plant" statuses + washing share one Washing stage
    if (
      isCollectedStage(selected.status) ||
      selected.status === "washing"
    ) {
      return {
        label: "Out for delivery",
        next: "out_for_delivery" as const,
      };
    }
    if (selected.status === "out_for_delivery") {
      return { label: "Mark delivered", next: "delivered" as const };
    }
    return null;
  })();

  const stageBackLabel = selected
    ? orderStageBackLabel(selected.status)
    : null;

  const customerMsg = selected
    ? `Hi ${selected.contact.name.split(" ")[0] || "there"}, this is FOAM about your pickup on ${selected.pickup.date} (${selected.pickup.slot}).`
    : "";

  const stage = selected ? orderPipelineIndex(selected.status) : 0;

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
            {PRIMARY_FILTERS.map((item) => (
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
            <button
              type="button"
              className={cn(
                "ops-filter-chip ops-filter-more",
                showMoreFilters && "is-open"
              )}
              aria-expanded={showMoreFilters}
              onClick={() => setShowMoreFilters((v) => !v)}
            >
              More
              <ChevronDown
                size={14}
                className={cn("ops-flow-chevron", showMoreFilters && "is-open")}
                aria-hidden
              />
            </button>
          </div>

          {showMoreFilters ||
          MORE_FILTERS.some((item) => item.id === filter) ? (
            <div
              className="ops-filter-row ops-filter-row-more"
              role="tablist"
              aria-label="More order tabs"
            >
              {MORE_FILTERS.map((item) => (
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
          ) : null}
        </div>

        {error && !selected ? <p className="ops-error ops-pad">{error}</p> : null}

        <div className="ops-list-body">
          {filtered.length === 0 ? (
            <p className="ops-empty">Live orders will appear here.</p>
          ) : (
            filtered.map((row) => (
              <div
                key={row.id}
                className={cn(
                  "ops-row",
                  selectedId === row.id && "is-active"
                )}
              >
                <button
                  type="button"
                  className="ops-row-select"
                  onClick={() => selectOrder(row.id)}
                >
                  <span className="ops-row-main">
                    <span className="ops-row-name">{row.contact.name}</span>
                    <span className="ops-row-sub">
                      {row.pickup.date} · {row.pickup.slot}
                    </span>
                    <span className="ops-row-meta">
                      Ordered {formatCreatedAt(row.createdAt)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "ops-status-pill",
                      row.status === "delivered" && "is-done",
                      row.status === "cancelled" && "is-cancelled",
                      row.status === "new" && "is-new",
                      isEnRouteToPickup(row.status) && "is-en-route"
                    )}
                  >
                    {shortStatus(row.status)}
                  </span>
                </button>
                {row.status === "new" ? (
                  <button
                    type="button"
                    className="ops-row-action"
                    disabled={saving}
                    onClick={() => void markLeftForPickup(row)}
                  >
                    <Truck size={14} aria-hidden />
                    Left for pickup
                  </button>
                ) : null}
              </div>
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
                        selected.status === "new" && "is-new",
                        isEnRouteToPickup(selected.status) && "is-en-route"
                      )}
                    >
                      {shortStatus(selected.status)}
                    </span>
                  </div>
                  <p className="ops-muted">
                    {selected.pickup.date} · {selected.pickup.slot}
                    {" · "}
                    Ordered {formatCreatedAt(selected.createdAt)}
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

                <div className="ops-timeline">
                  {ORDER_PIPELINE_STEPS.map((step, index) => {
                    const cancelled = selected.status === "cancelled";
                    const done = !cancelled && stage > index;
                    const active = !cancelled && stage === index;
                    return (
                      <div
                        key={step.id}
                        className={cn(
                          "ops-timeline-step",
                          done && "is-done",
                          active && "is-active"
                        )}
                      >
                        <div className="ops-timeline-node-row">
                          <span className="ops-timeline-dot">
                            {done ? <Check size={12} /> : index + 1}
                          </span>
                          {index < ORDER_PIPELINE_STEPS.length - 1 ? (
                            <span className="ops-timeline-line" />
                          ) : null}
                        </div>
                        <span className="ops-timeline-label">{step.label}</span>
                      </div>
                    );
                  })}
                </div>

                {selected.status === "cancelled" ? (
                  <div className="ops-cancelled-note">
                    <p className="ops-flow-done-note">
                      This order was cancelled — no further action needed.
                    </p>
                  </div>
                ) : (
                  <div className="ops-stage-card">
                    {stage === 0 ? (
                      selected.status === "new" ? (
                      <>
                        <div className="ops-stage-card-head">
                          <Truck size={16} aria-hidden />
                          <h3>Start pickup run</h3>
                          <span className="ops-stage-badge">Action needed</span>
                        </div>
                        <p className="ops-flow-done-note">
                          Mark Left for pickup when you leave for this stop.
                          The customer&rsquo;s tracking page updates, and WhatsApp
                          opens so you can notify them you&rsquo;re on the way.
                        </p>
                        <div className="ops-action-row">
                          <Button
                            type="button"
                            className="ops-btn-lg"
                            disabled={saving || uploadingPhoto}
                            onClick={() => void markLeftForPickup(selected)}
                          >
                            <Truck size={16} />
                            Left for pickup
                          </Button>
                        </div>
                      </>
                      ) : (
                      <>
                        <div className="ops-stage-card-head">
                          <Shirt size={16} aria-hidden />
                          <h3>At the customer&rsquo;s stop</h3>
                          <span className="ops-stage-badge">
                            {isEnRouteToPickup(selected.status)
                              ? "En route · collect"
                              : "Action needed"}
                          </span>
                        </div>

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
                              <p className="ops-field-label">Scale photo</p>
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
                            {selected.services.dryCleaning ? (
                              <span className="ops-required-tag"> · ordered</span>
                            ) : null}
                          </p>
                          {selected.services.dryCleaning && dryItems.length === 0 ? (
                            <p className="ops-dry-warn" role="status">
                              Customer ordered dry cleaning — add items, or you&rsquo;ll
                              be asked to confirm before charging.
                            </p>
                          ) : null}
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
                                  {item.name} <b>${item.price.toFixed(2)}</b>
                                  <button
                                    type="button"
                                    aria-label={`Remove ${item.name}`}
                                    onClick={() => removeDryItem(itemIndex)}
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
                          {stageBackLabel ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="ops-stage-back"
                              disabled={saving || uploadingPhoto}
                              onClick={() => void goBackStage()}
                            >
                              <ArrowLeft size={14} />
                              {stageBackLabel}
                            </Button>
                          ) : null}
                        </div>
                      </>
                      )
                    ) : null}

                    {stage === 1 ? (
                      <>
                        <div className="ops-stage-card-head">
                          <Weight size={16} aria-hidden />
                          <h3>Washing — nothing to do right now</h3>
                        </div>
                        <div className="ops-stage-stats">
                          <div>
                            <p className="ops-field-label">Weighed</p>
                            <p className="ops-stage-stat-value">
                              {selected.weightLbs
                                ? `${selected.weightLbs} lb`
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="ops-field-label">Charged</p>
                            <p className="ops-stage-stat-value">
                              {selected.finalTotal != null
                                ? `$${selected.finalTotal.toFixed(2)}`
                                : "—"}
                            </p>
                          </div>
                        </div>
                        {stageAction ? (
                          <div className="ops-action-row">
                            <Button
                              type="button"
                              className="ops-btn-lg"
                              disabled={saving || uploadingPhoto}
                              onClick={() => void setStatus(stageAction.next)}
                            >
                              <PackageCheck size={16} />
                              {stageAction.label}
                            </Button>
                            {stageBackLabel ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="ops-stage-back"
                                disabled={saving || uploadingPhoto}
                                onClick={() => void goBackStage()}
                              >
                                <ArrowLeft size={14} />
                                {stageBackLabel}
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {stage === 2 ? (
                      <>
                        <div className="ops-stage-card-head">
                          <Truck size={16} aria-hidden />
                          <h3>With the driver</h3>
                        </div>
                        <div className="ops-photo-block">
                          <p className="ops-field-label">Delivery photo</p>
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
                        {stageAction ? (
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
                            {stageBackLabel ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="ops-stage-back"
                                disabled={saving || uploadingPhoto}
                                onClick={() => void goBackStage()}
                              >
                                <ArrowLeft size={14} />
                                {stageBackLabel}
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {stage === 3 ? (
                      <>
                        <div className="ops-stage-card-head">
                          <Check size={16} aria-hidden />
                          <h3>Delivered — order complete</h3>
                        </div>
                        <p className="ops-flow-done-note">
                          {selected.finalTotal != null
                            ? `Charged $${selected.finalTotal.toFixed(2)}${
                                selected.weightLbs
                                  ? ` · ${selected.weightLbs} lb`
                                  : ""
                              }`
                            : "Completed"}
                          {deliveryPhotos.length
                            ? " · Delivered with photo"
                            : ""}
                        </p>
                        {stageBackLabel ? (
                          <div className="ops-action-row">
                            <Button
                              type="button"
                              variant="outline"
                              className="ops-stage-back"
                              disabled={saving || uploadingPhoto}
                              onClick={() => void goBackStage()}
                            >
                              <ArrowLeft size={14} />
                              {stageBackLabel}
                            </Button>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                )}
              </section>
              </div>
            </div>
          </article>
        )}
      </section>
    </>
  );
}
