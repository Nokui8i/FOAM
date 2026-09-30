"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type WheelEvent,
} from "react";
import { ChevronDown, Shirt, X } from "lucide-react";

import { useOpsPageReadyWhen } from "@/components/ops-boot";
import {
  DRY_CLEAN_CATALOG_DEFAULT,
  DRY_CLEAN_DEPARTMENTS,
  groupCatalogByDepartment,
  saveDryCleanCatalog,
  subscribeDryCleanCatalog,
  type DryCleanCatalogItem,
  type DryCleanDepartmentId,
} from "@/lib/dry-clean-catalog";
import { cn } from "@/lib/utils";

type MobileView = "list" | "detail";

/** Number inputs trap wheel/trackpad — blur so the catalog list keeps scrolling. */
function releaseScrollOnWheel(e: WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

const CatalogEditorRow = memo(function CatalogEditorRow({
  index,
  name,
  price,
  onNameChange,
  onPriceChange,
  onRemove,
}: {
  index: number;
  name: string;
  price: number;
  onNameChange: (index: number, name: string) => void;
  onPriceChange: (index: number, price: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="ops-catalog-editor-row">
      <input
        value={name}
        onChange={(e) => onNameChange(index, e.target.value)}
        aria-label="Item name"
      />
      <input
        type="number"
        min={0}
        step={0.05}
        value={price}
        onChange={(e) => {
          const next = Number(e.target.value);
          onPriceChange(index, Number.isFinite(next) ? next : 0);
        }}
        aria-label={`${name} price`}
        onWheel={releaseScrollOnWheel}
      />
      <button
        type="button"
        className="ops-catalog-editor-remove"
        aria-label={`Remove ${name}`}
        onClick={() => onRemove(index)}
      >
        <X size={15} />
      </button>
    </div>
  );
});

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
  const [addDepartment, setAddDepartment] =
    useState<DryCleanDepartmentId>("tops");
  const [openDepartments, setOpenDepartments] = useState<
    Record<DryCleanDepartmentId, boolean>
  >(() =>
    Object.fromEntries(
      DRY_CLEAN_DEPARTMENTS.map((d, i) => [d.id, i === 0])
    ) as Record<DryCleanDepartmentId, boolean>
  );
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

  const markDirty = useCallback(
    (
      next:
        | DryCleanCatalogItem[]
        | ((current: DryCleanCatalogItem[]) => DryCleanCatalogItem[])
    ) => {
      setDirty(true);
      setDraft(next);
      setOkMsg("");
    },
    []
  );

  const groups = useMemo(() => groupCatalogByDepartment(draft), [draft]);

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
        {
          name,
          price: Math.round(price * 100) / 100,
          department: addDepartment,
        },
      ];
    });
    setOpenDepartments((prev) => ({ ...prev, [addDepartment]: true }));
    setNewName("");
    setNewPrice("");
    setError("");
  }

  const updateNameAt = useCallback(
    (index: number, name: string) => {
      markDirty((current) =>
        current.map((row, i) => (i === index ? { ...row, name } : row))
      );
    },
    [markDirty]
  );

  const updatePriceAt = useCallback(
    (index: number, price: number) => {
      markDirty((current) =>
        current.map((row, i) => (i === index ? { ...row, price } : row))
      );
    },
    [markDirty]
  );

  const removeAt = useCallback(
    (index: number) => {
      markDirty((current) => current.filter((_, i) => i !== index));
    },
    [markDirty]
  );

  function toggleDepartment(id: DryCleanDepartmentId) {
    setOpenDepartments((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <section className="ops-catalog-plane">
      <header className="ops-catalog-plane-head">
        <div className="ops-catalog-plane-title-row">
          <h1 className="ops-list-title">Catalog</h1>
          <div className="ops-catalog-editor-actions is-inline">
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
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        <div className="ops-catalog-plane-chip is-meta" aria-current="page">
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
        <div className="ops-catalog-add-block">
          <p className="ops-catalog-add-label">Add new item</p>
          <div className="ops-catalog-editor-add is-dept">
            <select
              value={addDepartment}
              onChange={(e) =>
                setAddDepartment(e.target.value as DryCleanDepartmentId)
              }
              aria-label="Department"
            >
              {DRY_CLEAN_DEPARTMENTS.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.title}
                </option>
              ))}
            </select>
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
            <button
              type="button"
              className="ops-catalog-editor-add-btn"
              onClick={addItem}
            >
              Add
            </button>
          </div>
        </div>

        <div className="ops-catalog-dept-list">
          {groups.map((group) => {
            const open = openDepartments[group.id] !== false;
            return (
              <section
                key={group.id}
                className={cn("ops-catalog-dept", open && "is-open")}
              >
                <button
                  type="button"
                  className="ops-catalog-dept-trigger"
                  aria-expanded={open}
                  onClick={() => toggleDepartment(group.id)}
                >
                  <span>
                    {group.title}
                    <small>
                      {group.items.length}{" "}
                      {group.items.length === 1 ? "item" : "items"}
                    </small>
                  </span>
                  <ChevronDown size={18} aria-hidden />
                </button>
                {open ? (
                  <div className="ops-catalog-dept-body">
                    {group.items.length === 0 ? (
                      <p className="ops-catalog-editor-empty">
                        No items in this department.
                      </p>
                    ) : (
                      group.items.map((item) => {
                        const index = draft.findIndex((row) => row === item);
                        if (index < 0) return null;
                        return (
                          <CatalogEditorRow
                            key={`${group.id}-${index}-${item.name}`}
                            index={index}
                            name={item.name}
                            price={item.price}
                            onNameChange={updateNameAt}
                            onPriceChange={updatePriceAt}
                            onRemove={removeAt}
                          />
                        );
                      })
                    )}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
