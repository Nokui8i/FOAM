import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect } from "expo-router";

import { useStaffAuth } from "@/lib/staff-auth";

/**
 * Driver login — mirrors web Driver access shells:
 * pending / denied / banned / Google sign-in.
 */
export default function DriverLoginScreen() {
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

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Driver</Text>
      <Text style={styles.title}>
        {bannedShell ? "Access banned" : "Ready for the route."}
      </Text>
      <Text style={styles.subtitle}>
        {bannedShell
          ? user?.email
            ? `${user.email} is blocked from OPS and Driver. Contact a FOAM admin if this is a mistake.`
            : notice || "This email is banned from Driver and OPS access."
          : "Sign in with Google to request or open Driver access."}
      </Text>

      {!bannedShell && notice ? (
        <Text style={styles.notice} accessibilityRole="text">
          {notice}
        </Text>
      ) : null}
      {!bannedShell && error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {bannedShell ? (
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
