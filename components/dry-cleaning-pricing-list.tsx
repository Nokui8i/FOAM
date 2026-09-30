"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DRY_CLEAN_CATALOG_DEFAULT,
  DRY_CLEAN_DEPARTMENTS,
  formatCatalogPriceDisplay,
  groupCatalogByDepartment,
  subscribeDryCleanCatalog,
  type DryCleanCatalogItem,
} from "@/lib/dry-clean-catalog";

const MINIMUM_ROWS = [
  {
    name: "Dry Cleaning (Add on)",
    price: "$25 minimum when added to your laundry order",
  },
  {
    name: "Dry Cleaning Only",
    price: "Our standard $50 minimum",
  },
] as const;

export function DryCleaningPricingList() {
  const [items, setItems] = useState<DryCleanCatalogItem[]>(
    DRY_CLEAN_CATALOG_DEFAULT
  );

  useEffect(() => subscribeDryCleanCatalog(setItems), []);

  const sections = useMemo(() => {
    const groups = groupCatalogByDepartment(items);
    return [
      {
        id: "minimums",
        title: "Dry Cleaning Minimum Orders",
        rows: MINIMUM_ROWS.map((row) => ({ ...row })),
      },
      ...groups.map((group) => ({
        id: group.id,
        title: group.title,
        rows: group.items.map(formatCatalogPriceDisplay),
      })),
    ];
  }, [items]);

  return (
    <div className="dc-accordion">
      {sections.map((category, index) => (
        <details
          key={category.id}
          className="dc-accordion-item"
          open={index === 0}
        >
          <summary className="dc-accordion-trigger">{category.title}</summary>
          <ul className="dc-price-list">
            {category.rows.map((row) => (
              <li key={`${category.id}-${row.name}`} className="dc-price-row">
                <span>{row.name}</span>
                <span className="dc-price-value">{row.price}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

/** Kept for any static fallback / SSR shell references. */
export const DRY_CLEAN_PUBLIC_DEPARTMENTS = DRY_CLEAN_DEPARTMENTS;
