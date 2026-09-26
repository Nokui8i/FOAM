"use client";

import { useEffect, useState } from "react";
import { CircleDollarSign, Repeat2, Truck, Wallet } from "lucide-react";

import {
  DEFAULT_LAUNDRY_RATES,
  formatRateUsd,
  saveLaundryRates,
  subscribeLaundryRates,
  type LaundryRates,
} from "@/lib/laundry-rates";
import { cn } from "@/lib/utils";

type MobileView = "list" | "detail";

export function AdminPricingPanel({
  adminEmail,
  onMobileViewChange,
}: {
  adminEmail: string;
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
}) {
  const [rates, setRates] = useState<LaundryRates>(DEFAULT_LAUNDRY_RATES);
  const [draft, setDraft] = useState<LaundryRates>(DEFAULT_LAUNDRY_RATES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  useEffect(() => {
    onMobileViewChange("detail");
  }, [onMobileViewChange]);

  useEffect(() => {
    return subscribeLaundryRates((next) => {
      setRates(next);
      setDraft(next);
    });
  }, []);

  const dirty =
    draft.weeklyPerLb !== rates.weeklyPerLb ||
    draft.standardPerLb !== rates.standardPerLb ||
    draft.deliveryFee !== rates.deliveryFee ||
    draft.minimumOrder !== rates.minimumOrder;

  async function save() {
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const cleaned = await saveLaundryRates(draft, adminEmail);
      setRates(cleaned);
      setDraft(cleaned);
      setOkMsg("Saved. Homepage boxes and billing use these rates.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  function patch(partial: Partial<LaundryRates>) {
    setDraft((current) => ({ ...current, ...partial }));
    setOkMsg("");
    setError("");
  }

  return (
    <section className="ops-catalog-plane ops-pricing-plane">
      <header className="ops-catalog-plane-head">
        <div>
          <h1 className="ops-list-title">Pricing</h1>
          <p className="ops-catalog-plane-lead">
            Live rates for homepage cards, booking, and weekly automation.
          </p>
        </div>
        <div className="ops-schedule-head-actions">
          <div className="ops-catalog-plane-chip" aria-current="page">
            <span className="ops-catalog-plane-chip-icon" aria-hidden>
              <CircleDollarSign size={16} />
            </span>
            <span className="ops-catalog-plane-chip-copy">
              <strong>Laundry rates</strong>
            </span>
          </div>
          <button
            type="button"
            className="ops-schedule-save"
            disabled={saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {(okMsg || error) && (
        <p className={cn("ops-flash", error ? "is-error" : "is-ok")}>
          {error || okMsg}
        </p>
      )}

      <div className="ops-pricing-grid">
        <article className="ops-pricing-card is-weekly">
          <div className="ops-pricing-card-head">
            <span className="ops-pricing-card-icon" aria-hidden>
              <Repeat2 size={18} />
            </span>
            <div>
              <h2>Weekly / automation</h2>
              <p>
                Powers the <b>Weekly Service</b> card and every automated weekly
                pickup charge.
              </p>
            </div>
          </div>
          <label className="ops-promos-field">
            <span>Weekly $/lb</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={draft.weeklyPerLb}
              onChange={(e) =>
                patch({
                  weeklyPerLb: Math.max(0.01, Number(e.target.value) || 0.01),
                })
              }
            />
          </label>
          <p className="ops-pricing-preview">
            Card shows <b>{formatRateUsd(draft.weeklyPerLb)}</b> · used when
            booking is weekly / automation creates the next order
          </p>
        </article>

        <article className="ops-pricing-card is-ondemand">
          <div className="ops-pricing-card-head">
            <span className="ops-pricing-card-icon" aria-hidden>
              <Wallet size={18} />
            </span>
            <div>
              <h2>On-demand (regular)</h2>
              <p>
                Powers the <b>Only When You Need Us</b> card and one-off laundry
                orders.
              </p>
            </div>
          </div>
          <label className="ops-promos-field">
            <span>On-demand $/lb</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={draft.standardPerLb}
              onChange={(e) =>
                patch({
                  standardPerLb: Math.max(0.01, Number(e.target.value) || 0.01),
                })
              }
            />
          </label>
          <p className="ops-pricing-preview">
            Card shows <b>{formatRateUsd(draft.standardPerLb)}</b> · regular
            (non-weekly) laundry rate
          </p>
        </article>

        <article className="ops-pricing-card is-fee">
          <div className="ops-pricing-card-head">
            <span className="ops-pricing-card-icon" aria-hidden>
              <Truck size={18} />
            </span>
            <div>
              <h2>Service fee</h2>
              <p>
                Pickup / delivery fee on both cards and added in billing for
                laundry orders.
              </p>
            </div>
          </div>
          <label className="ops-promos-field">
            <span>Fee $</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={draft.deliveryFee}
              onChange={(e) =>
                patch({
                  deliveryFee: Math.max(0.01, Number(e.target.value) || 0.01),
                })
              }
            />
          </label>
          <p className="ops-pricing-preview">
            Cards show <b>+ {formatRateUsd(draft.deliveryFee)} Service Fee per
            Pickup</b>
          </p>
        </article>

        <article className="ops-pricing-card is-min">
          <div className="ops-pricing-card-head">
            <span className="ops-pricing-card-icon" aria-hidden>
              <CircleDollarSign size={18} />
            </span>
            <div>
              <h2>Minimum order</h2>
              <p>
                Floor for laundry totals in billing, and the homepage line under
                the cards.
              </p>
            </div>
          </div>
          <label className="ops-promos-field">
            <span>Minimum $</span>
            <input
              type="number"
              min={1}
              step={1}
              value={draft.minimumOrder}
              onChange={(e) =>
                patch({
                  minimumOrder: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
          </label>
          <p className="ops-pricing-preview">
            Page shows <b>Minimum order total: {formatRateUsd(draft.minimumOrder)}.</b>
          </p>
        </article>
      </div>

      <aside className="ops-pricing-note" aria-label="How rates apply">
        <strong>What this updates</strong>
        <ul>
          <li>
            Homepage pricing boxes (desktop + mobile) — live from Firestore.
          </li>
          <li>Booking / order pricing calculations for new charges.</li>
          <li>
            Weekly automation next-order pricing uses the weekly $/lb (+ fee /
            minimum rules).
          </li>
        </ul>
      </aside>
    </section>
  );
}
