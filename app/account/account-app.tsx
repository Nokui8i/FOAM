"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
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
type AccountTab = "details" | "preferences" | "orders" | "payments";

function AccountProfile({
  uid,
  email,
  isAdmin,
  onSignOut,
}: {
  uid: string;
  email: string;
  isAdmin: boolean;
  onSignOut: () => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<AccountTab>("details");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getUserProfile(uid)
      .then((data) => {
        if (!alive) return;
        setProfile(data ?? defaultProfile(uid, email));
      })
      .catch(() => {
        if (!alive) return;
        setError("Could not load your profile.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [uid, email]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setSaved(false);
    setError("");
    const data = new FormData(event.currentTarget);

    const next: Omit<UserProfile, "uid"> = {
      email,
      name: String(data.get("name") ?? profile.name),
      phone: String(data.get("phone") ?? profile.phone),
      address: String(data.get("address") ?? profile.address),
      unit: String(data.get("unit") ?? profile.unit),
      city: String(data.get("city") ?? profile.city),
      zip: String(data.get("zip") ?? profile.zip),
      pickupNotes: String(data.get("pickupNotes") ?? profile.pickupNotes),
      detergent: String(data.get("detergent") ?? profile.detergent),
      softener: String(data.get("softener") ?? profile.softener),
      washTemp: String(data.get("washTemp") ?? profile.washTemp),
      dryerTemp: String(data.get("dryerTemp") ?? profile.dryerTemp),
      foldStyle: String(data.get("foldStyle") ?? profile.foldStyle),
      separateColors: data.get("separateColors") === "on",
      careNotes: String(data.get("careNotes") ?? profile.careNotes),
    };

    try {
      await saveUserProfile(uid, next);
      setProfile({ uid, ...next });
      setSaved(true);
    } catch {
      setError("Could not save your settings. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !profile) {
    return <p className="account-muted">Loading your account...</p>;
  }

  return (
    <div className="account-card account-card-wide">
      <div className="account-header-row">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="account-title">Your account</h1>
          <p className="account-muted">
            Signed in as <strong>{email}</strong>
          </p>
        </div>
        <div className="account-actions account-actions-top">
          <Button size="sm" asChild>
            <Link href={BOOKING_PATH}>
              Book a Pickup <ArrowRight />
            </Link>
          </Button>
          {isAdmin ? (
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin">Admin</Link>
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </div>

      <div className="account-tabs" role="tablist" aria-label="Account sections">
        {(
          [
            ["details", "Details"],
            ["preferences", "Preferences"],
            ["orders", "Orders"],
            ["payments", "Payments"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            id={`account-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`account-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className={`account-tab${tab === id ? " is-active" : ""}`}
            onClick={() => {
              setTab(id);
              setSaved(false);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "orders" ? (
        <div
          id="account-panel-orders"
          role="tabpanel"
          aria-labelledby="account-tab-orders"
          className="account-empty"
        >
          <h2>Recent orders</h2>
          <p>
            No orders yet. After your first pickup, your order history will show
            up here.
          </p>
          <Button asChild>
            <Link href={BOOKING_PATH}>
              Book a Pickup <ArrowRight />
            </Link>
          </Button>
        </div>
      ) : null}

      {tab === "payments" ? (
        <div
          id="account-panel-payments"
          role="tabpanel"
          aria-labelledby="account-tab-payments"
          className="account-empty"
        >
          <h2>Payments</h2>
          <p>
            Invoices and card-on-file details will appear here once billing is
            connected. For now, payment setup happens with your first order.
          </p>
          <Button variant="outline" asChild>
            <Link href="/specialty">View fees & policies</Link>
          </Button>
        </div>
      ) : null}

      {tab === "details" || tab === "preferences" ? (
        <form
          id={`account-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`account-tab-${tab}`}
          className="account-form account-profile-form"
          onSubmit={handleSave}
        >
          {tab === "details" ? (
            <>
              <p className="account-section-copy account-field-full">
                Contact and pickup address — reused on future bookings.
              </p>

              <label>
                Full name
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={profile.name}
                  autoComplete="name"
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={email}
                  disabled
                  readOnly
                  autoComplete="email"
                />
              </label>

              <label>
                Phone
                <input
                  name="phone"
                  type="tel"
                  defaultValue={profile.phone}
                  autoComplete="tel"
                />
              </label>

              <label className="account-field-full">
                Street address
                <input
                  name="address"
                  type="text"
                  defaultValue={profile.address}
                  autoComplete="street-address"
                />
              </label>

              <label>
                Apt / unit
                <input
                  name="unit"
                  type="text"
                  defaultValue={profile.unit}
                  autoComplete="address-line2"
                />
              </label>

              <label>
                City
                <input
                  name="city"
                  type="text"
                  defaultValue={profile.city}
                  autoComplete="address-level2"
                />
              </label>

              <label>
                ZIP
                <input
                  name="zip"
                  type="text"
                  defaultValue={profile.zip}
                  autoComplete="postal-code"
                />
              </label>

              <label className="account-field-full">
                Pickup notes
                <textarea
                  name="pickupNotes"
                  rows={3}
                  defaultValue={profile.pickupNotes}
                  placeholder="Gate code, leave at door, building manager..."
                />
              </label>

              {/* Keep preference fields in the DOM so one Save works from either tab */}
              <input type="hidden" name="detergent" value={profile.detergent} />
              <input type="hidden" name="softener" value={profile.softener} />
              <input type="hidden" name="washTemp" value={profile.washTemp} />
              <input type="hidden" name="dryerTemp" value={profile.dryerTemp} />
              <input type="hidden" name="foldStyle" value={profile.foldStyle} />
              {profile.separateColors ? (
                <input type="hidden" name="separateColors" value="on" />
              ) : null}
              <input type="hidden" name="careNotes" value={profile.careNotes} />
            </>
          ) : (
            <>
              <p className="account-section-copy account-field-full">
                How we wash and finish your laundry by default.
              </p>

              <input type="hidden" name="name" value={profile.name} />
              <input type="hidden" name="phone" value={profile.phone} />
              <input type="hidden" name="address" value={profile.address} />
              <input type="hidden" name="unit" value={profile.unit} />
              <input type="hidden" name="city" value={profile.city} />
              <input type="hidden" name="zip" value={profile.zip} />
              <input type="hidden" name="pickupNotes" value={profile.pickupNotes} />

              <label>
                Detergent
                <select name="detergent" defaultValue={profile.detergent}>
                  {DETERGENT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Softener
                <select name="softener" defaultValue={profile.softener}>
                  {SOFTENER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Wash temperature
                <select name="washTemp" defaultValue={profile.washTemp}>
                  {WASH_TEMP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Dryer temperature
                <select name="dryerTemp" defaultValue={profile.dryerTemp}>
                  {DRYER_TEMP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="account-field-full">
                Fold style
                <select name="foldStyle" defaultValue={profile.foldStyle}>
                  {FOLD_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="account-check account-field-full">
                <input
                  type="checkbox"
                  name="separateColors"
                  defaultChecked={profile.separateColors}
                />
                <span>Separate lights and darks</span>
              </label>

              <label className="account-field-full">
                Care notes
                <textarea
                  name="careNotes"
                  rows={3}
                  defaultValue={profile.careNotes}
                  placeholder="Allergies, delicate items, stain notes..."
                />
              </label>
            </>
          )}

          {error ? <p className="account-error">{error}</p> : null}
          {saved ? (
            <p className="account-saved" role="status">
              Settings saved.
            </p>
          ) : null}

          <div className="account-actions">
            <Button type="submit" size="lg" disabled={saving}>
              {saving ? "Saving..." : "Save settings"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function AccountApp() {
  const { user, ready, signInEmail, signUpEmail, signInGoogle, signOut } =
    useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  async function handleGoogle() {
    setBusy(true);
    setError("");
    try {
      await signInGoogle();
    } catch {
      setError(
        "Google sign-in failed. Make sure Google is enabled in Firebase Authentication."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <p className="account-muted">Loading...</p>;
  }

  if (user) {
    return (
      <AccountProfile
        uid={user.uid}
        email={user.email ?? ""}
        isAdmin={isAdminEmail(user.email)}
        onSignOut={() => signOut()}
      />
    );
  }

  return (
    <div className="account-card">
      <p className="eyebrow">Account</p>
      <h1 className="account-title">
        {mode === "signin" ? "Sign in" : "Create account"}
      </h1>
      <p className="account-muted">
        Save your details once, then reuse them on every pickup.
      </p>

      <Button
        type="button"
        size="lg"
        variant="outline"
        className="account-google"
        disabled={busy}
        onClick={handleGoogle}
      >
        Continue with Google
      </Button>

      <div className="account-divider">
        <span>or email</span>
      </div>

      <form className="account-form" onSubmit={handleSubmit}>
        {mode === "signup" ? (
          <label>
            Name
            <input name="name" type="text" required autoComplete="name" />
          </label>
        ) : null}
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </label>
        {error ? <p className="account-error">{error}</p> : null}
        <Button type="submit" size="lg" disabled={busy}>
          {busy
            ? "Please wait..."
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </Button>
      </form>

      <p className="account-switch">
        {mode === "signin" ? (
          <>
            New here?{" "}
            <button type="button" onClick={() => setMode("signup")}>
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button type="button" onClick={() => setMode("signin")}>
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
