"use client";

import { useEffect, useMemo, useState } from "react";
import { Percent, Ticket, Trash2, X } from "lucide-react";

import {
  deletePromoCode,
  formatPromoLabel,
  isPromoCurrentlyValid,
  savePromoCode,
  setPromoActive,
  subscribePromoCodes,
  type PromoCode,
  type PromoDiscountType,
  type PromoLimitMode,
} from "@/lib/promo-codes";
import { bookingTodayIso } from "@/lib/booking";
import { cn } from "@/lib/utils";

type MobileView = "list" | "detail";

const emptyForm = {
  code: "",
  discountType: "percent" as PromoDiscountType,
  discountValue: "",
  includesFee: false,
  limitMode: "uses" as PromoLimitMode,
  maxUses: "",
  expiresAt: "",
  note: "",
  active: true,
};

export function AdminPromosPanel({
  adminEmail,
  onMobileViewChange,
}: {
  adminEmail: string;
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
}) {
  const [rows, setRows] = useState<PromoCode[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  useEffect(() => subscribePromoCodes(setRows), []);
  useEffect(() => {
    onMobileViewChange("detail");
  }, [onMobileViewChange]);

  const today = bookingTodayIso();

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.code.localeCompare(b.code);
      }),
    [rows]
  );

  function startEdit(promo: PromoCode) {
    setEditingCode(promo.code);
    setForm({
      code: promo.code,
      discountType: promo.discountType,
      discountValue: String(promo.discountValue),
      includesFee: promo.includesFee,
      limitMode: promo.limitMode,
      maxUses: promo.maxUses != null ? String(promo.maxUses) : "",
      expiresAt: promo.expiresAt ?? "",
      note: promo.note,
      active: promo.active,
    });
    setError("");
    setOkMsg("");
  }

  function resetForm() {
    setEditingCode(null);
    setForm(emptyForm);
    setError("");
  }

  async function onSave() {
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const value = Number(form.discountValue);
      await savePromoCode(
        {
          code: form.code,
          discountType: form.discountType,
          discountValue: value,
          includesFee: form.includesFee,
          limitMode: form.limitMode,
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          expiresAt: form.expiresAt || null,
          active: form.active,
          note: form.note,
        },
        adminEmail
      );
      setOkMsg(editingCode ? "Promo updated." : "Promo created.");
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save promo.");
    } finally {
      setSaving(false);
    }
  }

  async function onToggle(promo: PromoCode) {
    setError("");
    try {
      await setPromoActive(promo.code, !promo.active, adminEmail);
      setOkMsg(promo.active ? "Promo paused." : "Promo activated.");
    } catch {
      setError("Could not update promo status.");
    }
  }

  async function onDelete(promo: PromoCode) {
    const ok = window.confirm(
      `Delete promo code ${promo.code}?\n\nCustomers will no longer be able to use it.`
    );
    if (!ok) return;
    setError("");
    try {
      await deletePromoCode(promo.code);
      if (editingCode === promo.code) resetForm();
      setOkMsg("Promo deleted.");
    } catch {
      setError("Could not delete promo.");
    }
  }

  return (
    <section className="ops-catalog-plane ops-promos-plane">
      <header className="ops-catalog-plane-head">
        <div>
          <h1 className="ops-list-title">Promos</h1>
          <p className="ops-catalog-plane-lead">
            Create discount codes for booking. Set a percent or dollar off, then
            limit by number of uses or an end date.
          </p>
        </div>
        <div className="ops-catalog-plane-chip" aria-current="page">
          <span className="ops-catalog-plane-chip-icon" aria-hidden>
            <Ticket size={16} />
          </span>
          <span className="ops-catalog-plane-chip-copy">
            <strong>Promo codes</strong>
            <small>
              {rows.length} {rows.length === 1 ? "code" : "codes"}
            </small>
          </span>
        </div>
      </header>

      {(okMsg || error) && (
        <p className={cn("ops-flash", error ? "is-error" : "is-ok")}>
          {error || okMsg}
        </p>
      )}

      <div className="ops-promos-layout">
        <div className="ops-promos-form">
          <div className="ops-promos-form-head">
            <h2>{editingCode ? `Edit ${editingCode}` : "New promo"}</h2>
            {editingCode ? (
              <button type="button" className="ops-promos-link" onClick={resetForm}>
                <X size={14} aria-hidden />
                Clear
              </button>
            ) : null}
          </div>

          <label className="ops-promos-field">
            <span>Code</span>
            <input
              value={form.code}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  code: e.target.value.toUpperCase(),
                }))
              }
              placeholder="WELCOME10"
              autoCapitalize="characters"
              disabled={Boolean(editingCode)}
              aria-label="Promo code"
            />
          </label>

          <div className="ops-promos-row">
            <label className="ops-promos-field">
              <span>Discount type</span>
              <select
                value={form.discountType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    discountType: e.target.value as PromoDiscountType,
                  }))
                }
                aria-label="Discount type"
              >
                <option value="percent">Percent (%)</option>
                <option value="fixed">Fixed ($)</option>
              </select>
            </label>
            <label className="ops-promos-field">
              <span>
                {form.discountType === "percent" ? "Percent off" : "Amount off"}
              </span>
              <input
                type="number"
                min={0}
                step={form.discountType === "percent" ? 1 : 0.01}
                value={form.discountValue}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discountValue: e.target.value }))
                }
                placeholder={form.discountType === "percent" ? "10" : "5.00"}
                aria-label="Discount value"
              />
            </label>
          </div>

          <fieldset className="ops-promos-limit">
            <legend>Service fee</legend>
            <label className="ops-promos-radio">
              <input
                type="radio"
                name="promo-fee"
                checked={!form.includesFee}
                onChange={() =>
                  setForm((f) => ({ ...f, includesFee: false }))
                }
              />
              <span>Exclude fee — discount laundry / dry clean only</span>
            </label>
            <label className="ops-promos-radio">
              <input
                type="radio"
                name="promo-fee"
                checked={form.includesFee}
                onChange={() =>
                  setForm((f) => ({ ...f, includesFee: true }))
                }
              />
              <span>Include fee — discount also applies to pickup fee</span>
            </label>
          </fieldset>

          <fieldset className="ops-promos-limit">
            <legend>Limit</legend>
            <label className="ops-promos-radio">
              <input
                type="radio"
                name="promo-limit"
                checked={form.limitMode === "uses"}
                onChange={() =>
                  setForm((f) => ({ ...f, limitMode: "uses" }))
                }
              />
              <span>Number of uses</span>
            </label>
            <label className="ops-promos-radio">
              <input
                type="radio"
                name="promo-limit"
                checked={form.limitMode === "expires"}
                onChange={() =>
                  setForm((f) => ({ ...f, limitMode: "expires" }))
                }
              />
              <span>End date</span>
            </label>
          </fieldset>

          {form.limitMode === "uses" ? (
            <label className="ops-promos-field">
              <span>Max uses</span>
              <input
                type="number"
                min={1}
                step={1}
                value={form.maxUses}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxUses: e.target.value }))
                }
                placeholder="50"
                aria-label="Maximum uses"
              />
            </label>
          ) : (
            <label className="ops-promos-field">
              <span>Valid through</span>
              <input
                type="date"
                min={today}
                value={form.expiresAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expiresAt: e.target.value }))
                }
                aria-label="Expiry date"
              />
            </label>
          )}

          <label className="ops-promos-field">
            <span>Note (optional)</span>
            <input
              value={form.note}
              onChange={(e) =>
                setForm((f) => ({ ...f, note: e.target.value }))
              }
              placeholder="Spring launch · friends & family"
              aria-label="Promo note"
            />
          </label>

          <label className="ops-promos-check">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm((f) => ({ ...f, active: e.target.checked }))
              }
            />
            <span>Active — customers can use this code</span>
          </label>

          <button
            type="button"
            className="ops-catalog-editor-btn"
            disabled={saving}
            onClick={() => void onSave()}
          >
            {saving
              ? "Saving…"
              : editingCode
                ? "Save changes"
                : "Create promo"}
          </button>
        </div>

        <div className="ops-promos-list">
          {sorted.length === 0 ? (
            <p className="ops-catalog-editor-empty">
              No promo codes yet. Create the first one on the left.
            </p>
          ) : (
            sorted.map((promo) => {
              const validity = isPromoCurrentlyValid(promo, today);
              return (
                <article
                  key={promo.id}
                  className={cn(
                    "ops-promos-card",
                    !promo.active && "is-paused",
                    !validity.ok && promo.active && "is-spent"
                  )}
                >
                  <div className="ops-promos-card-main">
                    <div className="ops-promos-card-title">
                      <Percent size={15} aria-hidden />
                      <strong>{promo.code}</strong>
                      <span>{formatPromoLabel(promo)}</span>
                    </div>
                    <p className="ops-promos-card-meta">
                      {promo.includesFee ? "Includes fee" : "Excludes fee"}
                      {" · "}
                      {promo.limitMode === "uses"
                        ? `${promo.usedCount} / ${promo.maxUses ?? "—"} uses`
                        : promo.expiresAt
                          ? `Until ${promo.expiresAt}`
                          : "No end date"}
                      {!promo.active
                        ? " · Paused"
                        : !validity.ok
                          ? ` · ${validity.reason.replace(/^This promo code /, "").replace(/\.$/, "")}`
                          : " · Live"}
                      {promo.note ? ` · ${promo.note}` : ""}
                    </p>
                  </div>
                  <div className="ops-promos-card-actions">
                    <button
                      type="button"
                      className="ops-promos-link"
                      onClick={() => startEdit(promo)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ops-promos-link"
                      onClick={() => void onToggle(promo)}
                    >
                      {promo.active ? "Pause" : "Activate"}
                    </button>
                    <button
                      type="button"
                      className="ops-promos-link is-danger"
                      aria-label={`Delete ${promo.code}`}
                      onClick={() => void onDelete(promo)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
