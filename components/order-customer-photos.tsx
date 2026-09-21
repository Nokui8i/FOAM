"use client";

import type { OrderPhoto } from "@/lib/orders";
import { customerVisiblePhotos } from "@/lib/order-tracking";
import { cn } from "@/lib/utils";

type OrderCustomerPhotosProps = {
  photos?: OrderPhoto[] | null;
  weightLbs?: number | null;
  finalTotal?: number | null;
  className?: string;
};

export function OrderCustomerPhotos({
  photos,
  weightLbs,
  finalTotal,
  className,
}: OrderCustomerPhotosProps) {
  const visible = customerVisiblePhotos(photos);
  const weightPhotos = visible.filter((p) => p.kind === "weight");
  const deliveryPhotos = visible.filter((p) => p.kind === "return");

  if (!weightPhotos.length && !deliveryPhotos.length && weightLbs == null && finalTotal == null) {
    return null;
  }

  return (
    <div className={cn("track-photos-stack", className)}>
      {weightLbs != null && weightLbs > 0 ? (
        <p className="track-photos-meta">
          Weight <strong>{weightLbs} lb</strong>
          {finalTotal != null ? (
            <>
              {" "}
              · Total <strong>${finalTotal.toFixed(2)}</strong>
            </>
          ) : null}
        </p>
      ) : finalTotal != null ? (
        <p className="track-photos-meta">
          Total <strong>${finalTotal.toFixed(2)}</strong>
        </p>
      ) : null}

      {weightPhotos.length > 0 ? (
        <section className="track-photos" aria-label="Scale photo">
          <h2 className="track-photos-title">Scale photo</h2>
          <p className="track-photos-hint">
            Taken when we weighed your laundry at pickup.
          </p>
          <div className="track-photos-grid">
            {weightPhotos.map((photo) => (
              <a
                key={photo.url}
                href={photo.url}
                target="_blank"
                rel="noreferrer"
                className="track-photo"
              >
                <img src={photo.url} alt="Scale photo from pickup" />
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {deliveryPhotos.length > 0 ? (
        <section className="track-photos" aria-label="Delivery photo">
          <h2 className="track-photos-title">Delivery photo</h2>
          <p className="track-photos-hint">Proof your order was returned.</p>
          <div className="track-photos-grid">
            {deliveryPhotos.map((photo) => (
              <a
                key={photo.url}
                href={photo.url}
                target="_blank"
                rel="noreferrer"
                className="track-photo"
              >
                <img src={photo.url} alt="Delivery proof photo" />
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
