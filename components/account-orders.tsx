"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  PackageOpen,
  Pencil,
  Search,
  XCircle,
} from "lucide-react";

import { OrderProgress } from "@/components/order-progress";
import { Button } from "@/components/ui/button";
import { formatPickupDate } from "@/lib/booking";
import { deleteOrderCompletely } from "@/lib/data-retention";
import { getFirebaseDb } from "@/lib/firebase";
import {
  isCancelledOrder,
  isWaitingForPickup,
  normalizeOrderStatus,
  orderDisplayId,
  orderListBadge,
  type OrderPhoto,
  type OrderStatus,
} from "@/lib/orders";
import { trackPath } from "@/lib/order-tracking";
import { releasePickupSlot } from "@/lib/pickup-availability";
import { BOOKING_PATH } from "@/lib/site-config";
import { cn } from "@/lib/utils";

type AccountOrderRow = {
  id: string;
  status: OrderStatus;
  pickupDate: string;
  pickupSlot: string;
  address: string;
  unit: string;
  city: string;
  zip: string;
  laundry: boolean;
  dryCleaning: boolean;
  bagCount: number;
  weekly: boolean;
  automatedWeekly: boolean;
  trackKey?: string;
  photos: OrderPhoto[];
  weightLbs: number | null;
  finalTotal: number | null;
};

function mapRow(id: string, data: Record<string, unknown>): AccountOrderRow {
  const pickup = (data.pickup ?? {}) as Record<string, unknown>;
  const services = (data.services ?? {}) as Record<string, unknown>;
  const photos = Array.isArray(data.photos)
    ? (data.photos as OrderPhoto[]).filter(
        (photo) => photo && typeof photo.url === "string"
      )
    : [];
  return {
    id,
    status: normalizeOrderStatus(data.status),
    pickupDate: String(pickup.date ?? ""),
    pickupSlot: String(pickup.slot ?? ""),
    address: String(pickup.address ?? ""),
    unit: String(pickup.unit ?? ""),
    city: String(pickup.city ?? ""),
    zip: String(pickup.zip ?? ""),
    laundry: Boolean(services.laundry),
    dryCleaning: Boolean(services.dryCleaning),
    bagCount: Number(services.bagCount ?? 0),
    weekly: Boolean(pickup.repeat),
    automatedWeekly: Boolean(data.automatedWeekly),
    trackKey: typeof data.trackKey === "string" ? data.trackKey : undefined,
    photos,
    weightLbs: typeof data.weightLbs === "number" ? data.weightLbs : null,
    finalTotal: typeof data.finalTotal === "number" ? data.finalTotal : null,
  };
}

function formatSlotShort(slot: string) {
  if (!slot) return "—";
  return slot
    .replace(/\s*-\s*/g, " – ")
    .replace(/\bam\b/gi, "am")
    .replace(/\bpm\b/gi, "pm");
}

