import type { ReactNode } from "react";

import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "@/../theme";

type AppScreenHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;

  back?: boolean;
  backLabel?: string;
  onBack?: () => void;

  right?: ReactNode;

  /*
   * Set embedded when the parent already owns horizontal screen padding.
   * Safe-area top spacing is still handled by this component.
   */
  embedded?: boolean;

  style?: StyleProp<ViewStyle>;
};

export function AppScreenHeader({
  eyebrow,
  title,
  subtitle,
  back = false,
  backLabel = "Back",
  onBack,
  right,
  embedded = false,
  style,
}: AppScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    router.back();
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + theme.spacing.xl,
        },
        !embedded && styles.screenPadding,
        style,
      ]}
    >
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to ${backLabel}`}
          onPress={handleBack}
          hitSlop={8}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.backLabel}>{backLabel}</Text>
        </Pressable>
      ) : null}

      <View style={styles.mainRow}>
        <View style={styles.titleGroup}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}

          <Text style={[styles.title, eyebrow && styles.titleAfterEyebrow]}>
            {title}
          </Text>

          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: theme.spacing.xxl,
    backgroundColor: theme.colors.background,
  },

  screenPadding: {
    paddingHorizontal: theme.spacing.screenHorizontal,
  },

  backButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 32,
    marginBottom: theme.spacing.md,
  },

  backChevron: {
    marginTop: -2,
    marginRight: theme.spacing.xs,
    fontSize: 30,
    lineHeight: 30,
    color: theme.colors.primary,
  },

  backLabel: {
    ...theme.typography.bodyStrong,
    color: theme.colors.primary,
  },

  mainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },

  titleGroup: {
    flex: 1,
  },

  eyebrow: {
    ...theme.typography.sectionTitle,
    color: theme.colors.primary,
  },

  title: {
    ...theme.typography.screenTitle,
    color: theme.colors.text,
  },

  titleAfterEyebrow: {
    marginTop: theme.spacing.xs,
  },

  subtitle: {
    marginTop: theme.spacing.sm,
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  right: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
    paddingTop: theme.spacing.xs,
  },

  pressed: {
    opacity: 0.72,
  },
});
