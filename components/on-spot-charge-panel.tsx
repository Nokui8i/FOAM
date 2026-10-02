"use client";

import { FormEvent, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import {
  finalizeOnSpotCharge,
  stripeCallableErrorMessage,
} from "@/lib/stripe-api";
import { getStripe } from "@/lib/stripe";

type Props = {
  orderId: string;
  clientSecret: string;
  paymentIntentId: string;
  amountLabel: string;
  onPaid: (result: { brand?: string; last4?: string; finalTotal: number }) => void;
  onCancel: () => void;
};

function OnSpotChargeForm({
  orderId,
  paymentIntentId,
  amountLabel,
  onPaid,
  onCancel,
}: Omit<Props, "clientSecret">) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError("");
    try {
      const result = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url:
            typeof window !== "undefined" ? window.location.href : undefined,
        },
      });
      if (result.error) {
        throw new Error(result.error.message || "Payment failed.");
      }
      const status = result.paymentIntent?.status;
      if (status !== "succeeded" && status !== "processing") {
        throw new Error(`Payment not completed (${status || "unknown"}).`);
      }
      const finalized = await finalizeOnSpotCharge({
        orderId,
        paymentIntentId:
          result.paymentIntent?.id || paymentIntentId,
      });
      onPaid({
        brand: finalized.brand,
        last4: finalized.last4,
        finalTotal: finalized.finalTotal,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : stripeCallableErrorMessage(err)
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="ops-onspot-form">
      <p className="ops-confirm-note">
        Enter a different card for this charge only ({amountLabel}). Card
        details stay with Stripe.
      </p>
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? (
        <p className="ops-confirm-note ops-confirm-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="ops-confirm-actions">
        <button
          type="button"
          className="ops-confirm-btn is-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Back
        </button>
        <button
          type="submit"
          className="ops-confirm-btn is-confirm"
          disabled={!stripe || busy}
        >
          {busy ? "Charging…" : `Charge ${amountLabel}`}
        </button>
      </div>
    </form>
  );
}

/** Driver enters an alternate card when the saved card fails. */
export function OnSpotChargePanel(props: Props) {
  return (
    <Elements
      stripe={getStripe()}
      options={{
        clientSecret: props.clientSecret,
        appearance: { theme: "stripe" },
      }}
    >
      <OnSpotChargeForm
        orderId={props.orderId}
        paymentIntentId={props.paymentIntentId}
        amountLabel={props.amountLabel}
        onPaid={props.onPaid}
        onCancel={props.onCancel}
      />
    </Elements>
  );
}
