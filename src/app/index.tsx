import { Redirect } from "expo-router";

import { useAuth } from "../auth/AuthContext";
import { useOnboarding } from "../onboarding/OnboardingContext";

export default function Index() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const { hasCompletedOnboarding, isLoading: isOnboardingLoading } =
    useOnboarding();

  /*
   * RootLayout normally keeps StartupSplash visible until these values are
   * restored. This guard also keeps the route safe during Fast Refresh or
   * direct navigation.
   */
  if (isAuthLoading || isOnboardingLoading) {
    return null;
  }

  /*
   * Authentication now comes BEFORE onboarding.
   *
   * A user who is not signed in always goes to Login, even when this device
   * has never completed the GradeLens introduction.
   */
  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  /*
   * A successfully authenticated faculty member who has not completed the
   * introduction is sent through onboarding before entering the workspace.
   *
   * This also safely resumes onboarding if the app was closed halfway through
   * the introduction after login.
   */
  if (!hasCompletedOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}
