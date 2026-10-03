import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    getOnboardingCompleted,
    resetOnboardingCompleted,
    setOnboardingCompleted,
} from "../storage/onboardingStorage";

type OnboardingContextValue = {
  isLoading: boolean;
  hasCompletedOnboarding: boolean;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

type OnboardingProviderProps = {
  children: ReactNode;
};

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    let isActive = true;

    const restore = async () => {
      try {
        const completed = await getOnboardingCompleted();

        if (isActive) {
          setHasCompletedOnboarding(completed);
        }
      } catch (error) {
        console.error("Unable to restore onboarding preference:", error);

        if (isActive) {
          /*
           * If the preference cannot be read, show onboarding rather than
           * silently skipping first-use guidance.
           */
          setHasCompletedOnboarding(false);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void restore();

    return () => {
      isActive = false;
    };
  }, []);

  const completeOnboarding = async () => {
    await setOnboardingCompleted();
    setHasCompletedOnboarding(true);
  };

  const resetOnboarding = async () => {
    await resetOnboardingCompleted();
    setHasCompletedOnboarding(false);
  };

  const value = useMemo<OnboardingContextValue>(
    () => ({
      isLoading,
      hasCompletedOnboarding,
      completeOnboarding,
      resetOnboarding,
    }),
    [isLoading, hasCompletedOnboarding],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);

  if (!context) {
    throw new Error("useOnboarding must be used inside OnboardingProvider.");
  }

  return context;
}
