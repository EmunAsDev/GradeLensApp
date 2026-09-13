import { Stack } from "expo-router";

import { theme } from "@/../theme";

export default function BatchLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    />
  );
}
