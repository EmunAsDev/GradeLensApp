import { useEffect, useState } from "react";

import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Stack } from "expo-router";

import { StatusBar } from "expo-status-bar";

import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "../auth/AuthContext";

import { initializeDatabase } from "../database/database";

import { theme } from "@/../theme";

function RootNavigator() {
  const { isLoading: isAuthLoading } = useAuth();

  const [isDatabaseReady, setIsDatabaseReady] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        await initializeDatabase();

        setIsDatabaseReady(true);
      } catch (error) {
        console.error("Database initialization failed:", error);
      }
    };

    void initialize();
  }, []);

  if (isAuthLoading || !isDatabaseReady) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="dark" />

        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />

      <Stack
        screenOptions={{
          headerShown: false,

          contentStyle: {
            backgroundColor: theme.colors.background,
          },
        }}
      >
        <Stack.Screen name="index" />

        <Stack.Screen name="login" />

        <Stack.Screen name="(tabs)" />

        <Stack.Screen
          name="scan-camera"
          options={{
            headerShown: false,
            animation: "fade",
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: theme.colors.background,
  },
});
