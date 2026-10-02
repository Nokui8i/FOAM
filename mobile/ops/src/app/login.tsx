import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect } from "expo-router";

import { useStaffAuth } from "@/lib/staff-auth";

/**
 * OPS login — mirrors web OPS access shells:
 * pending / denied / banned / driver-only / Google sign-in.
 */
export default function OpsLoginScreen() {
  const {
    phase,
    user,
    notice,
    error,
    loggingIn,
    signIn,
    signOut,
    clearMessages,
  } = useStaffAuth();

  if (phase === "ready") {
    return <Redirect href="/portal" />;
  }

  if (phase === "booting" || phase === "loadingProfile") {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#ffffff" size="large" />
      </View>
    );
  }

  const bannedShell = phase === "banned";
  const driverOnlyShell = phase === "unauthorized";
  const lockedShell = bannedShell || driverOnlyShell;

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>OPS</Text>
      <Text style={styles.title}>
        {bannedShell
          ? "Access banned"
          : driverOnlyShell
            ? "Driver access only"
            : "Run the floor."}
      </Text>
      <Text style={styles.subtitle}>
        {bannedShell
          ? user?.email
            ? `${user.email} is blocked from OPS and Driver. Contact a FOAM admin if this is a mistake.`
            : notice || "This email is banned from Driver and OPS access."
          : driverOnlyShell
            ? notice ||
              "This account is approved as a driver. Use the FOAM Driver app instead of OPS."
            : "Sign in with Google to request or open OPS access."}
      </Text>

      {!lockedShell && notice ? (
        <Text style={styles.notice} accessibilityRole="text">
          {notice}
        </Text>
      ) : null}
      {!lockedShell && error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {driverOnlyShell ? (
        <>
          <Pressable
            style={styles.button}
            onPress={() => {
              void Linking.openURL("foam-driver://");
            }}
          >
            <Text style={styles.buttonText}>Open FOAM Driver</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void signOut()}
          >
            <Text style={styles.secondaryButtonText}>Sign out</Text>
          </Pressable>
        </>
      ) : bannedShell ? (
        <Pressable style={styles.secondaryButton} onPress={() => void signOut()}>
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.button, loggingIn && styles.buttonDisabled]}
          disabled={loggingIn}
          onPress={() => {
            clearMessages();
            void signIn();
          }}
        >
          {loggingIn ? (
            <ActivityIndicator color="#050505" />
          ) : (
            <Text style={styles.buttonText}>Continue with Google</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050505",
    paddingHorizontal: 24,
    justifyContent: "center",
    gap: 12,
  },
  eyebrow: {
    color: "#a3a3a3",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: "#a3a3a3",
    fontSize: 15,
    marginBottom: 8,
  },
  notice: {
    color: "#86efac",
    backgroundColor: "#052e16",
    padding: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
  error: {
    color: "#fecaca",
    backgroundColor: "#450a0a",
    padding: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
  button: {
    marginTop: 8,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#050505",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    marginTop: 8,
    backgroundColor: "#262626",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
