# FOAM Ops — מפרט מימוש לרידיזיין עמוד האדמין (עבור Cursor)

מבוסס על המוקאפ שאושר ב-Design Canvas: https://claude.ai/artifact/FysxrEpwZ1V8dWWJRBxPgu

**מטרה:** להחליף את הניווט בטאבים למעלה בסיידבר אמיתי (הזמנות/פניות), ולצמצם את כרטיס ההזמנה בעמוד ההזמנות ל: פרטי קשר, משקל, בחירת פריטי ניקוי יבש מהקטלוג האמיתי, וסכום כולל — תוך הסרה מוחלטת של תמונות, ביטול/זיכוי והערות אדמין פנימיות מה-UI.

**⚠️ הערה חשובה לפני שמתחילים:** הקבצים הבאים נכתבים כאן במלואם, אבל הם התבססו על גרסת הקוד שנקראה בסביבת קלוד (לא בהכרח זהה ל-100% לגרסה העדכנית ביותר במחשב שלך אחרי עבודות קודמות עם Cursor). לפני החלה — **תעשי diff/השוואה מול הקובץ האמיתי במחשב**, ואם יש הבדלים משמעותיים תני ל-Cursor להתאים את השינוי במקום להדביק עיוור.

**⚠️ הבהרה חשובה:** כפתור "Save total" (במוקאפ נקרא "Charge") **לא מבצע חיוב אשראי אמיתי** — אין כאן אינטגרציה עם Stripe/סליקה. הוא רק מחשב ושומר את הסכום הסופי בהזמנה ב-Firestore. החיוב בפועל של הלקוח נשאר תהליך נפרד (חוץ ל-scope הזה).

---

## 1. קובץ חדש: `lib/dry-clean-catalog.ts`

קטלוג שטוח (מקור: `app/dry-cleaning/page.tsx`), לשימוש בתיבת החיפוש באדמין. (הערה: "Romper" הופיע פעמיים במקור באותו מחיר — נכלל פה פעם אחת בלבד.)

```ts
export type DryCleanCatalogItem = {
  name: string;
  price: number;
};

export const DRY_CLEAN_CATALOG: DryCleanCatalogItem[] = [
  // Tops
  { name: "Blouse", price: 6.55 },
  { name: "Blouse (linen)", price: 7.55 },
  { name: "Coat", price: 12.25 },
  { name: "Jacket (down)", price: 15.0 },
  { name: "Jacket (leather)", price: 75.0 },
  { name: "Jacket (sport/outer)", price: 10.0 },
  { name: "Jacket (womens)", price: 7.5 },
  { name: "Jersey", price: 8.5 },
  { name: "Laundry Shirt", price: 3.95 },
  { name: "Long Heavy Coat", price: 20.0 },
  { name: "Outer Vest", price: 10.0 },
  { name: "Polo/T-shirt", price: 6.55 },
  { name: "Shirt", price: 6.55 },
  { name: "Shirt (linen)", price: 7.55 },
  { name: "Sweater", price: 6.75 },
  { name: "Sweater (fur)", price: 10.0 },
  { name: "Sweatshirt", price: 8.0 },
  { name: "Tommy Bahama Shirt", price: 7.55 },
  { name: "Vest", price: 5.0 },
  { name: "Windbreaker", price: 10.0 },
  // Bottoms
  { name: "Pants", price: 6.55 },
  { name: "Pants (beaded)", price: 14.0 },
  { name: "Pants (leather)", price: 15.0 },
  { name: "Pants (linen)", price: 7.55 },
  { name: "Shorts", price: 6.25 },
  { name: "Shorts (linen)", price: 7.25 },
  { name: "Skirt (short)", price: 9.5 },
  { name: "Skirt (long)", price: 10.0 },
  // Full Body
  { name: "2-piece suit", price: 14.55 },
  { name: "3-piece suit", price: 18.55 },
  { name: "Dress (short)", price: 12.0 },
  { name: "Dress (long)", price: 17.0 },
  { name: "Gown", price: 25.0 },
  { name: "Jumpsuit", price: 16.0 },
  { name: "Romper", price: 12.0 },
  // Accessories
  { name: "Belt", price: 1.5 },
  { name: "Hanky", price: 1.5 },
  { name: "Banquet Tablecloth", price: 25.0 },
  { name: "Large Tablecloth", price: 16.0 },
  { name: "Napkins (each)", price: 3.0 },
  { name: "Placemats (each)", price: 5.0 },
  { name: "Pillowcases (each)", price: 5.0 },
  { name: "Tablecloth", price: 12.0 },
  { name: "Tie", price: 4.5 },
  { name: "Veil", price: 15.0 },
  // Household / Bedding
  { name: "Blanket", price: 25.0 },
  { name: "Comforter", price: 40.0 },
  { name: "Comforter (NS)", price: 60.0 },
  { name: "Curtain Panels", price: 50.0 },
  { name: "Duvet Comforter", price: 25.0 },
  { name: "Down Comforter", price: 45.0 },
  { name: "Pillowcase (each)", price: 5.0 },
  { name: "Top/Bottom Sheet", price: 15.0 },
];
```

