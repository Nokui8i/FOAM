import { Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";

import { useStaffAuth } from "@/lib/staff-auth";

/**
 * Authenticated OPS shell only — no order/admin CRUD in Milestone 6B.
 */
export default function OpsPortalScreen() {
  const { phase, user, profile, signOut } = useStaffAuth();

  if (phase !== "ready") {
    return <Redirect href="/login" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FOAM OPS</Text>
      <Text style={styles.meta}>{user?.email ?? ""}</Text>
      <Text style={styles.meta}>
        {profile
          ? `${profile.role} · ${profile.status}`
          : "Company owner access"}
      </Text>
      <Text style={styles.shell}>
        Authenticated shell only. Order management and staff admin tools arrive
        in later milestones.
      </Text>
      <Pressable style={styles.button} onPress={() => void signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050505",
    paddingHorizontal: 24,
    justifyContent: "center",
    gap: 10,
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "700",
  },
  meta: {
    color: "#a3a3a3",
    fontSize: 14,
  },
  shell: {
    color: "#d4d4d4",
    fontSize: 15,
    marginTop: 8,
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#262626",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
