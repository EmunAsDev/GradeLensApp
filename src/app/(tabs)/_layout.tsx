import { Tabs } from "expo-router";

import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppTabIcon } from "@/../components/navigation/AppTabIcon";
import { theme } from "@/../theme";

/*
 * Custom button for normal tabs.
 *
 * We use our own Pressable so Android does not show the
 * default circular ripple when a navigation item is pressed.
 */
function TabButton(props: any) {
  const {
    children,
    onPress,
    onLongPress,
    accessibilityLabel,
    accessibilityState,
    testID,
    style,
  } = props;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={null}
      style={({ pressed }) => [style, pressed && styles.tabButtonPressed]}
    >
      {children}
    </Pressable>
  );
}

/*
 * Special raised Scan button.
 *
 * This remains circular because the circle is part of the
 * GradeLens Scan button design, not the Android press ripple.
 */
function ScanTabButton(props: any) {
  const { onPress, onLongPress, accessibilityState } = props;

  const selected = Boolean(accessibilityState?.selected);

  return (
    <View style={styles.scanButtonSlot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan answer sheets"
        accessibilityState={accessibilityState}
        onPress={onPress}
        onLongPress={onLongPress}
        android_ripple={null}
        style={({ pressed }) => [
          styles.scanTabButton,
          pressed && styles.scanTabButtonPressed,
        ]}
      >
        <View style={[styles.scanCircle, selected && styles.scanCircleActive]}>
          <AppTabIcon
            icon="scan"
            color={theme.colors.textInverse}
            focused
            size={27}
          />
        </View>

        <Text style={[styles.scanLabel, selected && styles.scanLabelActive]}>
          Scan
        </Text>
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,

        tabBarHideOnKeyboard: true,

        /*
         * Replace the default React Navigation tab button.
         *
         * This removes the Android circular ripple effect.
         */
        tabBarButton: (props) => <TabButton {...props} />,

        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          elevation: 0,
          shadowOpacity: 0,
        },

        tabBarItemStyle: {
          paddingTop: theme.spacing.xs,
        },

        tabBarLabelStyle: {
          marginTop: 1,
          fontSize: theme.typography.label.fontSize,
          fontWeight: theme.typography.label.fontWeight,
        },

        sceneStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",

          tabBarIcon: ({ color, focused }) => (
            <AppTabIcon icon="home" color={color as string} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="courses"
        options={{
          title: "Courses",

          tabBarIcon: ({ color, focused }) => (
            <AppTabIcon
              icon="courses"
              color={color as string}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",

          /*
           * Override the normal tab button because Scan has
           * its own raised circular button.
           */
          tabBarButton: (props) => <ScanTabButton {...props} />,
        }}
      />

      <Tabs.Screen
        name="batch"
        options={{
          title: "Batch",

          tabBarIcon: ({ color, focused }) => (
            <AppTabIcon
              icon="batch"
              color={color as string}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",

          tabBarIcon: ({ color, focused }) => (
            <AppTabIcon
              icon="settings"
              color={color as string}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  /*
   * Normal navigation tabs.
   *
   * Instead of a circular ripple, pressing a tab only gives
   * a very small opacity response.
   */
  tabButtonPressed: {
    opacity: 0.72,
  },

  /*
   * Scan Tab
   */
  scanButtonSlot: {
    flex: 1,
    alignItems: "center",
  },

  scanTabButton: {
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: -14,
  },

  scanTabButtonPressed: {
    opacity: 0.82,
  },

  scanCircle: {
    width: 56,
    height: 56,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 4,
    borderColor: theme.colors.surface,
    borderRadius: 28,

    backgroundColor: theme.colors.primary,

    shadowColor: "#000000",

    shadowOffset: {
      width: 0,
      height: 4,
    },

    shadowOpacity: 0.16,
    shadowRadius: 6,

    elevation: 7,
  },

  scanCircleActive: {
    backgroundColor: theme.colors.primaryPressed,
  },

  scanLabel: {
    marginTop: 2,

    ...theme.typography.label,

    color: theme.colors.textMuted,
  },

  scanLabelActive: {
    color: theme.colors.primary,
  },
});
