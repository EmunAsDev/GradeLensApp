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

  tabBar: {
    height: 76,
    heightCompact: 70,

    iconSize: 21,
    iconSizeCompact: 19,

    scanButtonSize: 55,
    scanButtonSizeCompact: 46,

    scanIconSize: 26,
    scanIconSizeCompact: 22,

    labelSize: 10,
    labelSizeCompact: 10,

    scanButtonOffset: -22,
    scanButtonOffsetCompact: -8,
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
