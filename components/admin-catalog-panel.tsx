"use client";

import { useEffect, useState } from "react";
import { Shirt, X } from "lucide-react";

import {
  DRY_CLEAN_CATALOG_DEFAULT,
  saveDryCleanCatalog,
  subscribeDryCleanCatalog,
  type DryCleanCatalogItem,
} from "@/lib/dry-clean-catalog";
import { cn } from "@/lib/utils";

type MobileView = "list" | "detail";

export function AdminCatalogPanel({
  adminEmail,
  mobileView,
  onMobileViewChange,
}: {
  adminEmail: string;
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
}) {
  const [catalog, setCatalog] = useState<DryCleanCatalogItem[]>(
    DRY_CLEAN_CATALOG_DEFAULT
  );
  const [draft, setDraft] = useState<DryCleanCatalogItem[]>([]);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => subscribeDryCleanCatalog(setCatalog), []);

  useEffect(() => {
    if (dirty) return;
    setDraft(catalog.map((item) => ({ ...item })));
  }, [catalog, dirty]);

  useEffect(() => {
    onMobileViewChange("detail");
  }, [onMobileViewChange]);

  function markDirty(
    next: DryCleanCatalogItem[] | ((current: DryCleanCatalogItem[]) => DryCleanCatalogItem[])
  ) {
    setDirty(true);
    setDraft(next);
    setOkMsg("");
  }

  async function save() {
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const saved = await saveDryCleanCatalog(draft, adminEmail);
      setCatalog(saved);
      setDraft(saved.map((item) => ({ ...item })));
      setDirty(false);
      setOkMsg("Catalog saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save catalog.");
    } finally {
      setSaving(false);
    }
  }

  function resetDraft() {
    setDraft(catalog.map((item) => ({ ...item })));
    setDirty(false);
    setNewName("");
    setNewPrice("");
    setError("");
    setOkMsg("");
  }

  function addItem() {
    const name = newName.trim();
    const price = Number(newPrice);
    if (!name || !Number.isFinite(price) || price < 0) {
      setError("Enter a name and valid price.");
      return;
    }
    markDirty((current) => {
      const without = current.filter(
        (row) => row.name.toLowerCase() !== name.toLowerCase()
      );
      return [
        ...without,
        { name, price: Math.round(price * 100) / 100 },
      ].sort((a, b) => a.name.localeCompare(b.name));
    });
    setNewName("");
    setNewPrice("");
    setError("");
  }

  return (
    <>
      <section
        className={cn(
          "ops-list-pane queue-plane",
          mobileView === "detail" && "is-hidden-mobile"
        )}
      >
        <div className="ops-list-head">
          <div className="queue-heading">
            <h1 className="ops-list-title">Catalog</h1>
          </div>
          <p className="ops-muted" style={{ margin: "8px 4px 0", fontSize: 13 }}>
            Admin-only dry clean prices. Drivers only add items to orders.
          </p>
        </div>
        <div className="ops-list-scroll">
          <button
            type="button"
            className="ops-row is-active"
            onClick={() => onMobileViewChange("detail")}
          >
            <span className="ops-row-icon">
              <Shirt size={16} />
            </span>
            <span className="ops-row-main">
              <span className="ops-row-name">Dry cleaning</span>
              <span className="ops-row-meta">
                {draft.length} items · edit prices
              </span>
            </span>
          </button>
        </div>
      </section>

      <section
        className={cn(
          "ops-detail-pane task-plane",
          mobileView === "list" && "is-hidden-mobile"
        )}
      >
        <article className="ops-detail">
          <div className="ops-detail-head">
            <p className="ops-breadcrumb">
              <span>Admin</span>
              <span aria-hidden>›</span>
              <span>Dry clean catalog</span>
            </p>
            <h2 className="ops-detail-title">Edit prices</h2>
          </div>

          {(okMsg || error) && (
            <p className={cn("ops-flash", error ? "is-error" : "is-ok")}>
              {error || okMsg}
            </p>
          )}

          <div className="ops-detail-stack">
            <div className="ops-stage-card ops-catalog-admin">
              <div className="ops-catalog-edit-add">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Item name"
                  aria-label="New item name"
                />
                <input
                  type="number"
                  min={0}
                  step={0.05}
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="Price"
                  aria-label="New item price"
                />
                <button
                  type="button"
                  className="ops-catalog-mode-btn is-active"
                  onClick={addItem}
                >
                  Add
                </button>
              </div>

              <div className="ops-catalog-list is-edit">
                {draft.map((item, index) => (
                  <div
                    key={`${item.name}-${index}`}
                    className="ops-catalog-item is-edit"
                  >
                    <input
                      className="ops-catalog-edit-name"
                      value={item.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        markDirty((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, name } : row
                          )
                        );
                      }}
                      aria-label="Item name"
                    />
                    <input
                      className="ops-catalog-edit-price"
                      type="number"
                      min={0}
                      step={0.05}
                      value={item.price}
                      onChange={(e) => {
                        const price = Number(e.target.value);
                        markDirty((current) =>
                          current.map((row, i) =>
                            i === index
                              ? {
                                  ...row,
                                  price: Number.isFinite(price) ? price : 0,
                                }
                              : row
                          )
                        );
                      }}
                      aria-label={`${item.name} price`}
                    />
                    <button
                      type="button"
                      className="ops-soft-thumb-remove"
                      aria-label={`Remove ${item.name}`}
                      onClick={() =>
                        markDirty((current) =>
                          current.filter((_, i) => i !== index)
                        )
                      }
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="ops-catalog-edit-actions">
                <button
                  type="button"
                  className="ops-catalog-modal-done is-secondary"
                  disabled={saving || !dirty}
                  onClick={resetDraft}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="ops-catalog-modal-done"
                  disabled={saving || !dirty}
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : "Save catalog"}
                </button>
              </div>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}
