"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";

import { OrderProgress } from "@/components/order-progress";
import { Button } from "@/components/ui/button";
import { getFirebaseDb } from "@/lib/firebase";
import {
  normalizeOrderStatus,
  type OrderPhoto,
  type OrderStatus,
} from "@/lib/orders";
import {
  customerVisiblePhotos,
  type OrderTrackSnapshot,
} from "@/lib/order-tracking";
import { formatPickupDate } from "@/lib/booking";

function TrackBody() {
  const search = useSearchParams();
  const key = (search.get("k") || "").trim();
  const [track, setTrack] = useState<OrderTrackSnapshot | null>(null);
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

  if (loading) {
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
  const services = [
    track.laundry
      ? `Laundry${track.bagCount > 0 ? ` (${track.bagCount} bag${track.bagCount === 1 ? "" : "s"})` : ""}`
      : null,
    track.dryCleaning ? "Dry cleaning" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="track-card">
      <p className="eyebrow">Order tracking</p>
      <h1 className="mt-1 font-display text-xl font-bold tracking-tight">
        {track.firstName ? `Hi ${track.firstName}` : "Your pickup"}
      </h1>

      <div className="track-meta mt-4">
        <p>
          Ref <strong>{track.ref}</strong>
        </p>
        {track.pickupDate ? (
          <p>
            Pickup{" "}
            <strong>
              {formatPickupDate(track.pickupDate)}
              {track.pickupSlot ? ` · ${track.pickupSlot}` : ""}
            </strong>
          </p>
        ) : null}
        {services ? (
          <p>
            Services <strong>{services}</strong>
          </p>
        ) : null}
      </div>

      <OrderProgress
        status={status}
        photos={track.photos}
        weightLbs={track.weightLbs}
        finalTotal={track.finalTotal}
      />

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href="/">Home</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/account">Account</Link>
        </Button>
      </div>
    </div>
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
