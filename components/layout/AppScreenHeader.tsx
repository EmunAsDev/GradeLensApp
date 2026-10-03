import type { ReactNode } from "react";

import type { StyleProp, ViewStyle } from "react-native";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getScreenHorizontalPadding, isCompactWidth, theme } from "@/../theme";

type AppScreenHeaderProps =
  | {
      variant: "brand";
      style?: StyleProp<ViewStyle>;
    }
  | {
      variant: "detail";
      title: string;
      subtitle?: string;
      onBack?: () => void;
      backAccessibilityLabel?: string;
      right?: ReactNode;
      style?: StyleProp<ViewStyle>;
    }
  | {
      variant?: "screen";
      eyebrow?: string;
      title: string;
      subtitle?: string;
      back?: boolean;
      backLabel?: string;
      onBack?: () => void;
      right?: ReactNode;
      embedded?: boolean;
      style?: StyleProp<ViewStyle>;
    };

export function AppScreenHeader(props: AppScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const compact = isCompactWidth(width);
  const horizontalPadding = getScreenHorizontalPadding(width);

  const handleBack = (onBack?: () => void) => {
    if (onBack) {
      onBack();
      return;
    }

    router.back();
  };

  if (props.variant === "brand") {
    return (
      <>
        <StatusBar style="light" />

        <View
          style={[
            styles.appBar,
            {
              paddingTop: insets.top,
            },
            props.style,
          ]}
        >
          <View
            style={[
              styles.brandContent,
              {
                paddingHorizontal: horizontalPadding,
              },
            ]}
          >
            <Image
              source={require("../../assets/images/gradelenslogov2white.png")}
              style={styles.brandLogo}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />

            <Text style={styles.brandTitle}>GradeLens</Text>
          </View>
        </View>
      </>
    );
  }

  if (props.variant === "detail") {
    const {
      title,
      subtitle,
      onBack,
      backAccessibilityLabel = "Go back",
      right,
      style,
    } = props;

    return (
      <>
        <StatusBar style="light" />

        <View
          style={[
            styles.appBar,
            {
              paddingTop: insets.top,
            },
            style,
          ]}
        >
          <View
            style={[
              styles.detailContent,
              {
                paddingHorizontal: horizontalPadding,
              },
            ]}
          >
            <View style={styles.detailSide}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={backAccessibilityLabel}
                onPress={() => handleBack(onBack)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.detailBackButton,
                  pressed && styles.detailBackButtonPressed,
                ]}
              >
                <Text style={styles.detailBackIcon}>←</Text>
              </Pressable>
            </View>

            <View style={styles.detailTitleGroup}>
              <Text
                style={styles.detailTitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {title}
              </Text>

              {subtitle ? (
                <Text
                  style={styles.detailSubtitle}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>

            <View style={[styles.detailSide, styles.detailRight]}>{right}</View>
          </View>
        </View>
      </>
    );
  }

  const {
    eyebrow,
    title,
    subtitle,
    back = false,
    backLabel = "Back",
    onBack,
    right,
    embedded = false,
    style,
  } = props;

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
          onPress={() => handleBack(onBack)}
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
  appBar: {
    width: "100%",
    backgroundColor: theme.colors.primary,
    elevation: 4,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    zIndex: 10,
  },

  brandContent: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },

  brandLogo: {
    width: 20,
    height: 20,
  },

  brandTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },

  detailContent: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
  },

  detailSide: {
    width: 44,
    minWidth: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  detailRight: {
    alignItems: "flex-end",
  },

  detailBackButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },

  detailBackButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.20)",
    transform: [{ scale: 0.96 }],
  },

  detailBackIcon: {
    marginTop: -15,
    fontSize: 32,
    lineHeight: 32,
    fontWeight: "400",
    textAlign: "center",
    color: theme.colors.textInverse,
  },

  detailTitleGroup: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.sm,
  },

  detailTitle: {
    maxWidth: "100%",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    textAlign: "center",
    color: theme.colors.textInverse,
  },

  detailSubtitle: {
    maxWidth: "100%",
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    textAlign: "center",
    color: "rgba(255, 255, 255, 0.72)",
  },

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
