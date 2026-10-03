import type { LayoutChangeEvent } from "react-native";
import { Image, StyleSheet, Text, View } from "react-native";

import { theme } from "@/../theme";

type StartupSplashProps = {
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function StartupSplash({ onLayout }: StartupSplashProps) {
  return (
    <View style={styles.screen} onLayout={onLayout}>
      <View style={styles.centerContent}>
        <View style={styles.brandRow}>
          <Image
            source={require("../../assets/images/gradelenslogov2.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.brandName}>GradeLens</Text>
        </View>
      </View>

      <View style={styles.bottomContent}>
        <Text style={styles.overviewTitle}>Paper Assessment Scanner</Text>

        <Text style={styles.overviewText}>
          Scan, review, and sync assessments—even offline.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: theme.spacing.xxl,
    paddingBottom: theme.spacing.xxxl,
    backgroundColor: "#FFFFFF",
  },

  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
  },

  logo: {
    width: 56,
    height: 56,
  },

  brandName: {
    ...theme.typography.display,
    color: theme.colors.primary,
    fontWeight: "700",
  },

  bottomContent: {
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },

  overviewTitle: {
    ...theme.typography.bodySmallStrong,
    color: theme.colors.text,
    textAlign: "center",
  },

  overviewText: {
    maxWidth: 300,
    marginTop: theme.spacing.xs,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
});
