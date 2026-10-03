/*
 * GradeLens uses the platform system font.
 *
 * Android -> Roboto / system sans-serif
 * iOS     -> San Francisco / system sans-serif
 *
 * Do not set fontFamily globally unless GradeLens later adopts a custom
 * branded font. Keeping the platform font preserves native rendering,
 * accessibility scaling, and avoids font-loading delays during startup.
 */
export const typography = {
  display: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700" as const,
  },

  screenTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700" as const,
  },

  detailTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700" as const,
  },

  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700" as const,
  },

  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600" as const,
  },

  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },

  bodyStrong: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600" as const,
  },

  bodyExtraSmall: {
    fontSize: 10,
    lineHeight: 18,
    fontWeight: "400" as const,
  },

  bodySmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },

  bodyExtraSmallStrong: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600" as const,
  },

  bodySmallStrong: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600" as const,
  },

  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400" as const,
  },

  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600" as const,
  },

  button: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600" as const,
  },

  tabLabel: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600" as const,
  },

  metric: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700" as const,
  },
} as const;
