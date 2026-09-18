import type { ReactElement, ReactNode } from "react";

import type {
    RefreshControlProps,
    ScrollViewProps,
    StyleProp,
    ViewStyle,
} from "react-native";
import {
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getScreenHorizontalPadding, theme } from "@/../theme";

type AppScreenProps = {
  children: ReactNode;

  /*
   * Most GradeLens screens should scroll.
   *
   * Set false for screens that own their own FlatList,
   * camera view, or another full-screen layout.
   */
  scroll?: boolean;

  /*
   * Use this when the screen is outside the tab navigator and
   * needs its own bottom safe-area protection.
   */
  includeBottomSafeArea?: boolean;

  /*
   * Extra styling for the outer screen and centered content area.
   */
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;

  /*
   * ScrollView-only options used by screens such as Settings.
   */
  refreshControl?: ReactElement<RefreshControlProps>;
  keyboardShouldPersistTaps?: ScrollViewProps["keyboardShouldPersistTaps"];
  showsVerticalScrollIndicator?: boolean;
};

export function AppScreen({
  children,
  scroll = true,
  includeBottomSafeArea = false,
  style,
  contentStyle,
  refreshControl,
  keyboardShouldPersistTaps = "handled",
  showsVerticalScrollIndicator = false,
}: AppScreenProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const horizontalPadding = getScreenHorizontalPadding(width);

  const bottomPadding =
    theme.spacing.xxxl + (includeBottomSafeArea ? insets.bottom : 0);

  const content = (
    <View
      style={[
        styles.content,
        {
          paddingHorizontal: horizontalPadding,
          paddingBottom: bottomPadding,
        },
        !scroll && styles.fillContent,
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  if (!scroll) {
    return <View style={[styles.screen, style]}>{content}</View>;
  }

  return (
    <ScrollView
      style={[styles.screen, style]}
      contentContainerStyle={styles.scrollContent}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  scrollContent: {
    flexGrow: 1,
  },

  content: {
    width: "100%",
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: "center",
  },

  fillContent: {
    flex: 1,
  },
});
