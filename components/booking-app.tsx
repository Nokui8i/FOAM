"use client";

import { useEffect, useMemo, useState, Suspense, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Minus, Plus, Repeat, Shirt, Sparkles, X } from "lucide-react";

import { OptionSheet } from "@/components/option-sheet";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { getFirebaseDb } from "@/lib/firebase";
import {
  buildOrderTrackDoc,
  makeTrackKey,
  orderRefFromId,
  trackPath,
} from "@/lib/order-tracking";
import {
  defaultProfile,
  getUserProfile,
  legacyFieldsFromLaundryPrefs,
  saveUserProfile,
} from "@/lib/user-profile";
import { ensureNextWeeklyOrder } from "@/lib/weekly-automation";
import type { FoamOrder } from "@/lib/orders";
import {
  BOOKING_STEPS,
  DETERGENT_BOOKING_OPTIONS,
  DETERGENT_IMAGES,
  DRYER_HEAT_OPTIONS,
  FOLD_ITEM_OPTIONS,
  SOFTENER_BOOKING_OPTIONS,
  TIME_SLOTS,
  TIP_PRESETS,
  WASH_TEMP_BOOKING_OPTIONS,
  SLOT_CAPACITY,
  clearBookingDraft,
  draftFromProfile,
  earliestPickupDate,
  emptyBookingDraft,
  formatPickupDate,
  hasService,
  isPickupDateAllowed,
  isPickupSlotStillOpen,
  latestPickupDate,
  loadBookingDraft,
  nextPickupDates,
  orderEstimate,
  pricingForOrder,
  resolvedTip,
  saveBookingDraft,
  servicesLabel,
  toIsoDate,
  type BookingDraft,
  type BookingStep,
} from "@/lib/booking";
import {
  releasePickupSlot,
  reservePickupSlot,
  subscribePickupSlotCounts,
  type SlotCounts,
} from "@/lib/pickup-availability";
import {
  LAS_VEGAS_CITY,
  hasHouseNumber,
  isLasVegasAddress,
  isLasVegasZip,
} from "@/lib/las-vegas";
import { cn } from "@/lib/utils";
import { useQueryReplace } from "@/lib/use-query-replace";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-border/80 bg-white px-3 py-2.5 text-[15px] outline-none transition focus:border-accent-strong focus:ring-2 focus:ring-accent-strong/20";

function parseBookingStep(raw: string | null): BookingStep | null {
  if (raw && (BOOKING_STEPS as readonly string[]).includes(raw)) {
    return raw as BookingStep;
  }
  return null;
}

const STEP_COPY: Record<
  BookingStep,
  { title: string; hint: string }
> = {
  services: {
    title: "What do you need?",
    hint: "Choose one or both services.",
  },
  schedule: {
    title: "Pick a day & time",
    hint: "We'll come to you in this window.",
  },
  address: {
    title: "Where should we pick up?",
    hint: "Contact info and pickup address.",
  },
  confirm: {
    title: "Confirm your order",
    hint: "Review details, preferences, and total.",
  },
};

export function BookingApp() {
  return (
    <Suspense
      fallback={
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Loading…
        </p>
      }
    >
      <BookingAppInner />
    </Suspense>
  );
}

