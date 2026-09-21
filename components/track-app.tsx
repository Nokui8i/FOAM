"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";

import { useAuth } from "@/components/auth-provider";
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
import {
  customerVisiblePhotos,
  type OrderTrackSnapshot,
} from "@/lib/order-tracking";
import { cn } from "@/lib/utils";

type OrderExtras = {
  photos: OrderPhoto[];
  weightLbs: number | null;
  finalTotal: number | null;
};

function TrackBody() {
  const search = useSearchParams();
  const key = (search.get("k") || "").trim();
  const { user, ready } = useAuth();
  const [track, setTrack] = useState<OrderTrackSnapshot | null>(null);
  const [orderExtras, setOrderExtras] = useState<OrderExtras | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(Boolean(key));

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

  // Owner fallback: pull photos/weight from the order doc when signed in.
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
        setOrderExtras({
          photos: customerVisiblePhotos(photos),
          weightLbs:
            typeof data.weightLbs === "number" ? data.weightLbs : null,
          finalTotal:
            typeof data.finalTotal === "number" ? data.finalTotal : null,
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

  return (
    <article className="account-order-card track-order-card">
      <div className="account-order-head is-static">
        <div>
          <h3>Ref {track.ref}</h3>
          <p>
            {track.pickupDate
              ? `${formatPickupDate(track.pickupDate)}${
                  track.pickupSlot ? ` · ${track.pickupSlot}` : ""
                }`
              : "Pickup scheduled"}
            {services ? ` · ${services}` : ""}
          </p>
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
        <OrderProgress
          status={status}
          photos={photos}
          weightLbs={weightLbs}
          finalTotal={finalTotal}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/">Home</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/account">Account</Link>
          </Button>
        </div>
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
