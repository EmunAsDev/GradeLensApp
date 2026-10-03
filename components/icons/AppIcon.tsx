import { Host, Icon } from "@expo/ui";
import type { ColorValue } from "react-native";

/*
 * One semantic icon vocabulary for the entire GradeLens application.
 *
 * Android uses Material Symbols through @expo/material-symbols.
 * iOS uses the equivalent SF Symbol through @expo/ui's Icon.select().
 *
 * Screens should import AppIcon instead of importing icon packages directly.
 */
const ICONS = {
  home: Icon.select({
    ios: "house.fill",
    android: import("@expo/material-symbols/home.xml"),
  }),

  courses: Icon.select({
    ios: "graduationcap.fill",
    android: import("@expo/material-symbols/school.xml"),
  }),

  scan: Icon.select({
    ios: "doc.viewfinder",
    android: import("@expo/material-symbols/document_scanner.xml"),
  }),

  batch: Icon.select({
    ios: "shippingbox.fill",
    android: import("@expo/material-symbols/inventory_2.xml"),
  }),

  settings: Icon.select({
    ios: "gearshape.fill",
    android: import("@expo/material-symbols/settings.xml"),
  }),

  back: Icon.select({
    ios: "arrow.left",
    android: import("@expo/material-symbols/arrow_back.xml"),
  }),

  chevronLeft: Icon.select({
    ios: "chevron.left",
    android: import("@expo/material-symbols/chevron_left.xml"),
  }),

  next: Icon.select({
    ios: "chevron.right",
    android: import("@expo/material-symbols/chevron_right.xml"),
  }),

  search: Icon.select({
    ios: "magnifyingglass",
    android: import("@expo/material-symbols/search.xml"),
  }),

  close: Icon.select({
    ios: "xmark",
    android: import("@expo/material-symbols/close.xml"),
  }),

  student: Icon.select({
    ios: "person.fill",
    android: import("@expo/material-symbols/person.xml"),
  }),

  review: Icon.select({
    ios: "exclamationmark.triangle.fill",
    android: import("@expo/material-symbols/warning.xml"),
  }),

  success: Icon.select({
    ios: "checkmark.circle.fill",
    android: import("@expo/material-symbols/check_circle.xml"),
  }),

  error: Icon.select({
    ios: "exclamationmark.circle.fill",
    android: import("@expo/material-symbols/error.xml"),
  }),

  info: Icon.select({
    ios: "info.circle.fill",
    android: import("@expo/material-symbols/info.xml"),
  }),

  time: Icon.select({
    ios: "clock.fill",
    android: import("@expo/material-symbols/schedule.xml"),
  }),

  location: Icon.select({
    ios: "location.fill",
    android: import("@expo/material-symbols/location_on.xml"),
  }),

  sync: Icon.select({
    ios: "arrow.triangle.2.circlepath",
    android: import("@expo/material-symbols/sync.xml"),
  }),

  delete: Icon.select({
    ios: "trash.fill",
    android: import("@expo/material-symbols/delete.xml"),
  }),

  rescan: Icon.select({
    ios: "arrow.clockwise",
    android: import("@expo/material-symbols/refresh.xml"),
  }),

  flashOn: Icon.select({
    ios: "bolt.fill",
    android: import("@expo/material-symbols/flash_on.xml"),
  }),

  flashOff: Icon.select({
    ios: "bolt.slash.fill",
    android: import("@expo/material-symbols/flash_off.xml"),
  }),

  offline: Icon.select({
    ios: "icloud.slash.fill",
    android: import("@expo/material-symbols/cloud_off.xml"),
  }),

  online: Icon.select({
    ios: "icloud.fill",
    android: import("@expo/material-symbols/cloud_done.xml"),
  }),

  visibility: Icon.select({
    ios: "eye.fill",
    android: import("@expo/material-symbols/visibility.xml"),
  }),

  visibilityOff: Icon.select({
    ios: "eye.slash.fill",
    android: import("@expo/material-symbols/visibility_off.xml"),
  }),

  logout: Icon.select({
    ios: "rectangle.portrait.and.arrow.right",
    android: import("@expo/material-symbols/logout.xml"),
  }),
} as const;

export type AppIconName = keyof typeof ICONS;

type AppIconProps = {
  name: AppIconName;
  size?: number;
  color?: ColorValue;
  accessibilityLabel?: string;
};

export function AppIcon({
  name,
  size = 24,
  color,
  accessibilityLabel,
}: AppIconProps) {
  return (
    <Host matchContents>
      <Icon
        name={ICONS[name]}
        size={size}
        color={color}
        accessibilityLabel={accessibilityLabel}
      />
    </Host>
  );
}
