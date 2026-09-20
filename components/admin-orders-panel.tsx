"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  CalendarDays,
  Camera,
  Check,
  Clock3,
  ExternalLink,
  MapPin,
  MessageCircle,
  PackageCheck,
  Phone,
  Search,
  Truck,
  UserRound,
  X,
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
  isEnRouteToPickup,
  isReadyForDelivery,
  isWaitingForPickup,
  isWashingOrder,
  normalizeOrderStatus,
  orderDisplayId,
  orderListBadge,
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

type Filter = "all" | "waiting" | "progress" | "ready";
type MobileView = "list" | "detail";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "progress", label: "In Progress" },
  { id: "ready", label: "Ready" },
];

function formatCreatedAt(
  value: FoamOrder["createdAt"] | { toDate?: () => Date } | null | undefined
) {
  if (!value || typeof value !== "object" || typeof value.toDate !== "function") {
    return "—";
  }
  try {
    const date = value.toDate();
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/** "Sep 21, 2026" style for list + detail meta */
function formatPickupDate(date: string) {
  if (!date) return "—";
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSlotShort(slot: string) {
  if (!slot) return "—";
  return slot
    .replace(/\s*-\s*/g, "–")
    .replace(/\bam\b/gi, "am")
    .replace(/\bpm\b/gi, "pm");
}

function listBadgeClass(status: OrderStatus) {
  switch (status) {
    case "new":
      return "is-waiting";
    case "confirmed":
      return "is-en-route";
    case "picked_up":
    case "weighed":
    case "washing":
      return "is-progress";
    case "out_for_delivery":
      return "is-ready";
    case "delivered":
      return "is-done";
    case "cancelled":
      return "is-cancelled";
    default:
      return "";
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
    opsIssue: typeof data.opsIssue === "string" ? data.opsIssue : "",
    opsNotes: typeof data.opsNotes === "string" ? data.opsNotes : "",
    refundStatus:
      typeof data.refundStatus === "string" ? data.refundStatus : "none",
    refundAmount:
      typeof data.refundAmount === "number" ? data.refundAmount : null,
    cancelReason:
      typeof data.cancelReason === "string" ? data.cancelReason : "",
  };
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
  const catalogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openCatalog) return;

    function handlePointerDown(event: PointerEvent) {
      const root = catalogRef.current;
      if (!root) return;
      const target = event.target;
      if (target instanceof Node && root.contains(target)) return;
      setOpenCatalog(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenCatalog(false);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openCatalog]);

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

  const counts = useMemo(
    () => ({
      all: rows.length,
      waiting: rows.filter((r) => isWaitingForPickup(r.status)).length,
      progress: rows.filter((r) => isWashingOrder(r.status)).length,
      ready: rows.filter((r) => isReadyForDelivery(r.status)).length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "waiting" && !isWaitingForPickup(row.status)) return false;
      if (filter === "progress" && !isWashingOrder(row.status)) return false;
      if (filter === "ready" && !isReadyForDelivery(row.status)) return false;
      if (!q) return true;
      const hay = [
        row.contact.name,
        row.contact.email,
        row.contact.phone,
        row.pickup.address,
        row.pickup.zip,
        row.id,
        orderDisplayId(row.id),
        ORDER_STATUS_LABELS[row.status],
        orderListBadge(row.status),
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
    if (status === "delivered" || status === "cancelled") {
      setFilter("all");
    }
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
      "Driver left for pickup — customer tracking updated"
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

  const stageBackLabel = selected
    ? orderStageBackLabel(selected.status)
    : null;

  const stage = selected ? orderPipelineIndex(selected.status) : 0;
  const activeStep = ORDER_PIPELINE_STEPS[Math.max(0, stage)];
  const stepNumber = Math.max(1, stage + 1);

  const workflowHelp = (() => {
    if (!selected) return "";
    if (selected.status === "cancelled") {
      return `This order was cancelled${
        selected.cancelReason ? ` · ${selected.cancelReason}` : ""
      } — no further action needed.`;
    }
    if (selected.status === "new") {
      return "Mark Left for pickup when you leave for this stop. Tracking updates and WhatsApp opens so you can notify the customer.";
    }
    if (isEnRouteToPickup(selected.status)) {
      return "At the stop: enter weight and scale photo, add dry-clean items if needed, then charge to move into Washing.";
    }
    if (stage === 1) {
      return "Order is washing at the plant. Tap Out for delivery when bags are ready to go.";
    }
    if (stage === 2) {
      return "Upload a return photo, then Mark delivered when the customer has their bags.";
    }
    if (stage === 3) {
      return selected.finalTotal != null
        ? `Delivery complete · Charged $${selected.finalTotal.toFixed(2)}${
            selected.weightLbs ? ` · ${selected.weightLbs} lb` : ""
          }`
        : "Delivery is complete.";
    }
    return "Complete the current step, then move this order forward.";
  })();

  const canCharge =
    !!selected &&
    isWaitingForPickup(selected.status) &&
    selected.status !== "new";

  const customerMsg = selected
    ? `Hi ${selected.contact.name.split(" ")[0] || "there"}, this is FOAM about your pickup on ${selected.pickup.date} (${selected.pickup.slot}).`
    : "";

  function selectOrder(id: string) {
    setSelectedId(id);
    onMobileViewChange("detail");
  }

  function renderAtStopWorkspace() {
    if (!selected) return null;

    if (selected.status === "new") {
      return (
        <>
          <p className="ops-muted ops-step-help">{workflowHelp}</p>
          <div className="ops-action-row">
            {stageBackLabel ? (
              <button
                type="button"
                className="ops-stage-back"
                disabled={saving || uploadingPhoto}
                onClick={() => void goBackStage()}
              >
                <ArrowLeft size={14} aria-hidden />
                {stageBackLabel}
              </button>
            ) : null}
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
      );
    }

    // confirmed / en route — weigh, photo, dry clean, bill
    return (
      <>
        <p className="ops-muted ops-step-help">{workflowHelp}</p>

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

        <div className="ops-photo-block">
          <label className="ops-photo-upload is-primary">
            <Camera size={16} aria-hidden />
            <span>
              {uploadingPhoto
                ? "Uploading…"
                : weightPhotos.length
                  ? "Add another scale photo"
                  : "Add scale photo"}
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
          <div className="ops-photo-thumbs ops-photo-area">
            {weightPhotos.length ? (
              weightPhotos.map((photo) => (
                <a
                  key={photo.url}
                  href={photo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ops-photo-thumb"
                >
                  <img src={photo.url} alt="Weight scale photo" />
                </a>
              ))
            ) : (
              <span className="ops-chips-empty">
                Photos appear here after upload
              </span>
            )}
          </div>
        </div>

        <div className="ops-flow-subsection">
          <div className="ops-catalog" ref={catalogRef}>
            <Button
              type="button"
              variant="outline"
              className="ops-catalog-toggle"
              onClick={() => setOpenCatalog((v) => !v)}
            >
              Dry cleaning catalog
              <span className="ops-catalog-toggle-hint">
                {openCatalog ? "Close" : "Open"}
              </span>
            </Button>
            {openCatalog ? (
              <div className="ops-catalog-menu" role="listbox" aria-label="Dry cleaning catalog">
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
          {selected.services.dryCleaning && dryItems.length === 0 ? (
            <p className="ops-dry-warn" role="status">
              Customer ordered dry cleaning — add items, or you&rsquo;ll be asked
              to confirm before charging.
            </p>
          ) : null}
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
              <span className="ops-chips-empty">No dry-clean items</span>
            )}
          </div>
        </div>

        <div className="ops-billing-card">
          <div className="ops-billing-total">
            <span>Billing preview</span>
            <strong>
              {previewTotal != null
                ? `$${previewTotal.toFixed(2)}`
                : selected.finalTotal != null
                  ? `$${selected.finalTotal.toFixed(2)}`
                  : "—"}
            </strong>
          </div>
          <div className="ops-action-row">
            {stageBackLabel ? (
              <button
                type="button"
                className="ops-stage-back"
                disabled={saving || uploadingPhoto}
                onClick={() => void goBackStage()}
              >
                <ArrowLeft size={14} aria-hidden />
                {stageBackLabel}
              </button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="ops-btn-lg"
              disabled={saving || uploadingPhoto}
              onClick={() => void saveBilling()}
            >
              Save &amp; close
            </Button>
            {canCharge ? (
              <Button
                type="button"
                className="ops-btn-lg"
                disabled={saving || uploadingPhoto}
                onClick={() => void chargeAndCollect()}
              >
                <PackageCheck size={16} />
                Next step → Mark as Washing
              </Button>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  function renderWorkspaceBody() {
    if (!selected) return null;

    if (selected.status === "cancelled") {
      return (
        <div className="ops-cancelled-note">
          <p className="ops-flow-done-note">{workflowHelp}</p>
        </div>
      );
    }

    if (stage === 0) {
      return renderAtStopWorkspace();
    }

    if (stage === 1) {
      return (
        <>
          <p className="ops-muted ops-step-help">{workflowHelp}</p>
          <p className="ops-muted" style={{ margin: 0 }}>
            {servicesSummary(selected)}
            {selected.weightLbs != null ? ` · ${selected.weightLbs} lb` : ""}
            {selected.finalTotal != null
              ? ` · $${selected.finalTotal.toFixed(2)}`
              : ""}
          </p>
          <div className="ops-action-row">
            {stageBackLabel ? (
              <button
                type="button"
                className="ops-stage-back"
                disabled={saving || uploadingPhoto}
                onClick={() => void goBackStage()}
              >
                <ArrowLeft size={14} aria-hidden />
                {stageBackLabel}
              </button>
            ) : null}
            <Button
              type="button"
              className="ops-btn-lg"
              disabled={saving || uploadingPhoto}
              onClick={() => void setStatus("out_for_delivery")}
            >
              <Truck size={16} />
              Out for delivery
            </Button>
          </div>
        </>
      );
    }

    if (stage === 2) {
      return (
        <>
          <p className="ops-muted ops-step-help">{workflowHelp}</p>
          <div className="ops-photo-block">
            <label className="ops-photo-upload is-primary">
              <Camera size={16} aria-hidden />
              <span>
                {uploadingPhoto
                  ? "Uploading…"
                  : deliveryPhotos.length
                    ? "Add another return photo"
                    : "Add return photo"}
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
            <div className="ops-photo-thumbs ops-photo-area">
              {deliveryPhotos.length ? (
                deliveryPhotos.map((photo) => (
                  <a
                    key={photo.url}
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ops-photo-thumb"
                  >
                    <img src={photo.url} alt="Delivery proof photo" />
                  </a>
                ))
              ) : (
                <span className="ops-chips-empty">
                  Photos appear here after upload
                </span>
              )}
            </div>
          </div>
          <div className="ops-action-row">
            {stageBackLabel ? (
              <button
                type="button"
                className="ops-stage-back"
                disabled={saving || uploadingPhoto}
                onClick={() => void goBackStage()}
              >
                <ArrowLeft size={14} aria-hidden />
                {stageBackLabel}
              </button>
            ) : null}
            <Button
              type="button"
              className="ops-btn-lg"
              disabled={saving || uploadingPhoto}
              onClick={() => void markDelivered()}
            >
              <PackageCheck size={16} />
              Mark delivered
            </Button>
          </div>
        </>
      );
    }

    // stage 3 — complete
    return (
      <>
        <p className="ops-muted ops-step-help">{workflowHelp}</p>
        <div className="ops-stage-stats">
          <div>
            <p className="ops-field-label">Total</p>
            <p className="ops-stage-stat-value">
              {selected.finalTotal != null
                ? `$${selected.finalTotal.toFixed(2)}`
                : "—"}
            </p>
          </div>
          {selected.weightLbs != null ? (
            <div>
              <p className="ops-field-label">Weight</p>
              <p className="ops-stage-stat-value">{selected.weightLbs} lb</p>
            </div>
          ) : null}
        </div>
        {stageBackLabel ? (
          <button
            type="button"
            className="ops-stage-back"
            disabled={saving || uploadingPhoto}
            onClick={() => void goBackStage()}
          >
            <ArrowLeft size={14} aria-hidden />
            {stageBackLabel}
          </button>
        ) : null}
      </>
    );
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
              <h1 className="ops-list-title">Orders</h1>
            </div>
            <span className="ops-count-chip">{counts[filter]}</span>
          </div>

          <label className="ops-search">
            <Search size={16} aria-hidden />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search orders, name, phone..."
            />
          </label>

          <div className="ops-filter-row" role="group" aria-label="Order filters">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
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

        <div className="ops-list-scroll">
          <div className="ops-list-card">
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
                        {formatPickupDate(row.pickup.date)} ·{" "}
                        {formatSlotShort(row.pickup.slot)}
                      </span>
                      <span className="ops-row-meta">
                        {orderDisplayId(row.id)}
                        {" · "}
                        {row.finalTotal != null
                          ? `$${row.finalTotal.toFixed(2)}`
                          : "—"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "ops-status-pill",
                        listBadgeClass(row.status)
                      )}
                    >
                      {orderListBadge(row.status)}
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
                className="ops-back ops-back-labeled"
                onClick={() => onMobileViewChange("list")}
              >
                <ArrowLeft size={16} />
                Back to orders
              </Button>

              <div className="ops-detail-head-row">
                <div className="ops-detail-head-main">
                  <p className="ops-breadcrumb">
                    Orders <span aria-hidden>&gt;</span>{" "}
                    {orderDisplayId(selected.id)}
                  </p>
                  <div className="ops-detail-name-row">
                    <h2>{selected.contact.name}</h2>
                    <span
                      className={cn(
                        "ops-status-pill is-lg",
                        listBadgeClass(selected.status)
                      )}
                    >
                      {shortStatus(selected.status)}
                    </span>
                  </div>
                  <p className="ops-customer-address">
                    <MapPin size={14} aria-hidden />
                    {formatOrderAddress(selected)}
                  </p>
                  <div className="ops-schedule" aria-label="Pickup schedule">
                    <div className="ops-schedule-item">
                      <p className="ops-field-label">Pickup date</p>
                      <p className="ops-schedule-value">
                        <CalendarDays size={16} aria-hidden />
                        {formatPickupDate(selected.pickup.date)}
                      </p>
                    </div>
                    <div className="ops-schedule-item">
                      <p className="ops-field-label">Time window</p>
                      <p className="ops-schedule-value is-emphasis">
                        <Clock3 size={16} aria-hidden />
                        {formatSlotShort(selected.pickup.slot)}
                      </p>
                    </div>
                    <div className="ops-schedule-item">
                      <p className="ops-field-label">Ordered</p>
                      <p className="ops-schedule-value is-muted">
                        {formatCreatedAt(selected.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="ops-fields ops-fields-inline">
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
                    <div>
                      <p className="ops-field-label">Services</p>
                      <p>{servicesSummary(selected)}</p>
                    </div>
                  </div>
                  {selected.pickup.notes ? (
                    <div className="ops-access-note">
                      <p className="ops-field-label">Access notes</p>
                      <p>{selected.pickup.notes}</p>
                    </div>
                  ) : null}
                  <a
                    className="ops-link"
                    href={mapsUrl(selected)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Maps <ExternalLink size={14} />
                  </a>
                </div>
                <div className="ops-icon-row">
                  <a
                    className="ops-icon-btn"
                    href={`tel:${selected.contact.phone}`}
                    aria-label="Call"
                    title="Call"
                  >
                    <Phone size={16} />
                  </a>
                  <a
                    className="ops-icon-btn"
                    href={waUrl(selected.contact.phone, customerMsg)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="WhatsApp"
                    title="WhatsApp"
                  >
                    <MessageCircle size={16} />
                  </a>
                  <a
                    className="ops-icon-btn"
                    href={mapsUrl(selected)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Maps"
                    title="Maps"
                  >
                    <MapPin size={16} />
                  </a>
                </div>
              </div>
            </div>

            {(okMsg || error) && (
              <p className={cn("ops-flash", error ? "is-error" : "is-ok")}>
                {error || okMsg}
              </p>
            )}

            <div className="ops-detail-stack">
              <section className="ops-card ops-workflow-card">
                <div className="ops-timeline" role="list">
                  {ORDER_PIPELINE_STEPS.map((step, index) => {
                    const cancelled = selected.status === "cancelled";
                    const done = !cancelled && stage > index;
                    const active = !cancelled && stage === index;
                    const canJumpBack =
                      !cancelled &&
                      done &&
                      Boolean(stageBackLabel) &&
                      index === stage - 1;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        role="listitem"
                        className={cn(
                          "ops-timeline-step",
                          done && "is-done",
                          active && "is-active",
                          canJumpBack && "is-backable"
                        )}
                        disabled={!canJumpBack || saving || uploadingPhoto}
                        title={
                          canJumpBack ? stageBackLabel ?? undefined : undefined
                        }
                        onClick={() => {
                          if (!canJumpBack) return;
                          void goBackStage();
                        }}
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
                        <span className="ops-timeline-hint">
                          {step.actionHint}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="ops-stage-card">
                  <div className="ops-stage-card-head">
                    <UserRound size={18} aria-hidden />
                    <h3>
                      {selected.status === "cancelled"
                        ? "Order cancelled"
                        : `Step ${stepNumber} of 4: ${activeStep?.label ?? ""}`}
                    </h3>
                    {selected.status !== "cancelled" ? (
                      <span className="ops-stage-badge">
                        {activeStep?.actionHint}
                      </span>
                    ) : null}
                  </div>
                  {renderWorkspaceBody()}
                </div>
              </section>
            </div>
          </article>
        )}
      </section>
    </>
  );
}
