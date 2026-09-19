"use client";

import { Check } from "lucide-react";

import type { OrderStatus } from "@/lib/orders";
import { ORDER_STATUS_LABELS } from "@/lib/orders";
import { customerPipelineSteps } from "@/lib/order-tracking";
import { cn } from "@/lib/utils";

type OrderProgressProps = {
  status: OrderStatus;
  className?: string;
};

export function OrderProgress({ status, className }: OrderProgressProps) {
  const steps = customerPipelineSteps(status);
  const cancelled = status === "cancelled";

  return (
    <div className={cn("order-progress", className)}>
      {cancelled ? (
        <p className="order-progress-cancelled" role="status">
          This order was cancelled.
        </p>
      ) : null}

      <ol className="order-progress-list" aria-label="Order progress">
        {steps.map((step) => (
          <li
            key={step.id}
            className={cn(
              "order-progress-step",
              step.state === "done" && "is-done",
              step.state === "active" && "is-active",
              step.state === "upcoming" && "is-upcoming",
              step.state === "cancelled" && "is-cancelled"
            )}
          >
            <span className="order-progress-dot" aria-hidden>
              {step.state === "done" ? <Check size={12} strokeWidth={3} /> : null}
            </span>
            <div className="order-progress-copy">
              <strong>{step.label}</strong>
              {step.state === "active" || step.state === "done" ? (
                <small>{step.hint}</small>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <p className="order-progress-status">
        Status · {ORDER_STATUS_LABELS[status]}
      </p>
    </div>
  );
}