---

## 2. `lib/orders.ts` — הוספות (לא מוחקים כלום קיים)

הוסיפי את הטיפוס והפונקציה הבאים (למשל אחרי `export type OrderPhoto = {...}`):

```ts
export type DryCleanItem = {
  name: string;
  price: number;
};

/** Sum of ad-hoc dry-cleaning items ops added for this order. */
export function dryCleanItemsTotal(items?: DryCleanItem[] | null): number {
  if (!items || items.length === 0) return 0;
  const sum = items.reduce((total, item) => total + (Number(item.price) || 0), 0);
  return Math.round(sum * 100) / 100;
}
```

והוסיפי שדה אחד לטיפוס `FoamOrder` (ליד `weightLbs?: number | null;`):

```ts
  dryCleanItems?: DryCleanItem[];
```

שאר הקובץ (`CANCEL_REASONS`, `REFUND_STATUSES`, `ORDER_ISSUE_OPTIONS` וכו') **נשאר כמו שהוא** — לא בשימוש יותר ב-UI של האדמין, אבל לא מזיק שיישאר מוגדר (ניקוי מאוחר יותר, לא עכשיו).

---

## 3. `app/globals.css` — הוספות (בסוף בלוק ה-Admin, למשל אחרי `admin-photo-thumb`)

```css
@utility admin-shell-body {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
}

@utility admin-rail {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem;
  border: 1px solid color-mix(in oklch, var(--color-border) 80%, transparent);
  border-radius: 0.9rem;
  background: white;
  flex-shrink: 0;
}

@utility admin-rail-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  width: 3.6rem;
  padding: 0.55rem 0.3rem;
  border: 0;
  border-radius: 0.65rem;
  background: transparent;
  color: var(--color-muted-foreground);
  font-size: 0.65rem;
  font-weight: 700;
  cursor: pointer;

  &.is-active {
    background: color-mix(in oklch, var(--color-accent) 40%, white);
    color: var(--color-foreground);
  }
}

@utility admin-rail-badge {
  position: absolute;
  top: 0.25rem;
  right: 0.55rem;
  min-width: 1rem;
  height: 1rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: var(--color-destructive);
  color: white;
  font-size: 0.6rem;
  font-weight: 800;
  line-height: 1rem;
  text-align: center;
}

@utility admin-main {
  flex: 1;
  min-width: 0;
}

@utility admin-dry-results {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-top: 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: 0.7rem;
  overflow: hidden;
}

@utility admin-dry-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.7rem;
  border: 0;
  background: white;
  font: inherit;
  font-size: 0.82rem;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: #f6f6f4;
  }
  & + & {
    border-top: 1px solid var(--color-border);
  }
}

@utility admin-dry-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.5rem 0.3rem 0.7rem;
  border-radius: 999px;
  background: color-mix(in oklch, var(--color-accent) 30%, white);
  font-size: 0.78rem;
  font-weight: 650;

  & button {
    border: 0;
    background: transparent;
    cursor: pointer;
    color: var(--color-muted-foreground);
    font-weight: 800;
    line-height: 1;
  }
}

@utility admin-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

@utility admin-total-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-top: 0.6rem;
  border-top: 1px solid var(--color-border);

  & strong {
    font-family: var(--font-display);
    font-size: 1.4rem;
  }
}
```

---

## 4. `components/admin-app.tsx` — מבנה חדש (סיידבר אמיתי במקום טאבים למעלה)

**שינויים:**
- שורת ה-`import` מ-`@/lib/firebase`: מוסיפים `getFirebaseDb` לצד `getFirebaseAuth`.
- מוסיפים `import { collection, onSnapshot } from "firebase/firestore";`
- מוסיפים `Package` ל-import מ-`lucide-react` (יחד עם `LogOut`), ומוסיפים גם `MessageCircle`.
- מוסיפים state + effect לספירת פניות פתוחות (לבאדג' האדום).
- מחליפים את ה-`<header className="admin-bar">` הקיים (עם ה-nav הפנימי) ואת ה-render של הפאנלים, במבנה של top bar דק + סיידבר.

קטע ה-imports המעודכן:

```tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { LogOut, MessageCircle, Package } from "lucide-react";

import { AdminContactsPanel } from "@/components/admin-contacts-panel";
import { AdminOrdersPanel } from "@/components/admin-orders-panel";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/site-config";
import { cn } from "@/lib/utils";

type AdminTab = "orders" | "contacts";
```

בתוך `AdminApp()`, אחרי ה-state הקיים (`const [tab, setTab] = useState<AdminTab>("orders");`) מוסיפים:

```tsx
const [openInquiriesCount, setOpenInquiriesCount] = useState(0);
```

ואחרי ה-`useEffect` הקיים של האימות (זה שקורא ל-`onAuthStateChanged`), מוסיפים `useEffect` נוסף:

```tsx
useEffect(() => {
  if (!allowed) return;
  const db = getFirebaseDb();
  return onSnapshot(collection(db, "contactMessages"), (snap) => {
    const open = snap.docs.filter((d) => d.data().status !== "done").length;
    setOpenInquiriesCount(open);
  });
}, [allowed]);
```

לבסוף, מחליפים את כל בלוק ה-`return` האחרון (המקרה `if (!allowed) {...}` נשאר בדיוק כמו שהוא — רק ה-`return` האחרון, של המסך המחובר, משתנה):

```tsx
return (
  <div className="admin-shell">
    <header className="admin-bar">
      <div className="admin-bar-brand">
        <span className="admin-bar-mark">FOAM</span>
      </div>
      <div className="admin-bar-end">
        <span className="admin-bar-email">{user.email}</span>
        <button
          type="button"
          className="admin-bar-icon"
          aria-label="Sign out"
          onClick={() => void signOut(getFirebaseAuth())}
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>

    <div className="admin-shell-body">
      <nav className="admin-rail" aria-label="Ops sections">
        <button
          type="button"
          className={cn("admin-rail-btn", tab === "orders" && "is-active")}
          onClick={() => setTab("orders")}
        >
          <Package size={18} aria-hidden />
          Orders
        </button>
        <button
          type="button"
          className={cn("admin-rail-btn", tab === "contacts" && "is-active")}
          onClick={() => setTab("contacts")}
        >
          <MessageCircle size={18} aria-hidden />
          Inquiries
          {openInquiriesCount > 0 ? (
            <span className="admin-rail-badge">{openInquiriesCount}</span>
          ) : null}
        </button>
      </nav>

      <div className="admin-main">
        {tab === "orders" ? (
          <AdminOrdersPanel adminEmail={user.email ?? ""} />
        ) : (
          <AdminContactsPanel />
        )}
      </div>
    </div>
  </div>
);
```

(שאר הקובץ — מסכי login/access-denied — נשאר בדיוק כמו שהוא, לא נגעו בו.)

---

## 5. `components/admin-orders-panel.tsx` — קובץ מלא מוחלף

זה השינוי הכי גדול. הקובץ החדש **מחליף את כל הקובץ הקיים**. מה שהוסר: כל ה-Photos (upload + grid), כל ה-CS pane (issue/cancel/refund/notes), הטאבים הפנימיים (Run/Details/CS). מה שנוסף: בחירת פריטי ניקוי יבש עם חיפוש, וכפתור וואטסאפ בכותרת.

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { ExternalLink, MapPin, MessageCircle, Phone, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DRY_CLEAN_CATALOG, type DryCleanCatalogItem } from "@/lib/dry-clean-catalog";
import { getFirebaseDb } from "@/lib/firebase";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_NEXT,
  computeFinalTotal,
  dryCleanItemsTotal,
  formatOrderAddress,
  normalizeOrderStatus,
  servicesSummary,
  type DryCleanItem,
  type FoamOrder,
  type OrderStatus,
} from "@/lib/orders";
import { BUSINESS_WHATSAPP } from "@/lib/site-config";
import { cn } from "@/lib/utils";

type Filter = "active" | "new" | "today" | "cancelled" | "done" | "all";

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mapsUrl(order: FoamOrder) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    formatOrderAddress(order)
  )}`;
}

function waUrl(phone: string, body: string) {
  const digits = phone.replace(/\D/g, "");
  const to = digits || BUSINESS_WHATSAPP;
  return `https://wa.me/${to}?text=${encodeURIComponent(body)}`;
}

