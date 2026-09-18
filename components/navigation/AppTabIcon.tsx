import type { ComponentProps } from "react";

import { StyleSheet, View } from "react-native";

import { SymbolView } from "expo-symbols";

type SymbolName = ComponentProps<typeof SymbolView>["name"];

export type AppTabIconName = "home" | "courses" | "scan" | "batch" | "settings";

type AppTabIconProps = {
  icon: AppTabIconName;
  color: string;
  focused?: boolean;
  size?: number;
};

const SYMBOLS = {
  home: {
    ios: "house.fill",
    android: "home",
    web: "home",
  },

  courses: {
    ios: "books.vertical.fill",
    android: "school",
    web: "school",
  },

  scan: {
    ios: "viewfinder",
    android: "document_scanner",
    web: "document_scanner",
  },

  batch: {
    ios: "tray.full.fill",
    android: "inbox",
    web: "inbox",
  },

  settings: {
    ios: "gearshape.fill",
    android: "settings",
    web: "settings",
  },
} satisfies Record<AppTabIconName, SymbolName>;

export function AppTabIcon({
  icon,
  color,
  focused = false,
  size,
}: AppTabIconProps) {
  const iconSize = size ?? (focused ? 22 : 21);

  /*
   * Give SymbolView a slightly larger native drawing area
   * than the actual glyph.
   *
   * This prevents Material Symbols on Android from looking
   * clipped along the left/right edges.
   */
  const viewportSize = iconSize + 6;

  return (
    <View
      style={[
        styles.container,
        {
          width: viewportSize,
          height: viewportSize,
        },
      ]}
    >
      <SymbolView
        name={SYMBOLS[icon]}
        tintColor={color}
        size={iconSize}
        style={{
          width: viewportSize,
          height: viewportSize,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
});
