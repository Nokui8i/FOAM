"use client";

import { FormEvent, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { Button } from "@/components/ui/button";
import {
  confirmCardSaved,
  createSetupIntent,
  stripeCallableErrorMessage,
} from "@/lib/stripe-api";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

type Props = {
  customerName?: string;
  onSaved: (card: {
    brand: string;
    last4: string;
    expMonth: number | null;
    expYear: number | null;
  }) => void;
};

function SaveCardFormInner({ onSaved }: { onSaved: Props["onSaved"] }) {
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
      const result = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });
      if (result.error) {
        throw new Error(result.error.message || "Could not save card.");
      }
      const setupIntentId = result.setupIntent?.id;
      if (!setupIntentId) {
        throw new Error("Setup incomplete. Try again.");
      }
      const card = await confirmCardSaved(setupIntentId);
      onSaved(card);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : stripeCallableErrorMessage(err)
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="account-ops-stack gap-3">
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />
      {error ? (
        <p className="account-ops-note" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={!stripe || busy}>
        {busy ? "Saving…" : "Save card"}
      </Button>
    </form>
  );
}

export function SaveCardPanel({ customerName, onSaved }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [bootError, setBootError] = useState("");
  const [loading, setLoading] = useState(false);

  async function start() {
    if (!isStripeConfigured()) {
      setBootError(
        "Stripe is not configured yet. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env.local."
      );
      return;
    }
    setLoading(true);
    setBootError("");
    try {
      const { clientSecret: secret } = await createSetupIntent(customerName);
      if (!secret) throw new Error("Missing client secret.");
      setClientSecret(secret);
    } catch (err) {
      setBootError(stripeCallableErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!clientSecret) {
    return (
      <div className="account-ops-stack gap-3">
        {bootError ? (
          <p className="account-ops-note" role="alert">
            {bootError}
          </p>
        ) : (
          <p className="account-ops-note">
            Save a card securely with Stripe. We charge after your laundry is
            weighed — never over WhatsApp or text.
          </p>
        )}
        <Button type="button" onClick={() => void start()} disabled={loading}>
          {loading ? "Loading…" : "Add card"}
        </Button>
      </div>
    );
  }

  return (
    <Elements
      stripe={getStripe()}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#0f766e",
            borderRadius: "10px",
          },
        },
      }}
    >
      <SaveCardFormInner onSaved={onSaved} />
    </Elements>
  );
}
