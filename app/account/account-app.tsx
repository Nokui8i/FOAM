"use client";

import {
  useEffect,
  useState,
  Suspense,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  CreditCard,
  LogOut,
  Package,
  Settings2,
  UserRound,
} from "lucide-react";

import { AddressAutocomplete } from "@/components/address-autocomplete";
import { AccountOrders } from "@/components/account-orders";
import { OptionSheet } from "@/components/option-sheet";
import { BrandSplash } from "@/components/brand-splash";
import { useAuth } from "@/components/auth-provider";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { SaveCardPanel } from "@/components/save-card-panel";
import { useQueryReplace } from "@/lib/use-query-replace";
import { cn } from "@/lib/utils";
import {
  LAS_VEGAS_CITY,
  isLasVegasAddress,
} from "@/lib/las-vegas";
import {
  defaultLaundryPrefs,
  defaultProfile,
  getUserProfile,
  legacyFieldsFromLaundryPrefs,
  resolveLaundryPrefs,
  saveUserProfile,
  type LaundryPrefs,
  type UserProfile,
} from "@/lib/user-profile";
import {
  DETERGENT_BOOKING_OPTIONS,
  DETERGENT_IMAGES,
  DRYER_HEAT_OPTIONS,
  FOLD_ITEM_OPTIONS,
  SOFTENER_BOOKING_OPTIONS,
  WASH_TEMP_BOOKING_OPTIONS,
} from "@/lib/booking";
import {
  cancelFutureWeeklyOrders,
} from "@/lib/weekly-automation";

type Mode = "signin" | "signup";
const tabs = ["Details", "Preferences", "Orders", "Payments"] as const;
type TabName = (typeof tabs)[number];

const TAB_PARAM: Record<TabName, string> = {
  Details: "details",
  Preferences: "preferences",
  Orders: "orders",
  Payments: "payments",
};

function parseAccountTab(raw: string | null): TabName {
  const match = (Object.entries(TAB_PARAM) as [TabName, string][]).find(
    ([, value]) => value === raw
  );
  return match?.[0] ?? "Details";
}

const inputClass = "account-ops-control";

const TAB_META: Record<
  TabName,
  { icon: typeof UserRound; label: string }
> = {
  Details: { icon: UserRound, label: "Details" },
  Preferences: { icon: Settings2, label: "Preferences" },
  Orders: { icon: Package, label: "Orders" },
  Payments: { icon: CreditCard, label: "Payments" },
};