function mapOrder(id: string, data: Record<string, unknown>): FoamOrder {
  const contact = (data.contact ?? {}) as Record<string, string>;
  const pickup = (data.pickup ?? {}) as Record<string, unknown>;
  const services = (data.services ?? {}) as Record<string, unknown>;
  const pricing = (data.pricing ?? {}) as FoamOrder["pricing"];

  return {
    id,
    status: normalizeOrderStatus(data.status),
    guest: Boolean(data.guest),
    uid: typeof data.uid === "string" ? data.uid : null,
    services: {
      laundry: Boolean(services.laundry),
      dryCleaning: Boolean(services.dryCleaning),
      bagCount: Number(services.bagCount ?? 0),
    },
    contact: {
      name: String(contact.name ?? ""),
      email: String(contact.email ?? ""),
      phone: String(contact.phone ?? ""),
    },
    pickup: {
      address: String(pickup.address ?? ""),
      unit: String(pickup.unit ?? ""),
      city: String(pickup.city ?? "Las Vegas"),
      zip: String(pickup.zip ?? ""),
      notes: String(pickup.notes ?? ""),
      date: String(pickup.date ?? ""),
      slot: String(pickup.slot ?? ""),
      repeat: Boolean(pickup.repeat),
      repeatRequested: Boolean(pickup.repeatRequested),
    },
    preferences: (data.preferences as Record<string, string>) ?? undefined,
    orderNotes: String(data.orderNotes ?? ""),
    pricing,
    tip: Number(data.tip ?? pricing?.tip ?? 0),
    promoCode: String(data.promoCode ?? pricing?.promoCode ?? ""),
    weightLbs: typeof data.weightLbs === "number" ? data.weightLbs : null,
    finalTotal: typeof data.finalTotal === "number" ? data.finalTotal : null,
    dryCleanItems: Array.isArray(data.dryCleanItems)
      ? (data.dryCleanItems as DryCleanItem[]).filter(
          (item) => item && typeof item.name === "string" && typeof item.price === "number"
        )
      : [],
    createdAt: (data.createdAt as FoamOrder["createdAt"]) ?? null,
    statusUpdatedAt: (data.statusUpdatedAt as FoamOrder["statusUpdatedAt"]) ?? null,
  };
}

