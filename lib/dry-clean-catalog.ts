import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";

export const DRY_CLEAN_DEPARTMENTS = [
  { id: "tops", title: "Tops" },
  { id: "bottoms", title: "Bottoms" },
  { id: "full-body", title: "Full Body" },
  { id: "accessories", title: "Accessories" },
  { id: "household", title: "Household / Bedding" },
] as const;

export type DryCleanDepartmentId =
  (typeof DRY_CLEAN_DEPARTMENTS)[number]["id"];

export type DryCleanCatalogItem = {
  name: string;
  price: number;
  department: DryCleanDepartmentId;
};

const DEPARTMENT_IDS = new Set<string>(
  DRY_CLEAN_DEPARTMENTS.map((d) => d.id)
);

function isDepartmentId(value: unknown): value is DryCleanDepartmentId {
  return typeof value === "string" && DEPARTMENT_IDS.has(value);
}

/**
 * Default catalog matching the public dry-cleaning departments.
 * Live Ops catalog is stored in Firestore `config/dryCleanCatalog`.
 */
export const DRY_CLEAN_CATALOG_DEFAULT: DryCleanCatalogItem[] = [
  { name: "Blouse", price: 6.55, department: "tops" },
  { name: "Blouse (linen)", price: 7.55, department: "tops" },
  { name: "Coat", price: 12.25, department: "tops" },
  { name: "Jacket (down)", price: 15.0, department: "tops" },
  { name: "Jacket (leather)", price: 75.0, department: "tops" },
  { name: "Jacket (sport/outer)", price: 10.0, department: "tops" },
  { name: "Jacket (womens)", price: 7.5, department: "tops" },
  { name: "Jersey", price: 8.5, department: "tops" },
  { name: "Laundry Shirt", price: 3.95, department: "tops" },
  { name: "Long Heavy Coat", price: 20.0, department: "tops" },
  { name: "Outer Vest", price: 10.0, department: "tops" },
  { name: "Polo/T-shirt", price: 6.55, department: "tops" },
  { name: "Romper", price: 12.0, department: "tops" },
  { name: "Shirt", price: 6.55, department: "tops" },
  { name: "Shirt (linen)", price: 7.55, department: "tops" },
  { name: "Sweater", price: 6.75, department: "tops" },
  { name: "Sweater (fur)", price: 10.0, department: "tops" },
  { name: "Sweatshirt", price: 8.0, department: "tops" },
  { name: "Tommy Bahama Shirt", price: 7.55, department: "tops" },
  { name: "Vest", price: 5.0, department: "tops" },
  { name: "Windbreaker", price: 10.0, department: "tops" },
  { name: "Pants", price: 6.55, department: "bottoms" },
  { name: "Pants (beaded)", price: 14.0, department: "bottoms" },
  { name: "Pants (leather)", price: 15.0, department: "bottoms" },
  { name: "Pants (linen)", price: 7.55, department: "bottoms" },
  { name: "Shorts", price: 6.25, department: "bottoms" },
  { name: "Shorts (linen)", price: 7.25, department: "bottoms" },
  { name: "Skirt (short)", price: 9.5, department: "bottoms" },
  { name: "Skirt (long)", price: 10.0, department: "bottoms" },
  { name: "2-piece suit", price: 14.55, department: "full-body" },
  { name: "3-piece suit", price: 18.55, department: "full-body" },
  { name: "Dress (short)", price: 12.0, department: "full-body" },
  { name: "Dress (long)", price: 17.0, department: "full-body" },
  { name: "Gown", price: 25.0, department: "full-body" },
  { name: "Jumpsuit", price: 16.0, department: "full-body" },
  { name: "Belt", price: 1.5, department: "accessories" },
  { name: "Hanky", price: 1.5, department: "accessories" },
  { name: "Banquet Tablecloth", price: 25.0, department: "accessories" },
  { name: "Large Tablecloth", price: 16.0, department: "accessories" },
  { name: "Napkins (each)", price: 3.0, department: "accessories" },
  { name: "Placemats (each)", price: 5.0, department: "accessories" },
  { name: "Pillowcases (each)", price: 5.0, department: "accessories" },
  { name: "Tablecloth", price: 12.0, department: "accessories" },
  { name: "Tie", price: 4.5, department: "accessories" },
  { name: "Veil", price: 15.0, department: "accessories" },
  { name: "Blanket", price: 25.0, department: "household" },
  { name: "Comforter", price: 40.0, department: "household" },
  { name: "Comforter (NS)", price: 60.0, department: "household" },
  { name: "Curtain Panels", price: 50.0, department: "household" },
  { name: "Duvet Comforter", price: 25.0, department: "household" },
  { name: "Down Comforter", price: 45.0, department: "household" },
  { name: "Pillowcase (each)", price: 5.0, department: "household" },
  { name: "Top/Bottom Sheet", price: 15.0, department: "household" },
];

