import { AppIcon, type AppIconName } from "../icons/AppIcon";

export type AppTabIconName = "home" | "courses" | "scan" | "batch" | "settings";

type AppTabIconProps = {
  icon: AppTabIconName;
  color: string;
  focused?: boolean;
  size?: number;
};

const TAB_ICON_MAP: Record<AppTabIconName, AppIconName> = {
  home: "home",
  courses: "courses",
  scan: "scan",
  batch: "batch",
  settings: "settings",
};

export function AppTabIcon({
  icon,
  color,
  focused: _focused = false,
  size = 24,
}: AppTabIconProps) {
  return <AppIcon name={TAB_ICON_MAP[icon]} color={color} size={size} />;
}
