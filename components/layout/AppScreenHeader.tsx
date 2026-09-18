import type { ReactNode } from "react";

import type { StyleProp, ViewStyle } from "react-native";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getScreenHorizontalPadding, isCompactWidth, theme } from "@/../theme";

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
   *
   * AppScreen should normally be used with embedded=true so both the
   * header and screen body share the exact same responsive content width.
   *
   * Safe-area top spacing is still handled here.
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
  const { width } = useWindowDimensions();

  const compact = isCompactWidth(width);

  const horizontalPadding = getScreenHorizontalPadding(width);

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
          paddingTop:
            insets.top + (compact ? theme.spacing.lg : theme.spacing.xl),

          paddingBottom: compact ? theme.spacing.xl : theme.spacing.xxl,
        },
        !embedded && {
          paddingHorizontal: horizontalPadding,
        },
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

          <Text style={styles.backLabel} numberOfLines={1} ellipsizeMode="tail">
            {backLabel}
          </Text>
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

        {right ? (
          <View style={[styles.right, compact && styles.rightCompact]}>
            {right}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: theme.colors.background,
  },

  backButton: {
    maxWidth: "100%",
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
    marginBottom: theme.spacing.md,
  },

  backChevron: {
    flexShrink: 0,
    marginTop: -2,
    marginRight: theme.spacing.xs,
    fontSize: 30,
    lineHeight: 30,
    color: theme.colors.primary,
  },

  backLabel: {
    flexShrink: 1,
    ...theme.typography.bodyStrong,
    color: theme.colors.primary,
  },

  mainRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },

  titleGroup: {
    flex: 1,
    minWidth: 0,
  },

  eyebrow: {
    ...theme.typography.sectionTitle,
    color: theme.colors.primary,
  },

  title: {
    flexShrink: 1,
    ...theme.typography.screenTitle,
    color: theme.colors.text,
  },

  titleAfterEyebrow: {
    marginTop: theme.spacing.xs,
  },

  subtitle: {
    flexShrink: 1,
    marginTop: theme.spacing.sm,
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  right: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    paddingTop: theme.spacing.xs,
  },

  rightCompact: {
    maxWidth: "38%",
  },

  pressed: {
    opacity: 0.72,
  },
});
