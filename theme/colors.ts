export const colors = {
  /*
   * Brand
   */
  primary: "#AF2532",
  primaryPressed: "#92202A",
  primarySoft: "#FBEAEC",
  primaryBorder: "#EFC5CA",

  /*
   * Surfaces
   */
  background: "#F7F7F8",
  surface: "#FFFFFF",
  surfaceMuted: "#F3F4F6",

  /*
   * Text
   */
  text: "#18181B",
  textSecondary: "#52525B",
  textMuted: "#71717A",
  textInverse: "#FFFFFF",

  /*
   * Structure
   */
  border: "#E4E4E7",
  divider: "#ECECEF",

  /*
   * Semantic states
   */
  success: "#16794A",
  successSoft: "#E9F7EF",

  warning: "#A15C00",
  warningSoft: "#FFF5DB",

  danger: "#B42318",
  dangerSoft: "#FDECEC",

  info: "#2563EB",
  infoSoft: "#EFF6FF",

  /*
   * Scanner
   */
  scannerGuide: "#F4C542",

  /*
   * Utility
   */
  transparent: "transparent",
  overlay: "rgba(0, 0, 0, 0.45)",
} as const;

export type GradeLensColorName = keyof typeof colors;