export function AdminOrdersPanel({ adminEmail }: { adminEmail: string }) {
  const [rows, setRows] = useState<FoamOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [queryText, setQueryText] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [dryItems, setDryItems] = useState<DryCleanItem[]>([]);
  const [dryQuery, setDryQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const db = getFirebaseDb();
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((item) =>
          mapOrder(item.id, item.data() as Record<string, unknown>)
        );
        setRows(next);
        setSelectedId((current) => current ?? next[0]?.id ?? null);
        setError("");
      },
      () => {
        setError("Could not load orders. Check admin permissions.");
      }
    );
  }, []);

  const counts = useMemo(() => {
    const today = todayIso();
    return {
      active: rows.filter((r) => r.status !== "delivered" && r.status !== "cancelled").length,
      new: rows.filter((r) => r.status === "new").length,
      today: rows.filter((r) => r.pickup.date === today).length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      done: rows.filter((r) => r.status === "delivered" || r.status === "cancelled").length,
      all: rows.length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const today = todayIso();
    return rows.filter((row) => {
      if (filter === "new" && row.status !== "new") return false;
      if (filter === "today" && row.pickup.date !== today) return false;
      if (filter === "cancelled" && row.status !== "cancelled") return false;
      if (filter === "done" && row.status !== "delivered" && row.status !== "cancelled") {
        return false;
      }
      if (filter === "active" && (row.status === "delivered" || row.status === "cancelled")) {
        return false;
      }
      if (!q) return true;
      const hay = [
        row.contact.name,
        row.contact.email,
        row.contact.phone,
        row.pickup.address,
        row.pickup.zip,
        row.id,
        ORDER_STATUS_LABELS[row.status],
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filter, queryText]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setWeightInput(
      selected.weightLbs != null && selected.weightLbs > 0 ? String(selected.weightLbs) : ""
    );
    setDryItems(selected.dryCleanItems ?? []);
    setDryQuery("");
    setOkMsg("");
    setError("");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patchOrder(data: Record<string, unknown>, ok = "Saved.") {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await updateDoc(doc(getFirebaseDb(), "orders", selected.id), {
        ...data,
        statusUpdatedAt: serverTimestamp(),
        lastUpdatedBy: adminEmail,
      });
      setOkMsg(ok);
    } catch {
      setError("Update failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: OrderStatus) {
    await patchOrder({ status }, `Status → ${ORDER_STATUS_LABELS[status]}`);
  }

  const dryMatches = useMemo(() => {
    const q = dryQuery.trim().toLowerCase();
    if (!q) return [];
    return DRY_CLEAN_CATALOG.filter((item) => item.name.toLowerCase().includes(q)).slice(0, 6);
  }, [dryQuery]);

  function addDryItem(item: DryCleanCatalogItem) {
    setDryItems((current) => [...current, { name: item.name, price: item.price }]);
    setDryQuery("");
  }

  function removeDryItem(index: number) {
    setDryItems((current) => current.filter((_, i) => i !== index));
  }

  async function saveBilling() {
    if (!selected) return;
    const hasLaundry = selected.services.laundry;
    let lbs = 0;
    if (hasLaundry) {
      lbs = Number(weightInput);
      if (!Number.isFinite(lbs) || lbs <= 0) {
        setError("Enter a valid weight in pounds.");
        return;
      }
    }
    const laundryPortion = computeFinalTotal({
      weightLbs: lbs,
      tier: selected.pricing?.tier,
      ratePerLb: selected.pricing?.laundryRatePerLb,
      deliveryFee: selected.pricing?.deliveryFee,
      minimumOrder: selected.pricing?.minimumOrder,
      tip: selected.tip ?? selected.pricing?.tip ?? 0,
      repeatDiscountPercent: selected.pricing?.repeatDiscountEligible
        ? selected.pricing?.repeatDiscountPercent ?? 0
        : 0,
      hasLaundry,
    });
    const dryTotal = dryCleanItemsTotal(dryItems);
    const finalTotal = Math.round((laundryPortion + dryTotal) * 100) / 100;

    await patchOrder(
      {
        ...(hasLaundry ? { weightLbs: lbs } : {}),
        dryCleanItems: dryItems,
        finalTotal,
        status: hasLaundry && selected.status === "picked_up" ? "weighed" : selected.status,
        "pricing.finalTotalPending": false,
      },
      `Total saved · $${finalTotal.toFixed(2)}`
    );
  }

  const nextStatuses = selected ? ORDER_STATUS_NEXT[selected.status] ?? [] : [];

  const previewTotal = useMemo(() => {
    if (!selected) return null;
    const hasLaundry = selected.services.laundry;
    const lbs = Number(weightInput);
    if (hasLaundry && !(lbs > 0)) return null;
    const laundryPortion = computeFinalTotal({
      weightLbs: hasLaundry ? lbs : 0,
      tier: selected.pricing?.tier,
      ratePerLb: selected.pricing?.laundryRatePerLb,
      deliveryFee: selected.pricing?.deliveryFee,
      minimumOrder: selected.pricing?.minimumOrder,
      tip: selected.tip ?? selected.pricing?.tip ?? 0,
      repeatDiscountPercent: selected.pricing?.repeatDiscountEligible
        ? selected.pricing?.repeatDiscountPercent ?? 0
        : 0,
      hasLaundry,
    });
    return Math.round((laundryPortion + dryCleanItemsTotal(dryItems)) * 100) / 100;
  }, [selected, weightInput, dryItems]);

  const customerMsg = selected
    ? `Hi ${selected.contact.name.split(" ")[0] || "there"}, this is FOAM about your pickup on ${selected.pickup.date} (${selected.pickup.slot}).`
    : "";

  return (
    <div className="admin-layout">
      <aside className="admin-list">
        <div className="admin-list-tools">
          <label className="admin-search">
            <Search size={15} aria-hidden />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search…"
            />
          </label>
          <select
            className="admin-filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Filter orders"
          >
            <option value="active">Active ({counts.active})</option>
            <option value="new">New ({counts.new})</option>
            <option value="today">Today ({counts.today})</option>
            <option value="cancelled">Cancelled ({counts.cancelled})</option>
            <option value="done">Done ({counts.done})</option>
            <option value="all">All ({counts.all})</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="admin-muted">No orders.</p>
        ) : (
          filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className={cn(
                "admin-list-item",
                selectedId === row.id && "is-active",
                row.status === "new" && "is-unread"
              )}
              onClick={() => setSelectedId(row.id)}
            >
              <span className="admin-list-name">{row.contact.name}</span>
              <span className="admin-list-meta">
                {row.pickup.date} · {row.pickup.slot}
              </span>
              <span
                className={cn(
                  "admin-pill",
                  row.status === "delivered" && "is-done",
                  row.status === "cancelled" && "is-cancelled",
                  row.status === "new" && "is-new"
                )}
              >
                {ORDER_STATUS_LABELS[row.status].replace(/^\d+ · /, "")}
              </span>
            </button>
          ))
        )}
      </aside>

      <section className="admin-detail">
        {!selected ? (
          <p className="admin-muted">Select an order.</p>
        ) : (
          <>
            <div className="admin-detail-head">
              <div>
                <h2>{selected.contact.name}</h2>
                <p className="admin-detail-sub">
                  {selected.pickup.date} · {selected.pickup.slot}
                </p>
              </div>
              <div className="admin-icon-row">
                <a className="admin-icon-btn" href={`tel:${selected.contact.phone}`} aria-label="Call">
                  <Phone size={16} />
                </a>
                <a
                  className="admin-icon-btn"
                  href={waUrl(selected.contact.phone, customerMsg)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="WhatsApp"
                >
                  <MessageCircle size={16} />
                </a>
                <a
                  className="admin-icon-btn"
                  href={mapsUrl(selected)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Maps"
                >
                  <MapPin size={16} />
                </a>
              </div>
            </div>

            {(okMsg || error) && (
              <p className={error ? "admin-error" : "admin-ok"}>{error || okMsg}</p>
            )}

            <div className="admin-pane">
              <div className="admin-block">
                <label className="admin-field">
                  Status
                  <select
                    value={selected.status}
                    disabled={saving}
                    onChange={(e) => void setStatus(e.target.value as OrderStatus)}
                  >
                    {ORDER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {ORDER_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
                {nextStatuses.length > 0 ? (
                  <div className="admin-chip-row">
                    {nextStatuses.map((status) => (
                      <button
                        key={status}
                        type="button"
                        className="admin-chip"
                        disabled={saving}
                        onClick={() => void setStatus(status)}
                      >
                        → {ORDER_STATUS_LABELS[status].replace(/^\d+ · /, "")}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <dl className="admin-kv">
                <div>
                  <dt>Phone</dt>
                  <dd>
                    <a href={`tel:${selected.contact.phone}`}>{selected.contact.phone || "—"}</a>
                  </dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${selected.contact.email}`}>{selected.contact.email || "—"}</a>
                  </dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>
                    {formatOrderAddress(selected)}{" "}
                    <a href={mapsUrl(selected)} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} className="inline" />
                    </a>
                  </dd>
                </div>
                {selected.pickup.notes ? (
                  <div>
                    <dt>Access</dt>
                    <dd>{selected.pickup.notes}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Services</dt>
                  <dd>{servicesSummary(selected)}</dd>
                </div>
              </dl>

              {selected.services.laundry ? (
                <div className="admin-block">
                  <p className="admin-block-title">Weigh-in</p>
                  <div className="admin-ops-row">
                    <label className="admin-field">
                      Weight (lb)
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.1}
                        value={weightInput}
                        onChange={(e) => setWeightInput(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              <div className="admin-block">
                <p className="admin-block-title">Dry cleaning — add items</p>
                <label className="admin-field">
                  Search catalog
                  <input
                    type="text"
                    value={dryQuery}
                    onChange={(e) => setDryQuery(e.target.value)}
                    placeholder="Shirt, coat, comforter…"
                  />
                </label>
                {dryMatches.length > 0 ? (
                  <div className="admin-dry-results">
                    {dryMatches.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        className="admin-dry-row"
                        onClick={() => addDryItem(item)}
                      >
                        <span>{item.name}</span>
                        <span>${item.price.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {dryItems.length > 0 ? (
                  <div className="admin-chip-wrap">
                    {dryItems.map((item, index) => (
                      <span key={`${item.name}-${index}`} className="admin-dry-chip">
                        {item.name} · ${item.price.toFixed(2)}
                        <button type="button" onClick={() => removeDryItem(index)} aria-label={`Remove ${item.name}`}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="admin-block">
                <div className="admin-total-row">
                  <span>Total</span>
                  <strong>{previewTotal != null ? `$${previewTotal.toFixed(2)}` : "—"}</strong>
                </div>
                <Button type="button" disabled={saving} onClick={() => void saveBilling()}>
                  Save total
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
```

---

## 6. ניקוי אופציונלי (לא חובה עכשיו)

- `lib/order-photos.ts` הופך ללא בשימוש (רק `admin-orders-panel.tsx` הישן ייבא אותו). אפשר להשאיר אותו כקובץ מת בינתיים, או למחוק — לא משפיע על שום דבר אחר (וידאתי עם grep שהוא לא בשימוש במקום אחר).
- `firestore.rules` / `storage.rules` — **לא נגעתי ולא מציע לגעת**, לפי ההנחיה הקבועה שלך. השדה החדש `dryCleanItems` הוא רק שדה נוסף בתוך מסמך `orders` קיים, ולא אמור לדרוש שינוי בחוקים (אם ה-admin כבר יכול לכתוב ל-`orders`, הוא יכול לכתוב גם לשדה הזה).

## 7. אחרי שהשינויים נכנסים

```
npm run build
firebase deploy --only hosting
```

(או התהליך הרגיל שלך ל-deploy.)
