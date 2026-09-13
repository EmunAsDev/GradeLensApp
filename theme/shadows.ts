import { Platform } from "react-native";

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: {
        width: 0,
        height: 2,
      },
    },

    android: {
      elevation: 1,
    },

    default: {},
  }),

  elevated: Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: {
        width: 0,
        height: 4,
      },
    },

    android: {
      elevation: 3,
    },

    default: {},
  }),
} as const;
