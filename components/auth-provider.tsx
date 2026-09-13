"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (name: string, email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function ensureUserProfile(user: User, name?: string) {
  const db = getFirebaseDb();
  const ref = doc(db, "users", user.uid);
  const existing = await getDoc(ref);
  const displayName =
    name?.trim() || user.displayName || user.email?.split("@")[0] || "FOAM customer";

  if (!existing.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email ?? "",
      name: displayName,
      phone: "",
      address: "",
      unit: "",
      city: "",
      zip: "",
      pickupNotes: "",
      detergent: "Standard Scented",
      softener: "Standard",
      washTemp: "Cold",
      dryerTemp: "Medium",
      foldStyle: "Standard fold",
      separateColors: false,
      careNotes: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      provider: user.providerData[0]?.providerId ?? "password",
    });
    return;
  }

  await setDoc(
    ref,
    {
      email: user.email ?? "",
      name: existing.data()?.name || displayName,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, async (next) => {
      setUser(next);
      setReady(true);
      if (next) {
        try {
          await ensureUserProfile(next);
        } catch {
          // Profile write can fail offline; auth still works.
        }
      }
    });
  }, []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(
      getFirebaseAuth(),
      email,
      password
    );
    await ensureUserProfile(result.user);
  }, []);

  const signUpEmail = useCallback(
    async (name: string, email: string, password: string) => {
      const result = await createUserWithEmailAndPassword(
        getFirebaseAuth(),
        email,
        password
      );
      if (name.trim()) {
        await updateProfile(result.user, { displayName: name.trim() });
      }
      await ensureUserProfile(result.user, name);
    },
    []
  );

  const signInGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(getFirebaseAuth(), provider);
    await ensureUserProfile(result.user);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signOut,
    }),
    [user, ready, signInEmail, signUpEmail, signInGoogle, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
