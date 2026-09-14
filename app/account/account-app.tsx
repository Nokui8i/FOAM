"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CreditCard,
  LogOut,
  PackageOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { cn } from "@/lib/utils";
import {
  DETERGENT_OPTIONS,
  DRYER_TEMP_OPTIONS,
  FOLD_OPTIONS,
  SOFTENER_OPTIONS,
  WASH_TEMP_OPTIONS,
  defaultProfile,
  getUserProfile,
  saveUserProfile,
  type UserProfile,
} from "@/lib/user-profile";
import { BOOKING_PATH, isAdminEmail } from "@/lib/site-config";

type Mode = "signin" | "signup";
const tabs = ["Details", "Preferences", "Orders", "Payments"] as const;
type TabName = (typeof tabs)[number];

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-white px-3.5 text-base text-foreground outline-none transition placeholder:text-muted-foreground/70 hover:border-muted-foreground/60 focus:border-accent-strong focus:ring-2 focus:ring-accent-strong/15 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted/70 disabled:text-muted-foreground";

function AccountProfile({
  uid,
  email,
  displayName,
  isAdmin,
  onSignOut,
}: {
  uid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  onSignOut: () => void;
}) {
  const [profile, setProfile] = useState<UserProfile>(() => ({
    ...defaultProfile(uid, email),
    name: displayName,
  }));
  const [activeTab, setActiveTab] = useState<TabName>("Details");
  const [saving, setSaving] = useState(false);
  const [savedPanel, setSavedPanel] = useState<"details" | "preferences" | null>(
    null
  );
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

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
          setProfile({
            ...data,
            name: data.name.trim() || displayName || data.name,
          });
        } else {
          setProfile(fallback);
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
    setActiveTab(tab);
    setSavedPanel(null);
    setError("");
    panelRef.current?.scrollTo({ top: 0 });
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

    const next: Omit<UserProfile, "uid"> = {
      email,
      name: profile.name,
      phone: profile.phone,
      address: profile.address,
      unit: profile.unit,
      city: profile.city,
      zip: profile.zip,
      pickupNotes: profile.pickupNotes,
      detergent: profile.detergent,
      softener: profile.softener,
      washTemp: profile.washTemp,
      dryerTemp: profile.dryerTemp,
      foldStyle: profile.foldStyle,
      separateColors: profile.separateColors,
      careNotes: profile.careNotes,
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

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-white">
      <header className="shrink-0 border-b border-border px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">
              Hello{profile.name.trim() ? ` ${profile.name.trim()}` : ""}
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="sm" className="flex-1 sm:flex-none" asChild>
              <Link href={BOOKING_PATH}>
                Book a Pickup <ArrowRight />
              </Link>
            </Button>
            {isAdmin ? (
              <Button size="sm" className="flex-1 sm:flex-none" variant="outline" asChild>
                <Link href="/admin">Admin</Link>
              </Button>
            ) : null}
            <Button
              size="sm"
              className="flex-1 sm:flex-none"
              variant="outline"
              type="button"
              onClick={onSignOut}
            >
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-5">
        <div
          className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1"
          role="tablist"
          aria-label="Account sections"
        >
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab;
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
                className={cn(
                  "min-h-11 min-w-0 rounded-lg px-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 sm:px-3 sm:text-sm",
                  isActive
                    ? "bg-accent-strong text-white shadow-sm"
                    : "text-muted-foreground hover:bg-white/80 hover:text-foreground"
                )}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={panelRef}
        className={cn(
          "px-5 py-6 sm:px-6 sm:py-7",
          activeTab === "Details"
            ? "overflow-visible"
            : "max-h-[34rem] overflow-y-auto overscroll-contain"
        )}
      >
        {activeTab === "Details" ? (
          <form
            id="panel-details"
            role="tabpanel"
            aria-labelledby="tab-details"
            onSubmit={(event) => saveProfile(event, "details")}
          >
            <PanelIntro
              title="Personal details"
              helper="Contact and pickup address — reused on future bookings."
            />
            <div className="mt-5 grid gap-x-4 gap-y-4 sm:grid-cols-2">
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
                <input
                  className={inputClass}
                  autoComplete="street-address"
                  value={profile.address}
                  onChange={(e) =>
                    setProfile({ ...profile, address: e.target.value })
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
                  autoComplete="address-level2"
                  value={profile.city}
                  onChange={(e) =>
                    setProfile({ ...profile, city: e.target.value })
                  }
                />
              </Field>
              <Field label="ZIP">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  value={profile.zip}
                  onChange={(e) =>
                    setProfile({ ...profile, zip: e.target.value })
                  }
                />
              </Field>
              <Field label="Pickup notes" wide>
                <textarea
                  className={`${inputClass} min-h-24 resize-y py-2.5`}
                  placeholder="Gate code, leave at door, building manager..."
                  value={profile.pickupNotes}
                  onChange={(e) =>
                    setProfile({ ...profile, pickupNotes: e.target.value })
                  }
                />
              </Field>
            </div>
            {error ? (
              <p className="mt-4 text-sm font-medium text-destructive">{error}</p>
            ) : null}
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
            <PanelIntro
              title="Laundry preferences"
              helper="How we wash and finish your laundry by default."
            />
            <div className="mt-5 grid gap-x-4 gap-y-4 sm:grid-cols-2">
              <SelectField
                label="Detergent"
                value={profile.detergent}
                options={[...DETERGENT_OPTIONS]}
                onChange={(value) =>
                  setProfile({ ...profile, detergent: value })
                }
              />
              <SelectField
                label="Softener"
                value={profile.softener}
                options={[...SOFTENER_OPTIONS]}
                onChange={(value) =>
                  setProfile({ ...profile, softener: value })
                }
              />
              <SelectField
                label="Wash temperature"
                value={profile.washTemp}
                options={[...WASH_TEMP_OPTIONS]}
                onChange={(value) =>
                  setProfile({ ...profile, washTemp: value })
                }
              />
              <SelectField
                label="Dryer temperature"
                value={profile.dryerTemp}
                options={[...DRYER_TEMP_OPTIONS]}
                onChange={(value) =>
                  setProfile({ ...profile, dryerTemp: value })
                }
              />
              <SelectField
                label="Fold style"
                wide
                value={profile.foldStyle}
                options={[...FOLD_OPTIONS]}
                onChange={(value) =>
                  setProfile({ ...profile, foldStyle: value })
                }
              />
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/45 px-3.5 sm:col-span-2">
                <input
                  type="checkbox"
                  className="size-4 accent-(--color-accent-strong)"
                  checked={profile.separateColors}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      separateColors: e.target.checked,
                    })
                  }
                />
                <span className="text-sm font-medium">
                  Separate lights and darks
                </span>
              </label>
              <Field label="Care notes" wide>
                <textarea
                  className={`${inputClass} min-h-24 resize-y py-2.5`}
                  placeholder="Allergies, delicate items, stain notes..."
                  value={profile.careNotes}
                  onChange={(e) =>
                    setProfile({ ...profile, careNotes: e.target.value })
                  }
                />
              </Field>
            </div>
            {error ? (
              <p className="mt-4 text-sm font-medium text-destructive">{error}</p>
            ) : null}
            <SaveRow saved={savedPanel === "preferences"} saving={saving} />
          </form>
        ) : null}

        {activeTab === "Orders" ? (
          <EmptyState
            id="panel-orders"
            labelledBy="tab-orders"
            icon={<PackageOpen />}
            title="Recent orders"
            text="No orders yet. After your first pickup, your order history will show up here."
          >
            <Button asChild>
              <Link href={BOOKING_PATH}>
                Book a Pickup <ArrowRight />
              </Link>
            </Button>
          </EmptyState>
        ) : null}

        {activeTab === "Payments" ? (
          <EmptyState
            id="panel-payments"
            labelledBy="tab-payments"
            icon={<CreditCard />}
            title="Payments"
            text="Invoices and card-on-file details will appear here once billing is connected. For now, payment setup happens with your first order."
          >
            <Button variant="secondary" asChild>
              <Link href="/specialty">
                View fees &amp; policies <ArrowRight />
              </Link>
            </Button>
          </EmptyState>
        ) : null}
      </div>
    </section>
  );
}

