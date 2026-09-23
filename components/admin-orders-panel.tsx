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
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  ClipboardList,
  Clock,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Minus,
  MoreHorizontal,
  PackageCheck,
  Phone,
  Plus,
  Scale,
  Search,
  Shirt,
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
  compareOrdersByPickupSchedule,
  isDoneOrder,
  isEnRouteToPickup,
  isFuturePickupOrder,
  isReadyForDelivery,
  isWaitingForPickup,
  isWaitingTodayOrder,
  isWashingOrder,
  normalizeOrderStatus,
  orderDisplayId,
  orderListBadge,
  orderPipelineIndex,
  orderStageBackLabel,
  orderStatusPrevious,
  isOrderCharged,
  servicesSummary,
  type DryCleanItem,
  type FoamOrder,
  type OrderPhoto,
  type OrderPhotoKind,
  type OrderStatus,
} from "@/lib/orders";
import { customerVisiblePhotos, firstNameFromContact } from "@/lib/order-tracking";
import { BUSINESS_WHATSAPP } from "@/lib/site-config";
import { cn } from "@/lib/utils";
import { useQueryReplace } from "@/lib/use-query-replace";

type Filter = "waiting" | "progress" | "ready" | "done" | "all";
type MobileView = "list" | "detail";
type OrdersMode = "today" | "future";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "waiting", label: "Waiting" },
  { id: "progress", label: "In Progress" },
  { id: "ready", label: "Ready" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];

const ROW_FILTERS = FILTERS.filter((item) => item.id !== "all");

const FILTER_IDS = new Set<string>(FILTERS.map((f) => f.id));

function parseFilter(raw: string | null, mode: OrdersMode): Filter {
  if (mode === "future") return "all";
  if (raw && FILTER_IDS.has(raw)) return raw as Filter;
  return "waiting";
}

function formatPickupDate(date: string, withYear = false) {
  if (!date) return "—";
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
  });
}

function formatSlotShort(slot: string) {
  if (!slot) return "—";
  return slot
    .replace(/\s*-\s*/g, " – ")
    .replace(/\bam\b/gi, "am")
    .replace(/\bpm\b/gi, "pm");
}

