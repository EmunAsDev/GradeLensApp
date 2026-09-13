import type { ComponentProps } from "react";

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
  return (
    <SymbolView
      name={SYMBOLS[icon]}
      tintColor={color}
      size={size ?? (focused ? 23 : 22)}
    />
  );
}