function BookingAppInner() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const { searchParams, replaceQuery } = useQueryReplace();
  const step =
    parseBookingStep(searchParams.get("step")) ?? ("services" as BookingStep);
  const [draft, setDraft] = useState<BookingDraft>(() => emptyBookingDraft());
  const [picker, setPicker] = useState<null | keyof BookingDraft>(null);
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneId, setDoneId] = useState<string | null>(null);
  const [doneTrackKey, setDoneTrackKey] = useState<string | null>(null);
  const [repeatDiscountEligible, setRepeatDiscountEligible] = useState(false);
  const [guestGateOpen, setGuestGateOpen] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [slotCounts, setSlotCounts] = useState<SlotCounts>({
    "7am - 10am": 0,
    "10am - 1pm": 0,
    "1pm - 4pm": 0,
    "4pm - 7pm": 0,
  });
  const dates = useMemo(() => nextPickupDates(7), []);
  const estimate = useMemo(
    () =>
      orderEstimate(draft, {
        repeatDiscountEligible,
        weeklyAutomation: Boolean(user) && draft.repeatPickup,
      }),
    [draft, repeatDiscountEligible, user]
  );

  function setStep(next: BookingStep) {
    replaceQuery({ step: next === "services" ? null : next });
  }

  useEffect(() => {
    const saved = loadBookingDraft();
    const fromUrl = parseBookingStep(searchParams.get("step"));
    if (saved) {
      setDraft(saved.draft);
      if (!fromUrl && saved.step !== "services") {
        replaceQuery({ step: saved.step });
      }
    }
    setDraftHydrated(true);
    // Restore once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    saveBookingDraft(draft, step);
  }, [draft, step, draftHydrated]);

  useEffect(() => {
    if (!draft.pickupDate && dates[0]) {
      setDraft((d) => ({ ...d, pickupDate: dates[0] }));
    }
  }, [dates, draft.pickupDate]);

  useEffect(() => {
    if (!draft.pickupDate) return;
    return subscribePickupSlotCounts(draft.pickupDate, setSlotCounts);
  }, [draft.pickupDate]);

  useEffect(() => {
    if (!draft.pickupDate || !draft.pickupSlot) return;
    if (slotIsBookable(draft.pickupDate, draft.pickupSlot, slotCounts)) return;
    const next = TIME_SLOTS.find((slot) =>
      slotIsBookable(draft.pickupDate, slot, slotCounts)
    );
    if (next && next !== draft.pickupSlot) {
      setDraft((d) => ({ ...d, pickupSlot: next }));
    }
  }, [draft.pickupDate, draft.pickupSlot, slotCounts]);

  useEffect(() => {
    if (!ready || !user || !draftHydrated) return;
    let alive = true;
    getUserProfile(user.uid)
      .then((profile) => {
        if (!alive || !profile) return;
        // Account Details + Preferences are the source of truth for signed-in
        // users (contact, address, Access notes, wash prefs, washing notes).
        setDraft((d) => ({
          ...d,
          ...draftFromProfile(profile),
          saveDetailsToProfile: true,
          savePrefsToProfile: true,
        }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, user, draftHydrated]);

  // Repeat-pickup 10% discount: only for signed-in accounts, and only once
  // they already have a prior order with repeat pickup active — i.e. this
  // is not their first repeat order. Never applies to guests.
  useEffect(() => {
    if (!user || !draft.repeatPickup) {
      setRepeatDiscountEligible(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const q = query(
          collection(getFirebaseDb(), "orders"),
          where("uid", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(5)
        );
        const snap = await getDocs(q);
        const hasPriorRepeatOrder = snap.docs.some(
          (doc) => doc.data()?.pickup?.repeat === true
        );
        if (alive) setRepeatDiscountEligible(hasPriorRepeatOrder);
      } catch {
        if (alive) setRepeatDiscountEligible(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, draft.repeatPickup]);

  function patch(partial: Partial<BookingDraft>) {
    setDraft((d) => ({ ...d, ...partial }));
    setError("");
  }

  function setBagCount(next: number) {
    patch({ bagCount: String(Math.max(1, Math.min(20, next))) });
  }

  function goNext() {
    setError("");
    if (step === "services") {
      if (!hasService(draft)) {
        setError("Select at least one service.");
        return;
      }
      if (draft.laundry) {
        const n = Number(draft.bagCount);
        if (!Number.isFinite(n) || n < 1) {
          setError("Enter how many bags (at least 1).");
          return;
        }
      }
      setStep("schedule");
      return;
    }
    if (step === "schedule") {
      if (!draft.pickupDate || !draft.pickupSlot) {
        setError("Choose a pickup day and time.");
        return;
      }
      if (!slotIsBookable(draft.pickupDate, draft.pickupSlot, slotCounts)) {
        setError("That time window is closed or full. Pick another.");
        return;
      }
      setStep("address");
      return;
    }
    if (step === "address") {
      if (!draft.address.trim() || !draft.zip.trim()) {
        setError("Add a Las Vegas street address and ZIP.");
        return;
      }
      if (!hasHouseNumber(draft.address)) {
        setError(
          draft.unit.trim()
            ? "Street needs the building number first — Apt/unit alone isn’t enough (e.g. 105 Dolly Varden Court)."
            : "Add the building number at the start of Street (e.g. 123 Valley View Blvd)."
        );
        return;
      }
      if (
        !isLasVegasAddress({
          city: draft.city || LAS_VEGAS_CITY,
          zip: draft.zip,
        })
      ) {
        setError("We only pick up in Las Vegas (ZIP 891xx).");
        return;
      }
      if (!isLasVegasZip(draft.zip)) {
        setError("Enter a valid Las Vegas ZIP (891xx).");
        return;
      }
      if (!draft.name.trim() || !draft.email.trim() || !draft.phone.trim()) {
        setError("Name, email, and phone are required.");
        return;
      }
      setStep("confirm");
    }
  }

  function toggleRepeatPickup() {
    patch({ repeatPickup: !draft.repeatPickup });
  }

  function goBack() {
    setError("");
    setPicker(null);
    setGuestGateOpen(false);
    if (step === "schedule") setStep("services");
    else if (step === "address") setStep("schedule");
    else if (step === "confirm") setStep("address");
  }

  function requestSubmit() {
    setError("");
    // Guests always get the sign-in offer; signed-in users skip it.
    if (!user) {
      setGuestGateOpen(true);
      return;
    }
    void submitOrder();
  }

  function continueAsGuest() {
    setGuestGateOpen(false);
    void submitOrder();
  }

  function signUpForBenefits() {
    saveBookingDraft(draft, "confirm");
    setGuestGateOpen(false);
    router.push("/account");
  }

  async function submitOrder() {
    setBusy(true);
    setError("");
    try {
      if (!slotIsBookable(draft.pickupDate, draft.pickupSlot, slotCounts)) {
        throw new Error("That time window is closed or full. Pick another.");
      }
      await reservePickupSlot(draft.pickupDate, draft.pickupSlot);

      const wantsRepeat = draft.repeatPickup;
      const repeatActive = Boolean(user) && wantsRepeat;
      const pricing = pricingForOrder({ weeklyAutomation: repeatActive });
      const tip = resolvedTip(draft);
      const trackKey = makeTrackKey();
      const payload = {
        status: "new",
        guest: !user,
        uid: user?.uid ?? null,
        trackKey,
        services: {
          laundry: draft.laundry,
          dryCleaning: draft.dryCleaning,
          bagCount: draft.laundry ? Number(draft.bagCount) || 1 : 0,
        },
        contact: {
          name: draft.name.trim(),
          email: draft.email.trim().toLowerCase(),
          phone: draft.phone.trim(),
        },
        pickup: {
          address: draft.address.trim(),
          unit: draft.unit.trim(),
          city: draft.city.trim() || LAS_VEGAS_CITY,
          zip: draft.zip.trim(),
          notes: draft.pickupNotes.trim(),
          date: draft.pickupDate,
          slot: draft.pickupSlot,
          repeat: repeatActive,
          repeatRequested: wantsRepeat,
        },
        preferences: {
          pants: draft.pants,
          dresses: draft.dresses,
          detergent: draft.detergent,
          softener: draft.softener,
          whitesWashTemp: draft.whitesWashTemp,
          colorsWashTemp: draft.colorsWashTemp,
          whitesDryerHeat: draft.whitesDryerHeat,
          colorsDryerHeat: draft.colorsDryerHeat,
        },
        orderNotes: draft.orderNotes.trim(),
        pricing: {
          ...pricing,
          tip,
          promoCode: draft.promoCode.trim(),
          // Final $ after weigh — ops applies rate × lbs (min $50) + delivery + tip + dry cleaning.
          finalTotalPending: true,
          repeatDiscountEligible: repeatDiscountEligible,
          repeatDiscountPercent: repeatDiscountEligible
            ? pricing.repeatDiscountPercent
            : 0,
        },
        tip,
        promoCode: draft.promoCode.trim(),
        createdAt: serverTimestamp(),
      };

      let ref;
      try {
        ref = await addDoc(collection(getFirebaseDb(), "orders"), payload);
      } catch (err) {
        await releasePickupSlot(draft.pickupDate, draft.pickupSlot);
        throw err;
      }

      await setDoc(doc(getFirebaseDb(), "orderTracks", trackKey), {
        ...buildOrderTrackDoc({
          orderId: ref.id,
          status: "new",
          name: draft.name.trim(),
          pickupDate: draft.pickupDate,
          pickupSlot: draft.pickupSlot,
          laundry: draft.laundry,
          dryCleaning: draft.dryCleaning,
          bagCount: draft.laundry ? Number(draft.bagCount) || 1 : 0,
          preferences: payload.preferences,
          orderNotes: draft.orderNotes.trim(),
          pickupNotes: draft.pickupNotes.trim(),
        }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      clearBookingDraft();

      if (user) {
        const existing = await getUserProfile(user.uid);
        if (existing) {
          const next = { ...existing };

          if (repeatActive && !existing.weeklyRepeatEnabled) {
            next.weeklyRepeatEnabled = true;
          }

          // Always sync Details + Preferences (incl. Access notes) back to account.
          next.name = draft.name.trim() || existing.name;
          next.phone = draft.phone.trim() || existing.phone;
          next.address = draft.address.trim() || existing.address;
          next.unit = draft.unit.trim();
          next.city = draft.city.trim() || existing.city || LAS_VEGAS_CITY;
          next.zip = draft.zip.trim() || existing.zip;
          next.pickupNotes = draft.pickupNotes.trim();
          next.laundryPrefs = {
            pants: draft.pants,
            dresses: draft.dresses,
            detergent: draft.detergent,
            softener: draft.softener,
            whitesWashTemp: draft.whitesWashTemp,
            colorsWashTemp: draft.colorsWashTemp,
            whitesDryerHeat: draft.whitesDryerHeat,
            colorsDryerHeat: draft.colorsDryerHeat,
          };
          Object.assign(
            next,
            legacyFieldsFromLaundryPrefs(next.laundryPrefs)
          );
          next.careNotes = draft.orderNotes.trim();
          await saveUserProfile(user.uid, next);
        } else {
          const prefs = {
            pants: draft.pants,
            dresses: draft.dresses,
            detergent: draft.detergent,
            softener: draft.softener,
            whitesWashTemp: draft.whitesWashTemp,
            colorsWashTemp: draft.colorsWashTemp,
            whitesDryerHeat: draft.whitesDryerHeat,
            colorsDryerHeat: draft.colorsDryerHeat,
          };
          const created = {
            ...defaultProfile(user.uid, user.email ?? draft.email.trim()),
            name: draft.name.trim() || user.displayName || "",
            phone: draft.phone.trim(),
            address: draft.address.trim(),
            unit: draft.unit.trim(),
            city: draft.city.trim() || LAS_VEGAS_CITY,
            zip: draft.zip.trim(),
            pickupNotes: draft.pickupNotes.trim(),
            laundryPrefs: prefs,
            ...legacyFieldsFromLaundryPrefs(prefs),
            careNotes: draft.orderNotes.trim(),
            weeklyRepeatEnabled: Boolean(repeatActive),
          };
          const { uid: _profileUid, ...rest } = created;
          void _profileUid;
          await saveUserProfile(user.uid, rest);
        }

        if (repeatActive) {
          try {
            const queued = await ensureNextWeeklyOrder({
              id: ref.id,
              status: "new",
              uid: user.uid,
              guest: false,
              trackKey,
              services: payload.services,
              contact: payload.contact,
              pickup: payload.pickup,
              preferences: payload.preferences,
              pricing: payload.pricing,
              tip,
            } as FoamOrder);
            if (!queued.created && queued.reason && queued.reason !== "already-queued") {
              console.warn("Weekly next pickup not queued:", queued.reason);
            }
          } catch (err) {
            console.error("Weekly next pickup queue failed", err);
          }
        }
      }

      setDoneId(ref.id);
      setDoneTrackKey(trackKey);
    } catch {
      setError("Could not submit. Check connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = BOOKING_STEPS.indexOf(step);
  const copy = STEP_COPY[step];

  if (doneId) {
    return (
      <div className="book-frame">
        <div className="book-panel book-panel--center">
          <div className="book-success">
            <span className="book-success-icon">
              <Check size={22} strokeWidth={2.5} />
            </span>
            <p className="eyebrow">Order received</p>
            <h1 className="book-success-title">We&apos;ll confirm your pickup.</h1>
            <p className="book-success-ref">
              Ref <span>{orderRefFromId(doneId)}</span>
            </p>
            <p className="book-hint">
              {user
                ? "Saved to Account → Orders. You can also track with the link below."
                : "Save your tracking link — it’s the only way to follow this order as a guest."}
            </p>
            <div className="book-success-actions">
              {doneTrackKey ? (
                <Button asChild>
                  <Link href={trackPath(doneTrackKey)}>Track your order</Link>
                </Button>
              ) : null}
              {user ? (
                <Button variant="outline" asChild>
                  <Link href="/account">My account</Link>
                </Button>
              ) : (
                <Button variant="outline" asChild>
                  <Link href="/">Home</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="book-frame">
      <header className="book-chrome">
        <button
          type="button"
          className="book-back"
          onClick={() => {
            if (step === "services") router.push("/");
            else goBack();
          }}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="book-chrome-copy">
          <h1 className="book-title">{copy.title}</h1>
          <p className="book-hint">{copy.hint}</p>
        </div>

        <ol className="book-progress" aria-label="Booking steps">
          {BOOKING_STEPS.map((s, i) => (
            <li
              key={s}
              className={cn(
                "book-progress-dot",
                i < stepIndex && "is-done",
                i === stepIndex && "is-active"
              )}
            />
          ))}
        </ol>
      </header>

      <div className="book-panel" key={step}>
        {step === "services" ? (
          <div className="book-stack">
            <ServiceCard
              checked={draft.laundry}
              icon={<Shirt size={20} />}
              title="Laundry"
              subtitle="Pickup, wash, fold & delivery"
              onToggle={() => patch({ laundry: !draft.laundry })}
            >
              {draft.laundry ? (
                <div className="book-bag-row">
                  <span>How many bags?</span>
                  <div className="book-stepper">
                    <button
                      type="button"
                      aria-label="Fewer bags"
                      onClick={() => setBagCount(Number(draft.bagCount || 1) - 1)}
                    >
                      <Minus size={16} />
                    </button>
                    <strong>{draft.bagCount || "1"}</strong>
                    <button
                      type="button"
                      aria-label="More bags"
                      onClick={() => setBagCount(Number(draft.bagCount || 1) + 1)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              ) : null}
            </ServiceCard>

            <ServiceCard
              checked={draft.dryCleaning}
              icon={<Sparkles size={20} />}
              title="Dry Cleaning"
              subtitle="Pickup & delivery per item"
              onToggle={() => patch({ dryCleaning: !draft.dryCleaning })}
            />
          </div>
        ) : null}

        {step === "schedule" ? (
          <div className="book-stack">
            <section className="book-block">
              <h2 className="book-block-title">Pickup day</h2>
              <div className="book-day-pills">
                {dates.map((iso) => {
                  const d = new Date(`${iso}T12:00:00`);
                  const active = draft.pickupDate === iso;
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={cn("book-day-pill", active && "is-active")}
                      onClick={() => patch({ pickupDate: iso })}
                    >
                      <span className="book-day-pill-dow">
                        {d.toLocaleDateString("en-US", { weekday: "short" })}
                      </span>
                      <span className="book-day-pill-num">{d.getDate()}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="book-more-dates"
                onClick={() => setShowFullCalendar((v) => !v)}
              >
                {showFullCalendar
                  ? "Hide full calendar"
                  : "Need a date further out? Pick from the calendar"}
              </button>
              {showFullCalendar ? (
                <PickupCalendar
                  value={draft.pickupDate}
                  onChange={(iso) => patch({ pickupDate: iso })}
                />
              ) : null}
            </section>

            <section className="book-block is-slots">
              <h2 className="book-block-title">Time window</h2>
              <div className="book-slots">
                {TIME_SLOTS.map((slot) => {
                  const open = slotIsBookable(
                    draft.pickupDate,
                    slot,
                    slotCounts
                  );
                  const count = slotCounts[slot] ?? 0;
                  const full = count >= SLOT_CAPACITY;
                  const past =
                    Boolean(draft.pickupDate) &&
                    !isPickupSlotStillOpen(draft.pickupDate, slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={!open}
                      onClick={() => patch({ pickupSlot: slot })}
                      className={cn(
                        "book-slot",
                        draft.pickupSlot === slot && open && "is-active",
                        !open && "is-disabled"
                      )}
                    >
                      <span>{slot}</span>
                      {!open ? (
                        <span className="book-slot-meta">
                          {past ? "Passed" : full ? "Full" : "Unavailable"}
                        </span>
                      ) : count > 0 ? (
                        <span className="book-slot-meta">
                          {SLOT_CAPACITY - count} left
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <button
              type="button"
              className={cn(
                "book-repeat-banner",
                draft.repeatPickup && "is-active"
              )}
              onClick={toggleRepeatPickup}
            >
              <span className="book-repeat-banner-icon" aria-hidden>
                <Repeat size={18} />
              </span>
              <span className="book-repeat-banner-copy">
                <strong>Make this a repeat pickup</strong>
                <span className="book-repeat-lines">
                  <span>Same day &amp; time every week</span>
                  <span>
                    Weekly rate <b>$2.35/lb</b> (vs $2.60 on-demand) + $5 pickup
                  </span>
                  <span>
                    <b>10% off</b> on your next automated pickup
                  </span>
                  <span>Cancel anytime</span>
                  {!user ? (
                    <span className="book-repeat-note">
                      Automation &amp; weekly rate:{" "}
                      <b>registered accounts only</b>
                    </span>
                  ) : null}
                </span>
              </span>
              <span
                className={cn("book-toggle", draft.repeatPickup && "is-on")}
                aria-hidden
              >
                <span className="book-toggle-knob" />
              </span>
            </button>
          </div>
        ) : null}

        {step === "address" ? (
          <div className="book-stack">
            <section className="book-block">
              <h2 className="book-block-title">Contact</h2>
              {user ? (
                <p className="book-note">
                  Prefills from your account — edit anything for this order.
                </p>
              ) : null}
              <div className="book-grid">
                <Field label="Full name">
                  <input
                    className={fieldClass}
                    value={draft.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    autoComplete="name"
                  />
                </Field>
                <Field label="Phone">
                  <input
                    className={fieldClass}
                    type="tel"
                    value={draft.phone}
                    onChange={(e) => patch({ phone: e.target.value })}
                    autoComplete="tel"
                  />
                </Field>
                <Field label="Email" wide>
                  <input
                    className={fieldClass}
                    type="email"
                    value={draft.email}
                    onChange={(e) => patch({ email: e.target.value })}
                    autoComplete="email"
                    readOnly={Boolean(user)}
                    aria-readonly={user ? "true" : undefined}
                  />
                </Field>
              </div>
            </section>

            <section className="book-block">
              <h2 className="book-block-title">Pickup address</h2>
              <div className="book-grid">
                <Field label="Street" wide>
                  <AddressAutocomplete
                    className={fieldClass}
                    value={draft.address}
                    onAddressChange={(address) => {
                      setError("");
                      patch({ address });
                    }}
                    onPlaceSelect={(place) => {
                      setError("");
                      patch({
                        address: place.address,
                        city: LAS_VEGAS_CITY,
                        zip: place.zip || draft.zip,
                        unit: place.unit || draft.unit,
                      });
                    }}
                  />
                </Field>
                <Field label="Apt / unit">
                  <input
                    className={fieldClass}
                    value={draft.unit}
                    onChange={(e) => patch({ unit: e.target.value })}
                  />
                </Field>
                <Field label="ZIP">
                  <input
                    className={fieldClass}
                    value={draft.zip}
                    onChange={(e) => patch({ zip: e.target.value })}
                    inputMode="numeric"
                    autoComplete="postal-code"
                  />
                </Field>
                <Field label="City" wide>
                  <input
                    className={fieldClass}
                    value={LAS_VEGAS_CITY}
                    readOnly
                    aria-readonly="true"
                  />
                </Field>
                <Field label="Access notes" wide>
                  <textarea
                    className={`${fieldClass} min-h-[4.5rem] resize-y py-2`}
                    placeholder="Gate code, leave at door, building manager…"
                    value={draft.pickupNotes}
                    onChange={(e) => patch({ pickupNotes: e.target.value })}
                  />
                </Field>
              </div>
              {user ? (
                <p className="book-save-prefs mt-2 text-sm text-muted-foreground">
                  Saved to your account Details (including Access notes) when you
                  place this order.
                </p>
              ) : null}
            </section>
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="book-stack">
            <div className="book-summary">
              <p className="book-summary-service">{servicesLabel(draft)}</p>
              <p>
                {draft.address}
                {draft.unit ? `, ${draft.unit}` : ""}
              </p>
              <p className="text-muted-foreground">
                {draft.city || LAS_VEGAS_CITY}, {draft.zip}
              </p>
              <p className="book-summary-when">
                {formatPickupDate(draft.pickupDate)} · {draft.pickupSlot}
                {draft.repeatPickup
                  ? user
                    ? " · Repeats weekly"
                    : " · Weekly automation requested"
                  : ""}
              </p>
              <p className="text-muted-foreground">
                {[draft.name, draft.phone, draft.email]
                  .filter(Boolean)
                  .join(" · ")}
                {user ? " · Signed in" : " · Guest"}
              </p>
            </div>

            <Field label="Washing notes">
              <input
                className={fieldClass}
                placeholder="Stains, mud, delicate items…"
                value={draft.orderNotes}
                onChange={(e) => patch({ orderNotes: e.target.value })}
              />
            </Field>

            <section className="book-prefs">
              <div className="book-prefs-head">
                <strong>Wash preferences</strong>
                <small>Choose how you want your clothes handled</small>
              </div>
              <div className="book-prefs-body">
                <PrefRow label="Pants" value={draft.pants} onClick={() => setPicker("pants")} />
                <PrefRow label="Dresses" value={draft.dresses} onClick={() => setPicker("dresses")} />
                <PrefRow label="Detergent" value={draft.detergent} onClick={() => setPicker("detergent")} />
                <PrefRow label="Softener" value={draft.softener} onClick={() => setPicker("softener")} />
                <PrefRow label="Whites wash" value={draft.whitesWashTemp} onClick={() => setPicker("whitesWashTemp")} />
                <PrefRow label="Colors wash" value={draft.colorsWashTemp} onClick={() => setPicker("colorsWashTemp")} />
                <PrefRow label="Whites dryer" value={draft.whitesDryerHeat} onClick={() => setPicker("whitesDryerHeat")} />
                <PrefRow label="Colors dryer" value={draft.colorsDryerHeat} onClick={() => setPicker("colorsDryerHeat")} />
                {user ? (
                  <p className="book-save-prefs text-sm text-muted-foreground">
                    Saved to your account Preferences when you place this order.
                  </p>
                ) : null}
              </div>
            </section>

            <section className="book-block">
              <h2 className="book-block-title">Tip your FOAM crew</h2>
              <div className="book-tip-row">
                {TIP_PRESETS.map((amount) => {
                  const active = !draft.tipCustom.trim() && draft.tip === amount;
                  return (
                    <button
                      key={amount}
                      type="button"
                      className={cn("book-tip-chip", active && "is-active")}
                      onClick={() => patch({ tip: amount, tipCustom: "" })}
                    >
                      {amount === 0 ? "No tip" : `$${amount}`}
                    </button>
                  );
                })}
                <input
                  className="book-tip-custom"
                  inputMode="decimal"
                  placeholder="Other $"
                  value={draft.tipCustom}
                  onChange={(e) => patch({ tipCustom: e.target.value })}
                  aria-label="Custom tip amount"
                />
              </div>
            </section>

            <section className="book-block">
              <h2 className="book-block-title">Promo code</h2>
              <Field label="Have a code?">
                <input
                  className={fieldClass}
                  placeholder="Enter promo code"
                  value={draft.promoCode}
                  onChange={(e) =>
                    patch({ promoCode: e.target.value.toUpperCase() })
                  }
                  autoCapitalize="characters"
                />
              </Field>
              <p className="book-note">
                We&apos;ll apply it when we confirm your final total after
                weighing (and any dry cleaning).
              </p>
            </section>

            <p className="book-note book-price-note">
              Final charge is based on <b>weight</b>
              {estimate.hasDryCleaning ? (
                <>
                  {" "}
                  and <b>dry cleaning items</b>
                </>
              ) : null}{" "}
              at pickup — {estimate.pricing.tier === "weekly" ? (
                <>
                  weekly rate <b>$2.35/lb</b>
                </>
              ) : (
                <>
                  standard rate <b>$2.60/lb</b>
                </>
              )}
              , <b>$5</b> pickup &amp; delivery, <b>$50</b> minimum
              {estimate.discountEligible ? (
                <>
                  , plus your <b>10%</b> repeat discount
                </>
              ) : null}
              {estimate.tip > 0 ? (
                <>
                  {" "}
                  and tip <b>${estimate.tip.toFixed(2)}</b>
                </>
              ) : null}
              .
            </p>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="book-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="book-cta">
        {step !== "confirm" ? (
          <Button
            type="button"
            className="w-full"
            size="lg"
            disabled={step === "services" && !hasService(draft)}
            onClick={goNext}
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            className="w-full"
            size="lg"
            disabled={busy}
            onClick={requestSubmit}
          >
            {busy ? "Submitting…" : "Continue to billing"}
          </Button>
        )}
      </div>

      {guestGateOpen ? (
        <GuestCheckoutGate
          wantsRepeat={draft.repeatPickup}
          onContinueGuest={continueAsGuest}
          onSignUp={signUpForBenefits}
          onClose={() => setGuestGateOpen(false)}
        />
      ) : null}

      {picker ? (
        <OptionSheet
          title={pickerLabel(picker)}
          options={pickerOptions(picker)}
          value={String(draft[picker])}
          images={picker === "detergent" ? DETERGENT_IMAGES : undefined}
          onClose={() => setPicker(null)}
          onSelect={(value) => {
            patch({ [picker]: value } as Partial<BookingDraft>);
            setPicker(null);
          }}
        />
      ) : null}
    </div>
  );
}

function pickerLabel(key: keyof BookingDraft) {
  const map: Partial<Record<keyof BookingDraft, string>> = {
    pants: "Pants",
    dresses: "Dresses",
    detergent: "Detergent",
    softener: "Softener",
    whitesWashTemp: "Whites wash",
    colorsWashTemp: "Colors wash",
    whitesDryerHeat: "Whites dryer",
    colorsDryerHeat: "Colors dryer",
  };
  return map[key] ?? "Choose";
}

function pickerOptions(key: keyof BookingDraft): readonly string[] {
  if (key === "pants" || key === "dresses") return FOLD_ITEM_OPTIONS;
  if (key === "detergent") return DETERGENT_BOOKING_OPTIONS;
  if (key === "softener") return SOFTENER_BOOKING_OPTIONS;
  if (key === "whitesWashTemp" || key === "colorsWashTemp")
    return WASH_TEMP_BOOKING_OPTIONS;
  if (key === "whitesDryerHeat" || key === "colorsDryerHeat")
    return DRYER_HEAT_OPTIONS;
  return [];
}

function ServiceCard({
  checked,
  icon,
  title,
  subtitle,
  onToggle,
  children,
}: {
  checked: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn("book-service", checked && "is-active")}
    >
      <span className="book-service-icon">{icon}</span>
      <span className="book-service-copy">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <span className={cn("book-check", checked && "is-on")} aria-hidden>
        {checked ? <Check size={14} strokeWidth={3} /> : null}
      </span>
      {children ? (
        <div
          className="book-service-extra"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      ) : null}
    </button>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={cn("book-field", wide && "is-wide")}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function PrefRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="book-pref-row">
      <span>{label}</span>
      <span>
        {value}
        <ChevronDown className="size-3.5 opacity-50" />
      </span>
    </button>
  );
}

function GuestCheckoutGate({
  wantsRepeat,
  onContinueGuest,
  onSignUp,
  onClose,
}: {
  wantsRepeat: boolean;
  onContinueGuest: () => void;
  onSignUp: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="book-modal-root"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in for member benefits"
    >
      <button
        type="button"
        className="book-modal-backdrop"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="book-modal book-guest-gate">
        <div className="book-guest-gate-badge">FOAM</div>
        <h2 className="book-guest-gate-title">Almost done</h2>
        <div className="book-guest-gate-body">
          {wantsRepeat ? (
            <>
              <p>
                You marked <b>weekly repeat pickup</b>.
              </p>
              <p>
                Sign in or create an account to lock in the weekly rate{" "}
                <b>$2.35/lb</b>, automation, and <b>10% off</b> your next
                automated pickup.
              </p>
            </>
          ) : (
            <p>
              Sign in or create an account for <b>member benefits</b> like
              weekly rate <b>$2.35/lb</b>, repeat pickups, and <b>10% off</b>{" "}
              your next automated order.
            </p>
          )}
        </div>
        <div className="book-guest-gate-actions">
          <Button type="button" className="w-full" size="lg" onClick={onSignUp}>
            Sign in / Create account
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="lg"
            onClick={onContinueGuest}
          >
            Continue as guest
          </Button>
        </div>
      </div>
    </div>
  );
}

function slotIsBookable(
  dateIso: string,
  slot: string,
  counts: SlotCounts
) {
  if (!dateIso || !slot) return false;
  if (!isPickupSlotStillOpen(dateIso, slot)) return false;
  if ((counts[slot as keyof SlotCounts] ?? 0) >= SLOT_CAPACITY) return false;
  return true;
}

function PickupCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const min = useMemo(() => earliestPickupDate(), []);
  const max = useMemo(() => latestPickupDate(), []);
  const [cursor, setCursor] = useState(() => {
    const base = value ? new Date(`${value}T12:00:00`) : min;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const monthLabel = cursor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startPad = first.getDay(); // Sun=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list: Array<{ iso: string; day: number; inMonth: boolean } | null> =
      [];
    for (let i = 0; i < startPad; i += 1) list.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = toIsoDate(new Date(year, month, day));
      list.push({ iso, day, inMonth: true });
    }
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [cursor]);

  const canPrev = useMemo(() => {
    const prev = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    return (
      prev.getFullYear() > min.getFullYear() ||
      (prev.getFullYear() === min.getFullYear() &&
        prev.getMonth() >= min.getMonth())
    );
  }, [cursor, min]);

  const canNext = useMemo(() => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    return (
      next.getFullYear() < max.getFullYear() ||
      (next.getFullYear() === max.getFullYear() &&
        next.getMonth() <= max.getMonth())
    );
  }, [cursor, max]);

  return (
    <div className="book-cal">
      <div className="book-cal-head">
        <button
          type="button"
          className="book-cal-nav"
          disabled={!canPrev}
          onClick={() =>
            setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
          }
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <strong>{monthLabel}</strong>
        <button
          type="button"
          className="book-cal-nav"
          disabled={!canNext}
          onClick={() =>
            setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
          }
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="book-cal-week">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="book-cal-grid">
        {cells.map((cell, i) => {
          if (!cell) return <span key={`e-${i}`} className="book-cal-empty" />;
          const allowed = isPickupDateAllowed(cell.iso);
          const active = value === cell.iso;
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={!allowed}
              className={cn(
                "book-cal-day",
                active && "is-active",
                !allowed && "is-disabled"
              )}
              onClick={() => onChange(cell.iso)}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
