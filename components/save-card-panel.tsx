"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import {
  confirmCardSaved,
  confirmGuestCardSaved,
  createGuestSetupIntent,
  createSetupIntent,
  stripeCallableErrorMessage,
} from "@/lib/stripe-api";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export type SavedCardPayload = {
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;
  setupIntentId?: string;
};

type Props = {
  customerName?: string;
  /** Guest checkout — no Firebase Auth. */
  guestEmail?: string;
  guestMode?: boolean;
  /** Start SetupIntent immediately. */
  autoStart?: boolean;
  saveLabel?: string;
  onSaved: (card: SavedCardPayload) => void;
};

function SaveCardFormInner({
  guestMode,
  saveLabel,
  onSaved,
}: {
  guestMode: boolean;
  saveLabel: string;
  onSaved: Props["onSaved"];
}) {
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
      if (guestMode) {
        const card = await confirmGuestCardSaved(setupIntentId);
        onSaved({
          brand: card.brand,
          last4: card.last4,
          expMonth: card.expMonth,
          expYear: card.expYear,
          setupIntentId,
        });
      } else {
        const card = await confirmCardSaved(setupIntentId);
        onSaved(card);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : stripeCallableErrorMessage(err)
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="account-ops-stack gap-3 account-ops-save-card-form"
    >
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? (
        <p className="account-ops-note" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="account-ops-btn is-primary account-ops-save-card-btn"
        disabled={!stripe || busy}
      >
        {busy ? "Saving…" : saveLabel}
      </button>
    </form>
  );
}

/** Stripe Payment Element — account Payments or guest booking billing. */
export function SaveCardPanel({
  customerName,
  guestEmail,
  guestMode = false,
  autoStart = false,
  saveLabel = "Save card",
  onSaved,
}: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [bootError, setBootError] = useState("");
  const [loading, setLoading] = useState(false);

  async function start() {
    if (!isStripeConfigured()) {
      setBootError("Payments are not available right now. Try again later.");
      return;
    }
    if (guestMode && !guestEmail?.trim()) {
      setBootError("Email is required to save a card.");
      return;
    }
    setLoading(true);
    setBootError("");
    try {
      const { clientSecret: secret } = guestMode
        ? await createGuestSetupIntent(guestEmail!.trim(), customerName)
        : await createSetupIntent(customerName);
      if (!secret) throw new Error("Missing client secret.");
      setClientSecret(secret);
    } catch (err) {
      setBootError(stripeCallableErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoStart && !clientSecret && !loading && !bootError) {
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  if (!clientSecret) {
    return (
      <div className="account-ops-stack gap-3">
        {bootError ? (
          <p className="account-ops-note" role="alert">
            {bootError}
          </p>
        ) : loading || autoStart ? (
          <p className="account-ops-note">Loading…</p>
        ) : (
          <button
            type="button"
            className="account-ops-btn is-primary"
            onClick={() => void start()}
            disabled={loading}
          >
            Add card
          </button>
        )}
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
      <SaveCardFormInner
        guestMode={guestMode}
        saveLabel={saveLabel}
        onSaved={onSaved}
      />
    </Elements>
  );
}