function PanelIntro({ title, helper }: { title: string; helper: string }) {
  return (
    <div>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {helper}
      </p>
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
    <label
      className={cn(
        "grid gap-2 text-sm font-semibold",
        wide && "sm:col-span-2"
      )}
    >
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
          className={`${inputClass} appearance-none pr-10`}
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
          className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </span>
    </Field>
  );
}

function SaveRow({ saved, saving }: { saved: boolean; saving: boolean }) {
  return (
    <div className="mt-6 flex min-h-11 flex-wrap items-center gap-4 border-t border-border pt-5">
      <Button type="submit" size="lg" className="text-base" disabled={saving}>
        {saving ? "Saving..." : "Save settings"}
      </Button>
      <p
        className={cn(
          "flex items-center gap-2 text-sm font-semibold text-accent-strong transition-opacity",
          saved ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        role="status"
        aria-live="polite"
      >
        <span className="grid size-5 place-items-center rounded-full bg-accent">
          <Check className="size-3.5" strokeWidth={3} />
        </span>{" "}
        Settings saved.
      </p>
    </div>
  );
}

function EmptyState({
  id,
  labelledBy,
  icon,
  title,
  text,
  children,
}: {
  id: string;
  labelledBy: string;
  icon: ReactNode;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="flex min-h-[22rem] flex-col items-center justify-center py-6 text-center"
    >
      <div className="grid size-14 place-items-center rounded-full bg-accent text-accent-foreground [&_svg]:size-6">
        {icon}
      </div>
      <h2 className="mt-5 font-display text-xl font-semibold sm:text-2xl">{title}</h2>
      <p className="mt-2.5 max-w-md text-sm leading-6 text-muted-foreground">
        {text}
      </p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function AccountApp() {
  const {
    user,
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

  // Don't block the sign-in UI on Firebase ready — LAN/mobile often delays auth init.
  if (user) {
    return (
      <AccountProfile
        uid={user.uid}
        email={user.email ?? ""}
        displayName={
          user.displayName?.trim() || user.email?.split("@")[0] || ""
        }
        isAdmin={isAdminEmail(user.email)}
        onSignOut={handleSignOut}
      />
    );
  }

  const fieldClass =
    "mt-1.5 mb-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-base text-foreground outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:mb-5 sm:rounded-lg sm:py-2.5 sm:text-sm";

  const socialClass =
    "flex min-h-12 w-full touch-manipulation items-center justify-center rounded-xl bg-white px-4 py-3.5 text-base font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:min-h-0 sm:rounded-lg sm:py-3 sm:shadow-md sm:ring-0";

  return (
    <div className="foam-login-mobile relative z-20 mx-auto w-full max-w-md">
      <div className="relative z-20 border-0 bg-transparent px-1 py-2 sm:rounded-3xl sm:border sm:border-gray-200 sm:bg-white sm:px-8 sm:py-10 sm:shadow-xl">
        <div className="mx-auto w-full">
          <h1 className="text-center font-display text-[2rem] font-extrabold tracking-tight text-black sm:text-[1.85rem]">
            {mode === "signin" ? "LOGIN" : "SIGN UP"}
          </h1>

          <form id="foam-auth-form" className="mt-6 sm:mt-5" onSubmit={handleSubmit}>
            {mode === "signup" ? (
              <label
                className="mb-1 block text-sm font-semibold text-gray-600"
                htmlFor="account-name"
              >
                Name
              </label>
            ) : null}
            {mode === "signup" ? (
              <input
                id="account-name"
                className={fieldClass}
                name="name"
                type="text"
                required
                autoComplete="name"
              />
            ) : null}

            <label
              className="mb-1 block text-sm font-semibold text-gray-600"
              htmlFor="account-email"
            >
              E-mail
            </label>
            <input
              id="account-email"
              className={fieldClass}
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
            />

            <label
              className="mb-1 block text-sm font-semibold text-gray-600"
              htmlFor="account-password"
            >
              Password
            </label>
            <input
              id="account-password"
              className={fieldClass}
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
            />

            {mode === "signin" ? (
              <div className="mb-5 text-right sm:mb-4">
                <button
                  type="button"
                  className="cursor-pointer touch-manipulation py-1 font-display text-sm font-semibold text-gray-500 hover:text-gray-600 sm:text-xs"
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
            <p
              className="relative z-30 mb-4 rounded-xl bg-red-50 px-3 py-3 text-sm font-medium text-red-600 sm:bg-transparent sm:px-0 sm:py-0"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {/* Outside <form> so mobile Safari doesn't swallow taps */}
          <div className="relative z-30 mt-1 flex w-full flex-col gap-3 sm:gap-4">
            <GoogleSignInButton
              className={`${socialClass} cursor-pointer disabled:opacity-60`}
              onError={(message) => {
                setError(message);
              }}
            />

            <button
              type="button"
              className={`${socialClass} cursor-pointer disabled:opacity-60`}
              disabled={oauthBusy}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void handleApple();
              }}
            >
              <svg
                viewBox="0 0 30 30"
                height="28"
                width="28"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
                className="pointer-events-none"
              >
                <path d="M25.565,9.785c-0.123,0.077-3.051,1.702-3.051,5.305c0.138,4.109,3.695,5.55,3.756,5.55 c-0.061,0.077-0.537,1.963-1.947,3.94C23.204,26.283,21.962,28,20.076,28c-1.794,0-2.438-1.135-4.508-1.135 c-2.223,0-2.852,1.135-4.554,1.135c-1.886,0-3.22-1.809-4.4-3.496c-1.533-2.208-2.836-5.673-2.882-9 c-0.031-1.763,0.307-3.496,1.165-4.968c1.211-2.055,3.373-3.45,5.734-3.496c1.809-0.061,3.419,1.242,4.523,1.242 c1.058,0,3.036-1.242,5.274-1.242C21.394,7.041,23.97,7.332,25.565,9.785z M15.001,6.688c-0.322-1.61,0.567-3.22,1.395-4.247 c1.058-1.242,2.729-2.085,4.17-2.085c0.092,1.61-0.491,3.189-1.533,4.339C18.098,5.937,16.488,6.872,15.001,6.688z" />
              </svg>
              <span className="pointer-events-none ml-2">
                {oauthBusy ? "Opening…" : "Sign in with Apple"}
              </span>
            </button>
          </div>

          <div className="mt-4 sm:mt-5">
            <button
              type="submit"
              form="foam-auth-form"
              disabled={busy || oauthBusy}
              className="min-h-12 w-full touch-manipulation rounded-xl bg-blue-600 px-4 py-3.5 text-center text-base font-semibold text-white shadow-md transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:rounded-lg sm:py-3"
            >
              {busy || oauthBusy
                ? "Please wait..."
                : mode === "signin"
                  ? "Log in"
                  : "Create account"}
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between sm:mt-4">
            <span className="w-1/5 border-b border-gray-300 md:w-1/4" />
            <button
              type="button"
              className="touch-manipulation px-3 py-2 text-xs uppercase tracking-wide text-gray-500 hover:underline"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
              }}
            >
              {mode === "signin" ? "or sign up" : "or log in"}
            </button>
            <span className="w-1/5 border-b border-gray-300 md:w-1/4" />
          </div>
        </div>
      </div>
    </div>
  );
}
