"use client";

import { useEffect, useState, type WheelEvent } from "react";
import { Shirt, X } from "lucide-react";

import { useOpsPageReadyWhen } from "@/components/ops-boot";
import {
  DRY_CLEAN_CATALOG_DEFAULT,
  saveDryCleanCatalog,
  subscribeDryCleanCatalog,
  type DryCleanCatalogItem,
} from "@/lib/dry-clean-catalog";
import { cn } from "@/lib/utils";

type MobileView = "list" | "detail";

/** Number inputs trap wheel/trackpad — blur so the catalog list keeps scrolling. */
function releaseScrollOnWheel(e: WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

export function AdminCatalogPanel({
  adminEmail,
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
  const [pageReady, setPageReady] = useState(false);
  useOpsPageReadyWhen(pageReady);

  useEffect(
    () =>
      subscribeDryCleanCatalog((next) => {
        setCatalog(next);
        setPageReady(true);
      }),
    []
  );

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
    <section className="ops-catalog-plane">
      <header className="ops-catalog-plane-head">
        <div>
          <h1 className="ops-list-title">Catalog</h1>
        </div>
        <div className="ops-catalog-plane-chip" aria-current="page">
          <span className="ops-catalog-plane-chip-icon" aria-hidden>
            <Shirt size={16} />
          </span>
          <span className="ops-catalog-plane-chip-copy">
            <strong>Dry cleaning</strong>
            <small>
              {draft.length} {draft.length === 1 ? "item" : "items"}
            </small>
          </span>
        </div>
      </header>

      {(okMsg || error) && (
        <p className={cn("ops-flash", error ? "is-error" : "is-ok")}>
          {error || okMsg}
        </p>
      )}

      <div className="ops-catalog-editor">
        <div className="ops-catalog-editor-add">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Item name"
            aria-label="New item name"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
          />
          <input
            type="number"
            min={0}
            step={0.05}
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="Price"
            aria-label="New item price"
            onWheel={releaseScrollOnWheel}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
          />
          <button type="button" className="ops-catalog-editor-add-btn" onClick={addItem}>
            Add
          </button>
        </div>

        <div className="ops-catalog-editor-list">
          {draft.length === 0 ? (
            <p className="ops-catalog-editor-empty">
              No items yet. Add the first price above.
            </p>
          ) : (
            draft.map((item, index) => (
              <div key={`${item.name}-${index}`} className="ops-catalog-editor-row">
                <input
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
                  onWheel={releaseScrollOnWheel}
                />
                <button
                  type="button"
                  className="ops-catalog-editor-remove"
                  aria-label={`Remove ${item.name}`}
                  onClick={() =>
                    markDirty((current) =>
                      current.filter((_, i) => i !== index)
                    )
                  }
                >
                  <X size={15} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="ops-catalog-editor-actions">
          <button
            type="button"
            className="ops-catalog-editor-btn is-secondary"
            disabled={saving || !dirty}
            onClick={resetDraft}
          >
            Reset
          </button>
          <button
            type="button"
            className="ops-catalog-editor-btn"
            disabled={saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save catalog"}
          </button>
        </div>
      </div>
    </section>
  );
}