function AccountProfile({
  uid,
  email,
  displayName,
  onSignOut,
}: {
  uid: string;
  email: string;
  displayName: string;
  onSignOut: () => void;
}) {
  const { searchParams, replaceQuery } = useQueryReplace();
  const [profile, setProfile] = useState<UserProfile>(() => ({
    ...defaultProfile(uid, email),
    name: displayName,
  }));
  const activeTab = parseAccountTab(searchParams.get("tab"));
  const [saving, setSaving] = useState(false);
  const [weeklyBusy, setWeeklyBusy] = useState(false);
  const [weeklyNote, setWeeklyNote] = useState("");
  const [savedPanel, setSavedPanel] = useState<"details" | "preferences" | null>(
    null
  );
  const [error, setError] = useState("");
  const [prefPicker, setPrefPicker] = useState<keyof LaundryPrefs | null>(null);
  const [signOutConfirm, setSignOutConfirm] = useState(false);

  useEffect(() => {
    let alive = true;
    const fallback: UserProfile = {
      ...defaultProfile(uid, email),
      name: displayName || "",
    };

    getUserProfile(uid)
      .then((data) => {
        if (!alive) return;
        if (data) {
          const prefs = resolveLaundryPrefs(data);
          const legacy = legacyFieldsFromLaundryPrefs(prefs);
          setProfile({
            ...data,
            ...legacy,
            laundryPrefs: prefs,
            name: data.name.trim() || displayName || data.name,
          });
        } else {
          setProfile({
            ...fallback,
            laundryPrefs: defaultLaundryPrefs(),
          });
        }
      })
      .catch(() => {
        if (!alive) return;
        setProfile(fallback);
      });

    return () => {
      alive = false;
    };
  }, [uid, email, displayName]);

  const chooseTab = (tab: TabName) => {
    replaceQuery({
      tab: tab === "Details" ? null : TAB_PARAM[tab],
    });
    setSavedPanel(null);
    setError("");
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    chooseTab(nextTab);
    const tabButtons =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        "[role='tab']"
      );
    tabButtons?.[nextIndex]?.focus();
  };

  async function saveProfile(
    event: FormEvent<HTMLFormElement>,
    panel: "details" | "preferences"
  ) {
    event.preventDefault();
    setSaving(true);
    setSavedPanel(null);
    setError("");

    if (panel === "details") {
      if (
        profile.address.trim() &&
        !isLasVegasAddress({
          city: profile.city || LAS_VEGAS_CITY,
          zip: profile.zip,
        })
      ) {
        setError("Pickup address must be in Las Vegas (ZIP 891xx).");
        setSaving(false);
        return;
      }
    }

    const laundryPrefs =
      profile.laundryPrefs ?? resolveLaundryPrefs(profile);
    const legacy = legacyFieldsFromLaundryPrefs(laundryPrefs);

    const next: Omit<UserProfile, "uid"> = {
      email,
      name: profile.name,
      phone: profile.phone,
      address: profile.address,
      unit: profile.unit,
      city: LAS_VEGAS_CITY,
      zip: profile.zip,
      pickupNotes: profile.pickupNotes,
      detergent: panel === "preferences" ? legacy.detergent : profile.detergent,
      softener: panel === "preferences" ? legacy.softener : profile.softener,
      washTemp: panel === "preferences" ? legacy.washTemp : profile.washTemp,
      dryerTemp: panel === "preferences" ? legacy.dryerTemp : profile.dryerTemp,
      foldStyle: panel === "preferences" ? legacy.foldStyle : profile.foldStyle,
      separateColors: profile.separateColors,
      careNotes: profile.careNotes,
      laundryPrefs,
      weeklyRepeatEnabled: profile.weeklyRepeatEnabled,
      stripeCustomerId: profile.stripeCustomerId,
      stripePaymentMethodId: profile.stripePaymentMethodId,
      cardBrand: profile.cardBrand,
      cardLast4: profile.cardLast4,
      cardExpMonth: profile.cardExpMonth,
      cardExpYear: profile.cardExpYear,
    };

    try {
      await saveUserProfile(uid, next);
      setProfile({ uid, ...next });
      setSavedPanel(panel);
    } catch {
      setError("Could not save your settings. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelWeeklyRepeat() {
    if (!profile.weeklyRepeatEnabled) return;
    const ok = window.confirm(
      "Cancel weekly repeat pickup?\n\nThis stops automatic weekly orders and removes the 10% discount on your next automated pickup.\n\nYou can turn weekly back on only when you place a new order."
    );
    if (!ok) return;

    setWeeklyBusy(true);
    setWeeklyNote("");
    setError("");
    try {
      const next: Omit<UserProfile, "uid"> = {
        email,
        name: profile.name,
        phone: profile.phone,
        address: profile.address,
        unit: profile.unit,
        city: LAS_VEGAS_CITY,
        zip: profile.zip,
        pickupNotes: profile.pickupNotes,
        detergent: profile.detergent,
        softener: profile.softener,
        washTemp: profile.washTemp,
        dryerTemp: profile.dryerTemp,
        foldStyle: profile.foldStyle,
        separateColors: profile.separateColors,
        careNotes: profile.careNotes,
        laundryPrefs: profile.laundryPrefs,
        weeklyRepeatEnabled: false,
        stripeCustomerId: profile.stripeCustomerId,
        stripePaymentMethodId: profile.stripePaymentMethodId,
        cardBrand: profile.cardBrand,
        cardLast4: profile.cardLast4,
        cardExpMonth: profile.cardExpMonth,
        cardExpYear: profile.cardExpYear,
      };
      await saveUserProfile(uid, next);
      setProfile({ uid, ...next });
      const result = await cancelFutureWeeklyOrders(uid);
      setWeeklyNote(
        result.cancelled > 0
          ? `Weekly cancelled · ${result.cancelled} future pickup${result.cancelled === 1 ? "" : "s"} removed · 10% off on the next automated order no longer applies.`
          : "Weekly cancelled · 10% off on the next automated order no longer applies."
      );
    } catch {
      setError("Could not cancel weekly repeat. Try again.");
    } finally {
      setWeeklyBusy(false);
    }
  }

  return (
    <div className="account-ops-shell">
      <div className="account-ops-frame">
        <aside className="account-ops-rail" aria-label="Account sections">
          <div
            className="account-ops-nav"
            role="tablist"
            aria-label="Account sections"
          >
            {tabs.map((tab, index) => {
              const isActive = activeTab === tab;
              const Icon = TAB_META[tab].icon;
              return (
                <button
                  key={tab}
                  id={`tab-${tab.toLowerCase()}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`panel-${tab.toLowerCase()}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => chooseTab(tab)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={cn("account-ops-nav-btn", isActive && "is-active")}
                >
                  <Icon aria-hidden />
                  <span>{TAB_META[tab].label}</span>
                </button>
              );
            })}
          </div>

          <div className="account-ops-signout-wrap is-mobile">
            <button
              type="button"
              className={cn(
                "account-ops-rail-signout-icon",
                signOutConfirm && "is-open"
              )}
              aria-label="Sign out"
              title="Sign out"
              aria-expanded={signOutConfirm}
              onClick={() => setSignOutConfirm((v) => !v)}
            >
              <LogOut size={16} aria-hidden />
            </button>
            {signOutConfirm ? (
              <div className="account-ops-signout-confirm" role="dialog">
                <strong>Are you sure?</strong>
                <div className="account-ops-signout-actions">
                  <button
                    type="button"
                    className="account-ops-signout-btn is-cancel"
                    onClick={() => setSignOutConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="account-ops-signout-btn is-confirm"
                    onClick={onSignOut}
                  >
                    <LogOut size={14} aria-hidden />
                    Sign out
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="account-ops-rail-foot">
            <div className="account-ops-signout-wrap is-desktop">
              <button
                type="button"
                className={cn(
                  "account-ops-rail-signout",
                  signOutConfirm && "is-open"
                )}
                aria-expanded={signOutConfirm}
                onClick={() => setSignOutConfirm((v) => !v)}
              >
                <LogOut size={14} aria-hidden />
                Sign out
              </button>
              {signOutConfirm ? (
                <div className="account-ops-signout-confirm" role="dialog">
                  <strong>Are you sure?</strong>
                  <div className="account-ops-signout-actions">
                    <button
                      type="button"
                      className="account-ops-signout-btn is-cancel"
                      onClick={() => setSignOutConfirm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="account-ops-signout-btn is-confirm"
                      onClick={onSignOut}
                    >
                      <LogOut size={14} aria-hidden />
                      Sign out
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="account-ops-plane">
          <div
            className={cn(
              "account-ops-plane-body",
              activeTab === "Orders" && "is-orders"
            )}
          >
            {activeTab === "Details" ? (
              <form
                id="panel-details"
                role="tabpanel"
                aria-labelledby="tab-details"
                onSubmit={(event) => saveProfile(event, "details")}
              >
                <PanelIntro title="Personal details" />
                {profile.weeklyRepeatEnabled ? (
                  <div className="account-ops-weekly is-active">
                    <div className="account-ops-weekly-row">
                      <div>
                        <h3>Weekly repeat pickup</h3>
                        <p>Active — 10% off your next order.</p>
                      </div>
                      <button
                        type="button"
                        className="account-ops-btn is-ghost"
                        disabled={weeklyBusy || saving}
                        onClick={() => void cancelWeeklyRepeat()}
                      >
                        {weeklyBusy ? "Cancelling…" : "Cancel weekly"}
                      </button>
                    </div>
                    {weeklyNote || weeklyBusy ? (
                      <p className="account-ops-weekly-status">
                        {weeklyBusy ? "Updating…" : weeklyNote}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="account-ops-grid">
                  <Field label="Full name">
                    <input
                      className={inputClass}
                      autoComplete="name"
                      required
                      value={profile.name}
                      onChange={(e) =>
                        setProfile({ ...profile, name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      className={inputClass}
                      type="email"
                      autoComplete="email"
                      value={email}
                      disabled
                      readOnly
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      className={inputClass}
                      type="tel"
                      autoComplete="tel"
                      value={profile.phone}
                      onChange={(e) =>
                        setProfile({ ...profile, phone: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Street address" wide>
                    <AddressAutocomplete
                      className={inputClass}
                      value={profile.address}
                      onAddressChange={(address) =>
                        setProfile({ ...profile, address })
                      }
                      onPlaceSelect={(place) =>
                        setProfile({
                          ...profile,
                          address: place.address,
                          city: LAS_VEGAS_CITY,
                          zip: place.zip || profile.zip,
                          unit: place.unit || profile.unit,
                        })
                      }
                    />
                  </Field>
                  <Field label="Apt / unit">
                    <input
                      className={inputClass}
                      autoComplete="address-line2"
                      value={profile.unit}
                      onChange={(e) =>
                        setProfile({ ...profile, unit: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="City">
                    <input
                      className={inputClass}
                      value={LAS_VEGAS_CITY}
                      readOnly
                      aria-readonly="true"
                    />
                  </Field>
                  <Field label="ZIP">
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="891xx"
                      value={profile.zip}
                      onChange={(e) =>
                        setProfile({ ...profile, zip: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Access notes" wide>
                    <textarea
                      className={inputClass}
                      placeholder="Gate code, leave at door, building manager…"
                      value={profile.pickupNotes}
                      onChange={(e) =>
                        setProfile({ ...profile, pickupNotes: e.target.value })
                      }
                    />
                  </Field>
                </div>
                {error ? <p className="account-ops-error">{error}</p> : null}
                <SaveRow saved={savedPanel === "details"} saving={saving} />
              </form>
            ) : null}

            {activeTab === "Preferences" ? (
              <form
                id="panel-preferences"
                role="tabpanel"
                aria-labelledby="tab-preferences"
                onSubmit={(event) => saveProfile(event, "preferences")}
              >
                <PanelIntro title="Laundry preferences" />
                <div className="account-ops-note">
                  These settings are saved to your account and used when you
                  book.
                </div>
                <div className="account-ops-grid">
                  {(
                    [
                      {
                        key: "pants",
                        label: "Pants",
                        options: FOLD_ITEM_OPTIONS,
                      },
                      {
                        key: "dresses",
                        label: "Dresses",
                        options: FOLD_ITEM_OPTIONS,
                      },
                      {
                        key: "detergent",
                        label: "Detergent",
                        options: DETERGENT_BOOKING_OPTIONS,
                      },
                      {
                        key: "softener",
                        label: "Softener",
                        options: SOFTENER_BOOKING_OPTIONS,
                      },
                      {
                        key: "whitesWashTemp",
                        label: "Whites wash",
                        options: WASH_TEMP_BOOKING_OPTIONS,
                      },
                      {
                        key: "colorsWashTemp",
                        label: "Colors wash",
                        options: WASH_TEMP_BOOKING_OPTIONS,
                      },
                      {
                        key: "whitesDryerHeat",
                        label: "Whites dryer",
                        options: DRYER_HEAT_OPTIONS,
                      },
                      {
                        key: "colorsDryerHeat",
                        label: "Colors dryer",
                        options: DRYER_HEAT_OPTIONS,
                      },
                    ] as const
                  ).map((field) => {
                    const prefs =
                      profile.laundryPrefs ?? resolveLaundryPrefs(profile);
                    const value = prefs[field.key];
                    const imageSrc =
                      field.key === "detergent"
                        ? DETERGENT_IMAGES[
                            value as keyof typeof DETERGENT_IMAGES
                          ]
                        : undefined;
                    return (
                      <Field key={field.key} label={field.label}>
                        <button
                          type="button"
                          className={inputClass}
                          onClick={() => setPrefPicker(field.key)}
                        >
                          {field.key === "detergent" ? (
                            imageSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={imageSrc}
                                alt=""
                                width={28}
                                height={40}
                                className="h-10 w-7 shrink-0 object-contain"
                              />
                            ) : (
                              <span
                                className="inline-block h-10 w-7 shrink-0 rounded"
                                style={{ background: "var(--ops-surface)" }}
                                aria-hidden
                              />
                            )
                          ) : null}
                          <span className="min-w-0 flex-1 truncate">{value}</span>
                          <ChevronDown
                            className="size-3.5 shrink-0"
                            aria-hidden
                          />
                        </button>
                      </Field>
                    );
                  })}
                  <Field label="Washing notes" wide>
                    <textarea
                      className={inputClass}
                      placeholder="Stains, mud, delicate items, allergies…"
                      value={profile.careNotes}
                      onChange={(e) =>
                        setProfile({ ...profile, careNotes: e.target.value })
                      }
                    />
                  </Field>
                </div>
                {error ? <p className="account-ops-error">{error}</p> : null}
                <SaveRow
                  saved={savedPanel === "preferences"}
                  saving={saving}
                />
              </form>
            ) : null}

            {prefPicker ? (
              <OptionSheet
                title={
                  (
                    {
                      pants: "Pants",
                      dresses: "Dresses",
                      detergent: "Detergent",
                      softener: "Softener",
                      whitesWashTemp: "Whites wash",
                      colorsWashTemp: "Colors wash",
                      whitesDryerHeat: "Whites dryer",
                      colorsDryerHeat: "Colors dryer",
                    } as const
                  )[prefPicker]
                }
                options={
                  prefPicker === "pants" || prefPicker === "dresses"
                    ? FOLD_ITEM_OPTIONS
                    : prefPicker === "detergent"
                      ? DETERGENT_BOOKING_OPTIONS
                      : prefPicker === "softener"
                        ? SOFTENER_BOOKING_OPTIONS
                        : prefPicker === "whitesWashTemp" ||
                            prefPicker === "colorsWashTemp"
                          ? WASH_TEMP_BOOKING_OPTIONS
                          : DRYER_HEAT_OPTIONS
                }
                value={
                  (profile.laundryPrefs ?? resolveLaundryPrefs(profile))[
                    prefPicker
                  ]
                }
                images={
                  prefPicker === "detergent" ? DETERGENT_IMAGES : undefined
                }
                onClose={() => setPrefPicker(null)}
                onSelect={(value) => {
                  const current =
                    profile.laundryPrefs ?? resolveLaundryPrefs(profile);
                  const nextPrefs: LaundryPrefs = {
                    ...current,
                    [prefPicker]: value,
                  };
                  const legacy = legacyFieldsFromLaundryPrefs(nextPrefs);
                  setProfile({
                    ...profile,
                    ...legacy,
                    laundryPrefs: nextPrefs,
                  });
                  setPrefPicker(null);
                }}
              />
            ) : null}

            {activeTab === "Orders" ? <AccountOrders uid={uid} /> : null}

            {activeTab === "Payments" ? (
              <PaymentsPanel
                uid={uid}
                profile={profile}
                onCardChange={(card) =>
                  setProfile({
                    ...profile,
                    cardBrand: card.brand,
                    cardLast4: card.last4,
                    cardExpMonth: card.expMonth,
                    cardExpYear: card.expYear,
                    stripePaymentMethodId: card.last4 ? "saved" : "",
                  })
                }
              />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}


function PaymentsPanel({
  profile,
  uid,
  onCardChange,
}: {
  profile: UserProfile;
  uid: string;
  onCardChange: (card: {
    brand: string;
    last4: string;
    expMonth: number | null;
    expYear: number | null;
  }) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [invoices, setInvoices] = useState<
    {
      id: string;
      label: string;
      when: string;
      amount: string;
      status: string;
      details: string[];
    }[]
  >([]);
  const hasCard = Boolean(profile.cardLast4);
  const brandLabel = (profile.cardBrand || "Card").replace(/^./, (c) =>
    c.toUpperCase()
  );
  const expLabel =
    profile.cardExpMonth && profile.cardExpYear
      ? `Exp ${String(profile.cardExpMonth).padStart(2, "0")}/${String(
          profile.cardExpYear
        ).slice(-2)}`
      : "";

  useEffect(() => {
    let alive = true;
    let unsub = () => {};

    async function loadInvoices() {
      try {
        const {
          collection,
          limit,
          onSnapshot,
          orderBy,
          query,
          where,
        } = await import("firebase/firestore");
        const { getFirebaseDb } = await import("@/lib/firebase");
        const { orderDisplayId, dryCleanItemsTotal } = await import(
          "@/lib/orders"
        );
        const q = query(
          collection(getFirebaseDb(), "orders"),
          where("uid", "==", uid),
          orderBy("createdAt", "desc"),
          limit(40)
        );
        unsub = onSnapshot(
          q,
          (snap) => {
            if (!alive) return;
            const rows = snap.docs
              .map((docSnap) => {
                const data = docSnap.data();
                const paid =
                  data.paymentStatus === "paid" ||
                  typeof data.finalTotal === "number";
                if (!paid) return null;
                const total =
                  typeof data.finalTotal === "number" ? data.finalTotal : null;
                const paidAt = data.paidAt?.toDate?.() as Date | undefined;
                const createdAt = data.createdAt?.toDate?.() as
                  | Date
                  | undefined;
                const whenDate = paidAt || createdAt;
                const pickupDate = String(data.pickup?.date ?? "");
                const weightLbs =
                  typeof data.weightLbs === "number" ? data.weightLbs : null;
                const tip =
                  typeof data.tip === "number"
                    ? data.tip
                    : typeof data.pricing?.tip === "number"
                      ? data.pricing.tip
                      : 0;
                const dryRaw = Array.isArray(data.dryCleanItems)
                  ? (data.dryCleanItems as { name?: string; price?: number }[])
                  : [];
                const dryGroups = new Map<
                  string,
                  { name: string; price: number; qty: number }
                >();
                for (const item of dryRaw) {
                  const name = String(item?.name || "").trim();
                  const price = Number(item?.price) || 0;
                  if (!name) continue;
                  const existing = dryGroups.get(name);
                  if (existing) existing.qty += 1;
                  else dryGroups.set(name, { name, price, qty: 1 });
                }
                const dryTotal = dryCleanItemsTotal(
                  dryRaw.map((item) => ({
                    name: String(item?.name || ""),
                    price: Number(item?.price) || 0,
                  }))
                );
                const details: string[] = [];
                details.push(`Order ${orderDisplayId(docSnap.id)}`);
                if (weightLbs != null && weightLbs > 0) {
                  details.push(`Laundry · ${weightLbs} lb`);
                }
                for (const group of dryGroups.values()) {
                  const lineTotal = Math.round(group.price * group.qty * 100) / 100;
                  details.push(
                    group.qty > 1
                      ? `Dry clean · ${group.name} × ${group.qty} · $${lineTotal.toFixed(2)}`
                      : `Dry clean · ${group.name} · $${group.price.toFixed(2)}`
                  );
                }
                if (dryGroups.size === 0 && dryTotal > 0) {
                  details.push(`Dry clean · $${dryTotal.toFixed(2)}`);
                }
                if (tip > 0) {
                  details.push(`Tip · $${tip.toFixed(2)}`);
                }
                const promoLabel =
                  typeof data.pricing?.promoLabel === "string"
                    ? data.pricing.promoLabel.trim()
                    : "";
                const promoOff =
                  typeof data.pricing?.promoDiscountAmount === "number"
                    ? data.pricing.promoDiscountAmount
                    : 0;
                if (promoLabel && promoOff > 0) {
                  details.push(`${promoLabel} · −$${promoOff.toFixed(2)}`);
                }

                return {
                  id: docSnap.id,
                  label: pickupDate
                    ? `${pickupDate} pickup`
                    : `Order ${orderDisplayId(docSnap.id)}`,
                  when: whenDate
                    ? whenDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "",
                  amount: total != null ? `$${total.toFixed(2)}` : "—",
                  status:
                    data.paymentStatus === "paid"
                      ? "Paid"
                      : data.paymentStatus === "failed"
                        ? "Failed"
                        : "Charged",
                  details,
                  sortAt: whenDate?.getTime() ?? 0,
                };
              })
              .filter((row): row is NonNullable<typeof row> => row != null)
              .sort((a, b) => b.sortAt - a.sortAt)
              .slice(0, 8)
              .map(({ sortAt: _sortAt, ...row }) => row);
            setInvoices(rows);
          },
          () => {
            if (alive) setInvoices([]);
          }
        );
      } catch {
        if (alive) setInvoices([]);
      }
    }

    void loadInvoices();
    return () => {
      alive = false;
      unsub();
    };
  }, [uid]);

  async function onRemove() {
    setRemoving(true);
    setError("");
    try {
      const { removeSavedCard, stripeCallableErrorMessage } = await import(
        "@/lib/stripe-api"
      );
      await removeSavedCard();
      onCardChange({
        brand: "",
        last4: "",
        expMonth: null,
        expYear: null,
      });
      setAdding(false);
    } catch (err) {
      const { stripeCallableErrorMessage } = await import("@/lib/stripe-api");
      setError(stripeCallableErrorMessage(err));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section
      id="panel-payments"
      role="tabpanel"
      aria-labelledby="tab-payments"
      className="account-ops-payments"
    >
      <PanelIntro title="Payments" />

      <div className="account-ops-note">
        Card details are stored securely by Stripe — FOAM never sees or saves
        your full card number.
      </div>

      {adding ? (
        <SaveCardPanel
          customerName={profile.name}
          autoStart
          onSaved={(card) => {
            onCardChange(card);
            setAdding(false);
          }}
        />
      ) : (
        <div className="account-ops-pay-card">
          <div className="account-ops-pay-card-top">
            <span className="account-ops-pay-card-brand">
              <CreditCard size={18} aria-hidden />
              {hasCard ? "Card on file" : "No card yet"}
            </span>
            {hasCard ? (
              <span className="account-ops-pay-card-chip">Default</span>
            ) : null}
          </div>
          <p className="account-ops-pay-card-number">
            {hasCard
              ? `•••• •••• •••• ${profile.cardLast4}`
              : "•••• •••• •••• ••••"}
          </p>
          <div className="account-ops-pay-card-meta">
            <span>{hasCard ? brandLabel : "FOAM"}</span>
            {hasCard && expLabel ? <span>{expLabel}</span> : null}
          </div>
          <div className="account-ops-pay-card-actions">
            {hasCard ? (
              <>
                <button
                  type="button"
                  className="account-ops-btn is-ghost"
                  onClick={() => setAdding(true)}
                >
                  Update card
                </button>
                <button
                  type="button"
                  className="account-ops-btn is-ghost"
                  disabled={removing}
                  onClick={() => void onRemove()}
                >
                  {removing ? "Removing…" : "Remove"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="account-ops-btn is-ghost"
                onClick={() => setAdding(true)}
              >
                Add card
              </button>
            )}
          </div>
        </div>
      )}

      <div className="account-ops-pay-invoices">
        <h3>Recent invoices</h3>
        {invoices.length === 0 ? (
          <div className="account-ops-note">
            No payments yet. Invoices will show here after your card is charged.
          </div>
        ) : (
          <ul>
            {invoices.map((row) => (
              <li key={row.id}>
                <div className="account-ops-pay-invoice-main">
                  <strong>{row.label}</strong>
                  <span>{row.when}</span>
                  {row.details.length > 0 ? (
                    <ul className="account-ops-pay-invoice-details">
                      {row.details.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="account-ops-pay-invoice-right">
                  <b>{row.amount}</b>
                  <em>{row.status}</em>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? <p className="account-ops-error">{error}</p> : null}
    </section>
  );
}

function PanelIntro({ title }: { title: string }) {
  return (
    <div className="account-ops-intro">
      <h2>{title}</h2>
    </div>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={cn("account-ops-field", wide && "is-wide")}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  wide = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <Field label={label} wide={wide}>
      <span className="relative block">
        <select
          className={`${inputClass} appearance-none pr-9`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </span>
    </Field>
  );
}

function SaveRow({ saved, saving }: { saved: boolean; saving: boolean }) {
  return (
    <div className="account-ops-save-row">
      <button type="submit" className="account-ops-btn is-primary" disabled={saving}>
        {saving ? "Saving..." : "Save settings"}
      </button>
      <p
        className={cn("account-ops-saved", saved && "is-on")}
        role="status"
        aria-live="polite"
      >
        <span className="account-ops-saved-dot">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
        Settings saved.
      </p>
    </div>
  );
}

export function AccountApp() {
  const {
    user,
    ready,
    signInEmail,
    signUpEmail,
    signInApple,
    signOut,
    oauthReturnError,
    clearOauthReturnError,
  } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);

  useEffect(() => {
    if (oauthReturnError) {
      setError(oauthReturnError);
      clearOauthReturnError();
    }
  }, [oauthReturnError, clearOauthReturnError]);

  async function handleSignOut() {
    await signOut();
    window.location.assign("/");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || oauthBusy) return;
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "");
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");

    try {
      if (mode === "signup") {
        await signUpEmail(name, email, password);
      } else {
        await signInEmail(email, password);
      }
      window.location.assign("/");
    } catch {
      setError(
        mode === "signup"
          ? "Could not create account. Try a different email or stronger password."
          : "Could not sign in. Check your email and password."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleApple() {
    if (oauthBusy) return;
    setError("");
    setOauthBusy(true);
    try {
      await signInApple();
      window.location.assign("/");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Apple sign-in failed. Email login still works."
      );
    } finally {
      setOauthBusy(false);
    }
  }

  // Wait for Firebase to restore the session before choosing login vs profile,
  // otherwise a refresh flashes the login card for already-signed-in users.
  if (!ready) {
    return <BrandSplash label="Loading account…" />;
  }

  if (user) {
    return (
      <Suspense fallback={<BrandSplash label="Loading account…" />}>
        <AccountProfile
          uid={user.uid}
          email={user.email ?? ""}
          displayName={
            user.displayName?.trim() || user.email?.split("@")[0] || ""
          }
          onSignOut={handleSignOut}
        />
      </Suspense>
    );
  }

  return (
    <div className="account-ops-auth-shell">
      <div className="account-ops-auth">
        <h1>{mode === "signin" ? "Log in" : "Create account"}</h1>

        <form id="foam-auth-form" className="account-ops-auth-form" onSubmit={handleSubmit}>
          {mode === "signup" ? (
            <label className="account-ops-auth-label" htmlFor="account-name">
              Name
              <input
                id="account-name"
                className="account-ops-auth-input"
                name="name"
                type="text"
                required
                autoComplete="name"
              />
            </label>
          ) : null}

          <label className="account-ops-auth-label" htmlFor="account-email">
            E-mail
            <input
              id="account-email"
              className="account-ops-auth-input"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>

          <label className="account-ops-auth-label" htmlFor="account-password">
            Password
            <input
              id="account-password"
              className="account-ops-auth-input"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
            />
          </label>

          {mode === "signin" ? (
            <div className="account-ops-auth-forgot">
              <button
                type="button"
                onClick={() =>
                  setError(
                    "Password reset is coming soon. For now contact support if you need help."
                  )
                }
              >
                Forgot Password?
              </button>
            </div>
          ) : null}
        </form>

        {error ? (
          <p className="account-ops-auth-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="account-ops-auth-social">
          <GoogleSignInButton
            className="account-ops-auth-social-btn"
            onError={(message) => {
              setError(message);
            }}
          />

          <button
            type="button"
            className="account-ops-auth-social-btn"
            disabled={oauthBusy}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void handleApple();
            }}
          >
            <svg
              viewBox="0 0 30 30"
              height="22"
              width="22"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
              className="pointer-events-none"
            >
              <path d="M25.565,9.785c-0.123,0.077-3.051,1.702-3.051,5.305c0.138,4.109,3.695,5.55,3.756,5.55 c-0.061,0.077-0.537,1.963-1.947,3.94C23.204,26.283,21.962,28,20.076,28c-1.794,0-2.438-1.135-4.508-1.135 c-2.223,0-2.852,1.135-4.554,1.135c-1.886,0-3.22-1.809-4.4-3.496c-1.533-2.208-2.836-5.673-2.882-9 c-0.031-1.763,0.307-3.496,1.165-4.968c1.211-2.055,3.373-3.45,5.734-3.496c1.809-0.061,3.419,1.242,4.523,1.242 c1.058,0,3.036-1.242,5.274-1.242C21.394,7.041,23.97,7.332,25.565,9.785z M15.001,6.688c-0.322-1.61,0.567-3.22,1.395-4.247 c1.058-1.242,2.729-2.085,4.17-2.085c0.092,1.61-0.491,3.189-1.533,4.339C18.098,5.937,16.488,6.872,15.001,6.688z" />
            </svg>
            <span className="pointer-events-none">
              {oauthBusy ? "Opening…" : "Sign in with Apple"}
            </span>
          </button>
        </div>

        <button
          type="submit"
          form="foam-auth-form"
          disabled={busy || oauthBusy}
          className="account-ops-btn is-primary account-ops-auth-submit"
        >
          {busy || oauthBusy
            ? "Please wait..."
            : mode === "signin"
              ? "Log in"
              : "Create account"}
        </button>

        <button
          type="button"
          className="account-ops-auth-switch"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
          }}
        >
          {mode === "signin" ? "or sign up" : "or log in"}
        </button>
      </div>
    </div>
  );
}
