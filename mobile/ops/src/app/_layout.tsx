import { useMemo } from "react";
import { Stack } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import {
  FOAM_APP_PORTAL,
  getFoamAppIdentityError,
} from "@/lib/app-identity";
import { StaffAuthProvider, useStaffAuth } from "@/lib/staff-auth";

function OpsAuthGate({ children }: { children: React.ReactNode }) {
  const { phase } = useStaffAuth();

  if (phase === "booting" || phase === "loadingProfile") {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color="#ffffff" size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

function OpsRootNavigator() {
  return (
    <OpsAuthGate>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#050505" },
          headerTintColor: "#ffffff",
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: "#050505" },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "FOAM OPS" }} />
        <Stack.Screen name="portal" options={{ title: "OPS" }} />
      </Stack>
    </OpsAuthGate>
  );
}

/**
 * FOAM OPS — staff authentication shell.
 * Order management and admin CRUD are out of scope for Milestone 6B.
 */
export default function RootLayout() {
  const identityError = useMemo(() => getFoamAppIdentityError(), []);

  if (identityError) {
    return (
      <View style={styles.boot}>
        <StatusBar style="light" />
        <Text style={styles.identityTitle}>FOAM OPS identity error</Text>
        <Text style={styles.identityBody}>{identityError}</Text>
      </View>
    );
  }

  return (
    <StaffAuthProvider portal={FOAM_APP_PORTAL}>
      <OpsRootNavigator />
    </StaffAuthProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: "#050505",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  identityTitle: {
    color: "#fecaca",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  identityBody: {
    color: "#fca5a5",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
