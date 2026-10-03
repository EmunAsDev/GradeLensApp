export const layout = {
  breakpoints: {
    compact: 360,
    wide: 600,
  },

  screenPadding: {
    compact: 12,
    regular: 18,
    wide: 24,
  },

  contentMaxWidth: 720,

  controls: {
    buttonHeight: 52,
    inputHeight: 52,
    minimumTouchTarget: 48,
  },

  icon: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 28,
    xl: 32,
    status: 48,
  },

  tabBar: {
    height: 76,
    heightCompact: 70,

    iconSize: 24,
    iconSizeCompact: 20,

    scanButtonSize: 56,
    scanButtonSizeCompact: 48,

    scanIconSize: 28,
    scanIconSizeCompact: 24,

    labelSize: 11,
    labelSizeCompact: 10,

    scanButtonOffset: -22,
    scanButtonOffsetCompact: -10,
  },
} as const;

export function isCompactWidth(width: number): boolean {
  return width < layout.breakpoints.compact;
}

export function isWideWidth(width: number): boolean {
  return width >= layout.breakpoints.wide;
}

export function getScreenHorizontalPadding(width: number): number {
  if (isCompactWidth(width)) {
    return layout.screenPadding.compact;
  }

  if (isWideWidth(width)) {
    return layout.screenPadding.wide;
  }

  return layout.screenPadding.regular;
}