function formatAccountAddress(order: AccountOrderRow) {
  const unit = order.unit.trim();
  const street = order.address.trim();
  if (!street) {
    const cityZip = `${order.city || "Las Vegas"} ${order.zip}`.trim();
    return cityZip || "Address missing";
  }
  const line = unit ? `${street}, ${unit}` : street;
  return `${line}, ${order.city || "Las Vegas"} ${order.zip}`.trim();
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

function servicesLine(order: AccountOrderRow) {
  return [
    order.laundry
      ? `Laundry${order.bagCount > 0 ? ` (${order.bagCount})` : ""}`
      : null,
    order.dryCleaning ? "Dry cleaning" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function AccountOrders({ uid }: { uid: string }) {
  const [orders, setOrders] = useState<AccountOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [queryText, setQueryText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    const q = query(
      collection(getFirebaseDb(), "orders"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => mapRow(d.id, d.data() as Record<string, unknown>))
          .filter((row) => !isCancelledOrder(row.status));
        setOrders(rows);
        setLoading(false);
        setSelectedId((current) => {
          if (current && rows.some((r) => r.id === current)) return current;
          return null;
        });
      },
      () => {
        setError("Could not load orders. Try refreshing.");
        setLoading(false);
      }
    );
  }, [uid]);

  useEffect(() => {
    if (!menuId) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuId(null);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuId(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((row) => {
      const hay = [
        formatPickupDate(row.pickupDate),
        row.pickupDate,
        row.pickupSlot,
        formatAccountAddress(row),
        orderDisplayId(row.id),
        orderListBadge(row.status),
        servicesLine(row),
        row.weekly ? "weekly" : "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [orders, queryText]);

  const selected =
    filtered.find((row) => row.id === selectedId) ??
    orders.find((row) => row.id === selectedId) ??
    null;

  async function cancelOrder(order: AccountOrderRow) {
    if (!isWaitingForPickup(order.status)) return;
    const ok = window.confirm(
      `Cancel this pickup${
        order.pickupDate ? ` on ${formatPickupDate(order.pickupDate)}` : ""
      }?\n\nThis cannot be undone from here.`
    );
    if (!ok) return;

    setBusyId(order.id);
    setError("");
    setActionNote("");
    setMenuId(null);
    try {
      await releasePickupSlot(order.pickupDate, order.pickupSlot);
      await deleteOrderCompletely(order.id);
      setActionNote("Pickup cancelled.");
      setSelectedId(null);
    } catch {
      setError("Could not cancel this pickup. Try again or contact FOAM.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div
        id="panel-orders"
        role="tabpanel"
        aria-labelledby="tab-orders"
        className="account-orders-queue"
      >
        <div className="account-orders-head">
          <div className="account-orders-heading">
            <h1 className="account-orders-title">Orders</h1>
          </div>
        </div>
        <div className="account-orders-scroll">
          <div className="account-orders-list" aria-busy="true">
            {[0, 1, 2].map((key) => (
              <div key={key} className="account-orders-skel">
                <span className="account-orders-skel-title" />
                <span className="account-orders-skel-line" />
                <span className="account-orders-skel-line is-short" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && orders.length === 0) {
    return (
      <div
        id="panel-orders"
        role="tabpanel"
        aria-labelledby="tab-orders"
        className="account-orders-queue"
      >
        <div className="account-orders-head">
          <div className="account-orders-heading">
            <h1 className="account-orders-title">Orders</h1>
          </div>
        </div>
        <p className="account-orders-flash is-error">{error}</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div
        id="panel-orders"
        role="tabpanel"
        aria-labelledby="tab-orders"
        className="account-orders-queue"
      >
        <div className="account-orders-head">
          <div className="account-orders-heading">
            <h1 className="account-orders-title">Orders</h1>
          </div>
        </div>
        <div className="account-ops-empty">
          <span className="account-ops-empty-icon">
            <PackageOpen className="size-5" />
          </span>
          <h3>Recent orders</h3>
          <p>
            No orders yet. After your first pickup, your order history will show
            up here.
          </p>
          <Button asChild>
            <Link href={BOOKING_PATH}>
              Book a Pickup <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (selected) {
    const canCancel = isWaitingForPickup(selected.status);
    const canEdit =
      canCancel && Boolean(selected.trackKey);
    const hasActions = canEdit || canCancel;
    const services = servicesLine(selected);

    return (
      <div
        id="panel-orders"
        role="tabpanel"
        aria-labelledby="tab-orders"
        className="account-orders-queue is-detail"
      >
        <div className="account-orders-detail-head">
          <button
            type="button"
            className="account-orders-back"
            onClick={() => {
              setMenuId(null);
              setSelectedId(null);
            }}
          >
            <ArrowLeft size={16} aria-hidden />
            Back
          </button>

          <div className="account-orders-detail-top">
            <div className="account-orders-detail-main">
              <p className="account-orders-breadcrumb">
                <span>Orders</span>
                <span aria-hidden>›</span>
                <span>{orderDisplayId(selected.id)}</span>
              </p>
              <h2 className="account-orders-detail-title">
                {selected.pickupDate
                  ? formatPickupDate(selected.pickupDate)
                  : "Pickup"}
              </h2>
              <p className="account-orders-detail-meta">
                {selected.pickupSlot
                  ? formatSlotShort(selected.pickupSlot)
                  : null}
                {services ? ` · ${services}` : null}
                {selected.weekly
                  ? selected.automatedWeekly
                    ? " · Weekly auto"
                    : " · Weekly"
                  : null}
              </p>
              <p className="account-orders-detail-address">
                {formatAccountAddress(selected)}
              </p>
            </div>

            <div className="account-orders-detail-aside">
              <span
                className={cn(
                  "ops-status-pill is-lg",
                  listBadgeClass(selected.status)
                )}
              >
                {orderListBadge(selected.status)}
              </span>
              {hasActions ? (
                <div
                  className="account-order-menu"
                  ref={menuId === selected.id ? menuRef : undefined}
                >
                  <button
                    type="button"
                    className="account-order-menu-trigger"
                    aria-label="Order actions"
                    aria-haspopup="menu"
                    aria-expanded={menuId === selected.id}
                    onClick={() =>
                      setMenuId(menuId === selected.id ? null : selected.id)
                    }
                  >
                    <MoreHorizontal size={18} aria-hidden />
                  </button>
                  {menuId === selected.id ? (
                    <div className="account-order-menu-panel" role="menu">
                      {canEdit && selected.trackKey ? (
                        <Link
                          role="menuitem"
                          className="account-order-menu-item"
                          href={`${trackPath(selected.trackKey)}&edit=1`}
                          onClick={() => setMenuId(null)}
                        >
                          <Pencil size={16} aria-hidden />
                          Edit order
                        </Link>
                      ) : null}
                      {canCancel ? (
                        <>
                          {canEdit ? (
                            <div
                              className="account-order-menu-sep"
                              role="separator"
                            />
                          ) : null}
                          <button
                            type="button"
                            role="menuitem"
                            className="account-order-menu-item is-danger"
                            disabled={busyId === selected.id}
                            onClick={() => void cancelOrder(selected)}
                          >
                            <XCircle size={16} aria-hidden />
                            {busyId === selected.id
                              ? "Cancelling…"
                              : "Cancel pickup"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {actionNote ? (
          <p className="account-orders-flash is-ok">{actionNote}</p>
        ) : null}
        {error ? (
          <p className="account-orders-flash is-error">{error}</p>
        ) : null}

        <div className="account-orders-detail-scroll">
          <OrderProgress
            status={selected.status}
            photos={selected.photos}
            weightLbs={selected.weightLbs}
            finalTotal={selected.finalTotal}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      id="panel-orders"
      role="tabpanel"
      aria-labelledby="tab-orders"
      className="account-orders-queue"
    >
      <div className="account-orders-head">
        <div className="account-orders-heading">
          <h1 className="account-orders-title">Orders</h1>
        </div>
        <label className="account-orders-search">
          <Search size={16} aria-hidden />
          <input
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search date, address, or order #"
            aria-label="Search orders"
          />
        </label>
        {actionNote ? (
          <p className="account-orders-flash is-ok">{actionNote}</p>
        ) : null}
        {error ? (
          <p className="account-orders-flash is-error">{error}</p>
        ) : null}
      </div>

      <div className="account-orders-scroll">
        <div className="account-orders-list">
          {filtered.length === 0 ? (
            <p className="account-orders-empty">No orders match your search.</p>
          ) : (
            filtered.map((row) => (
              <button
                key={row.id}
                type="button"
                className="account-orders-row"
                onClick={() => {
                  setMenuId(null);
                  setSelectedId(row.id);
                }}
              >
                <span className="account-orders-row-top">
                  <span className="account-orders-row-name">
                    {row.pickupDate
                      ? formatPickupDate(row.pickupDate)
                      : "Pickup"}
                  </span>
                  <span
                    className={cn(
                      "ops-status-pill",
                      listBadgeClass(row.status)
                    )}
                  >
                    {orderListBadge(row.status)}
                  </span>
                </span>
                <span className="account-orders-row-when">
                  {row.pickupSlot ? formatSlotShort(row.pickupSlot) : "—"}
                  {row.weekly
                    ? row.automatedWeekly
                      ? " · Weekly auto"
                      : " · Weekly"
                    : ""}
                </span>
                <span className="account-orders-row-address">
                  {formatAccountAddress(row)}
                </span>
                <span className="account-orders-row-foot">
                  <span className="account-orders-row-ref">
                    {orderDisplayId(row.id)}
                  </span>
                  <span className="account-orders-row-price">
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
    </div>
  );
}