const DEFAULT_DEPARTMENT_BY_NAME = new Map(
  DRY_CLEAN_CATALOG_DEFAULT.map((item) => [
    item.name.toLowerCase(),
    item.department,
  ])
);

/** @deprecated Prefer DRY_CLEAN_CATALOG_DEFAULT or live Firestore catalog. */
export const DRY_CLEAN_CATALOG = DRY_CLEAN_CATALOG_DEFAULT;

export const DRY_CLEAN_CATALOG_DOC = "config/dryCleanCatalog";

function inferDepartment(
  name: string,
  raw: unknown
): DryCleanDepartmentId {
  if (isDepartmentId(raw)) return raw;
  return DEFAULT_DEPARTMENT_BY_NAME.get(name.toLowerCase()) ?? "tops";
}

function normalizeItems(raw: unknown): DryCleanCatalogItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const items: DryCleanCatalogItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const name = String((row as { name?: unknown }).name ?? "").trim();
    const price = Number((row as { price?: unknown }).price);
    if (!name || !Number.isFinite(price) || price < 0) continue;
    items.push({
      name,
      price: Math.round(price * 100) / 100,
      department: inferDepartment(
        name,
        (row as { department?: unknown }).department
      ),
    });
  }
  return items.length ? items : null;
}

/** Keep department order; preserve relative order within each department. */
export function sortCatalogByDepartment(
  items: DryCleanCatalogItem[]
): DryCleanCatalogItem[] {
  const order = new Map(
    DRY_CLEAN_DEPARTMENTS.map((d, i) => [d.id, i] as const)
  );
  return [...items].sort((a, b) => {
    const deptDiff =
      (order.get(a.department) ?? 99) - (order.get(b.department) ?? 99);
    if (deptDiff !== 0) return deptDiff;
    return 0;
  });
}

export function groupCatalogByDepartment(items: DryCleanCatalogItem[]) {
  return DRY_CLEAN_DEPARTMENTS.map((dept) => ({
    ...dept,
    items: items.filter((item) => item.department === dept.id),
  }));
}

export function formatCatalogPriceDisplay(item: DryCleanCatalogItem): {
  name: string;
  price: string;
} {
  const each = /\(each\)\s*$/i.test(item.name);
  const name = each
    ? item.name.replace(/\s*\(each\)\s*$/i, "").trim()
    : item.name;
  const price = `$${item.price.toFixed(2)}${each ? " each" : ""}`;
  return { name, price };
}

export function subscribeDryCleanCatalog(
  onChange: (items: DryCleanCatalogItem[]) => void
) {
  const ref = doc(getFirebaseDb(), "config", "dryCleanCatalog");
  return onSnapshot(
    ref,
    (snap) => {
      const items = normalizeItems(snap.data()?.items);
      onChange(sortCatalogByDepartment(items ?? DRY_CLEAN_CATALOG_DEFAULT));
    },
    () => onChange(DRY_CLEAN_CATALOG_DEFAULT)
  );
}

export async function loadDryCleanCatalog() {
  try {
    const snap = await getDoc(doc(getFirebaseDb(), "config", "dryCleanCatalog"));
    return sortCatalogByDepartment(
      normalizeItems(snap.data()?.items) ?? DRY_CLEAN_CATALOG_DEFAULT
    );
  } catch {
    return DRY_CLEAN_CATALOG_DEFAULT;
  }
}

export async function saveDryCleanCatalog(
  items: DryCleanCatalogItem[],
  updatedBy: string
) {
  const cleaned = normalizeItems(items);
  if (!cleaned) throw new Error("Catalog needs at least one valid item.");
  const sorted = sortCatalogByDepartment(cleaned);
  await setDoc(
    doc(getFirebaseDb(), "config", "dryCleanCatalog"),
    {
      items: sorted,
      updatedAt: serverTimestamp(),
      updatedBy: updatedBy || "admin",
    },
    { merge: true }
  );
  return sorted;
}
