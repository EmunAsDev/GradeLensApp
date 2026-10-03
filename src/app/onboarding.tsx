import { useRef, useState } from "react";

import {
    Alert,
    FlatList,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";

import { Redirect, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { theme } from "@/../theme";
import { useAuth } from "../auth/AuthContext";
import { useOnboarding } from "../onboarding/OnboardingContext";

type OnboardingPage = {
  key: string;
  kicker: string;
  title: string;
  description: string;
  visual: "scan" | "offline" | "review";
};

const PAGES: OnboardingPage[] = [
  {
    key: "scan",
    kicker: "CAPTURE",
    title: "Scan paper assessments",
    description:
      "Capture GradeLens answer sheets from your phone and let the app prepare each paper for review.",
    visual: "scan",
  },
  {
    key: "offline",
    kicker: "OFFLINE",
    title: "Keep working without internet",
    description:
      "Once your course data is synced, continue scanning and reviewing assessments even while offline.",
    visual: "offline",
  },
  {
    key: "review",
    kicker: "REVIEW & SYNC",
    title: "Resolve attention, then submit",
    description:
      "Review scans that genuinely need clarification, then sync completed batches when you are back online.",
    visual: "review",
  },
];

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();

  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const listRef = useRef<FlatList<OnboardingPage>>(null);

  const { completeOnboarding } = useOnboarding();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);

  const isLastPage = currentIndex === PAGES.length - 1;

  const finishOnboarding = async () => {
    if (isFinishing) {
      return;
    }

    setIsFinishing(true);

    try {
      /*
       * Skip and Get Started both mean:
       * "I have seen enough of this introduction. Do not show it automatically
       * on future launches of this installation."
       */
      await completeOnboarding();

      /*
       * Onboarding is now post-login, so finishing enters the authenticated
       * GradeLens workspace instead of returning to Login.
       */
      router.replace("/(tabs)");
    } catch (error) {
      console.error("Unable to save onboarding preference:", error);

      Alert.alert(
        "Unable to Continue",
        "GradeLens could not save the introduction preference. Please try again.",
      );
    } finally {
      setIsFinishing(false);
    }
  };

  const handleNext = () => {
    if (isLastPage) {
      void finishOnboarding();
      return;
    }

    const nextIndex = currentIndex + 1;

    listRef.current?.scrollToIndex({
      index: nextIndex,
      animated: true,
    });

    setCurrentIndex(nextIndex);
  };

  /*
   * Onboarding is an authenticated first-use experience. Direct navigation to
   * this route without a valid session returns to Login. All hooks above are
   * still called unconditionally so React hook ordering remains stable.
   */
  if (isAuthLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  const handleMomentumEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (width <= 0) {
      return;
    }

    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);

    setCurrentIndex(Math.max(0, Math.min(PAGES.length - 1, nextIndex)));
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>GradeLens</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip introduction"
          disabled={isFinishing}
          onPress={() => {
            void finishOnboarding();
          }}
          style={({ pressed }) => [
            styles.skipButton,
            pressed && !isFinishing && styles.pressed,
          ]}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={PAGES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        renderItem={({ item }) => (
          <View
            style={[
              styles.page,
              {
                width,
              },
            ]}
          >
            <View style={styles.visualArea}>
              <OnboardingVisual type={item.visual} />
            </View>

            <View style={styles.copyArea}>
              <Text style={styles.kicker}>{item.kicker}</Text>

              <Text style={styles.title}>{item.title}</Text>

              <Text style={styles.description}>{item.description}</Text>
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View
          style={styles.dots}
          accessibilityLabel={`Page ${currentIndex + 1} of ${PAGES.length}`}
        >
          {PAGES.map((page, index) => (
            <View
              key={page.key}
              style={[styles.dot, index === currentIndex && styles.dotActive]}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLastPage ? "Get started" : "Next"}
          disabled={isFinishing}
          onPress={handleNext}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && !isFinishing && styles.primaryButtonPressed,
            isFinishing && styles.primaryButtonDisabled,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isLastPage ? "Get Started" : "Next"}
          </Text>
        </Pressable>

        <Text style={styles.footerNote}>
          This introduction is shown only after your first successful login.
        </Text>
      </View>
    </SafeAreaView>
  );
}

type OnboardingVisualProps = {
  type: OnboardingPage["visual"];
};

function OnboardingVisual({ type }: OnboardingVisualProps) {
  if (type === "scan") {
    return (
      <View style={styles.visualCard}>
        <View style={styles.paper}>
          <View style={styles.paperHeaderLine} />
          <View style={styles.paperLineShort} />

          {[0, 1, 2].map((row) => (
            <View key={row} style={styles.bubbleRow}>
              <View style={styles.questionLine} />

              {[0, 1, 2, 3, 4].map((bubble) => (
                <View
                  key={bubble}
                  style={[
                    styles.bubble,
                    row === 1 && bubble === 2 && styles.bubbleSelected,
                  ]}
                />
              ))}
            </View>
          ))}
        </View>

        <View style={[styles.scanCorner, styles.scanCornerTopLeft]} />
        <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
        <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
        <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />
      </View>
    );
  }

  if (type === "offline") {
    return (
      <View style={styles.visualCard}>
        <View style={styles.deviceCard}>
          <View style={styles.deviceTopRow}>
            <View style={styles.statusDot} />
            <Text style={styles.deviceLabel}>OFFLINE READY</Text>
          </View>

          {["Course data", "Answer key", "Saved scans"].map((label) => (
            <View key={label} style={styles.savedRow}>
              <View style={styles.savedIndicator} />
              <Text style={styles.savedText}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.visualCard}>
      <View style={styles.reviewCard}>
        <Text style={styles.reviewLabel}>NEEDS REVIEW</Text>

        <View style={styles.reviewQuestionRow}>
          <Text style={styles.reviewQuestion}>Question 12</Text>
          <View style={styles.reviewStatusPill}>
            <Text style={styles.reviewStatusText}>Check</Text>
          </View>
        </View>

        <View style={styles.reviewQuestionRow}>
          <Text style={styles.reviewQuestion}>Question 27</Text>
          <View style={styles.reviewStatusPill}>
            <Text style={styles.reviewStatusText}>Check</Text>
          </View>
        </View>

        <View style={styles.syncReadyCard}>
          <View style={styles.syncReadyDot} />
          <Text style={styles.syncReadyText}>Ready to sync when online</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  topBar: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.xl,
  },

  brand: {
    ...theme.typography.cardTitle,
    color: theme.colors.primary,
  },

  skipButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -theme.spacing.sm,
    borderRadius: theme.radius.pill,
  },

  skipText: {
    ...theme.typography.bodySmallStrong,
    color: theme.colors.textSecondary,
  },

  page: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
  },

  visualArea: {
    flex: 1.08,
    alignItems: "center",
    justifyContent: "center",
  },

  visualCard: {
    width: "100%",
    maxWidth: 340,
    height: 300,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.primarySoft,
  },

  paper: {
    width: 190,
    minHeight: 225,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.elevated,
  },

  paperHeaderLine: {
    width: "58%",
    height: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.text,
  },

  paperLineShort: {
    width: "36%",
    height: 5,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.border,
  },

  bubbleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: theme.spacing.lg,
  },

  questionLine: {
    width: 24,
    height: 5,
    marginRight: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.border,
  },

  bubble: {
    width: 15,
    height: 15,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.textMuted,
    backgroundColor: theme.colors.surface,
  },

  bubbleSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },

  scanCorner: {
    position: "absolute",
    width: 34,
    height: 34,
    borderColor: theme.colors.primary,
  },

  scanCornerTopLeft: {
    top: 38,
    left: 44,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },

  scanCornerTopRight: {
    top: 38,
    right: 44,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },

  scanCornerBottomLeft: {
    bottom: 38,
    left: 44,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },

  scanCornerBottomRight: {
    right: 44,
    bottom: 38,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderBottomRightRadius: 8,
  },

  deviceCard: {
    width: 230,
    padding: theme.spacing.xl,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.elevated,
  },

  deviceTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.success,
  },

  deviceLabel: {
    ...theme.typography.label,
    color: theme.colors.success,
  },

  savedRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },

  savedIndicator: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
  },

  savedText: {
    ...theme.typography.bodySmallStrong,
    color: theme.colors.text,
  },

  reviewCard: {
    width: 260,
    padding: theme.spacing.xl,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.elevated,
  },

  reviewLabel: {
    ...theme.typography.label,
    marginBottom: theme.spacing.md,
    color: theme.colors.warning,
  },

  reviewQuestionRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },

  reviewQuestion: {
    ...theme.typography.bodySmallStrong,
    color: theme.colors.text,
  },

  reviewStatusPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.warningSoft,
  },

  reviewStatusText: {
    ...theme.typography.label,
    color: theme.colors.warning,
  },

  syncReadyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xl,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.successSoft,
  },

  syncReadyDot: {
    width: 9,
    height: 9,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.success,
  },

  syncReadyText: {
    flex: 1,
    ...theme.typography.caption,
    color: theme.colors.success,
  },

  copyArea: {
    flex: 0.92,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    justifyContent: "flex-start",
    paddingTop: theme.spacing.xl,
  },

  kicker: {
    ...theme.typography.label,
    color: theme.colors.primary,
    letterSpacing: 0.8,
  },

  title: {
    ...theme.typography.screenTitle,
    marginTop: theme.spacing.sm,
    color: theme.colors.text,
  },

  description: {
    ...theme.typography.body,
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
  },

  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
  },

  dots: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.border,
  },

  dotActive: {
    width: 24,
    backgroundColor: theme.colors.primary,
  },

  primaryButton: {
    minHeight: theme.layout.controls.buttonHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
  },

  primaryButtonPressed: {
    backgroundColor: theme.colors.primaryPressed,
  },

  primaryButtonDisabled: {
    opacity: 0.6,
  },

  primaryButtonText: {
    ...theme.typography.button,
    color: "#FFFFFF",
  },

  footerNote: {
    ...theme.typography.caption,
    marginTop: theme.spacing.sm,
    color: theme.colors.textMuted,
    textAlign: "center",
  },

  pressed: {
    opacity: 0.7,
  },
});
