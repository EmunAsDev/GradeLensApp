import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Stack } from "expo-router";

import { useEffect, useState } from "react";

import { AuthProvider, useAuth } from "../auth/AuthContext";

import { initializeDatabase } from "../database/database";

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
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />

      <Stack.Screen name="login" />

      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,

    alignItems: "center",

    justifyContent: "center",
  },
});
