"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ArrowRight, ChevronDown, PackageOpen } from "lucide-react";

import { OrderProgress } from "@/components/order-progress";
import { Button } from "@/components/ui/button";
import { formatPickupDate } from "@/lib/booking";
import { getFirebaseDb } from "@/lib/firebase";
import {
  ORDER_STATUS_LABELS,
  isInProgressOrder,
  isWaitingForPickup,
  normalizeOrderStatus,
  type OrderPhoto,
  type OrderStatus,
} from "@/lib/orders";
import { orderRefFromId, trackPath } from "@/lib/order-tracking";
import { releasePickupSlot } from "@/lib/pickup-availability";
import { BOOKING_PATH } from "@/lib/site-config";
import { cn } from "@/lib/utils";

type AccountOrderRow = {
  id: string;
  status: OrderStatus;
  pickupDate: string;
  pickupSlot: string;
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

export function AccountOrders({ uid }: { uid: string }) {
  const [orders, setOrders] = useState<AccountOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

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
        const rows = snap.docs.map((d) =>
          mapRow(d.id, d.data() as Record<string, unknown>)
        );
        setOrders(rows);
        setLoading(false);
        setOpenId((current) => {
          if (current && rows.some((r) => r.id === current)) return current;
          return rows[0]?.id ?? null;
        });
      },
      () => {
        setError("Could not load orders. Try refreshing.");
        setLoading(false);
      }
    );
  }, [uid]);

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
    try {
      const db = getFirebaseDb();
      await updateDoc(doc(db, "orders", order.id), {
        status: "cancelled",
        cancelReason: "Cancelled by customer from account",
        statusUpdatedAt: serverTimestamp(),
      });
      await releasePickupSlot(order.pickupDate, order.pickupSlot);
      if (order.trackKey) {
        try {
          await updateDoc(doc(db, "orderTracks", order.trackKey), {
            status: "cancelled",
            updatedAt: serverTimestamp(),
          });
        } catch {
          /* track optional */
        }
      }
      setActionNote("Pickup cancelled.");
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
        className="py-6 text-sm text-muted-foreground"
      >
        Loading orders…
      </div>
    );
  }

  if (error && orders.length === 0) {
    return (
      <div
        id="panel-orders"
        role="tabpanel"
        aria-labelledby="tab-orders"
        className="py-6 text-sm font-medium text-destructive"
      >
        {error}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div
        id="panel-orders"
        role="tabpanel"
        aria-labelledby="tab-orders"
        className="grid justify-items-center gap-4 py-10 text-center"
      >
        <span className="grid size-12 place-items-center rounded-full border border-border bg-white text-muted-foreground">
          <PackageOpen className="size-5" />
        </span>
        <div>
          <h3 className="font-display text-lg font-semibold tracking-tight">
            Recent orders
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            No orders yet. After your first pickup, your order history will show
            up here.
          </p>
        </div>
        <Button asChild>
          <Link href={BOOKING_PATH}>
            Book a Pickup <ArrowRight />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      id="panel-orders"
      role="tabpanel"
      aria-labelledby="tab-orders"
      className="account-orders"
    >
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Your orders
        </h2>
        {actionNote ? (
          <p className="mt-2 text-sm font-medium text-emerald-700">{actionNote}</p>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm font-medium text-destructive">{error}</p>
        ) : null}
      </div>

      {orders.map((order) => {
        const open = openId === order.id;
        const active =
          isWaitingForPickup(order.status) || isInProgressOrder(order.status);
        const canCancel = isWaitingForPickup(order.status);
        const services = [
          order.laundry
            ? `Laundry${order.bagCount > 0 ? ` (${order.bagCount})` : ""}`
            : null,
          order.dryCleaning ? "Dry cleaning" : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <article key={order.id} className="account-order-card">
            <button
              type="button"
              className="account-order-head"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : order.id)}
            >
              <div>
                <h3>
                  {order.pickupDate
                    ? `${formatPickupDate(order.pickupDate)}${
                        order.pickupSlot ? ` · ${order.pickupSlot}` : ""
                      }`
                    : "Pickup scheduled"}
                  {services ? ` · ${services}` : ""}
                </h3>
                <p>Ref {orderRefFromId(order.id)}</p>
              </div>
              <span className="inline-flex items-center gap-2">
                {order.weekly ? (
                  <span className="account-order-badge is-weekly">
                    {order.automatedWeekly ? "Weekly auto" : "Weekly"}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "account-order-badge",
                    active && "is-active"
                  )}
                >
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition",
                    open && "rotate-180"
                  )}
                />
              </span>
            </button>

            {open ? (
              <div className="account-order-body">
                <OrderProgress
                  status={order.status}
                  photos={order.photos}
                  weightLbs={order.weightLbs}
                  finalTotal={order.finalTotal}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  {order.trackKey ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={trackPath(order.trackKey)}>
                        Open tracking page
                      </Link>
                    </Button>
                  ) : null}
                  {canCancel && order.trackKey ? (
                    <Button size="sm" asChild>
                      <Link href={`${trackPath(order.trackKey)}&edit=1`}>
                        Edit order
                      </Link>
                    </Button>
                  ) : null}
                  {canCancel ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyId === order.id}
                      onClick={() => void cancelOrder(order)}
                    >
                      {busyId === order.id ? "Cancelling…" : "Cancel pickup"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
