import { useCallback, useEffect, useState } from "react";

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";

import { StyleSheet, Text, View } from "react-native";

import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "../auth/AuthContext";

import { initializeDatabase } from "../database/database";

import {
  OnboardingProvider,
  useOnboarding,
} from "../onboarding/OnboardingContext";

import { StartupSplash } from "@/../components/feedback/StartupSplash";
import { theme } from "@/../theme";

/*
 * Keep the GradeLens React startup screen visible for at least 2.5 seconds.
 * If Auth, SQLite, or onboarding preference restoration takes longer, the
 * splash simply remains until that real startup work finishes.
 */
const STARTUP_SPLASH_MIN_MS = 2500;

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Fast Refresh may execute this more than once during development.
});

SplashScreen.setOptions({
  duration: 150,
  fade: true,
});

type DatabaseState = "loading" | "ready" | "error";

function RootNavigator() {
  const { isLoading: isAuthLoading } = useAuth();

  const { isLoading: isOnboardingLoading } = useOnboarding();

  const [databaseState, setDatabaseState] = useState<DatabaseState>("loading");

  const [startupSplashMounted, setStartupSplashMounted] = useState(false);

  const [minimumSplashTimePassed, setMinimumSplashTimePassed] = useState(false);

  /*
   * Initialize the local GradeLens SQLite database.
   */
  useEffect(() => {
    let isActive = true;

    const initialize = async () => {
      try {
        await initializeDatabase();

        if (isActive) {
          setDatabaseState("ready");
        }
      } catch (error) {
        console.error("Database initialization failed:", error);

        if (isActive) {
          setDatabaseState("error");
        }
      }
    };

    void initialize();

    return () => {
      isActive = false;
    };
  }, []);

  /*
   * Count the 2.5-second minimum only after the React splash is actually
   * visible, rather than while it is still hidden underneath the native layer.
   */
  useEffect(() => {
    if (!startupSplashMounted) {
      return;
    }

    const timer = setTimeout(() => {
      setMinimumSplashTimePassed(true);
    }, STARTUP_SPLASH_MIN_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [startupSplashMounted]);

  const isAppReady =
    !isAuthLoading && !isOnboardingLoading && databaseState === "ready";

  const handleStartupSplashLayout = useCallback(() => {
    setStartupSplashMounted(true);

    void SplashScreen.hideAsync().catch(() => {
      // Safe when Fast Refresh already hid the native splash.
    });
  }, []);

  useEffect(() => {
    if (databaseState !== "error") {
      return;
    }

    void SplashScreen.hideAsync().catch(() => {
      // Safe if the native splash has already been hidden.
    });
  }, [databaseState]);

  if (databaseState === "error") {
    return (
      <View style={styles.errorScreen}>
        <StatusBar style="dark" />

        <Text style={styles.errorTitle}>GradeLens couldn&apos;t start</Text>

        <Text style={styles.errorText}>
          The local database could not be prepared. Close and reopen the app. If
          the problem continues, reinstall the current development build.
        </Text>
      </View>
    );
  }

  const shouldShowStartupSplash = !isAppReady || !minimumSplashTimePassed;

  if (shouldShowStartupSplash) {
    return (
      <>
        <StatusBar style="dark" />

        <StartupSplash onLayout={handleStartupSplashLayout} />
      </>
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
        <Stack.Screen name="onboarding" />
        <Stack.Screen
          name="login"
          options={{
            animation: "none",
          }}
        />
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
        <OnboardingProvider>
          <RootNavigator />
        </OnboardingProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  errorScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xxl,
    backgroundColor: "#FFFFFF",
  },

  errorTitle: {
    ...theme.typography.detailTitle,
    color: theme.colors.text,
    textAlign: "center",
  },

  errorText: {
    ...theme.typography.body,
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
});
