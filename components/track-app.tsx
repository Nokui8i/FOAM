"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";

import { useAuth } from "@/components/auth-provider";
import { OrderProgress } from "@/components/order-progress";
import { TrackOrderEdit } from "@/components/track-order-edit";
import { Button } from "@/components/ui/button";
import { formatPickupDate } from "@/lib/booking";
import { getFirebaseDb } from "@/lib/firebase";
import {
  canEditOrderRequests,
  canRescheduleOrder,
} from "@/lib/order-edit";
import {
  ORDER_STATUS_LABELS,
  isInProgressOrder,
  isWaitingForPickup,
  normalizeOrderStatus,
  type OrderPhoto,
  type OrderStatus,
} from "@/lib/orders";
import {
  customerVisiblePhotos,
  orderRefFromId,
  type OrderTrackSnapshot,
} from "@/lib/order-tracking";
import { cn } from "@/lib/utils";

type OrderExtras = {
  photos: OrderPhoto[];
  weightLbs: number | null;
  finalTotal: number | null;
  preferences: Record<string, string>;
  orderNotes: string;
  pickupNotes: string;
  pickupDate: string;
  pickupSlot: string;
};

function TrackBody() {
  const search = useSearchParams();
  const key = (search.get("k") || "").trim();
  const startInEdit = search.get("edit") === "1";
  const { user, ready } = useAuth();
  const [track, setTrack] = useState<OrderTrackSnapshot | null>(null);
  const [orderExtras, setOrderExtras] = useState<OrderExtras | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(Boolean(key));
  const [editing, setEditing] = useState(startInEdit);
  const [savedNote, setSavedNote] = useState("");

  useEffect(() => {
    if (!key || key.length < 16) {
      setLoading(false);
      setMissing(true);
      setTrack(null);
      return;
    }

    setLoading(true);
    setMissing(false);
    return onSnapshot(
      doc(getFirebaseDb(), "orderTracks", key),
      (snap) => {
        setLoading(false);
        if (!snap.exists()) {
          setMissing(true);
          setTrack(null);
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const photos = Array.isArray(data.photos)
          ? (data.photos as OrderPhoto[])
          : [];
        const preferences =
          data.preferences && typeof data.preferences === "object"
            ? (data.preferences as Record<string, string>)
            : {};
        setTrack({
          orderId: String(data.orderId ?? ""),
          ref: String(data.ref ?? ""),
          status: normalizeOrderStatus(data.status),
          firstName: String(data.firstName ?? ""),
          pickupDate: String(data.pickupDate ?? ""),
          pickupSlot: String(data.pickupSlot ?? ""),
          laundry: Boolean(data.laundry),
          dryCleaning: Boolean(data.dryCleaning),
          bagCount: Number(data.bagCount ?? 0),
          preferences,
          orderNotes: String(data.orderNotes ?? ""),
          pickupNotes: String(data.pickupNotes ?? ""),
          photos: customerVisiblePhotos(photos),
          weightLbs:
            typeof data.weightLbs === "number" ? data.weightLbs : null,
          finalTotal:
            typeof data.finalTotal === "number" ? data.finalTotal : null,
        });
        setMissing(false);
      },
      () => {
        setLoading(false);
        setMissing(true);
        setTrack(null);
      }
    );
  }, [key]);

  // Owner fallback: pull photos/weight/prefs from the order doc when signed in.
  useEffect(() => {
    if (!ready || !user || !track?.orderId) {
      setOrderExtras(null);
      return;
    }
    return onSnapshot(
      doc(getFirebaseDb(), "orders", track.orderId),
      (snap) => {
        if (!snap.exists()) {
          setOrderExtras(null);
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const photos = Array.isArray(data.photos)
          ? (data.photos as OrderPhoto[])
          : [];
        const pickup = (data.pickup ?? {}) as Record<string, unknown>;
        const preferences =
          data.preferences && typeof data.preferences === "object"
            ? (data.preferences as Record<string, string>)
            : {};
        setOrderExtras({
          photos: customerVisiblePhotos(photos),
          weightLbs:
            typeof data.weightLbs === "number" ? data.weightLbs : null,
          finalTotal:
            typeof data.finalTotal === "number" ? data.finalTotal : null,
          preferences,
          orderNotes: String(data.orderNotes ?? ""),
          pickupNotes: String(pickup.notes ?? ""),
          pickupDate: String(pickup.date ?? ""),
          pickupSlot: String(pickup.slot ?? ""),
        });
      },
      () => setOrderExtras(null)
    );
  }, [ready, user, track?.orderId]);

  const photos = useMemo(() => {
    const fromTrack = track?.photos ?? [];
    if (fromTrack.length) return fromTrack;
    return orderExtras?.photos ?? [];
  }, [track?.photos, orderExtras?.photos]);

  const weightLbs =
    track?.weightLbs ?? orderExtras?.weightLbs ?? null;
  const finalTotal =
    track?.finalTotal ?? orderExtras?.finalTotal ?? null;

  if (loading || !ready) {
    return <p className="text-sm text-muted-foreground">Loading your order…</p>;
  }

  if (missing || !track) {
    return (
      <div className="track-card text-center">
        <h1 className="font-display text-xl font-bold tracking-tight">
          Tracking link not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use the link from your order confirmation, or sign in to see orders in
          your account.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/book">Book a pickup</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/account">Account</Link>
          </Button>
        </div>
      </div>
    );
  }

  const status = track.status as OrderStatus;
  const active =
    isWaitingForPickup(status) || isInProgressOrder(status);
  const services = [
    track.laundry
      ? `Laundry${track.bagCount > 0 ? ` (${track.bagCount})` : ""}`
      : null,
    track.dryCleaning ? "Dry cleaning" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const pickupDate =
    track.pickupDate || orderExtras?.pickupDate || "";
  const pickupSlot =
    track.pickupSlot || orderExtras?.pickupSlot || "";
  const preferences =
    Object.keys(track.preferences ?? {}).length > 0
      ? track.preferences
      : orderExtras?.preferences;
  const orderNotes =
    track.orderNotes || orderExtras?.orderNotes || "";
  const pickupNotes =
    track.pickupNotes || orderExtras?.pickupNotes || "";
  const showEdit = canEditOrderRequests(status) && Boolean(track.orderId);

  if (editing && showEdit) {
    return (
      <article className="account-order-card track-order-card">
        <div className="account-order-head is-static">
          <div>
            <h3>Edit order · Ref {orderRefFromId(track.orderId || track.ref)}</h3>
            <p>
              {pickupDate
                ? `${formatPickupDate(pickupDate)}${
                    pickupSlot ? ` · ${pickupSlot}` : ""
                  }`
                : "Pickup scheduled"}
            </p>
          </div>
          <span className={cn("account-order-badge", active && "is-active")}>
            {ORDER_STATUS_LABELS[status]}
          </span>
        </div>
        <div className="account-order-body">
          <TrackOrderEdit
            trackKey={key}
            orderId={track.orderId}
            status={status}
            pickupDate={pickupDate}
            pickupSlot={pickupSlot}
            preferences={preferences}
            orderNotes={orderNotes}
            pickupNotes={pickupNotes}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              setSavedNote("Order updated.");
            }}
          />
        </div>
      </article>
    );
  }

  return (
    <article className="account-order-card track-order-card">
      <div className="account-order-head is-static">
        <div>
          <h3>
            {pickupDate
              ? `${formatPickupDate(pickupDate)}${
                  pickupSlot ? ` · ${pickupSlot}` : ""
                }`
              : "Pickup scheduled"}
            {services ? ` · ${services}` : ""}
          </h3>
          <p>Ref {orderRefFromId(track.orderId || track.ref)}</p>
        </div>
        <span
          className={cn("account-order-badge", active && "is-active")}
        >
          {ORDER_STATUS_LABELS[status]}
        </span>
      </div>

      <div className="account-order-body">
        {track.firstName ? (
          <p className="track-greeting">Hi {track.firstName}</p>
        ) : null}
        {savedNote ? (
          <p className="mb-3 text-sm font-medium text-emerald-700">{savedNote}</p>
        ) : null}
        <OrderProgress
          status={status}
          photos={photos}
          weightLbs={weightLbs}
          finalTotal={finalTotal}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {showEdit ? (
            <Button type="button" size="sm" onClick={() => setEditing(true)}>
              Edit order
              {canRescheduleOrder(status, pickupDate, pickupSlot)
                ? ""
                : " (requests)"}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" asChild>
            <Link href="/account">Back</Link>
          </Button>
        </div>
        {showEdit && !canRescheduleOrder(status, pickupDate, pickupSlot) ? (
          <p className="mt-2 text-xs text-muted-foreground">
            You can still change wash preferences and notes. Date &amp; time
            lock once your pickup window starts (or when the driver is on the
            way).
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function TrackApp() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading your order…</p>
      }
    >
      <TrackBody />
    </Suspense>
  );
}
