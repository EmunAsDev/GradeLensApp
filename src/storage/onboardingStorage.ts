import * as SecureStore from "expo-secure-store";

const ONBOARDING_COMPLETED_KEY = "gradelens_onboarding_v1_completed";

export async function getOnboardingCompleted(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(ONBOARDING_COMPLETED_KEY);

  return value === "true";
}

export async function setOnboardingCompleted(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, "true");
}

export async function resetOnboardingCompleted(): Promise<void> {
  await SecureStore.deleteItemAsync(ONBOARDING_COMPLETED_KEY);
}
