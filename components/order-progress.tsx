"use client";

import { useEffect, useId, useState } from "react";
import { Check, X } from "lucide-react";

import type { OrderPhoto, OrderStatus } from "@/lib/orders";
import { ORDER_STATUS_LABELS } from "@/lib/orders";
import {
  customerPipelineSteps,
  customerVisiblePhotos,
} from "@/lib/order-tracking";
import { cn } from "@/lib/utils";

type OrderProgressProps = {
  status: OrderStatus;
  photos?: OrderPhoto[] | null;
  weightLbs?: number | null;
  finalTotal?: number | null;
  className?: string;
};

export function OrderProgress({
  status,
  photos,
  weightLbs,
  finalTotal,
  className,
}: OrderProgressProps) {
  const steps = customerPipelineSteps(status);
  const cancelled = status === "cancelled";
  const visible = customerVisiblePhotos(photos);
  const weightPhotos = visible.filter((p) => p.kind === "weight");
  const deliveryPhotos = visible.filter((p) => p.kind === "return");
  const [overlay, setOverlay] = useState<{
    url: string;
    alt: string;
  } | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!overlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverlay(null);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [overlay]);

  function stepPhotos(stepId: string): OrderPhoto[] {
    if (stepId === "waiting") return weightPhotos;
    if (stepId === "done") return deliveryPhotos;
    if (stepId === "delivery" && status === "out_for_delivery") {
      return deliveryPhotos;
    }
    return [];
  }

  function photoAlt(kind: OrderPhoto["kind"]) {
    return kind === "return" ? "Delivery photo" : "Scale photo";
  }

  return (
    <div className={cn("order-progress", className)}>
      {cancelled ? (
        <p className="order-progress-cancelled" role="status">
          This order was cancelled.
        </p>
      ) : null}

      <ol className="order-progress-list" aria-label="Order progress">
        {steps.map((step) => {
          const thumbs = stepPhotos(step.id);
          return (
            <li
              key={step.id}
              className={cn(
                "order-progress-step",
                step.state === "done" && "is-done",
                step.state === "active" && "is-active",
                step.state === "upcoming" && "is-upcoming",
                step.state === "cancelled" && "is-cancelled",
                thumbs.length > 0 && "has-photos"
              )}
            >
              <span className="order-progress-dot" aria-hidden>
                {step.state === "done" ? (
                  <Check size={12} strokeWidth={3} />
                ) : null}
              </span>
              <strong className="order-progress-label">{step.label}</strong>
              {thumbs.length > 0 ? (
                <div className="order-progress-thumbs">
                  {thumbs.map((photo) => (
                    <button
                      key={photo.url}
                      type="button"
                      className="order-progress-thumb"
                      onClick={() =>
                        setOverlay({
                          url: photo.url,
                          alt: photoAlt(photo.kind),
                        })
                      }
                    >
                      <img src={photo.url} alt={photoAlt(photo.kind)} />
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="order-progress-status">
        Status · {ORDER_STATUS_LABELS[status]}
      </p>

      {weightLbs != null && weightLbs > 0 ? (
        <p className="order-progress-meta">
          Weight <strong>{weightLbs} lb</strong>
          {finalTotal != null ? (
            <>
              {" "}
              · Total <strong>${finalTotal.toFixed(2)}</strong>
            </>
          ) : null}
        </p>
      ) : finalTotal != null ? (
        <p className="order-progress-meta">
          Total <strong>${finalTotal.toFixed(2)}</strong>
        </p>
      ) : null}

      {overlay ? (
        <div
          className="order-photo-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => setOverlay(null)}
        >
          <button
            type="button"
            className="order-photo-overlay-close"
            aria-label="Close"
            onClick={() => setOverlay(null)}
          >
            <X size={20} />
          </button>
          <p id={titleId} className="sr-only">
            {overlay.alt}
          </p>
          <img
            src={overlay.url}
            alt={overlay.alt}
            className="order-photo-overlay-img"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