function formatOrderedAt(createdAt: FoamOrder["createdAt"]) {
  if (!createdAt || typeof createdAt.toDate !== "function") return null;
  try {
    const d = createdAt.toDate();
    if (Number.isNaN(d.getTime())) return null;
    const date = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const time = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `Ordered ${date}, ${time}`;
  } catch {
    return null;
  }
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
      return "is-en-route";
    case "delivered":
      return "is-ready";
    case "cancelled":
      return "is-cancelled";
    default:
      return "is-waiting";
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
  mode = "today",
  adminEmail,
  mobileView,
  onMobileViewChange,
}: {
  mode?: OrdersMode;
  adminEmail: string;
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
}) {
  const { searchParams, replaceQuery } = useQueryReplace();
  const [rows, setRows] = useState<FoamOrder[]>([]);
  const selectedId = searchParams.get("id");
  const filter = parseFilter(searchParams.get("filter"), mode);
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

  function setFilter(next: Filter) {
    replaceQuery({
      filter: next === "waiting" ? null : next,
      id: null,
      view: null,
    });
  }

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
        setError("");
      },
      () => {
        setError("Could not load orders. Check admin permissions.");
      }
    );
  }, []);

  const counts = useMemo(
    () => ({
      waiting: rows.filter((r) => isWaitingTodayOrder(r)).length,
      progress: rows.filter((r) => isWashingOrder(r.status)).length,
      ready: rows.filter((r) => isReadyForDelivery(r.status)).length,
      done: rows.filter((r) => isDoneOrder(r.status)).length,
      all: rows.filter((r) => !isFuturePickupOrder(r)).length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const matched = rows.filter((row) => {
      if (mode === "future") {
        if (!isFuturePickupOrder(row)) return false;
      } else {
        if (isFuturePickupOrder(row)) return false;
        if (filter === "waiting" && !isWaitingTodayOrder(row)) return false;
        if (filter === "progress" && !isWashingOrder(row.status)) return false;
        if (filter === "ready" && !isReadyForDelivery(row.status)) return false;
        if (filter === "done" && !isDoneOrder(row.status)) return false;
      }
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

    if (mode === "future" || filter === "waiting" || filter === "ready") {
      return [...matched].sort(compareOrdersByPickupSchedule);
    }
    return matched;
  }, [rows, filter, queryText, mode]);

  // Prefer URL selection; fall back to first visible row without rewriting the URL.
  const selected =
    filtered.find((row) => row.id === selectedId) ?? filtered[0] ?? null;

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

  // Backfill customer tracking with scale/delivery photos + totals.
  useEffect(() => {
    if (!selected?.trackKey) return;
    const visible = customerVisiblePhotos(selected.photos);
    if (
      !visible.length &&
      !(typeof selected.weightLbs === "number" && selected.weightLbs > 0) &&
      selected.finalTotal == null
    ) {
      return;
    }
    const trackPatch: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (visible.length) {
      trackPatch.photos = visible.map((photo) => ({
        url: photo.url,
        kind: photo.kind,
        createdAt: photo.createdAt ?? null,
      }));
    }
    if (typeof selected.weightLbs === "number") {
      trackPatch.weightLbs = selected.weightLbs;
    }
    if (typeof selected.finalTotal === "number") {
      trackPatch.finalTotal = selected.finalTotal;
    }
    void updateDoc(
      doc(getFirebaseDb(), "orderTracks", selected.trackKey),
      trackPatch
    ).catch(() => {
      /* older orders may lack a track doc */
    });
  }, [
    selected?.id,
    selected?.trackKey,
    selected?.photos?.length,
    selected?.weightLbs,
    selected?.finalTotal,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (order.trackKey) {
        try {
          const trackPatch: Record<string, unknown> = {
            updatedAt: serverTimestamp(),
          };
          if (nextStatus) trackPatch.status = nextStatus;
          if (typeof data.weightLbs === "number") {
            trackPatch.weightLbs = data.weightLbs;
          }
          if (typeof data.finalTotal === "number") {
            trackPatch.finalTotal = data.finalTotal;
          }
          const visible = customerVisiblePhotos(order.photos);
          if (visible.length) {
            trackPatch.photos = visible.map((photo) => ({
              url: photo.url,
              kind: photo.kind,
              createdAt: photo.createdAt ?? null,
            }));
          }
          await updateDoc(
            doc(getFirebaseDb(), "orderTracks", order.trackKey),
            trackPatch
          );
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
    if (
      isOrderCharged(selected) &&
      (prev === "new" || prev === "confirmed")
    ) {
      setError(
        "Already charged — cannot go back to pickup. Refunds need management approval."
      );
      return;
    }
    const ok = window.confirm(
      `${label}? Customer tracking will move back to this step.`
    );
    if (!ok) return;
    await setStatus(prev);
  }

  async function markLeftForPickup(order: FoamOrder) {
    replaceQuery({
      id: order.id,
      filter: null,
      view: "detail",
    });
    await patchOrderDoc(
      order,
      { status: "confirmed" },
      "Driver on the way — customer tracking updated"
    );
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
    setOpenCatalog(true);
  }

  function removeDryItem(index: number) {
    setDryItems((current) => current.filter((_, i) => i !== index));
  }

  function nudgeWeight(delta: number) {
    const current = Number(weightInput);
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.max(0, Math.round((base + delta) * 10) / 10);
    setWeightInput(next > 0 ? String(next) : "");
  }

  async function removeWeightPhoto(url: string) {
    if (!selected) return;
    const nextPhotos = (selected.photos ?? []).filter((photo) => photo.url !== url);
    setUploadingPhoto(true);
    setError("");
    try {
      await updateDoc(doc(getFirebaseDb(), "orders", selected.id), {
        photos: nextPhotos,
        statusUpdatedAt: serverTimestamp(),
        lastUpdatedBy: adminEmail,
      });
      if (selected.trackKey) {
        try {
          const visible = customerVisiblePhotos(nextPhotos);
          await updateDoc(doc(getFirebaseDb(), "orderTracks", selected.trackKey), {
            photos: visible.map((photo) => ({
              url: photo.url,
              kind: photo.kind,
              createdAt: photo.createdAt ?? null,
            })),
            updatedAt: serverTimestamp(),
          });
        } catch {
          /* older orders may lack a track doc */
        }
      }
      setOkMsg("Photo removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove photo.");
    } finally {
      setUploadingPhoto(false);
    }
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
      const photo: OrderPhoto = {
        url: uploaded.url,
        kind,
        createdAt: new Date().toISOString(),
      };
      await updateDoc(doc(getFirebaseDb(), "orders", selected.id), {
        photos: arrayUnion(photo),
        statusUpdatedAt: serverTimestamp(),
        lastUpdatedBy: adminEmail,
      });
      if (selected.trackKey && (kind === "weight" || kind === "return")) {
        try {
          await updateDoc(
            doc(getFirebaseDb(), "orderTracks", selected.trackKey),
            {
              photos: arrayUnion({
                url: photo.url,
                kind: photo.kind,
                createdAt: photo.createdAt ?? null,
              }),
              updatedAt: serverTimestamp(),
            }
          );
        } catch {
          /* older orders may lack a track doc */
        }
      }
      setOkMsg(kind === "return" ? "Drop-off photo saved." : "Photo saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function markDelivered() {
    if (!selected) return;
    if (deliveryPhotos.length === 0) {
      setError("Upload a drop-off photo before marking delivered.");
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
      `Charged · $${finalTotal.toFixed(2)} · At laundry`
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

  const canCharge =
    !!selected &&
    isWaitingForPickup(selected.status) &&
    selected.status !== "new";

  const customerMsg = selected
    ? selected.status === "new" || isEnRouteToPickup(selected.status)
      ? `Hi ${firstNameFromContact(selected.contact.name) || "there"}, this is FOAM — your courier is on the way to pick up your bags (${selected.pickup.date} · ${selected.pickup.slot}).`
      : `Hi ${firstNameFromContact(selected.contact.name) || "there"}, this is FOAM about your pickup on ${selected.pickup.date} (${selected.pickup.slot}).`
    : "";

  function selectOrder(id: string) {
    replaceQuery({ id, view: "detail" });
  }

  function renderAtStopWorkspace() {
    if (!selected) return null;

    if (selected.status === "new") {
      return (
        <section className="stage pickup-stage">
          <div className="bag-delight" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="ops-pickup-bag"
              src="/foam-ops-bag.png"
              alt=""
              width={640}
              height={640}
            />
          </div>
          <div className="stage-copy">
            <small>NEXT MOVE</small>
            <h3>Head to the pickup</h3>
            <p>The customer’s window is active. Start the route when you leave.</p>
            <div className="stage-actions">
              <a
                className="secondary-action"
                href={waUrl(selected.contact.phone, customerMsg)}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={16} aria-hidden />
                Message customer
              </a>
              <Button
                type="button"
                className="primary-action"
                disabled={saving || uploadingPhoto}
                onClick={() => void markLeftForPickup(selected)}
              >
                I’m on the way
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </section>
      );
    }

    // confirmed / en route — weigh, photo, dry clean, bill
    return (
      <>
        <div className="ops-soft-card">
          <div className="ops-soft-grid">
            <section className="ops-soft-col" aria-label="Scale">
              <div className="ops-soft-section-head">
                <span className="ops-soft-icon" aria-hidden>
                  <Scale size={16} />
                </span>
                <h4>Weight in pounds</h4>
              </div>
              <div className="ops-soft-stepper">
                <button
                  type="button"
                  className="ops-soft-stepper-btn"
                  aria-label="Decrease weight"
                  disabled={saving || uploadingPhoto}
                  onClick={() => nudgeWeight(-0.1)}
                >
                  <Minus size={16} />
                </button>
                <label className="ops-soft-stepper-value">
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
                </label>
                <button
                  type="button"
                  className="ops-soft-stepper-btn"
                  aria-label="Increase weight"
                  disabled={saving || uploadingPhoto}
                  onClick={() => nudgeWeight(0.1)}
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="ops-soft-section-head">
                <span className="ops-soft-icon" aria-hidden>
                  <Camera size={16} />
                </span>
                <h4>Scale photo</h4>
              </div>
              {weightPhotos.length === 0 ? (
                <label className="ops-soft-dropzone">
                  <Camera size={22} aria-hidden />
                  <span>
                    {uploadingPhoto ? "Uploading…" : "Add scale photo"}
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
              ) : (
                <div className="ops-soft-thumbs">
                  <div className="ops-soft-thumb is-large">
                    <a
                      href={weightPhotos[0].url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={weightPhotos[0].url}
                        alt="Weight scale photo"
                      />
                    </a>
                    <button
                      type="button"
                      className="ops-soft-thumb-remove"
                      aria-label="Remove photo"
                      disabled={uploadingPhoto || saving}
                      onClick={() => void removeWeightPhoto(weightPhotos[0].url)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="ops-soft-col" aria-label="Dry cleaning">
              <div className="ops-soft-section-head">
                <span className="ops-soft-icon" aria-hidden>
                  <Shirt size={16} />
                </span>
                <h4>Dry cleaning catalog</h4>
              </div>

              <button
                type="button"
                className="ops-soft-add"
                onClick={() => setOpenCatalog(true)}
              >
                <Plus size={16} aria-hidden />
                Add more items
              </button>

              {selected.services.dryCleaning && dryItems.length === 0 ? (
                <p className="ops-dry-warn" role="status">
                  Customer ordered dry cleaning — add items before charging.
                </p>
              ) : null}

              {dryItems.length ? (
                <div className="ops-soft-items">
                  {dryItems.map((item, itemIndex) => (
                    <div
                      key={`${item.name}-${itemIndex}`}
                      className="ops-soft-item"
                    >
                      <span className="ops-soft-item-mark" aria-hidden>
                        <Shirt size={14} />
                      </span>
                      <span className="ops-soft-item-copy">
                        <span>{item.name}</span>
                        <strong>${item.price.toFixed(2)}</strong>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => removeDryItem(itemIndex)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {openCatalog ? (
                <div
                  className="ops-catalog-overlay"
                  role="presentation"
                  onClick={() => setOpenCatalog(false)}
                >
                  <div
                    className="ops-catalog-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Dry cleaning catalog"
                    ref={catalogRef}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="ops-catalog-modal-head">
                      <h4>Add dry clean items</h4>
                      <button
                        type="button"
                        className="ops-catalog-modal-close"
                        aria-label="Close"
                        onClick={() => setOpenCatalog(false)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <label className="ops-search is-compact">
                      <Search size={14} aria-hidden />
                      <input
                        autoFocus
                        value={dryQuery}
                        onChange={(e) => setDryQuery(e.target.value)}
                        placeholder="Search catalog"
                      />
                    </label>
                    <div
                      className="ops-catalog-list"
                      role="listbox"
                      aria-multiselectable="true"
                    >
                      {dryMatches.length === 0 ? (
                        <p className="ops-catalog-empty">No catalog matches</p>
                      ) : (
                        dryMatches.map((item) => {
                          const selectedCount = dryItems.filter(
                            (dry) => dry.name === item.name
                          ).length;
                          return (
                            <button
                              key={item.name}
                              type="button"
                              role="option"
                              aria-selected={selectedCount > 0}
                              className={cn(
                                "ops-catalog-item",
                                selectedCount > 0 && "is-selected"
                              )}
                              onClick={() => addDryItem(item)}
                            >
                              <span className="ops-catalog-item-main">
                                <span
                                  className={cn(
                                    "ops-catalog-check",
                                    selectedCount > 0 && "is-on"
                                  )}
                                  aria-hidden
                                >
                                  {selectedCount > 0 ? (
                                    <Check size={12} />
                                  ) : null}
                                </span>
                                <span>{item.name}</span>
                                {selectedCount > 1 ? (
                                  <span className="ops-catalog-qty">
                                    ×{selectedCount}
                                  </span>
                                ) : null}
                              </span>
                              <strong>${item.price.toFixed(2)}</strong>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <button
                      type="button"
                      className="ops-catalog-modal-done"
                      onClick={() => setOpenCatalog(false)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <div className="ops-soft-footer">
            <div className="ops-soft-total">
              <span>Total</span>
              <strong>
                {previewTotal != null
                  ? `$${previewTotal.toFixed(2)}`
                  : selected.finalTotal != null
                    ? `$${selected.finalTotal.toFixed(2)}`
                    : "—"}
              </strong>
            </div>
            <div className="ops-soft-actions">
              {stageBackLabel ? (
                <button
                  type="button"
                  className="ops-soft-btn"
                  disabled={saving || uploadingPhoto}
                  onClick={() => void goBackStage()}
                >
                  <ArrowLeft size={15} aria-hidden />
                  Back
                </button>
              ) : null}
              {canCharge ? (
                <button
                  type="button"
                  className="ops-soft-btn is-primary"
                  disabled={saving || uploadingPhoto}
                  onClick={() => void chargeAndCollect()}
                >
                  Continue
                  <ArrowRight size={15} aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </>
    );
  }

  function renderWorkspaceBody() {
    if (!selected) return null;

    if (mode === "future") {
      return (
        <section className="stage future-stage">
          <CalendarDays size={38} aria-hidden />
          <div className="stage-copy">
            <small>SCHEDULED PICKUP</small>
            <h3>{formatPickupDate(selected.pickup.date, true)}</h3>
            <p>
              {formatSlotShort(selected.pickup.slot)} · This order will move
              into today’s Orders queue on its pickup date.
            </p>
            <div className="calm-lock">
              <LockKeyhole size={16} />
              Scheduled order · read only
            </div>
          </div>
        </section>
      );
    }

    if (selected.status === "cancelled") {
      return (
        <div className="ops-cancelled-note">
          <p className="ops-flow-done-note">
            This order was cancelled
            {selected.cancelReason ? ` · ${selected.cancelReason}` : ""}
          </p>
        </div>
      );
    }

    if (stage === 0) {
      return renderAtStopWorkspace();
    }

    if (stage === 1) {
      return (
        <section className="stage locked-stage">
          <div className="lock-illustration" aria-hidden>
            <div className="machine-dial">
              <Shirt size={30} />
            </div>
          </div>
          <div className="stage-copy">
            <small>
              CHARGED
              {selected.finalTotal != null
                ? ` · $${selected.finalTotal.toFixed(2)}`
                : ""}
            </small>
            <h3>At the laundry</h3>
            <p>
              {servicesSummary(selected)}
              {selected.weightLbs != null ? ` · ${selected.weightLbs} lb` : ""}
            </p>
            <div className="calm-lock" role="status">
              <LockKeyhole size={16} />
              Billing is locked after charge
            </div>
            <Button
              type="button"
              className="primary-action"
              disabled={saving || uploadingPhoto}
              onClick={() => void setStatus("out_for_delivery")}
            >
              Move to On delivery
              <ArrowRight size={16} />
            </Button>
          </div>
        </section>
      );
    }

    if (stage === 2) {
      return (
        <>
          <div className="ops-soft-section-head" style={{ marginBottom: "0.65rem" }}>
            <span className="ops-soft-icon" aria-hidden>
              <Camera size={16} />
            </span>
            <h4>Drop-off photo</h4>
          </div>
          {deliveryPhotos.length === 0 ? (
            <label className="ops-soft-dropzone">
              <Camera size={22} aria-hidden />
              <span>
                {uploadingPhoto
                  ? "Uploading…"
                  : "Photo of the delivered bags"}
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
          ) : (
            <div className="ops-soft-thumbs">
              <div className="ops-soft-thumb is-large">
                <a
                  href={deliveryPhotos[0].url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src={deliveryPhotos[0].url}
                    alt="Drop-off delivery photo"
                  />
                </a>
                <button
                  type="button"
                  className="ops-soft-thumb-remove"
                  aria-label="Remove photo"
                  disabled={uploadingPhoto || saving}
                  onClick={() => void removeWeightPhoto(deliveryPhotos[0].url)}
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}
          <div className="ops-action-row" style={{ marginTop: "0.85rem" }}>
            {stageBackLabel ? (
              <button
                type="button"
                className="ops-stage-back"
                disabled={saving || uploadingPhoto}
                onClick={() => void goBackStage()}
              >
                <ArrowLeft size={14} aria-hidden />
                Back
              </button>
            ) : null}
            <Button
              type="button"
              className="ops-btn-lg"
              disabled={saving || uploadingPhoto}
              onClick={() => void markDelivered()}
            >
              <PackageCheck size={16} />
              Confirm delivered
            </Button>
          </div>
        </>
      );
    }

    // stage 3 — complete
    return (
      <>
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
          "ops-list-pane queue-plane",
          mobileView === "detail" && "is-hidden-mobile"
        )}
      >
        <div className="ops-list-head">
          <div className="queue-heading">
            <h1 className="ops-list-title">
              {mode === "future" ? "Future" : "Orders"}
            </h1>
            {mode === "today" ? (
              <button
                type="button"
                className={cn(
                  "ops-all-tab",
                  filter === "all" && "is-active"
                )}
                onClick={() => setFilter("all")}
              >
                All {counts.all}
              </button>
            ) : null}
          </div>
          <label className="ops-search">
            <Search size={15} aria-hidden />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              aria-label="Search orders"
            />
          </label>

          {mode === "today" ? (
            <div className="ops-filter-row" role="group" aria-label="Order filters">
              {ROW_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "ops-filter-chip",
                    filter === item.id && "is-active"
                  )}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label} {counts[item.id]}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {error && !selected ? <p className="ops-error ops-pad">{error}</p> : null}

        <div className="ops-list-scroll">
          <div className="ops-list-card">
            {filtered.length === 0 ? (
              <p className="ops-empty">
                {mode === "future"
                  ? "Future pickups will appear here, sorted by date and time."
                  : "Live orders will appear here."}
              </p>
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
                  <span className="ops-row-top">
                    <span className="ops-row-name">{row.contact.name}</span>
                    <span
                      className={cn(
                        "ops-status-pill",
                        listBadgeClass(row.status)
                      )}
                    >
                      {orderListBadge(row.status)}
                    </span>
                  </span>
                  <span className="ops-row-when">
                    {formatPickupDate(row.pickup.date)},{" "}
                    {formatSlotShort(row.pickup.slot)}
                  </span>
                  <span className="ops-row-address">
                    {formatOrderAddress(row)}
                  </span>
                  <span className="ops-row-foot">
                    <span className="ops-row-ref">{orderDisplayId(row.id)}</span>
                    <span className="ops-row-price">
                      {row.finalTotal != null
                        ? `$${row.finalTotal.toFixed(2)}`
                        : "—"}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      <section
        className={cn(
          "ops-detail-pane task-plane",
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
                Back
              </Button>

              <div className="ops-detail-top">
                <div className="ops-detail-top-main">
                  <p className="ops-breadcrumb">
                    <span>Orders</span>
                    <span aria-hidden>›</span>
                    <span>{orderDisplayId(selected.id)}</span>
                  </p>
                  <h2 className="ops-detail-title">{selected.contact.name}</h2>
                  <p className="ops-detail-address">
                    <MapPin size={16} aria-hidden />
                    <span>{formatOrderAddress(selected)}</span>
                  </p>
                  <div className="ops-detail-meta">
                    <span>
                      <CalendarDays size={14} aria-hidden />
                      {formatPickupDate(selected.pickup.date, true)}
                    </span>
                    <span>
                      <Clock size={14} aria-hidden />
                      {formatSlotShort(selected.pickup.slot)}
                    </span>
                    {(() => {
                      const ordered = formatOrderedAt(selected.createdAt);
                      return ordered ? (
                        <span>
                          <ClipboardList size={14} aria-hidden />
                          {ordered}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>

                <div className="ops-icon-row">
                  <a
                    className="ops-action-btn"
                    href={`tel:${selected.contact.phone}`}
                    aria-label="Call"
                    title="Call"
                  >
                    <Phone size={18} aria-hidden />
                  </a>
                  <a
                    className="ops-action-btn"
                    href={waUrl(selected.contact.phone, customerMsg)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="WhatsApp"
                    title="WhatsApp"
                  >
                    <MessageCircle size={18} aria-hidden className="ops-wa-icon" />
                  </a>
                  <a
                    className="ops-action-btn"
                    href={mapsUrl(selected)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Maps"
                    title="Maps"
                  >
                    <MapPin size={18} aria-hidden />
                  </a>
                  <button
                    type="button"
                    className="ops-action-btn is-icon"
                    aria-label="More"
                    title={
                      selected.pickup.notes
                        ? `Access: ${selected.pickup.notes}`
                        : "More"
                    }
                  >
                    <MoreHorizontal size={18} aria-hidden />
                  </button>
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
                        </div>
                        <span className="ops-timeline-label">{step.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="ops-stage-card">
                  {selected.status === "cancelled" ? (
                    <div className="ops-stage-card-head">
                      <UserRound size={18} aria-hidden />
                      <h3>Order cancelled</h3>
                    </div>
                  ) : null}
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
