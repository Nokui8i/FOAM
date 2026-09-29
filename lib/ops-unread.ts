/**
 * OPS “unread” signals — chat-style, not inventory counts.
 * Persisted per signed-in staff email in localStorage.
 */

export const OPS_UNREAD_EVENT = "foam-ops-unread-changed";

type OpsUnreadStore = {
  version: 1;
  /** Order ids already opened (or seeded as known). */
  seenOrders: string[];
  /** Pending staff uids already acknowledged. */
  seenStaff: string[];
  ordersSeeded: boolean;
  staffSeeded: boolean;
};

const EMPTY: OpsUnreadStore = {
  version: 1,
  seenOrders: [],
  seenStaff: [],
  ordersSeeded: false,
  staffSeeded: false,
};

function storageKey(email: string) {
  return `foam-ops-unread:v1:${email.trim().toLowerCase()}`;
}

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPS_UNREAD_EVENT));
}

function load(email: string): OpsUnreadStore {
  if (typeof window === "undefined" || !email.trim()) return { ...EMPTY };
  try {
    const raw = localStorage.getItem(storageKey(email));
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<OpsUnreadStore>;
    return {
      version: 1,
      seenOrders: Array.isArray(parsed.seenOrders)
        ? parsed.seenOrders.map(String)
        : [],
      seenStaff: Array.isArray(parsed.seenStaff)
        ? parsed.seenStaff.map(String)
        : [],
      ordersSeeded: Boolean(parsed.ordersSeeded),
      staffSeeded: Boolean(parsed.staffSeeded),
    };
  } catch {
    return { ...EMPTY };
  }
}

function save(email: string, store: OpsUnreadStore) {
  if (typeof window === "undefined" || !email.trim()) return;
  try {
    // Cap lists so storage stays bounded.
    const next: OpsUnreadStore = {
      ...store,
      seenOrders: store.seenOrders.slice(-800),
      seenStaff: store.seenStaff.slice(-200),
    };
    localStorage.setItem(storageKey(email), JSON.stringify(next));
    emit();
  } catch {
    /* private mode / quota */
  }
}

function mergeIds(existing: string[], ids: string[]) {
  const set = new Set(existing);
  for (const id of ids) {
    if (id) set.add(id);
  }
  return Array.from(set);
}

/** First snapshot: treat current orders as already known (no flood of dots). */
export function seedKnownOrders(email: string, orderIds: string[]) {
  if (!email.trim()) return;
  const store = load(email);
  if (store.ordersSeeded) return;
  store.seenOrders = mergeIds(store.seenOrders, orderIds);
  store.ordersSeeded = true;
  save(email, store);
}

/** First snapshot of pending staff: acknowledge current requests. */
export function seedKnownStaffPending(email: string, staffUids: string[]) {
  if (!email.trim()) return;
  const store = load(email);
  if (store.staffSeeded) return;
  store.seenStaff = mergeIds(store.seenStaff, staffUids);
  store.staffSeeded = true;
  save(email, store);
}

export function markOrderSeen(email: string, orderId: string) {
  if (!email.trim() || !orderId) return;
  const store = load(email);
  if (store.seenOrders.includes(orderId)) return;
  store.seenOrders = mergeIds(store.seenOrders, [orderId]);
  store.ordersSeeded = true;
  save(email, store);
}

/** Opening Staff acknowledges every pending request currently listed. */
export function markStaffPendingSeen(email: string, staffUids: string[]) {
  if (!email.trim()) return;
  const store = load(email);
  store.seenStaff = mergeIds(store.seenStaff, staffUids);
  store.staffSeeded = true;
  save(email, store);
}

export function isOrderUnread(email: string, orderId: string): boolean {
  if (!email.trim() || !orderId) return false;
  const store = load(email);
  if (!store.ordersSeeded) return false;
  return !store.seenOrders.includes(orderId);
}

export function countUnreadOrders(email: string, orderIds: string[]): number {
  if (!email.trim() || orderIds.length === 0) return 0;
  const store = load(email);
  if (!store.ordersSeeded) return 0;
  const seen = new Set(store.seenOrders);
  return orderIds.filter((id) => id && !seen.has(id)).length;
}

export function countUnreadStaffPending(
  email: string,
  staffUids: string[]
): number {
  if (!email.trim() || staffUids.length === 0) return 0;
  const store = load(email);
  if (!store.staffSeeded) return 0;
  const seen = new Set(store.seenStaff);
  return staffUids.filter((id) => id && !seen.has(id)).length;
}

export function subscribeOpsUnread(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener(OPS_UNREAD_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(OPS_UNREAD_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
